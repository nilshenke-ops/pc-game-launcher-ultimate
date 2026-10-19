import { describe, expect, it } from "vitest";
import { applySetup, setupReply, type SetupOp } from "./assistant-setup";
import { defaultPrefs } from "./prefs-core";
import { navItems } from "./nav";

const items = navItems();
const ask = (q: string, p = defaultPrefs()) => setupReply(q, p, items);
const ops = (q: string, p = defaultPrefs()) => (ask(q, p)?.actions ?? []).filter((a) => a.kind === "setup").map((a) => a.params as unknown as SetupOp);
const run = (q: string, p = defaultPrefs(), pick = 0) => applySetup(p, ops(q, p)[pick], true);

describe("assistant: set up the app by request", () => {
  it("design: light, dark, colours, background, text size", () => {
    expect(run("Mach das Design hell").theme.mode).toBe("light");
    expect(run("Bitte dunkles Design").theme.mode).toBe("dark");
    expect(run("Mach die Farben grün").theme.primary).toBe("#34d399");
    const bg = run("Hintergrund Weltall");
    expect(bg.theme.bgScene).toBe("space");
    expect(run("Hintergrund entfernen", bg).theme.bgScene).toBeNull();
    expect(run("Schrift größer").theme.fontScale).toBeGreaterThan(1);
    expect(run("Design zurücksetzen", run("Mach die Farben grün")).theme.primary).toBe("#22d3ee");
  });

  it("bottom bar: add, remove, never more than four – offers a swap instead", () => {
    const p = defaultPrefs(); // Home, Deck, Spiele, Sounds
    expect(ask("Pack den Backlog in die Leiste", p)!.actions.length).toBe(4); // full: one button per place to swap
    const swapped = run("Pack den Backlog in die Leiste", p, 3);
    expect(swapped.nav.bottom).toEqual(["/", "/deck", "/games", "/backlog"]);
    const fewer = run("Nimm Sounds aus der Leiste", p);
    expect(fewer.nav.bottom).toEqual(["/", "/deck", "/games"]);
    expect(run("Pack den Assistenten in die Leiste", fewer).nav.bottom).toEqual(["/", "/deck", "/games", "/assistant"]);
    expect(ask("Pack das Deck in die Leiste", p)!.actions).toHaveLength(0); // already there – said, nothing to do
    expect(run("Leiste schlicht wie früher", p).nav.colors).toBe(false);
    expect(run("Leiste wieder farbig", run("Leiste schlicht", p)).nav.colors).toBe(true);
  });

  it("home widgets and menu", () => {
    const p = run("Zeig die Uhr auf Home");
    const layout = p.layouts.find((l) => l.id === p.activeLayout.mobile)!;
    expect(layout.widgets[0]).toMatchObject({ id: "clock", visible: true });
    const q = run("Blende die Notizen auf der Startseite aus", p);
    expect(q.layouts[0].widgets.find((w) => w.id === "notes")!.visible).toBe(false);
    expect(run("Blende Deal Radar aus").nav.hidden).toContain("/deals");
    expect(ask("Blende Einstellungen aus")!.actions).toHaveLength(0); // fixed areas stay
  });

  it("language and profile designs", () => {
    expect(run("Stell die Sprache auf Englisch").lang).toBe("en");
    expect(run("Profil-Designs aus").profileThemes).toBe(false);
  });

  it("other questions are left to the normal assistant, results stay valid settings", () => {
    for (const q of ["Wie richte ich Discord ein?", "Starte Rocket League", "Was soll ich als Nächstes spielen?", "Öffne das Deck", "Wie heiß ist meine GPU?"]) expect(ask(q), q).toBeNull();
    // A manipulated action (e.g. from an old chat) cannot break the settings: results are checked like stored settings.
    const p = applySetup(defaultPrefs(), { op: "bar", paths: ["javascript:alert(1)", "/deck"] }, true);
    expect(p.nav.bottom).toEqual(["/deck"]);
    expect(applySetup(defaultPrefs(), { op: "font", value: 99 }, true).theme.fontScale).toBeLessThanOrEqual(1.35);
  });
});
