import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hmacSha256, loginProof, sha256, toHex, utf8 } from "./sha256";
import { en } from "./en";
// @ts-expect-error plain JS helper shared with the CLI script
import { collectKeys } from "../../scripts/i18n-keys.mjs";
import { ALL_WIDGETS, contrast, defaultPrefs, sanitizePrefs } from "./prefs-core";
import { templates } from "./custom-widgets";
import { connectionQuality } from "./net-quality";
import { arrangeNav, navItems } from "./nav";
import { needsConfirm, STALE_MS } from "./outbox-rules";
import { score } from "../components/search-score";
import { comboFromEvent, describeCombo } from "../pages/hotkey-combo";

const SRC = new URL("..", import.meta.url).pathname;

describe("sha256 / hmac", () => {
  const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "ü€😀".repeat(40), "x".repeat(1000)];
  it("matches node:crypto", () => {
    for (const s of inputs) expect(toHex(sha256(utf8(s)))).toBe(createHash("sha256").update(s).digest("hex"));
  });
  it("hmac matches node:crypto (short and long keys)", () => {
    for (const k of ["key", "k".repeat(100)]) for (const m of inputs)
      expect(toHex(hmacSha256(utf8(k), utf8(m)))).toBe(createHmac("sha256", k).update(m).digest("hex"));
  });
  it("login proof equals the companion's HMAC(SHA256(token), nonce)", () => {
    const token = "abcDEF_123-token", nonce = "00ff10aa".repeat(8);
    const key = createHash("sha256").update(token).digest();
    expect(loginProof(token, nonce)).toBe(createHmac("sha256", key).update(Buffer.from(nonce, "hex")).digest("hex"));
  });
});

describe("i18n", () => {
  it("every German UI text has an English translation", () => {
    const missing = (collectKeys(SRC) as string[]).filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
  it("placeholders are kept in translations", () => {
    for (const [de, eng] of Object.entries(en)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(eng), de).toBe(ph(de));
    }
  });
});

describe("protocol", () => {
  const protocol = JSON.parse(readFileSync(new URL("../../../protocol/protocol.json", import.meta.url), "utf8"));
  it("every method the web app calls is defined in protocol.json", () => {
    const used = new Set<string>();
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !f.endsWith(".test.ts")) for (const m of readFileSync(p, "utf8").matchAll(/(?:call|useRpc)(?:<[^>]*>)?\(\s*"([a-zA-Z.]+)"/g)) used.add(m[1]); } };
    walk(SRC);
    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((m) => !(m in protocol.methods))).toEqual([]);
  });
});

