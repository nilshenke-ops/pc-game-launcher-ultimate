import { describe, expect, it } from "vitest";
import { discordSteps } from "./discord-check";
import type { AudioDevice, AudioSettings } from "./types";

const dev = (id: string, flow: "render" | "capture", cable = false, def = false): AudioDevice => ({ id, name: id, flow, isVirtualCable: cable, isDefault: def });
const devices = [dev("Lautsprecher", "render", false, true), dev("CABLE Input", "render", true), dev("Headset-Mikro", "capture", false, true), dev("Kopfhörer", "render")];
const base: AudioSettings = { soundboardVolume: 80, monitorEnabled: false, monitorVolume: 50, micPassthrough: false, micVolume: 100, playMode: "overlap", maxConcurrent: 4 };

describe("Discord-Check", () => {
  it("zeigt, was fehlt – und behauptet nichts über Discord selbst", () => {
    const st = discordSteps(base, devices).map((x) => x.state);
    expect(st).toEqual(["ok", "todo", "todo", "todo", "unknown"]);
    expect(discordSteps(base, devices.filter((d) => !d.isVirtualCable))[0].state).toBe("todo");
  });
  it("alles richtig eingestellt", () => {
    const s = { ...base, outputDeviceId: "CABLE Input", micPassthrough: true, micDeviceId: "Headset-Mikro", monitorEnabled: true, monitorDeviceId: "Kopfhörer" };
    expect(discordSteps(s, devices).map((x) => x.state)).toEqual(["ok", "ok", "ok", "ok", "unknown"]);
  });
  it("erkennt das Kabel als falsches Mikrofon", () => {
    const s = { ...base, micPassthrough: true, micDeviceId: "CABLE Output" };
    const d = [...devices, dev("CABLE Output", "capture", true)];
    expect(discordSteps(s, d)[2]).toMatchObject({ state: "todo" });
    expect(discordSteps(s, d)[2].detail).toContain("Headset-Mikrofon");
  });
});
