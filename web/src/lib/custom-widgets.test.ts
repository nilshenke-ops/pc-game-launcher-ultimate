import { describe, expect, it } from "vitest";
import { templates } from "./custom-widgets";

// What the companion accepts (CustomWidgetService): types, measured values and button targets.
const TYPES = ["text", "clock", "metric", "button", "image", "playtime", "nowPlaying", "music", "shape", "icon", "timer", "counter", "note", "until", "conn", "battery", "dice"];
const METRICS = ["cpu", "ram", "gpu", "gputemp", "cputemp", "disk"];
const MEDIA = ["playpause", "next", "prev", "volup", "voldown", "mute", "stop"];

describe("Vorlagen für neue Widgets", () => {
  const all = templates().map((x) => ({ name: x.name, w: x.make() }));
  it("es gibt viele (nicht nur vier), jeder Name einmal", () => {
    expect(all.length).toBeGreaterThanOrEqual(15);
    expect(new Set(all.map((x) => x.name)).size).toBe(all.length);
  });
  it("jedes Element wird vom PC akzeptiert", () => {
    for (const { name, w } of all) {
      expect(w.elements.length, name).toBeLessThanOrEqual(40);
      expect(new Set(w.elements.map((e) => e.id)).size, name).toBe(w.elements.length);
      for (const e of w.elements) {
        expect(TYPES, `${name}: ${e.type}`).toContain(e.type);
        for (const v of [e.x, e.y, e.w, e.h]) expect(v >= 0 && v <= 100, `${name}: Lage`).toBe(true);
        expect(e.x + e.w, `${name}: ragt nicht heraus`).toBeLessThanOrEqual(100.01);
        expect(e.y + e.h, `${name}: ragt nicht heraus`).toBeLessThanOrEqual(100.01);
        if (e.type === "metric") expect(METRICS, name).toContain(e.kind);
        if (e.type === "button" && e.action === "media") expect(MEDIA, name).toContain(e.ref);
        if (e.type === "button" && e.action === "open") expect(e.ref, name).toMatch(/^\/[a-z-]{0,30}$/);
        if (e.type === "timer" && e.kind === "countdown") expect(Number(e.ref), name).toBeGreaterThan(0);
        if (e.type === "until") expect(e.ref, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  it("Knöpfe ohne Text haben trotzdem ein Symbol", () => {
    for (const { name, w } of all) for (const e of w.elements) if (e.type === "button" && !e.text) expect(e.icon, name).toBeTruthy();
  });
});

import { untilText } from "../components/cw-extra";
import { newElement as newEl354 } from "./custom-widgets";
describe("Neue Bausteine (3.54)", () => {
  it("„Tage bis …“: Tage, am letzten Tag Stunden/Minuten, danach „Heute!“ bzw. „Vorbei“", () => {
    const now = new Date("2026-11-12T12:00:00");
    expect(untilText("2026-12-12", now).big).toBe("29 Tage");
    expect(untilText("2026-11-14", now).big).toBe("1 Tag");
    expect(untilText("2026-11-13", now).big).toBe("12 h 0 min");
    expect(untilText("2026-11-12", now)).toEqual({ big: "Heute!", done: true });
    expect(untilText("2026-11-01", now).big).toBe("Vorbei");
    expect(untilText("kein Datum", now).big).toBe("–");
    expect(untilText(null, now).big).toBe("–");
  });
  it("jeder neue Baustein hat sinnvolle Startwerte", () => {
    for (const ty of ["counter", "note", "until", "conn", "battery", "dice"] as const) {
      const e = newEl354(ty);
      expect(e.type).toBe(ty); expect(e.w).toBeGreaterThan(10); expect(e.h).toBeGreaterThan(10);
    }
    expect(newEl354("until").ref).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
