import { describe, expect, it } from "vitest";
import { applyNightReply, applyPollReply, groupFinder, inZone, linkFor, newKey, readLink, rsvpCount, tally, zonedToUtc, type Poll } from "./friends";
import { encodeShare } from "./play";

describe("group finder", () => {
  const players = [
    { id: "1", name: "Ich", games: [{ name: "Minecraft", platform: "PC" }, { name: "Fortnite", platform: "PC" }, { name: "Rocket League", platform: "PC" }, { name: "Hades", platform: "PC" }] },
    { id: "2", name: "Mia", games: [{ name: "minecraft", platform: "pc" }, { name: "Fortnite", platform: "PlayStation" }, { name: "Rocket League", platform: "Xbox" }] },
    { id: "3", name: "Tom", games: [{ name: "Minecraft", platform: "PC" }, { name: "Fortnite", platform: "Switch" }, { name: "Rocket League", platform: "PC" }] },
  ];
  it("same platform first, crossplay only with a source, unknown stays unknown, missing named", () => {
    const facts = [{ title: "Fortnite", crossplay: "yes", crossplaySource: "https://example.com/crossplay" }, { title: "Rocket League", crossplay: "yes" /* no source */, maxPlayers: 2 }];
    const r = groupFinder(players, facts);
    expect(r.map((x) => [x.game, x.kind])).toEqual([["Minecraft", "same-platform"], ["Fortnite", "crossplay"], ["Rocket League", "crossplay-unknown"], ["Hades", "missing"]]);
    expect(r[0].common).toEqual(["PC"]);
    expect(r[1].source).toBe("https://example.com/crossplay");
    expect(r[2].tooMany).toBe(true); // 3 players, 2 allowed
    expect(r[3].missing).toEqual(["Mia", "Tom"]);
    expect(groupFinder(players.slice(0, 2), [{ title: "Rocket League", crossplay: "no", crossplaySource: "https://x" }]).find((x) => x.game === "Rocket League")!.kind).toBe("no-crossplay");
    expect(groupFinder([], [])).toEqual([]);
  });
});

describe("links", () => {
  const key = newKey();
  it("keys are long and random", () => { expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/); expect(newKey()).not.toBe(key); });
  it("invite and reply links round-trip and foreign data is checked", () => {
    const link = linkFor("https://site/", "polls", { k: "poll", id: "j_abc123456", key, title: "Was spielen wir?", options: ["A", "B"], multi: false });
    const part = link.split("&l=")[1];
    expect(readLink(part)).toMatchObject({ k: "poll", options: ["A", "B"] });
    expect(readLink(encodeShare({ k: "poll", id: "j_abc123456", key, title: "x", options: ["nur eine"] }))).toBeNull();
    expect(readLink(encodeShare({ k: "poll", id: "../x", key, options: ["a", "b"] }))).toBeNull();
    expect(readLink(encodeShare({ k: "reply", to: "poll", id: "j_abc123456", key, name: "Mia", choices: [0, 99] }))).toBeNull();
    expect(readLink(encodeShare({ k: "reply", to: "night", id: "j_abc123456", key, name: "Mia", rsvp: "vielleicht" }))).toBeNull();
    expect(readLink(encodeShare({ k: "night", id: "j_abc123456", key, title: "Abend", start: "2026-11-01T19:00:00Z", tz: "Mars/Olympus", minutes: 120 }))).toBeNull();
    expect(readLink("kaputt!")).toBeNull();
  });
});

describe("polls", () => {
  const base: Poll = { title: "Spiel", options: [{ text: "Minecraft" }, { text: "Fortnite" }], key: "k".repeat(22), votes: [] };
  const reply = (name: string, choices: number[], key = base.key) => ({ k: "reply" as const, to: "poll" as const, id: "j_x", key, name, choices });
  it("one vote per name, replaced by a new reply; revoked, closed and expired polls refuse", () => {
    let p = applyPollReply(base, reply("Mia", [0])).poll;
    p = applyPollReply(p, reply("Tom", [1])).poll;
    const again = applyPollReply(p, reply("mia", [1]));
    expect(again.result).toEqual({ ok: true, replaced: true });
    p = again.poll;
    expect(tally(p).counts.map((c) => c.votes)).toEqual([0, 2]);
    expect(tally(p).winners.map((w) => w.text)).toEqual(["Fortnite"]);
    expect(applyPollReply(p, reply("Lea", [0], "old-key-old-key-1234")).result).toEqual({ ok: false, reason: "revoked" });
    expect(applyPollReply({ ...p, closed: true }, reply("Lea", [0])).result).toEqual({ ok: false, reason: "closed" });
    expect(applyPollReply({ ...p, until: "2020-01-01T00:00:00Z" }, reply("Lea", [0])).result).toEqual({ ok: false, reason: "expired" });
    expect(applyPollReply(p, reply("Lea", [0, 1])).result).toEqual({ ok: false, reason: "invalid" }); // single choice
    expect(applyPollReply({ ...p, multi: true }, reply("Lea", [0, 1])).result.ok).toBe(true);
    expect(tally(base)).toMatchObject({ winners: [], voters: 0 });
  });
});

describe("gaming nights", () => {
  it("RSVP by reply link, counted; cancelled nights refuse", () => {
    const n = { key: "k".repeat(22), invitees: [{ name: "Mia", rsvp: "open" as const }] };
    const r1 = applyNightReply(n, { k: "reply", to: "night", id: "j_x", key: n.key, name: "mia", rsvp: "yes" });
    const r2 = applyNightReply({ ...n, invitees: r1.invitees }, { k: "reply", to: "night", id: "j_x", key: n.key, name: "Tom", rsvp: "maybe", note: "komme später" });
    expect(rsvpCount(r2.invitees)).toEqual({ yes: 1, maybe: 1, no: 0, open: 0 });
    expect(applyNightReply({ ...n, cancelled: true }, { k: "reply", to: "night", id: "j_x", key: n.key, name: "Tom", rsvp: "yes" }).result.ok).toBe(false);
  });
  it("time zones: wall clock in one zone, shown in another, across daylight saving", () => {
    expect(zonedToUtc("2026-07-01T20:00", "Europe/Berlin")).toBe("2026-07-01T18:00:00.000Z"); // summer time
    expect(zonedToUtc("2026-12-01T20:00", "Europe/Berlin")).toBe("2026-12-01T19:00:00.000Z");
    expect(zonedToUtc("2026-12-01T20:00", "America/New_York")).toBe("2026-12-02T01:00:00.000Z");
    expect(inZone("2026-12-01T19:00:00.000Z", "Europe/London")).toContain("19:00");
  });
});
