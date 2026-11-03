#!/usr/bin/env node
// Screenshot helper: node scripts/shot.mjs <route> <out.png> [preset] [WxH]  (preview server on :4173, access gate unlocked)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [route = "/", out = "/tmp/shot.png", preset = "", size = "1440x810"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const hash = readFileSync(new URL("../src/lib/access.ts", import.meta.url), "utf8").match(/ACCESS_HASH = "([0-9a-f]{64})"/)[1];
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: "de-DE", hasTouch: w < 700, isMobile: w < 700 }); await c.addInitScript((x) => localStorage.setItem("pgl.access", x), hash);
const p = await c.newPage();
await p.goto("http://localhost:4173/#/");
if (preset) { await p.evaluate((id) => { const k = Object.keys(localStorage).find((x) => x.startsWith("pgl.prefs")) ; }, preset); }
await p.goto("http://localhost:4173/#" + route); await p.waitForTimeout(1200);
if (preset) { await p.goto("http://localhost:4173/#/settings?s=design"); await p.waitForTimeout(500); await p.locator(".swatch", { hasText: preset }).first().click(); await p.goto("http://localhost:4173/#" + route); await p.waitForTimeout(1200); }
await p.screenshot({ path: out });
await b.close();
