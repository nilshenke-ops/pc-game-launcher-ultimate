import { describe, expect, it } from "vitest";
import { gb, isoWeek, loadWeather, pushHistory, sparkPoints, uptimeText, weekStrip } from "./island-dash";

describe("Insel-Übersicht", () => {
  it("Kalenderwoche nach ISO 8601", () => {
    expect(isoWeek(new Date(2026, 10, 12))).toBe(46);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);      // 1 Jan 2027 is a Friday: still week 53 of 2026
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1);     // Monday 30 Dec 2024 belongs to week 1 of 2025
  });
  it("Wochenleiste: Montag bis Sonntag, heute markiert", () => {
    const w = weekStrip(new Date(2026, 10, 12));          // Thursday
    expect(w.map((x) => x.day)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(w.filter((x) => x.today).map((x) => x.day)).toEqual([12]);
    expect(weekStrip(new Date(2026, 10, 1)).map((x) => x.day)).toEqual([26, 27, 28, 29, 30, 31, 1]);   // Sunday: the week before
  });
  it("Größen und Laufzeit lesbar", () => {
    expect(gb(15.2 * 1024 ** 3, "de-DE")).toBe("15,2 GB");
    expect(gb(953 * 1024 ** 3, "de-DE")).toBe("953 GB");
    expect(gb(512 * 1024 ** 2)).toBe("512 MB");
    expect(gb(null)).toBe("–");
    expect(uptimeText(0.15)).toBe("9 min");
    expect(uptimeText(3.2)).toBe("3 h 12 min");
    expect(uptimeText(52)).toBe("2 T 4 h");
    expect(uptimeText(undefined)).toBe("–");
  });
  it("Verlaufskurve: begrenzt, Lücken bleiben Lücken, erst ab zwei Werten", () => {
    let h: (number | null)[] = [];
    for (let i = 0; i < 50; i++) h = pushHistory(h, i * 3);
    expect(h).toHaveLength(40);
    expect(Math.max(...(h as number[]))).toBe(100);
    expect(sparkPoints([50])).toBe("");
    expect(sparkPoints([null, null])).toBe("");
    expect(sparkPoints([0, 100], 100, 24)).toBe("0.0,23.0 100.0,1.0");
    expect(sparkPoints([0, null, 100], 100, 24).split(" ")).toHaveLength(2);
  });
  it("Wetter: Ort gefunden → Werte; unbekannter Ort oder Ausfall → null", async () => {
    const ok = async (url: string) => new Response(JSON.stringify(url.includes("geocoding")
      ? { results: [{ name: "Köln", latitude: 50.9, longitude: 6.9 }] }
      : { current: { temperature_2m: 6.4, weather_code: 2 }, daily: { temperature_2m_max: [6.2], temperature_2m_min: [2.6] } }));
    expect(await loadWeather("Köln", ok, 1000)).toEqual({ place: "Köln", temp: 6, code: 2, hi: 6, lo: 3, at: 1000 });
    expect(await loadWeather("Nirgendwo", async () => new Response(JSON.stringify({ results: [] })))).toBeNull();
    expect(await loadWeather("Köln", async () => { throw new Error("offline"); })).toBeNull();
  });
});