describe("prefs", () => {
  it("shows the 2.14 widgets once in older layouts, but keeps them hidden after the user hid them", () => {
    const old = sanitizePrefs({ layouts: [{ id: "a", name: "A", widgets: [{ id: "status", visible: true, size: "m" }, { id: "next", visible: true, size: "m" }, { id: "shortcuts", visible: true, size: "m" }] }] });
    expect(old.layouts[0].widgets.slice(0, 5).map((w) => w.id)).toEqual(["status", "next", "shortcuts", "activity", "calendar"]);
    expect(old.layouts[0].widgets.find((w) => w.id === "activity")!.visible).toBe(true);
    expect(old.layouts[0].widgets.find((w) => w.id === "calendar")!.visible).toBe(true);
    const hidden = sanitizePrefs(old);
    hidden.layouts[0].widgets.find((w) => w.id === "calendar")!.visible = false;
    expect(sanitizePrefs(hidden).layouts[0].widgets.find((w) => w.id === "calendar")!.visible).toBe(false);
  });

  it("sanitizes invalid input to safe defaults", () => {
    const p = sanitizePrefs({ theme: { primary: "red; background:url(x)", radius: 999, fontScale: -1, bgImage: "javascript:alert(1)" }, layouts: [{ id: "x", name: "X", widgets: [{ id: "status", visible: true, size: "zz" }, { id: "evil", visible: true, size: "s" }] }], lang: "fr" });
    expect(p.theme.primary).toBe(defaultPrefs().theme.primary);
    expect(p.theme.radius).toBe(28);
    expect(p.theme.fontScale).toBe(0.85);
    expect(p.theme.bgImage).toBeNull();
    expect(p.layouts[0].widgets.find((w) => w.id === "status")!.size).toBe("m");
    expect(p.layouts[0].widgets.some((w) => (w.id as string) === "evil")).toBe(false);
    expect(p.layouts[0].widgets.length).toBe(ALL_WIDGETS.length); // all built-in widgets, each once
    expect(new Set(p.layouts[0].widgets.map((w) => w.id)).size).toBe(ALL_WIDGETS.length);
    expect(["de", "en"]).toContain(p.lang);
  });
  it("keeps own widgets from the widget editor (custom:cw_…) and drops malformed ones", () => {
    const p = sanitizePrefs({ layouts: [{ id: "x", name: "X", widgets: [
      { id: "custom:cw_abc123", visible: true, size: "m" }, { id: "custom:../evil", visible: true, size: "m" }, { id: "custom:cw_abc123", visible: false, size: "s" },
    ] }] });
    const ids = p.layouts[0].widgets.map((w) => w.id as string);
    expect(ids.filter((i) => i === "custom:cw_abc123")).toHaveLength(1);
    expect(ids.some((i) => i.includes("evil"))).toBe(false);
  });
  it("keeps every plugin widget of the catalog on the home screen (2.10 silently dropped the 13th)", () => {
    const widgets = Array.from({ length: 33 }, (_, i) => ({ id: `plugin:de.pgl.p${i}:w`, visible: true, size: "m" }));
    const p = sanitizePrefs({ layouts: [{ id: "x", name: "X", widgets }] });
    expect(p.layouts[0].widgets.filter((w) => (w.id as string).startsWith("plugin:"))).toHaveLength(33);
  });
  it("widget templates are valid for the PC (ids, limits, percent boxes)", () => {
    for (const tpl of templates()) {
      const w = tpl.make();
      expect(w.id).toMatch(/^cw_[A-Za-z0-9_-]{1,40}$/);
      expect(w.elements.length).toBeLessThanOrEqual(40);
      expect(new Set(w.elements.map((e) => e.id)).size).toBe(w.elements.length);
      for (const e of w.elements) {
        expect(e.id).toMatch(/^[a-z0-9_-]{1,40}$/);
        expect(e.x + e.w).toBeLessThanOrEqual(100);
        expect(e.y + e.h).toBeLessThanOrEqual(100);
      }
    }
  });
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("navigation", () => {
  it("own order inside a category, hidden sections, fixed ones stay", () => {
    const items = navItems();
    const nav = arrangeNav(items, { order: ["/audio", "/soundboard"], hidden: ["/programs", "/settings", "/help"] });
    const paths = nav.map((i) => i.path);
    expect(paths).not.toContain("/programs");
    expect(paths).not.toContain("/help");
    expect(paths).toContain("/settings"); // cannot be hidden
    expect(paths.indexOf("/audio")).toBeLessThan(paths.indexOf("/soundboard"));
    expect(new Set(nav.map((i) => i.group)).size).toBe(8); // Dashboard, Spielbegleiter, Steuerung, Audio, System, Verbindung, Erweiterungen, Verwaltung
  });
  it("sanitizes navigation prefs", () => {
    const p = sanitizePrefs({ nav: { order: ["/games", "javascript:x", 5], hidden: ["/x/../y"], bottom: [] } });
    expect(p.nav.order).toEqual(["/games"]);
    expect(p.nav.hidden).toEqual([]);
    expect(p.nav.bottom).toEqual(["/", "/deck", "/games", "/soundboard"]);
    // The untouched bar from before 2.7.0 gets the deck; an own choice stays as it is.
    expect(sanitizePrefs({ nav: { bottom: ["/", "/games", "/soundboard", "/quick"] } }).nav.bottom).toEqual(["/", "/deck", "/games", "/soundboard"]);
    expect(sanitizePrefs({ nav: { bottom: ["/quick", "/"] } }).nav.bottom).toEqual(["/quick", "/"]);
  });
  it("old dashboard layouts get the new home widgets once, own choices stay", () => {
    const old = sanitizePrefs({ layouts: [{ id: "l", name: "L", widgets: [{ id: "status", visible: true, size: "m" }, { id: "system", visible: true, size: "l" }] }] });
    const ids = old.layouts[0].widgets.filter((w) => w.visible).map((w) => w.id);
    expect(ids).toEqual(["status", "shortcuts", "next", "activity", "calendar", "system"]);
    const again = sanitizePrefs(old);
    expect(again.layouts[0].widgets.filter((w) => w.visible).map((w) => w.id)).toEqual(ids);
    const hiddenByUser = sanitizePrefs({ layouts: [{ ...old.layouts[0], widgets: old.layouts[0].widgets.map((w) => (w.id === "next" ? { ...w, visible: false } : w)) }] });
    expect(hiddenByUser.layouts[0].widgets.find((w) => w.id === "next")!.visible).toBe(false);
  });
});

describe("queued changes", () => {
  it("plugins and old changes wait for a confirmation, normal ones go", () => {
    const now = Date.now();
    expect(needsConfirm({ method: "quick.save", at: now }, now)).toBe(false);
    expect(needsConfirm({ method: "plugins.enable", at: now }, now)).toBe(true);
    expect(needsConfirm({ method: "plugins.importFile", at: now, confirmed: true }, now)).toBe(false);
    expect(needsConfirm({ method: "quick.save", at: now - STALE_MS - 1 }, now)).toBe(true);
  });
});

describe("connection quality", () => {
  it("rates only measured values", () => {
    expect(connectionQuality({ avg: 18, jitter: 2, lossPercent: 0, samples: 30 })).toBe("excellent");
    expect(connectionQuality({ avg: 60, jitter: 8, lossPercent: 0.5, samples: 30 })).toBe("good");
    expect(connectionQuality({ avg: 100, jitter: 15, lossPercent: 2, samples: 30 })).toBe("fair");
    expect(connectionQuality({ avg: 18, jitter: 2, lossPercent: 10, samples: 30 })).toBe("poor");
    expect(connectionQuality({ avg: 18, jitter: 2, lossPercent: 0, samples: 2 })).toBe("unknown");
    expect(connectionQuality({ avg: null, jitter: null, lossPercent: null, samples: 30 })).toBe("unknown");
  });
});

describe("search", () => {
  it("ranks prefix over word start over substring and ignores accents", () => {
    expect(score("Counter-Strike 2", "count")).toBeGreaterThan(score("Counter-Strike 2", "strike"));
    expect(score("Counter-Strike 2", "strike")).toBeGreaterThan(score("Counter-Strike 2", "rike"));
    expect(score("Einstellungen", "xyz")).toBe(0);
    expect(score("Geräte", "gerate")).toBeGreaterThan(0);
  });
});

describe("hotkey recording", () => {
  const ev = (p: Partial<{ key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }>) => ({ key: "", code: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...p });
  it("converts keyboard events to companion notation", () => {
    expect(comboFromEvent(ev({ key: "F9", code: "F9", ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+F9");
    expect(comboFromEvent(ev({ key: "ß", code: "KeyS", shiftKey: true }))).toBe("Shift+S");
    expect(comboFromEvent(ev({ key: "MediaPlayPause", code: "MediaPlayPause" }))).toBe("MediaPlayPause");
    expect(describeCombo("Ctrl+VolumeMute", (x) => x)).toBe("Ctrl + Ton aus");
    expect(comboFromEvent(ev({ key: "1", code: "Numpad1" }))).toBe("Num1");
    expect(comboFromEvent(ev({ key: "Dead", code: "Backquote" }))).toBeNull();
  });
});

import { directPairUrl, isLoopbackAddress, pcAddressToWs, wsToPcAddress } from "./address";
import { sniffAudio } from "./pending-sounds";
describe("PC-Adresse", () => {
  it("turns typed or scanned addresses into WebSocket URLs", () => {
    expect(pcAddressToWs("gaming-pc.tail1234.ts.net", true)).toBe("wss://gaming-pc.tail1234.ts.net/ws");
    expect(pcAddressToWs("  https://gaming-pc.tail1234.ts.net/ ", true)).toBe("wss://gaming-pc.tail1234.ts.net/ws");
    expect(pcAddressToWs("wss://relay.example.com/ws?pc=mein-pc", true)).toBe("wss://relay.example.com/ws?pc=mein-pc");
    expect(pcAddressToWs("http://192.168.178.116:8787", false)).toBe("ws://192.168.178.116:8787/ws");
    expect(pcAddressToWs("192.168.178.116:8787", false)).toBe("ws://192.168.178.116:8787/ws");
    expect(pcAddressToWs("", true)).toBeNull();
    expect(pcAddressToWs("javascript:alert(1)", true)).toBeNull();
  });
  it("round-trips through the short display form", () => {
    for (const ws of ["wss://gaming-pc.tail1234.ts.net/ws", "ws://127.0.0.1:18787/ws"]) {
      const short = wsToPcAddress(ws);
      expect(pcAddressToWs(short.startsWith("ws") ? short : (ws.startsWith("wss") ? short : "http://" + short), ws.startsWith("wss"))).toBe(ws);
    }
  });
});

describe("loopback detection (127.0.0.1 is never the PC for another device)", () => {
  it("recognises loopback addresses", () => {
    for (const a of ["ws://127.0.0.1:8787/ws", "wss://localhost/ws", "ws://[::1]:8787/ws", "127.0.0.5", "localhost"]) expect(isLoopbackAddress(a)).toBe(true);
    for (const a of ["ws://192.168.178.116:8787/ws", "wss://gaming-pc.tail1234.ts.net/ws", "nilshenke-ops.github.io"]) expect(isLoopbackAddress(a)).toBe(false);
  });
});

describe("sounds added without PC: format check before storing", () => {
  const b = (...x: (number | string)[]) => new Uint8Array(x.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])).concat(Array(16).fill(0)));
  it("recognises supported formats and refuses others", () => {
    expect(sniffAudio(b("ID3", 4, 0))).toBe("mp3");
    expect(sniffAudio(b(0xff, 0xfb, 0x90))).toBe("mp3");
    expect(sniffAudio(b("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("wav");
    expect(sniffAudio(b("fLaC"))).toBe("flac");
    expect(sniffAudio(b(0, 0, 0, 0x20, "ftypM4A "))).toBe("m4a");
    expect(sniffAudio(b("OggS"))).toBeNull();
    expect(sniffAudio(b("<html>"))).toBeNull();
  });
});

describe("overlay layout", () => {
  it("places new widgets on free places of the real screen, never on top of each other", async () => {
    const { addWidget, DEFAULT_OVERLAY_LAYOUT } = await import("./overlay-layout");
    for (const view of [{ w: 1920, h: 1080 }, { w: 1400, h: 900 }, { w: 2560, h: 1440 }]) {
      let l = { ...DEFAULT_OVERLAY_LAYOUT, widgets: [] as typeof DEFAULT_OVERLAY_LAYOUT.widgets };
      for (const id of ["system", "capture", "quick", "soundboard", "favorites", "audio"]) l = addWidget(l, id, view);
      const rects = l.widgets.map((w) => ({ x: w.x * view.w, y: w.y * view.h, w: w.w, h: 340 }));
      const fitting = Math.floor((view.w - 32) / 352) * Math.floor((view.h - 80) / 340);
      for (let i = 0; i < Math.min(rects.length, fitting); i++)
        for (let j = 0; j < i; j++) {
          const a = rects[i], b = rects[j];
          expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, `${view.w}x${view.h}: ${l.widgets[i].id} overlaps ${l.widgets[j].id}`).toBe(false);
        }
      for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(view.w); }
    }
  });
});

describe("direct pairing link (website https → PC http in the home network)", () => {
  it("opens the PC's own page with the code, only for plain http addresses", () => {
    expect(directPairUrl("http://192.168.178.116:8787", "kpdh-v2w8")).toBe("http://192.168.178.116:8787/#/pair?code=KPDH-V2W8");
    expect(directPairUrl("192.168.178.116:8787", "")).toBe("http://192.168.178.116:8787/#/pair");
    expect(directPairUrl("https://gaming-pc.tail1234.ts.net", "ABCD-EFGH")).toBeNull();
    expect(directPairUrl("javascript:alert(1)", "ABCD-EFGH")).toBeNull();
    expect(directPairUrl("http://192.168.1.5:8787", "AB\"<x>")).toBe("http://192.168.1.5:8787/#/pair?code=ABX");
  });
});
