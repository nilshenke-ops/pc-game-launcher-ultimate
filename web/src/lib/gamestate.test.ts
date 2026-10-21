import { describe, expect, it } from "vitest";
import { reverse } from "../pages/GameState";

describe("restore preview direction", () => {
  it("shows now → snapshot: values and added/removed are swapped", () => {
    const r = reverse({
      changes: [{ area: "Start", key: "Startargumente", old: "-windowed", new: "-dx12" }],
      files: [{ name: "a.ini", diff: { mode: "keys", changes: [{ kind: "changed", key: "Display.fov", old: "90", new: "120" }, { kind: "added", key: "Display.shadows", new: "ultra" }] } }],
    });
    expect(r.changes[0]).toMatchObject({ old: "-dx12", new: "-windowed" });
    const keys = r.files[0].diff!.mode === "keys" ? r.files[0].diff!.changes : [];
    expect(keys[0]).toMatchObject({ kind: "changed", old: "120", new: "90" });
    expect(keys[1]).toMatchObject({ kind: "removed", old: "ultra" });
  });
});
