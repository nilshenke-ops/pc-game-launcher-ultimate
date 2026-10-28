import { describe, expect, it } from "vitest";
import { designIntent } from "./design-ai";
import { contrast, DEFAULT_THEME, type Theme } from "./prefs-core";

const base: Theme = { ...DEFAULT_THEME };
const change = (q: string, t: Theme = base) => { const r = designIntent(q, t); if (!r || r.kind !== "change") throw new Error(`no change for „${q}“`); return r; };

describe("KI-Design-Editor: Beispiele aus dem Auftrag", () => {
  it("heller, Cyberpunk, Minecraft, minimalistisch, lila Neon, große Schaltflächen", () => {
    const h = change("Mach mein Dashboard etwas heller.");
    expect(h.changes).toEqual(["Etwas heller"]);
    expect(h.theme.mode).toBe("dark");
    expect(h.theme.background).not.toBe(base.background);

    const c = change("Gestalte die Website im Cyberpunk-Stil.");
    expect(c.theme.preset).toBe("cyberpunk");
    expect(c.changes[0]).toBe("Theme „Cyberpunk“");

    const m = change("Erstelle ein Minecraft-Theme mit grünen Akzenten.");
    expect(m.theme.preset).toBe("minecraft");
    expect(m.theme.primary).toBe("#4ade80");

    const min = change("Mach das Design minimalistischer.");
    expect(min.theme.shadow).toBe("none");
    expect(min.theme.radius).toBeLessThanOrEqual(10);

    const l = change("Verwende ein dunkles Design mit lila Neon-Akzenten.");
    expect(l.theme.mode).toBe("dark");
    expect(l.theme.primary).toBe("#c084fc");
    expect(l.changes).toContain("Neon-Akzent Lila");

    const b = change("Mach die Schaltflächen größer, damit ich sie auf meinem iPad besser bedienen kann.");
    expect(b.theme.touch).toBe(true);
    expect(b.changes).toEqual(["Größere Schaltflächen und Felder"]);
  });
  it("alle genannten Themes", () => {
    for (const [q, id] of [["Neon Gaming", "neonglow"], ["Minimal Dark Design", "minimal"], ["Purple Gaming Theme", "purple"], ["Blue Gaming Theme", "blue"], ["Schwarz-Weiß Design", "mono"], ["Light Mode Design", "daylight"]] as const)
      expect(change(q).theme.preset, q).toBe(id);
  });
  it("weitere Stellgrößen", () => {
    expect(change("Mach die Ecken runder").theme.radius).toBe(22);
    expect(change("Mehr Abstand zwischen den Karten").theme.density).toBe("roomy");
    expect(change("Kompakter bitte, das Design").theme.density).toBe("compact");
    expect(change("Keine Schatten im Design").theme.shadow).toBe("none");
    expect(change("Deutlichere Rahmen um die Karten").theme.border).toBe("bold");
    expect(change("Weniger Animationen").theme.reduceMotion).toBe(true);
    expect(change("Schrift größer").theme.fontScale).toBe(1.1);
  });
  it("Antworten auf die Vorschau", () => {
    expect(designIntent("Übernehmen", base)).toEqual({ kind: "apply" });
    expect(designIntent("Design verwerfen", base)).toEqual({ kind: "discard" });
    expect(designIntent("Letzte Designänderung rückgängig", base)).toEqual({ kind: "undo" });
    expect(designIntent("Ursprüngliches Design wiederherstellen", base)).toEqual({ kind: "original" });
  });
  it("lässt anderes in Ruhe und schützt die Lesbarkeit", () => {
    expect(designIntent("Starte Minecraft", base)).toBeNull();
    expect(designIntent("Pack das Deck in die Leiste", base)).toBeNull();
    expect(designIntent("Zeig die Uhr auf dem Dashboard als Widget", base)).toBeNull();
    const light: Theme = { ...base, mode: "light", background: "#f8fafc" };
    const w = change("Akzentfarbe weiß", light);
    expect(contrast(w.theme.primary, w.theme.background)).toBeGreaterThanOrEqual(2.2);
    expect(w.notes.length).toBe(1);
  });
});
