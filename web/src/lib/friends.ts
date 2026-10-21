// Friends: group game finder, polls and gaming nights with invite / reply links – pure logic, tested in friends.test.ts.
// Links carry their data after "#" (never sent to a server); nothing is "live": a friend answers with a reply link that
// you open, and a poll accepts it only with its current key (revoking = new key, closing = no more answers).

import { decodeShare, encodeShare } from "./play";

export type Data = Record<string, unknown>;
const norm = (s: string) => s.trim().toLowerCase().replace(/[™®]/g, "").replace(/\s+/g, " ");

// ------------------------------------------------------------------------------------------ F18 group finder

export interface PlayerGames { id: string; name: string; games: { name: string; platform?: string | null }[] }
export interface Facts { title: string; crossplay?: string; crossplaySource?: string | null; maxPlayers?: number | null }

export type FitKind = "same-platform" | "crossplay" | "crossplay-unknown" | "no-crossplay" | "missing";
export interface GroupFit { game: string; owners: { player: string; platforms: string[] }[]; missing: string[]; kind: FitKind; common: string[]; tooMany: boolean; source?: string | null; maxPlayers?: number | null }

/**
 * Which games the chosen players can play together – only from what is written on their cards. Crossplay counts
 * only with a source in the game facts; without one it is "unknown" (never claimed).
 */
export function groupFinder(players: PlayerGames[], facts: Facts[]): GroupFit[] {
  const games = new Map<string, string>();
  for (const p of players) for (const g of p.games) if (g.name?.trim() && !games.has(norm(g.name))) games.set(norm(g.name), g.name.trim());
  const out: GroupFit[] = [];
  for (const [key, game] of games) {
    const owners = players.map((p) => ({ player: p.name, platforms: [...new Set(p.games.filter((g) => norm(g.name) === key).map((g) => (g.platform ?? "").trim() || "?"))] })).filter((o) => o.platforms.length);
    const missing = players.filter((p) => !owners.some((o) => o.player === p.name)).map((p) => p.name);
    const f = facts.find((x) => norm(x.title) === key);
    let common = owners.length ? owners[0].platforms.filter((pl) => pl !== "?") : [];
    for (const o of owners.slice(1)) common = common.filter((pl) => o.platforms.some((x) => norm(x) === norm(pl)));
    const proven = (f?.crossplay === "yes" || f?.crossplay === "partial") && !!f.crossplaySource;
    let kind: FitKind;
    if (missing.length) kind = "missing";
    else if (common.length) kind = "same-platform";
    else if (proven) kind = "crossplay";
    else if (f?.crossplay === "no") kind = "no-crossplay";
    else kind = "crossplay-unknown";
    out.push({ game, owners, missing, kind, common, tooMany: !!f?.maxPlayers && players.length > f.maxPlayers, source: proven ? f!.crossplaySource : null, maxPlayers: f?.maxPlayers ?? null });
  }
  const rank: Record<FitKind, number> = { "same-platform": 0, crossplay: 1, "crossplay-unknown": 2, "no-crossplay": 3, missing: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || Number(a.tooMany) - Number(b.tooMany) || a.missing.length - b.missing.length || a.game.localeCompare(b.game));
}

// ------------------------------------------------------------------------------------------ invite and reply links

export function newKey() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PollInvite { k: "poll"; id: string; key: string; title: string; options: string[]; multi: boolean; until?: string | null }
export interface NightInvite { k: "night"; id: string; key: string; title: string; start: string; tz: string; minutes: number; games: string[]; notes?: string; rules?: string }
export interface Reply { k: "reply"; to: "poll" | "night"; id: string; key: string; name: string; choices?: number[]; rsvp?: "yes" | "maybe" | "no"; note?: string }

const ID = /^j_[A-Za-z0-9_-]{6,40}$/, KEY = /^[A-Za-z0-9_-]{16,64}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Reads a link part and checks it strictly (it comes from someone else). */
export function readLink(s: string): PollInvite | NightInvite | Reply | null {
  const v = decodeShare<Data>(s);
  if (!v || typeof v !== "object" || !ID.test(String(v.id)) || !KEY.test(String(v.key))) return null;
  if (v.k === "poll") {
    const options = Array.isArray(v.options) ? v.options.map((o) => str(o, 100)).filter(Boolean).slice(0, 30) : [];
    if (options.length < 2) return null;
    return { k: "poll", id: String(v.id), key: String(v.key), title: str(v.title, 120) || "Abstimmung", options, multi: v.multi === true, until: typeof v.until === "string" && !isNaN(Date.parse(v.until)) ? v.until : null };
  }
  if (v.k === "night") {
    if (typeof v.start !== "string" || isNaN(Date.parse(v.start))) return null;
    const tz = str(v.tz, 60);
    try { new Intl.DateTimeFormat("de-DE", { timeZone: tz || "UTC" }); } catch { return null; }
    return { k: "night", id: String(v.id), key: String(v.key), title: str(v.title, 120) || "Gaming-Abend", start: v.start, tz: tz || "UTC", minutes: Math.max(0, Math.min(24 * 60, Number(v.minutes) || 0)), games: Array.isArray(v.games) ? v.games.map((g) => str(g, 100)).filter(Boolean).slice(0, 10) : [], notes: str(v.notes, 1000), rules: str(v.rules, 1000) };
  }
  if (v.k === "reply") {
    const name = str(v.name, 40).trim();
    if (!name || (v.to !== "poll" && v.to !== "night")) return null;
    const r: Reply = { k: "reply", to: v.to, id: String(v.id), key: String(v.key), name, note: str(v.note, 300) };
    if (v.to === "poll") { if (!Array.isArray(v.choices) || !v.choices.length || !v.choices.every((c) => Number.isInteger(c) && c >= 0 && c < 30)) return null; r.choices = [...new Set(v.choices as number[])]; }
    else { if (!["yes", "maybe", "no"].includes(String(v.rsvp))) return null; r.rsvp = v.rsvp as Reply["rsvp"]; }
    return r;
  }
  return null;
}

