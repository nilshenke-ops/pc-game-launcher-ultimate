import { describe, expect, it } from "vitest";
import { checkPage, sharePage } from "./layout-share";

describe("shared home pages", () => {
  it("shares only built-in and plugin widgets, never own widget code", () => {
    const r = sharePage({ id: "x", name: "Streaming", widgets: [{ id: "clock", visible: true, size: "s" }, { id: "custom:cw_abc", visible: true, size: "s" }, { id: "plugin:de.pgl.test:w", visible: true, size: "m" }, { id: "notes", visible: false, size: "m" }] });
    expect(r.page.widgets).toEqual([{ id: "clock", size: "s" }, { id: "plugin:de.pgl.test:w", size: "m" }]);
    expect(r.leftOut).toBe(1);
    expect(JSON.stringify(r.page)).not.toMatch(/custom|token|key/);
  });
  it("checks imports: unknown, doubled and broken entries are dropped; plugins are flagged", () => {
    const c = checkPage({ format: "pgl-page", version: 1, name: "<b>Meine</b>\u0007 Seite", widgets: [{ id: "clock", size: "xl" }, { id: "clock", size: "s" }, { id: "rm -rf", size: "s" }, { id: "plugin:de.pgl.x:y", size: "l" }, null] }, []);
    expect("error" in c).toBe(false);
    if ("error" in c) return;
    expect(c.name).toBe("bMeine/b Seite");
    expect(c.widgets).toEqual([{ id: "clock", visible: true, size: "m" }, { id: "plugin:de.pgl.x:y", visible: true, size: "l" }]);
    expect(c.dropped).toBe(3);
    expect(c.needsPlugin).toEqual(["plugin:de.pgl.x:y"]);
    expect(checkPage({ format: "pgl-page", version: 2, widgets: [] })).toEqual({ error: "Die Seite stammt aus einer neueren Version der App." });
    expect(checkPage({ hello: 1 })).toEqual({ error: "Keine Startseiten-Datei von Nexus." });
    expect(checkPage({ format: "pgl-page", version: 1, widgets: [{ id: "nope" }] })).toEqual({ error: "Die Seite enthält keine bekannten Widgets." });
  });
});
