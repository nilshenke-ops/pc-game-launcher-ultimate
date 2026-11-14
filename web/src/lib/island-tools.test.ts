import { describe, expect, it } from "vitest";
import { addItem, breathePhase, bump, clearDone, countdownParts, parseChecklist, roll, safeLink, toggleItem } from "./island-tools";
import { ACCENT_GROUPS, ACCENTS, EFFECTS } from "./island-theme";
import { ALL_TABS, catalog, cleanLayout, defaultLayout, setView, sortTabs, sortTiles, TILE_DEFS, viewOf } from "./island-layout";

describe("island tools", () => {
  it("rolls fair ranges", () => {
    expect(roll("d6", 0, 0).value).toBe(1);
    expect(roll("d6", 0, 0.9999).value).toBe(6);
    expect(roll("d20", 0, 0.9999).value).toBe(20);
    expect(roll("num", 50, 0.9999).value).toBe(50);
    expect(roll("coin", 0, 0.2).text).toBe("Kopf");
    expect(roll("coin", 0, 0.7).text).toBe("Zahl");
  });
  it("counts down to a date and refuses impossible ones", () => {
    const now = new Date(2026, 10, 14, 12, 0).getTime();
    expect(countdownParts("2026-11-16", "18:30", now)).toMatchObject({ past: false, days: 2, hours: 6, minutes: 30 });
    expect(countdownParts("2026-11-13", "", now)?.past).toBe(true);
    expect(countdownParts("2026-02-31", "", now)).toBeNull();
    expect(countdownParts("16.11.2026", "", now)).toBeNull();
    expect(countdownParts("2026-11-16", "25:00", now)).toBeNull();
  });
  it("keeps a checklist as text", () => {
    let s = addItem("", "Brot");
    s = addItem(s, "Milch");
    s = toggleItem(s, 0);
    expect(parseChecklist(s)).toEqual([{ text: "Brot", done: true }, { text: "Milch", done: false }]);
    expect(clearDone(s)).toBe("Milch");
    expect(addItem("x".repeat(295), "zu lang")).toBe("x".repeat(295)); // never over 300 characters
  });
  it("breathes in the chosen rhythm", () => {
    expect(breathePhase("box", 0).label).toBe("Einatmen");
    expect(breathePhase("box", 4500).label).toBe("Halten");
    expect(breathePhase("box", 8500).label).toBe("Ausatmen");
    expect(breathePhase("calm", 4000 + 7000 + 100).label).toBe("Ausatmen");
    expect(breathePhase("even", 5000 + 100).label).toBe("Ausatmen");
    expect(breathePhase("box", 2000).size).toBeCloseTo(0.5, 1);
  });
  it("opens only web addresses", () => {
    expect(safeLink("twitch.tv/foo")).toEqual({ url: "https://twitch.tv/foo", name: "twitch.tv" });
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("data:text/html,x")).toBeNull();
    expect(safeLink("file:///C:/x")).toBeNull();
    expect(safeLink("")).toBeNull();
  });
  it("keeps the counter in range", () => {
    expect(bump(99999, 5)).toBe(99999);
    expect(bump(-2, -1)).toBe(-3);
  });
});

describe("island layout 3.63", () => {
  it("keeps views and drops unknown ones", () => {
    const l = cleanLayout({ home: [], view: { home: "list", dash: "karussell" } })!;
    expect(viewOf(l, "home")).toBe("list");
    expect(viewOf(l, "dash")).toBe("cards");
    expect(setView(l, "home", "cards").view).toBeUndefined();
  });
  it("sorts tiles and areas", () => {
    const l = defaultLayout(["music", "focus"]);
    expect(sortTiles(l, "home", "az").home.map((x) => x.type)).toEqual(["focus", "jarvis", "music", "game"]);
    expect(sortTiles(l, "home", "reverse").home.map((x) => x.type)).toEqual(["focus", "music", "game", "jarvis"]);
    const lab = (x: string) => x;
    expect(sortTabs(["home", "music", "dash"], "usual", lab)).toEqual(["home", "dash", "music"]);
    expect(sortTabs(["music", "home", "dash"], "az", lab)).toEqual(["home", "dash", "music"]);
  });
  it("filters and sorts the catalog", () => {
    expect(catalog({ cat: "new" }).every((d) => d.isNew)).toBe(true);
    expect(catalog({ cat: "new" }).length).toBe(8);
    expect(catalog({ query: "würfel" }).map((d) => d.type)).toEqual(["dice"]);
    expect(catalog({ sort: "new" })[0].isNew).toBe(true);
    expect(catalog({}).length).toBe(TILE_DEFS.length);
    expect(ALL_TABS).toContain("tools");
  });
  it("every colour sits in exactly one group; effects have unique ids", () => {
    const grouped = ACCENT_GROUPS.flatMap((g) => g.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(ACCENTS.map((a) => a.id).sort());
    expect(new Set(EFFECTS.map((e) => e.id)).size).toBe(EFFECTS.length);
  });
});
