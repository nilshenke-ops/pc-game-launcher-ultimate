import { describe, expect, it } from "vitest";
import { slimLongStrings } from "./offline-cache";

describe("slimLongStrings", () => {
  it("drops picture data URLs but keeps names, links and numbers", () => {
    const big = "data:image/png;base64," + "A".repeat(30_000);
    const out = slimLongStrings({ items: [{ id: "1", name: "Spiel", rating: 4, coverUrl: "https://x/y.jpg", iconData: big, categories: ["Indie"] }] });
    expect(out).toEqual({ items: [{ id: "1", name: "Spiel", rating: 4, coverUrl: "https://x/y.jpg", categories: ["Indie"] }] });
  });
  it("leaves small data untouched", () => {
    expect(slimLongStrings({ a: [1, "b", null, true] })).toEqual({ a: [1, "b", null, true] });
  });
});
