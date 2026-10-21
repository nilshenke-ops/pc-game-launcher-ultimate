import { describe as suite, expect, it } from "vitest";
import { describe } from "../pages/Inventory";
import { compareRows, type CrashReport } from "../pages/Crashes";

suite("inventory lines", () => {
  it("leave out missing facts instead of guessing", () => {
    expect(describe("gpu", { name: "RTX", driverVersion: null }).facts).toEqual(["Treiberversion nicht gelesen"]);
    expect(describe("network", { name: "eth0", up: true, speedMbit: null }).facts).toEqual(["Verbunden"]);
    expect(describe("drives", { name: "C:\\", label: null, format: "NTFS", totalBytes: 2e9, freeBytes: 1e9 }).facts[0]).toBe("NTFS");
  });
});

suite("crash report comparison", () => {
  const base: CrashReport = { id: "a", itemId: "g", game: "G", at: "2026-10-21T18:00:00Z", trigger: "crash", crashes: [{ eventType: "APPCRASH", app: "g.exe", module: "nvwgf2umx.dll", exceptionCode: "c0000005" }] };
  it("marks differing values and treats missing as –", () => {
    const rows = compareRows(base, { ...base, id: "b", crashes: [{ eventType: "APPCRASH", app: "g.exe", module: "game.dll", exceptionCode: "c0000005" }] });
    expect(rows.find((r) => r.label === "Fehlerbaustein")).toMatchObject({ same: false });
    expect(rows.find((r) => r.label === "Ausnahmecode")).toMatchObject({ same: true });
    expect(rows.find((r) => r.label === "Spielversion")).toMatchObject({ a: "–", b: "–", same: true });
  });
});
