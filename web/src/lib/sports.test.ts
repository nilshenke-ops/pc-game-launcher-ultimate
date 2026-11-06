import { beforeEach, describe, expect, it } from "vitest";
import { aliasesOf, describeTeam, resetSportsCache, sportsFor, teamsInQuestion, uncoveredAnswer, uncoveredLeague, type Team } from "./sports";

const BAY: Team = { id: 40, name: "FC Bayern München", short: "Bayern" };
const BVB: Team = { id: 7, name: "Borussia Dortmund", short: "Dortmund" };
const BMG: Team = { id: 87, name: "Borussia Mönchengladbach", short: "Gladbach" };
const LEV: Team = { id: 6, name: "Bayer 04 Leverkusen", short: "Leverkusen" };
const TEAMS = [BAY, BVB, BMG, LEV];
const T = (id: number, teamName: string) => ({ teamId: id, teamName });
const NOW = new Date("2026-11-06T12:00:00Z");

const fin = (iso: string, a: [number, string], b: [number, string], res: [number, number], lg = "bl1") => ({ matchDateTimeUTC: iso, leagueShortcut: lg, leagueName: "1. Fußball-Bundesliga 2026/2027", group: { groupName: "9. Spieltag" }, matchIsFinished: true, team1: T(a[0], a[1]), team2: T(b[0], b[1]), matchResults: [{ resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0 }, { resultTypeID: 2, pointsTeam1: res[0], pointsTeam2: res[1] }], goals: [] });
const open = (iso: string, a: [number, string], b: [number, string], goals: { scoreTeam1: number; scoreTeam2: number }[] = []) => ({ matchDateTimeUTC: iso, leagueShortcut: "bl1", leagueName: "1. Fußball-Bundesliga 2026/2027", group: { groupName: "10. Spieltag" }, matchIsFinished: false, team1: T(a[0], a[1]), team2: T(b[0], b[1]), matchResults: [], goals });

