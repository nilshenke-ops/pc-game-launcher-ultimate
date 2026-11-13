import { describe, expect, it } from "vitest";
import { addTile, cleanLayout, defaultLayout, MAX_TILES, moveTab, moveTile, opt, removeTile, setTabs, setTileOpt, tabsOf, validZone } from "./island-layout";

describe("island layout", () => {
  it("starts as the island always looked", () => {
    const d = defaultLayout(["music", "focus"]);
    expect(d.home.map((t) => t.type)).toEqual(["jarvis", "game", "music", "focus"]);
    expect(d.dash.map((t) => t.type)).toEqual(["calendar", "focus", "weather", "system"]);
    expect(defaultLayout([]).home.map((t) => t.type)).toEqual(["jarvis", "game"]);
  });
  it("keeps only known tiles, valid options and known areas", () => {
    const l = cleanLayout({
      tabs: ["dash", "kamera", "music", "music"],
      home: [{ id: "a1", type: "clock", opts: { zone: "Mars/Base", seconds: true, evil: 1 } }, { id: "a2", type: "browser" }, { id: "BAD ID", type: "note" }],
      dash: [{ id: "b1", type: "focus", opts: { minutes: 999 } }, { id: "b2", type: "weather", opts: { place: "Köln" } }],
    })!;
    expect(l.tabs).toEqual(["home", "dash", "music"]);
    expect(l.home).toEqual([{ id: "a1", type: "clock", opts: { seconds: true } }]);
    expect(opt<number>(l.dash[0], "minutes")).toBe(25); // out of range → default
    expect(opt<string>(l.dash[1], "place")).toBe("Köln");
    expect(cleanLayout(null)).toBeNull();
    expect(cleanLayout([1, 2])).toBeNull();
  });
  it("adds, removes and moves tiles, with a limit per page", () => {
    let l = defaultLayout();
    l = addTile(l, "dash", "clock");
    expect(l.dash.at(-1)!.type).toBe("clock");
    const id = l.dash.at(-1)!.id;
    l = moveTile(l, "dash", id, -1);
    expect(l.dash.at(-2)!.id).toBe(id);
    l = moveTile(l, "dash", l.dash[0].id, -1); // first one cannot go further left
    expect(l.dash[0].type).toBe("calendar");
    l = removeTile(l, "dash", id);
    expect(l.dash.some((t) => t.id === id)).toBe(false);
    for (let i = 0; i < 20; i++) l = addTile(l, "home", "note");
    expect(l.home.length).toBe(MAX_TILES.home);
  });
  it("changes an option only to a valid value", () => {
    let l = addTile(defaultLayout(), "dash", "clock");
    const id = l.dash.at(-1)!.id;
    l = setTileOpt(l, "dash", id, "zone", "Asia/Tokyo");
    expect(opt<string>(l.dash.at(-1)!, "zone")).toBe("Asia/Tokyo");
    l = setTileOpt(l, "dash", id, "zone", "Nirgendwo/Stadt");
    expect(opt<string>(l.dash.at(-1)!, "zone")).toBe("");
    expect(validZone("Europe/Berlin")).toBe(true);
    expect(validZone("<script>")).toBe(false);
  });
  it("keeps the start page in the strip and hides the game area without a game", () => {
    const l = setTabs(defaultLayout(), ["music", "game", "audio"]);
    expect(l.tabs).toEqual(["home", "music", "game", "audio"]);
    expect(tabsOf(l, ["home"], false)).toEqual(["home", "music", "audio"]);
    expect(tabsOf(l, ["home"], true)).toEqual(["home", "music", "game", "audio"]);
    expect(tabsOf(null, ["home", "dash"], false)).toEqual(["home", "dash"]);
    expect(moveTab(["home", "music", "audio"], "audio", -1)).toEqual(["home", "audio", "music"]);
  });
});
