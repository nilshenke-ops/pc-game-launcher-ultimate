import { describe, expect, it } from "vitest";
import { defaultPrefs, keepMotion } from "./prefs-core";

describe("Bewegung gehört dem Gerät, nicht dem Konto", () => {
  it("ein Design aus der Cloud schaltet Animationen auf diesem Gerät nicht ab", () => {
    const remote = defaultPrefs(); remote.theme.reduceMotion = true; remote.theme.lite = true; remote.theme.primary = "#ff0000";
    const own = defaultPrefs().theme;                                       // this device: movement on
    const merged = keepMotion(remote, own);
    expect(merged.theme.reduceMotion).toBe(false);
    expect(merged.theme.lite).toBe(false);
    expect(merged.theme.primary).toBe("#ff0000");                           // everything else comes from the account
  });
  it("wer auf diesem Gerät bewusst reduziert hat, behält das", () => {
    const own = defaultPrefs().theme; own.reduceMotion = true;
    expect(keepMotion(defaultPrefs(), own).theme.reduceMotion).toBe(true);
  });
});
