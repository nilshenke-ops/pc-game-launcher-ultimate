import { describe, expect, it } from "vitest";
import { filterCaptures, groupCaptures, type Capture } from "./captures";

const c = (id: string, game: string | null, taken: string, extra: Partial<Capture> = {}): Capture =>
  ({ id, name: id + ".png", folder: "Steam", kind: "image", size: 1, taken, game, favorite: false, tags: [], ...extra });

describe("capture library", () => {
  const items = [
    c("a", "Rocket League", "2026-10-20T18:00:00Z", { favorite: true, tags: ["Clutch"] }),
    c("b", null, "2026-10-20T19:00:00Z"),
    c("c", "Minecraft", "2026-10-19T10:00:00Z", { kind: "video" }),
    c("d", "Rocket League", "2026-10-18T10:00:00Z"),
  ];
  it("groups by game with the newest game first and unknown last", () => {
    expect(groupCaptures(items, "game", "Ohne").map(([k, v]) => [k, v.map((x) => x.id)])).toEqual([["Rocket League", ["a", "d"]], ["Minecraft", ["c"]], ["Ohne", ["b"]]]);
  });
  it("filters by kind, favorites and search over name, game and tags", () => {
    expect(filterCaptures(items, "video", "").map((x) => x.id)).toEqual(["c"]);
    expect(filterCaptures(items, "fav", "").map((x) => x.id)).toEqual(["a"]);
    expect(filterCaptures(items, "all", "clutch").map((x) => x.id)).toEqual(["a"]);
    expect(filterCaptures(items, "all", "mine").map((x) => x.id)).toEqual(["c"]);
  });
});
