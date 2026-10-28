import { describe, expect, it } from "vitest";
import { analyse, perfIntent, type Now } from "./perf-chat";

const GB = 1073741824;
const base = (over: Partial<Now["sample"]> = {}, running: Now["running"] = [{ itemId: "g", name: "Cyberpunk 2077" }]): Now => ({
  sample: { cpuPercent: 35, memTotalBytes: 24 * GB, memUsedBytes: 10 * GB, gpus: [{ name: "NVIDIA GeForce RTX 5060 Laptop GPU", utilPercent: 60, tempC: 70, memUsedBytes: 4 * GB, memTotalBytes: 8 * GB }], disks: [{ name: "C:", label: "", totalBytes: 1000 * GB, freeBytes: 400 * GB }], fpsStatus: "Nicht verfügbar", ...over },
  running, gameRunning: running.length > 0,
});

describe("Leistungsfragen erkennen", () => {
  it("Beispiele aus dem Auftrag", () => {
    expect(perfIntent("Warum läuft mein Spiel langsam?")).toEqual({ kind: "slow" });
    expect(perfIntent("Welche Programme verbrauchen am meisten RAM?")).toEqual({ kind: "ram" });
    expect(perfIntent("Ist meine GPU aktuell stark ausgelastet?")).toEqual({ kind: "gpu" });
    expect(perfIntent("Was könnte meine FPS beeinträchtigen?")).toEqual({ kind: "fps" });
    expect(perfIntent("Wie warm ist meine GPU?")).toEqual({ kind: "temp" });
    expect(perfIntent("Warum laggt mein Spiel?")).toBeNull(); // network – the lag advisor answers
    expect(perfIntent("Starte Minecraft")).toBeNull();
  });
});

describe("Analyse: Messwerte getrennt von Vermutungen", () => {
  it("nennt echte Werte und keine erfundenen FPS", () => {
    const a = analyse(base(), null, "status");
    expect(a.measured).toContain("Läuft gerade: Cyberpunk 2077");
    expect(a.measured.some((l) => l.startsWith("GPU NVIDIA GeForce RTX 5060 Laptop GPU: 60 % ausgelastet, 70 °C, Grafikspeicher 4.0 GB von 8.0 GB") || l.includes("4,0 GB von 8,0 GB"))).toBe(true);
    expect(a.measured).toContain("FPS: Nicht verfügbar");
  });
  it("leitet Engpässe aus den Zahlen ab", () => {
    expect(analyse(base({ cpuPercent: 95, gpus: [{ name: "GPU", utilPercent: 40 }] }), null, "slow").guesses.join(" ")).toMatch(/CPU ist fast voll.*CPU-begrenzt/);
    expect(analyse(base({ gpus: [{ name: "GPU", utilPercent: 99, tempC: 88, memUsedBytes: 7.8 * GB, memTotalBytes: 8 * GB }] }), null, "fps").guesses.join(" ")).toMatch(/am Anschlag.*Grafikspeicher.*sehr warm/);
    expect(analyse(base({ memUsedBytes: 22 * GB }), null, "slow").guesses.join(" ")).toMatch(/Arbeitsspeicher ist knapp/);
    expect(analyse(base({ disks: [{ name: "C:", label: "", totalBytes: 500 * GB, freeBytes: 20 * GB }] }), null, "slow").guesses.join(" ")).toMatch(/Wenig freier Speicher auf C:/);
    // Nothing striking: says so, names what it cannot measure – no invented cause.
    expect(analyse(base(), null, "slow").guesses[0]).toMatch(/keinen Engpass/);
  });
  it("schlägt nie Windows-, Treiber-, Launcher- oder Schutzprozesse und nicht das Spiel selbst zum Schließen vor", () => {
    const top = { ram: [{ name: "Cyberpunk 2077", ramMb: 9000, count: 1 }, { name: "svchost", ramMb: 2000, count: 80 }, { name: "MsMpEng", ramMb: 600, count: 1 }, { name: "steamwebhelper", ramMb: 900, count: 8 }, { name: "chrome", ramMb: 3100, count: 30 }, { name: "Discord", ramMb: 800, count: 6 }], cpu: [] };
    const tip = analyse(base({ memUsedBytes: 21 * GB }), top, "ram").tips.join(" ");
    expect(tip).toContain("chrome, Discord");
    expect(tip).not.toMatch(/svchost|MsMpEng|steamwebhelper|Cyberpunk/);
  });
});
