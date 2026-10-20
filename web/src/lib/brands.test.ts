import { describe, expect, it } from "vitest";
import { BRANDS, brandFor, isGameBrand } from "./brands";

describe("logos", () => {
  it("finds the right logo by the name the PC reports", () => {
    const id = (name: string, target = "") => brandFor({ name, target })?.id;
    expect(id("Minecraft Launcher")).toBe("minecraft");
    expect(id("Minecraft: Java & Bedrock Edition")).toBe("minecraft");
    expect(id("Hollow Knight")).toBe("hollowknight");
    expect(id("Hollow Knight: Silksong")).toBe("silksong");
    expect(id("Forza Motorsport")).toBe("forzam");
    expect(id("Forza Horizon 5")).toBe("forza");
    expect(id("EA SPORTS FC™ 25")).toBe("fc");
    expect(id("Call of Duty®: Black Ops 6")).toBe("cod");
    expect(id("Rocket League®")).toBe("rocketleague");
    expect(id("Among Us")).toBe("amongus");
    expect(id("Destiny 2")).toBe("destiny2");
    expect(id("Discord")).toBe("discord");
    expect(id("OBS Studio")).toBe("obs");
    expect(id("Steam")).toBe("steam");
    expect(id("Xbox")).toBe("xbox");
    expect(id("Spotify", "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")).toBe("spotify");
    // No logo is better than a wrong one.
    for (const n of ["Notepad", "Arkham Knight", "Doomsday Clock", "Rust Analyzer", "Overwatch 2", "Grand Theft Auto V"]) expect(id(n), n).toBeUndefined();
  });

  it("every logo is plain vector data and has a unique id", () => {
    expect(new Set(BRANDS.map((b) => b.id)).size).toBe(BRANDS.length);
    for (const b of BRANDS) {
      expect(!!b.path !== !!b.body, b.id).toBe(true);
      if (b.body) expect(b.body, b.id).not.toMatch(/<script|<a\b|<image|<use|href|\bon[a-z]+=|javascript:|url\(/i);
      expect(b.hex, b.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(BRANDS.filter(isGameBrand).length).toBeGreaterThanOrEqual(50);
  });
});
