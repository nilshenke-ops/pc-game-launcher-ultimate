import { describe, expect, it } from "vitest";
import { lineAt, parseLrc, speedText } from "./island-lyrics";

describe("island lyrics", () => {
  it("reads timed lines, several stamps per line, and skips the rest", () => {
    const l = parseLrc("[ti:Song]\n[00:01.50] Eins\n[00:10.00][01:00.00] Refrain\nohne Zeit\n[00:05] Zwei");
    expect(l).toEqual([{ ms: 1500, text: "Eins" }, { ms: 5000, text: "Zwei" }, { ms: 10000, text: "Refrain" }, { ms: 60000, text: "Refrain" }]);
  });
  it("finds the line for a position", () => {
    const l = parseLrc("[00:01.00] a\n[00:05.00] b\n[00:09.00] c");
    expect(lineAt(l, 0)).toBe(-1);
    expect(lineAt(l, 1000)).toBe(0);
    expect(lineAt(l, 8999)).toBe(1);
    expect(lineAt(l, 99999)).toBe(2);
  });
  it("formats speeds", () => {
    expect(speedText(null)).toBe("–");
    expect(speedText(0)).toBe("0 kB/s");
    expect(speedText(340_000)).toBe("340 kB/s");
    expect(speedText(1_250_000)).toBe("1,3 MB/s");
  });
});
