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
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    // Files of older builds are removed – otherwise every update would leave a few hundred KB behind on the device.
    try {
      const files = new Set((await (await fetch("./offline-files.json", { cache: "no-store" })).json()).map((f) => new URL("./" + f, self.registration.scope).href));
      const c = await caches.open(CACHE);
      for (const req of await c.keys()) if (new URL(req.url).pathname.includes("/assets/") && !files.has(req.url)) await c.delete(req);
    } catch { /* offline: tidy up next time */ }
    await self.clients.claim();
  })());
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
      // Only the app page itself is kept, not every file that was ever requested.
      if (res.ok) { if (isNav || url.pathname.endsWith("/index.html") || url.pathname.endsWith(".webmanifest")) put(isNav ? new Request("./index.html") : e.request, res); return res; }
      throw new Error("HTTP " + res.status);
    } catch {
      const hit = isNav ? await caches.match("./index.html") : await caches.match(e.request);
      return hit || Response.error();
    }
  })());
});

// Push messages from the PC (also while the app is closed). The PC encrypts them end to end; the browser decrypts
// before this event. Only title, text and the page to open are shown – nothing is executed.
self.addEventListener("push", (e) => {
  let m = { title: "Nexus Gaming Hub", body: "", link: "/notifications", tag: undefined };
  try { m = { ...m, ...e.data.json() }; } catch { /* plain or empty message */ }
  const link = typeof m.link === "string" && m.link.startsWith("/") && !m.link.startsWith("//") ? m.link : "/notifications";
  e.waitUntil(self.registration.showNotification(String(m.title).slice(0, 120), {
    body: String(m.body ?? "").slice(0, 300), tag: m.tag ? String(m.tag).slice(0, 80) : undefined,
    icon: "./icons/icon-192.png", badge: "./icons/favicon-64.png", data: { link },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL("./#" + (e.notification.data?.link ?? "/notifications"), self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.navigate?.(target); return; }
    await self.clients.openWindow(target);
  })());
});
