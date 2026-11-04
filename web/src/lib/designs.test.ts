import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BG_SCENES, colsOf, DEFAULT_LAYOUT, rowsOf, sizeOfCols, DEFAULT_PRESET, DEFAULT_THEME, defaultPrefs, HOME_VARIANT, homeVariant, LEGACY_PRESETS, lookOf, PRESETS, sanitizePrefs } from "./prefs-core";

describe("Die fünf Designs", () => {
  it("genau fünf, das Lavendel-Glas ist der Standard", () => {
    expect(Object.keys(PRESETS)).toEqual(["lavendel", "controller", "nacht", "chrom", "chromhell"]);
    expect(DEFAULT_PRESET).toBe("lavendel");
    expect(DEFAULT_THEME).toMatchObject({ preset: "lavendel", surface: "glass", bgScene: "h-lavendel" });
    expect(defaultPrefs().theme.preset).toBe("lavendel");
  });
  it("jedes Design hat eine Startseiten-Variante, eine Glas-Oberfläche und eine vorhandene Hintergrundgrafik", () => {
    for (const id of Object.keys(PRESETS)) {
      expect(HOME_VARIANT[id], id).toBeTruthy();
      expect(PRESETS[id].atmo?.surface, id).toBe("glass");
      const scene = PRESETS[id].atmo!.scene!;
      expect(BG_SCENES.some((s) => s.id === scene), id).toBe(true);
      expect(existsSync(new URL(`../../public/backgrounds/${scene}.svg`, import.meta.url)), scene).toBe(true);
    }
    expect(homeVariant("custom")).toBe("glass"); // own colours keep the glass home screen
  });
  it("die Farben und das Aussehen eines Designs setzt lookOf in einem Zug; Unbekanntes wird zum Standard", () => {
    expect(lookOf("chromhell")).toMatchObject({ preset: "chromhell", mode: "light", surface: "glass", bgScene: "h-chromhell" });
    expect(lookOf("gibt-es-nicht").preset).toBe("lavendel");
  });
  it("ein gespeichertes Design aus früheren Versionen wird einmal durch den Standard ersetzt; Schriftgröße und Bewegung bleiben", () => {
    expect(LEGACY_PRESETS.has("neon") && LEGACY_PRESETS.has("applelight")).toBe(true);
    const old = sanitizePrefs({ theme: { preset: "neon", mode: "dark", primary: "#22d3ee", accent: "#a78bfa", background: "#070b16", fontScale: 1.2, reduceMotion: true, surface: "flat", bgScene: "d-chrome" }, fx: { bg: { kind: "particles" } } });
    expect(old.theme).toMatchObject({ preset: "lavendel", surface: "glass", bgScene: "h-lavendel", fontScale: 1.2, reduceMotion: true });
    expect(old.fx.bg.kind).toBe("none");
  });
  it("eigene Farben (custom) und gewählte neue Designs bleiben, wie sie sind", () => {
    const own = sanitizePrefs({ theme: { preset: "custom", mode: "light", primary: "#112233", accent: "#445566", background: "#eef2f7", surface: "flat" } });
    expect(own.theme).toMatchObject({ preset: "custom", primary: "#112233", surface: "flat", bgScene: null });
    expect(sanitizePrefs({ theme: { ...lookOf("nacht") } }).theme).toMatchObject({ preset: "nacht", bgScene: "h-nacht" });
  });
});

describe("Startseite: Schnellstart und Erste Schritte nicht mehr im Standard", () => {
  const vis = (p: ReturnType<typeof sanitizePrefs>, id: string) => p.layouts.find((l) => l.id === "default")!.widgets.find((w) => w.id === id)?.visible;
  it("neues Gerät: beide aus", () => {
    const p = sanitizePrefs({});
    expect(vis(p, "shortcuts")).toBe(false);
    expect(vis(p, "start")).toBe(false);
    expect(vis(p, "next")).toBe(true);
  });
  it("gespeicherter Standard (beide an) wird einmal bereinigt, danach bleibt die eigene Wahl", () => {
    const old = structuredClone(DEFAULT_LAYOUT);
    for (const w of old.widgets) if (w.id === "shortcuts" || w.id === "start") w.visible = true;
    const once = sanitizePrefs({ layouts: [old] } as never);
    expect(vis(once, "shortcuts")).toBe(false);
    expect(once.homeTidied).toBe(true);
    // The person switches them on again: it stays that way.
    const on = structuredClone(once); for (const w of on.layouts[0].widgets) if (w.id === "shortcuts") w.visible = true;
    expect(vis(sanitizePrefs(on), "shortcuts")).toBe(true);
  });
  it("eigene Layouts bleiben unberührt", () => {
    const own = { id: "mein", name: "Mein Layout", widgets: [{ id: "shortcuts", visible: true, size: "m" }] };
    const p = sanitizePrefs({ layouts: [own] } as never);
    expect(p.layouts.find((l) => l.id === "mein")!.widgets.find((w) => w.id === "shortcuts")!.visible).toBe(true);
  });
});

describe("Freie Widget-Größen", () => {
  const widgetsOf = (w: unknown) => sanitizePrefs({ layouts: [{ id: "mein", name: "Mein", widgets: [w] }] } as never).layouts.find((l) => l.id === "mein")!.widgets.find((x) => x.id === "status")!;
  it("Breite (1–4) und Höhe (2–4) bleiben erhalten, Unsinn fliegt raus", () => {
    expect(widgetsOf({ id: "status", visible: true, size: "m", cols: 3, rows: 3 })).toMatchObject({ cols: 3, rows: 3 });
    const bad = widgetsOf({ id: "status", visible: true, size: "m", cols: 9, rows: 0 });
    expect(bad.cols).toBeUndefined(); expect(bad.rows).toBeUndefined();
    expect(widgetsOf({ id: "status", visible: true, size: "m", cols: "3", rows: 1.5 }).cols).toBeUndefined();
  });
  it("ohne Angaben zählt S/M/L wie bisher", () => {
    expect([colsOf({ size: "s" }), colsOf({ size: "m" }), colsOf({ size: "l" })]).toEqual([1, 2, 4]);
    expect(colsOf({ size: "m", cols: 3 })).toBe(3);
    expect(rowsOf({})).toBe(1); expect(rowsOf({ rows: 3 })).toBe(3);
    expect([sizeOfCols(1), sizeOfCols(2), sizeOfCols(3), sizeOfCols(4)]).toEqual(["s", "m", "l", "l"]);
  });
  it("Deck-Farben: nur true gilt als „eigene Farben“", () => {
    expect(sanitizePrefs({ deckOwn: true } as never).deckOwn).toBe(true);
    expect(sanitizePrefs({ deckOwn: "ja" } as never).deckOwn).toBe(false);
    expect(sanitizePrefs({} as never).deckOwn).toBe(false);
  });
});