export function linkFor(base: string, page: string, payload: PollInvite | NightInvite | Reply) {
  return `${base}#/friends?tab=${page}&l=${encodeShare(payload)}`;
}

// ------------------------------------------------------------------------------------------ F17 polls

export interface Vote { name: string; choices: number[]; at: string }
export interface Poll { title: string; options: { text: string }[]; multi?: boolean; until?: string | null; closed?: boolean; key: string; votes: Vote[]; nightId?: string | null }

export type ApplyResult = { ok: true; replaced: boolean } | { ok: false; reason: "unknown" | "revoked" | "closed" | "expired" | "invalid" };

/** A friend's reply link: only accepted with the poll's current key, while it is open; one vote per name (a new reply replaces it). */
export function applyPollReply(p: Poll, r: Reply, now = Date.now()): { poll: Poll; result: ApplyResult } {
  if (r.key !== p.key) return { poll: p, result: { ok: false, reason: "revoked" } };
  if (p.closed) return { poll: p, result: { ok: false, reason: "closed" } };
  if (p.until && Date.parse(p.until) < now) return { poll: p, result: { ok: false, reason: "expired" } };
  const choices = (r.choices ?? []).filter((c) => c < p.options.length);
  if (!choices.length || (!p.multi && choices.length > 1)) return { poll: p, result: { ok: false, reason: "invalid" } };
  const replaced = p.votes.some((v) => norm(v.name) === norm(r.name));
  const votes = [...p.votes.filter((v) => norm(v.name) !== norm(r.name)), { name: r.name, choices, at: new Date(now).toISOString() }];
  return { poll: { ...p, votes }, result: { ok: true, replaced } };
}

export function tally(p: Poll) {
  const counts = p.options.map((o, i) => ({ text: o.text, index: i, votes: p.votes.filter((v) => v.choices.includes(i)).length, names: p.votes.filter((v) => v.choices.includes(i)).map((v) => v.name) }));
  const max = Math.max(0, ...counts.map((c) => c.votes));
  return { counts, winners: max ? counts.filter((c) => c.votes === max) : [], voters: p.votes.length };
}

// ------------------------------------------------------------------------------------------ F19 gaming nights

export interface Invitee { name: string; rsvp?: "yes" | "maybe" | "no" | "open"; note?: string; tz?: string | null }

export function applyNightReply(n: { key: string; invitees: Invitee[]; cancelled?: boolean }, r: Reply): { invitees: Invitee[]; result: ApplyResult } {
  if (r.key !== n.key) return { invitees: n.invitees, result: { ok: false, reason: "revoked" } };
  if (n.cancelled) return { invitees: n.invitees, result: { ok: false, reason: "closed" } };
  const i = n.invitees.findIndex((x) => norm(x.name) === norm(r.name));
  const next = { ...(i >= 0 ? n.invitees[i] : { name: r.name }), rsvp: r.rsvp, note: r.note || (i >= 0 ? n.invitees[i].note : "") };
  return { invitees: i >= 0 ? n.invitees.map((x, j) => (j === i ? next : x)) : [...n.invitees, next], result: { ok: true, replaced: i >= 0 } };
}

export function rsvpCount(invitees: Invitee[]) {
  return { yes: invitees.filter((i) => i.rsvp === "yes").length, maybe: invitees.filter((i) => i.rsvp === "maybe").length, no: invitees.filter((i) => i.rsvp === "no").length, open: invitees.filter((i) => !i.rsvp || i.rsvp === "open").length };
}

/** Wall-clock date/time in a time zone → UTC ISO (handles daylight saving: tries the offset twice). */
export function zonedToUtc(local: string, tz: string): string {
  const [d, t] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number), [h, mi] = (t ?? "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const offset = (ms: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
  };
  let ms = guess - offset(guess);
  ms = guess - offset(ms);
  return new Date(ms).toISOString();
}

/** A moment shown in another time zone (e.g. a friend's). */
export function inZone(iso: string, tz: string, locale = "de-DE") {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function isPast(startIso: string, minutes: number, now = Date.now()) { return Date.parse(startIso) + Math.max(minutes, 1) * 60_000 < now; }

export function validTz(tz: string) { try { new Intl.DateTimeFormat("de-DE", { timeZone: tz }); return true; } catch { return false; } }
