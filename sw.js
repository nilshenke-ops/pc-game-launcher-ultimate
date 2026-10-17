// Service worker: keeps the app shell on the device so the page opens even while the PC is off
// (design and layout stay usable; the app connects by itself once the PC is reachable).
// Live data always goes over the WebSocket and is never cached. Works only over https (e.g. a tunnel) or localhost.
const CACHE = "pgl-shell-v3";
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (e) => {
  // Store the whole app (all pages), not only what was visited, so every area opens while the PC is off.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/favicon-64.png"]);
    try {
      const files = await (await fetch("./offline-files.json", { cache: "no-store" })).json();
      await c.addAll(files.map((f) => "./" + f));
    } catch { /* partial cache still works for visited pages */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function put(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/ws") || url.pathname.includes("/download/") || url.pathname.endsWith("/healthz")) return;

  // Hashed build assets never change: cache first.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) put(e.request, res); return res; })));
    return;
  }

  // Pages and other files: network first, but fall back to the cached app when the PC is off.
  // A tunnel answers with an error page (e.g. 502) or not at all when the PC is off – both count as "offline".
  e.respondWith((async () => {
    const isNav = e.request.mode === "navigate";
    try {
      const res = await Promise.race([
        fetch(e.request),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), isNav ? NAV_TIMEOUT_MS : 15000)),
      ]);
      if (res.ok) { put(isNav ? new Request("./index.html") : e.request, res); return res; }
      throw new Error("HTTP " + res.status);
    } catch {
      const hit = isNav ? await caches.match("./index.html") : await caches.match(e.request);
      return hit || Response.error();
    }
  })());
});
