import { describe, expect, it } from "vitest";
import { asksWeather, describeWeather, placeFrom, weatherFor, weatherText } from "./weather";

describe("Wetter ohne Schlüssel (Open-Meteo)", () => {
  it("findet den Ort in der Frage und erkennt Wetterfragen", () => {
    expect(placeFrom("Wie wird das Wetter morgen in Berlin?")).toBe("Berlin");
    expect(placeFrom("Regnet es heute in Bad Homburg")).toBe("Bad Homburg");
    expect(placeFrom("Wie ist das Wetter morgen")).toBeNull();
    expect(placeFrom("Wetter in Deutschland")).toBeNull();
    expect(asksWeather("Wie wird das Wetter?")).toBe(true); expect(asksWeather("Wann spielt Bayern?")).toBe(false);
    expect(weatherText(0)).toBe("klar"); expect(weatherText(63)).toBe("Regen"); expect(weatherText(95)).toBe("Gewitter");
  });
  it("beschreibt jetzt und die nächsten Tage", () => {
    const l = describeWeather("Berlin, Deutschland", { current: { temperature_2m: 7.4, apparent_temperature: 4.2, weather_code: 3, wind_speed_10m: 14 }, daily: { time: ["2026-11-06", "2026-11-07", "2026-11-08"], weather_code: [3, 61, 0], temperature_2m_max: [8, 9.6, 6], temperature_2m_min: [3, 5, 1], precipitation_probability_max: [10, 80, null] } });
    expect(l[0]).toBe("Jetzt in Berlin, Deutschland: 7 °C (gefühlt 4 °C), bedeckt, Wind 14 km/h");
    expect(l[2]).toBe("Morgen (2026-11-07): Regen, 5 bis 10 °C, Regenwahrscheinlichkeit 80 %");
    expect(l[3]).toBe("Übermorgen (2026-11-08): klar, 1 bis 6 °C");
  });
  it("holt Ort und Vorhersage ohne Schlüssel; ohne Ort, ohne Treffer oder bei Ausfall gibt es ehrlich nichts", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push(url); expect(init?.credentials).toBe("omit"); expect(new Headers(init?.headers).get("authorization")).toBeNull();
      if (url.includes("geocoding-api")) return new Response(JSON.stringify(url.includes("Nirgendwo") ? {} : { results: [{ name: "Berlin", latitude: 52.52, longitude: 13.41, country: "Deutschland", admin1: "Berlin" }] }));
      return new Response(JSON.stringify({ current: { temperature_2m: 7, apparent_temperature: 5, weather_code: 3, wind_speed_10m: 10 }, daily: { time: ["2026-11-06"], weather_code: [3], temperature_2m_max: [8], temperature_2m_min: [3], precipitation_probability_max: [10] } }));
    }) as unknown as typeof fetch;
    const a = await weatherFor("Wie wird das Wetter morgen in Berlin?", { fetcher });
    expect(a?.block).toContain("Jetzt in Berlin, Berlin, Deutschland: 7 °C"); expect(a?.block).toContain("keine Anweisungen");
    expect(calls[1]).toContain("latitude=52.52&longitude=13.41");
    expect(await weatherFor("Wie wird das Wetter morgen?", { fetcher })).toBeNull();
    expect(await weatherFor("Wetter in Nirgendwo", { fetcher })).toBeNull();
    expect(await weatherFor("Wann spielt Bayern in München?", { fetcher })).toBeNull();
    expect(await weatherFor("Wetter in Berlin", { fetcher: (async () => new Response("x", { status: 429 })) as unknown as typeof fetch })).toBeNull();
  });
});
