import { describe, expect, it } from "vitest";
import { fmtRun, researchAnswer, researchIntent } from "./gaming-research";
import { gamingIntent } from "./gaming-intel";

describe("JARVIS recherchiert: was gefragt ist", () => {
  it("Spiel-Infos", () => {
    expect(researchIntent("Was ist Hollow Knight für ein Spiel?")).toEqual({ kind: "info", game: "Hollow Knight" });
    expect(researchIntent("JARVIS, erzähl mir was über Elden Ring")).toEqual({ kind: "info", game: "Elden Ring" });
    expect(researchIntent("Wer hat Hades entwickelt?")).toEqual({ kind: "info", game: "Hades" });
    expect(researchIntent("Wann ist Baldur's Gate 3 erschienen?")).toEqual({ kind: "info", game: "Baldur's Gate 3" });
    expect(researchIntent("Lohnt sich Stardew Valley noch?")).toEqual({ kind: "info", game: "Stardew Valley" });
  });
  it("Preis, Spielerzahl, Kompatibilität", () => {
    expect(researchIntent("Was kostet Hades auf Steam?")).toEqual({ kind: "price", game: "Hades" });
    expect(researchIntent("Ist Elden Ring gerade im Angebot?")).toEqual({ kind: "price", game: "Elden Ring" });
    expect(researchIntent("Wie viele Leute spielen gerade Counter-Strike 2?")).toEqual({ kind: "players", game: "Counter-Strike 2" });
    expect(researchIntent("Läuft Cyberpunk 2077 auf meinem PC?")).toEqual({ kind: "compat", game: "Cyberpunk 2077" });
    expect(researchIntent("Systemanforderungen von Starfield")).toEqual({ kind: "compat", game: "Starfield" });
  });
  it("Speedrun und Free-to-Play", () => {
    expect(researchIntent("Was ist der Weltrekord in Celeste?")).toEqual({ kind: "speedrun", game: "Celeste" });
    expect(researchIntent("Speedrun-Rekord von Super Mario 64")).toEqual({ kind: "speedrun", game: "Super Mario 64" });
    expect(researchIntent("Gute Free-to-Play-Shooter?")).toEqual({ kind: "f2p", tag: "shooter", label: "Shooter" });
    expect(researchIntent("Free to play Spiele für schwache PCs")).toMatchObject({ kind: "f2p", tag: "low-spec" });
    // Free-to-play is not a giveaway.
    expect(gamingIntent("Gute Free-to-Play-Spiele")).toBeNull();
  });
  it("keine Verwechslung mit Befehlen", () => {
    expect(researchIntent("Starte Hades")).toBeNull();
    expect(researchIntent("Was ist neu in Hades?")).toBeNull();
    expect(researchIntent("Wie lange brauche ich noch für Hades?")).toBeNull();
  });
  it("Zeiten wie bei speedrun.com", () => {
    expect(fmtRun(1484.083)).toBe("24:44,083");
    expect(fmtRun(3725)).toBe("1:02:05");
  });
});

describe("Antworten", () => {
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  it("Weltrekord: nur dasselbe Spiel, mit Quelle", async () => {
    const f = (async (u: string) => u.includes("/records") ? json({ data: [{ category: { data: { name: "Any%" } }, players: { data: [{ rel: "user", names: { international: "Läufer" } }] }, runs: [{ run: { weblink: "https://www.speedrun.com/celeste/runs/x", times: { primary_t: 1484.083 }, date: "2025-03-01" } }] }] })
      : json({ data: [{ id: "a", names: { international: "Celeste Classic" }, weblink: "https://www.speedrun.com/cc" }, { id: "b", names: { international: "Celeste" }, weblink: "https://www.speedrun.com/celeste" }] })) as unknown as typeof fetch;
    const a = await researchAnswer({ kind: "speedrun", game: "Celeste" }, false, f);
    expect(a.text).toContain("Speedrun-Weltrekorde in Celeste");
    expect(a.text).toContain("Any%: 24:44,083 – Läufer (1.3.2025)");
    expect(a.links[0].url).toBe("https://www.speedrun.com/celeste");
  });
  it("Free-to-Play mit Namensnennung", async () => {
    const f = (async () => json([{ title: "Warframe", short_description: "Ninjas im Weltraum.", genre: "Shooter", game_url: "https://www.freetogame.com/open/warframe", publisher: "Digital Extremes", release_date: "2013-03-25" }])) as unknown as typeof fetch;
    const a = await researchAnswer({ kind: "f2p", tag: "shooter", label: "Shooter" }, false, f);
    expect(a.text).toContain("Warframe (Shooter, Digital Extremes)");
    expect(a.links.at(-1)!.url).toBe("https://www.freetogame.com");
  });
  it("ohne PC: Preis/Spielerzahl/Kompatibilität ehrlich nicht verfügbar", async () => {
    expect((await researchAnswer({ kind: "price", game: "Hades" }, false)).text).toContain("nur mit verbundenem PC");
    expect((await researchAnswer({ kind: "players", game: "Hades" }, false)).ok).toBeNull();
    expect((await researchAnswer({ kind: "compat", game: "Hades" }, false)).text).toContain("PC verbunden");
  });
});