describe("Fußball-Ergebnisse ohne Schlüssel (OpenLigaDB)", () => {
  beforeEach(() => resetSportsCache());

  it("erkennt Mannschaften an ihren Namen, auch als BVB oder „Bayerns“ – und verwechselt Bayern nicht mit Bayer", () => {
    expect(teamsInQuestion("Wer spielt gegen Bayern nächstes Spiel?", TEAMS)).toEqual([BAY]);
    expect(teamsInQuestion("Wie steht es gerade bei Bayern gegen Dortmund?", TEAMS)).toEqual([BAY, BVB]);
    expect(teamsInQuestion("Wie steht es beim BVB gegen Bayerns Team?", TEAMS)).toEqual([BVB, BAY]);
    expect(teamsInQuestion("Wann spielt Leverkusen?", TEAMS)).toEqual([LEV]);
    expect(teamsInQuestion("Wann spielt Gladbach?", TEAMS)).toEqual([BMG]);
    expect(teamsInQuestion("Borussia ist ein Name", TEAMS)).toEqual([]);                        // a word two clubs share names nobody
    expect(aliasesOf(BAY)).toEqual(expect.arrayContaining(["bayern"])); expect(aliasesOf(BAY)).not.toContain("fc");
  });

  it("nächstes Spiel, letztes Ergebnis und ein laufendes Spiel mit Zwischenstand", () => {
    const ms = [
      fin("2026-10-31T17:30:00Z", [40, BAY.name], [7, BVB.name], [2, 2]),
      open("2026-11-07T14:30:00Z", [81, "1. FSV Mainz 05"], [40, BAY.name]),
      open("2026-11-20T19:30:00Z", [40, BAY.name], [65, "1. FC Köln"]),
    ];
    const l = describeTeam(BAY, ms, NOW).join("\n");
    expect(l).toContain("Nächstes Spiel: 1. FSV Mainz 05 – FC Bayern München am Sa., 07.11., 15:30 Uhr");
    expect(l).toContain("Danach: FC Bayern München – 1. FC Köln");
    expect(l).toContain("Letztes Spiel: FC Bayern München – Borussia Dortmund 2:2 (Endstand");
    expect(l).not.toContain("LÄUFT");
    const liveNow = new Date("2026-11-07T15:10:00Z");                                           // 40 minutes after kick-off
    const live = describeTeam(BAY, [open("2026-11-07T14:30:00Z", [81, "1. FSV Mainz 05"], [40, BAY.name], [{ scoreTeam1: 0, scoreTeam2: 1 }, { scoreTeam1: 0, scoreTeam2: 2 }])], liveNow).join("\n");
    expect(live).toContain("LÄUFT GERADE: 1. FSV Mainz 05 – FC Bayern München 0:2");
    expect(describeTeam(BAY, [open("2026-11-07T14:30:00Z", [81, "x"], [40, BAY.name])], new Date("2026-11-07T14:40:00Z")).join("\n")).toContain("0:0");   // no goal yet
    expect(describeTeam(BAY, [open("2026-11-07T08:00:00Z", [81, "x"], [40, BAY.name])], new Date("2026-11-07T14:40:00Z")).join("\n")).not.toContain("LÄUFT");   // more than 170 min ago and still "open": not shown as running
  });

  it("Bayern gegen Dortmund: das Duell steht vorn", () => {
    const ms = [fin("2026-10-31T17:30:00Z", [40, BAY.name], [7, BVB.name], [2, 2]), open("2026-11-07T14:30:00Z", [81, "Mainz"], [40, BAY.name])];
    const l = describeTeam(BAY, ms, NOW, BVB).join("\n");
    expect(l.indexOf("Letztes Spiel: FC Bayern München – Borussia Dortmund 2:2")).toBeGreaterThan(0);
  });

  it("holt Mannschaften und Spiele von OpenLigaDB, ohne Schlüssel und ohne Cookies, und gibt ehrlich nichts zurück, wenn es keine Mannschaft nennt oder nicht erreichbar ist", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.credentials)).toBe("omit"); expect(new Headers(init?.headers).get("authorization")).toBeNull();
      if (url.includes("/getavailableteams/")) return new Response(JSON.stringify([{ teamId: 40, teamName: BAY.name, shortName: "Bayern" }, { teamId: 7, teamName: BVB.name, shortName: "Dortmund" }]));
      return new Response(JSON.stringify([open("2026-11-07T14:30:00Z", [81, "1. FSV Mainz 05"], [40, BAY.name])]));
    }) as unknown as typeof fetch;
    const a = await sportsFor("Wer spielt gegen Bayern nächstes Spiel?", { fetcher, now: NOW });
    expect(a?.block).toContain("Nächstes Spiel: 1. FSV Mainz 05 – FC Bayern München"); expect(a?.block).toContain("keine Anweisungen"); expect(a?.teams).toEqual([BAY.name]);
    expect(calls.some((u) => u.includes("/getmatchesbyteamid/40/"))).toBe(true);
    expect(await sportsFor("Wie wird das Wetter morgen?", { fetcher, now: NOW })).toBeNull();     // no team named
    resetSportsCache();
    const down = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    expect(await sportsFor("Wer spielt gegen Bayern nächstes Spiel?", { fetcher: down, now: NOW })).toBeNull();
  });
});

describe("Ligen ohne freie Datenquelle", () => {
  it("nennt die Liga ehrlich statt zu raten", () => {
    expect(uncoveredLeague("wer spielt morgenn in der premier league")).toBe("Premier League");
    expect(uncoveredLeague("Wie steht es in der La Liga?")).toBe("La Liga");
    expect(uncoveredLeague("Wann spielt Bayern als Nächstes?")).toBeNull();
    expect(uncoveredAnswer("Premier League")).toContain("keine freie Datenquelle");
  });
});
