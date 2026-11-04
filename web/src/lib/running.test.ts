import { describe, expect, it } from "vitest";
import { isAmbient, mainGame, playedGames } from "./running";

const g = (name: string) => ({ name, itemId: name });
describe("Laufendes Spiel", () => {
  it("Wallpaper Engine gilt als Hintergrundprogramm", () => {
    for (const n of ["Wallpaper Engine", "wallpaper engine", "Lively Wallpaper", "Rainmeter"]) expect(isAmbient(n)).toBe(true);
    for (const n of ["Among Us", "Minecraft", "", null, undefined]) expect(isAmbient(n)).toBe(false);
  });
  it("läuft ein anderes Spiel, steht Wallpaper Engine nicht da – egal in welcher Reihenfolge", () => {
    expect(mainGame([g("Wallpaper Engine"), g("Among Us")])?.name).toBe("Among Us");
    expect(mainGame([g("Among Us"), g("Wallpaper Engine")])?.name).toBe("Among Us");
    expect(playedGames([g("Wallpaper Engine"), g("Among Us")]).map((x) => x.name)).toEqual(["Among Us"]);
  });
  it("läuft sonst nichts, steht Wallpaper Engine da; ohne Programme nichts", () => {
    expect(mainGame([g("Wallpaper Engine")])?.name).toBe("Wallpaper Engine");
    expect(playedGames([g("Wallpaper Engine")])).toEqual([]);
    expect(mainGame([])).toBeNull();
    expect(mainGame(undefined)).toBeNull();
  });
});
