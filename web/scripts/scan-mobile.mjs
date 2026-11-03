#!/usr/bin/env node
// Öffnet jede Seite im iPhone-/iPad-Format (Hoch- und Querformat) und meldet: Seitenüberlauf, Skriptfehler,
// leere Seiten und bedienbare Elemente unter 44 × 44 px. Voraussetzung: gebaute Seite unter http://localhost:4173
// (npx vite preview --port 4173). Aufruf: node scripts/scan-mobile.mjs [--min 44] [--json datei]
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const ACCESS_HASH = readFileSync(new URL("../src/lib/access.ts", import.meta.url), "utf8").match(/ACCESS_HASH = "([0-9a-f]{64})"/)[1]; // Zugangs-Sperre: wie in den Browser-Tests schon entsperrt
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const MIN = Number(arg("min", 44));
const BASE = arg("base", "http://localhost:4173");
const PAIRED = process.argv.includes("--paired"); // gekoppeltes Handy, dessen PC aus ist: gespeicherte Kopplung, kein Begleiter erreichbar
const routes = [...readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8").matchAll(/path="([^"*]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
const profiles = [["iPhone SE hoch", devices["iPhone SE"]], ["Pixel 5 hoch", devices["Pixel 5"]], ["iPhone hoch", devices["iPhone 13"]], ["iPhone quer", devices["iPhone 13 landscape"]], ["iPad hoch", devices["iPad (gen 7)"]], ["iPad quer", devices["iPad (gen 7) landscape"]]];
const problems = [], small = new Map();
const browser = await chromium.launch();
for (const [name, dev] of profiles) {
  const ctx = await browser.newContext({ ...dev, locale: "de-DE" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("pgl.access", h); } catch { /* ignore */ } }, ACCESS_HASH);
  if (PAIRED) await ctx.addInitScript(() => { try { localStorage.setItem("pgl.cred", JSON.stringify({ deviceId: "scan", token: "scan-token", pcName: "Scan-PC" })); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  for (const r of routes) {
    errs.length = 0;
    await page.goto(`${BASE}/#${r.startsWith("/") ? r : "/" + r}`).catch(() => {});
    await page.waitForTimeout(PAIRED ? 2500 : 800);
    const o = await page.evaluate((min) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !e.closest("[hidden],[aria-hidden=true]") && r.bottom > 0 && r.right > 0; };
      // Ausnahmen: Links mitten im Fließtext (WCAG 2.5.8 nimmt sie aus) und die Raum-Gegenstände (ihre Trefferfläche wird per ::after vergrößert).
      const inline = (e) => e.tagName === "A" && !e.classList.length && e.parentElement && (e.parentElement.textContent || "").trim().length > (e.textContent || "").trim().length + 3;
      const els = [...document.querySelectorAll("button, a[href], [role=tab], [role=button], input:not([type=hidden]), select, textarea, summary")].filter((e) => vis(e) && !inline(e) && !e.classList.contains("room-obj") && !(e.tagName === "INPUT" && e.getBoundingClientRect().width < 20));
      const tiny = els.map((e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), t: (e.tagName.toLowerCase() + "." + (typeof e.className === "string" ? e.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) + " «" + (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24) + "»" }; })
        .filter((x) => x.w < min || x.h < min);
      const tb = document.querySelector(".topbar"); const tbr = tb?.getBoundingClientRect(); const clipped = tb ? [...tb.children].filter((e) => getComputedStyle(e).display !== "none").filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > tbr.right + 1).length : 0;
      return { loading: document.querySelectorAll(".skeleton").length, clipped, sw: document.documentElement.scrollWidth, iw: innerWidth, len: document.body.innerText.length, boundary: /Etwas ist schiefgelaufen/i.test(document.body.innerText), locked: /Access code|Zugangscode/i.test(document.body.innerText.slice(0, 60)), tiny };
    }, MIN);
    if ((PAIRED && o.loading) || o.clipped || o.sw > o.iw + 1 || errs.length || o.boundary || o.len < 20 || o.locked) problems.push(`${name} ${r}: Breite ${o.sw}/${o.iw} Fehler=${errs.join("|")} Dauerhaft ladend=${o.loading} Obere Leiste abgeschnitten=${o.clipped} Absturzseite=${o.boundary} Sperre=${!!o.locked} Text=${o.len}`);
    for (const t of o.tiny) { const k = `${r} · ${t.t} (${t.w}×${t.h})`; small.set(k, (small.get(k) ?? new Set()).add(name)); }
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEME:\n" + problems.join("\n") : "Keine Überläufe, Skriptfehler oder leeren Seiten.");
console.log(`\nBedienelemente unter ${MIN}px: ${small.size} verschiedene`);
const byRoute = {};
for (const k of small.keys()) { const r = k.split(" · ")[0]; byRoute[r] = (byRoute[r] ?? 0) + 1; }
console.log(Object.entries(byRoute).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([r, n]) => `  ${r}: ${n}`).join("\n"));
const j = arg("json", ""); if (j) writeFileSync(j, JSON.stringify({ problems, small: [...small.keys()] }, null, 1));
process.exit(problems.length ? 1 : 0);
