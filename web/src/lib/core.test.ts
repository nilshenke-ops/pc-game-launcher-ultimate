import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hmacSha256, loginProof, sha256, toHex, utf8 } from "./sha256";
import { en } from "./en";
// @ts-expect-error plain JS helper shared with the CLI script
import { collectKeys } from "../../scripts/i18n-keys.mjs";
import { contrast, defaultPrefs, sanitizePrefs } from "./prefs-core";
import { score } from "../components/search-score";
import { comboFromEvent } from "../pages/hotkey-combo";

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
  it("sanitizes invalid input to safe defaults", () => {
    const p = sanitizePrefs({ theme: { primary: "red; background:url(x)", radius: 999, fontScale: -1, bgImage: "javascript:alert(1)" }, layouts: [{ id: "x", name: "X", widgets: [{ id: "status", visible: true, size: "zz" }, { id: "evil", visible: true, size: "s" }] }], lang: "fr" });
    expect(p.theme.primary).toBe(defaultPrefs().theme.primary);
    expect(p.theme.radius).toBe(28);
    expect(p.theme.fontScale).toBe(0.85);
    expect(p.theme.bgImage).toBeNull();
    expect(p.layouts[0].widgets.find((w) => w.id === "status")!.size).toBe("m");
    expect(p.layouts[0].widgets.some((w) => (w.id as string) === "evil")).toBe(false);
    expect(p.layouts[0].widgets.length).toBe(12);
    expect(["de", "en"]).toContain(p.lang);
  });
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
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
    expect(comboFromEvent(ev({ key: "1", code: "Numpad1" }))).toBe("Num1");
    expect(comboFromEvent(ev({ key: "Dead", code: "Backquote" }))).toBeNull();
  });
});

import { pcAddressToWs, wsToPcAddress } from "./address";
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
