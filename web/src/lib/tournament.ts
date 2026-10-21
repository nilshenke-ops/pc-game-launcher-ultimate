// Mini tournaments for friends – pure logic, tested in tournament.test.ts. Formats: single elimination, double
// elimination (winners and losers bracket, grand final with reset), round robin, groups + knockout final.
// The bracket is always recomputed from the participants and the entered results, so a changed result can never leave
// a broken bracket behind: results that no longer fit their match are reported, not used. No money, no betting.

export type Format = "single" | "double" | "roundrobin" | "groups";

export interface Result {
  scoreA?: number | null; scoreB?: number | null;
  /** Winner side, needed when no scores are given. */
  winner?: "a" | "b" | null;
  draw?: boolean;
  /** Who played when the result was entered – if an earlier result changes who plays here, this result is not used. */
  players?: [string, string];
}
export interface TournamentData {
  title: string;
  format: Format;
  /** In seed order (after the draw). */
  participants: string[];
  results: Record<string, Result>;
  groups?: number;
  /** How many of each group reach the knockout final. */
  advance?: number;
  points?: { win: number; draw: number; loss: number };
  gameId?: string | null;
  gameName?: string | null;
}

export interface Match {
  id: string;
  /** "W" winners/knockout, "L" losers bracket, "F" grand final, "R" round robin / group. */
  bracket: "W" | "L" | "F" | "R";
  round: number;
  label: string;
  a: string | null;
  b: string | null;
  status: "waiting" | "ready" | "done" | "bye" | "empty";
  winner: string | null;
  loser: string | null;
  result?: Result;
  /** The entered result does not fit any more (e.g. an earlier result changed who plays here). */
  invalid?: string;
  group?: number;
}

export const MAX_PARTICIPANTS = 64;

export class TournamentError extends Error {}

/** Checks the setup; throws a readable error. */
export function checkSetup(t: TournamentData) {
  const names = t.participants.map((p) => p.trim());
  if (names.some((n) => !n)) throw new TournamentError("Jeder Teilnehmer braucht einen Namen.");
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new TournamentError("Jeder Name darf nur einmal vorkommen.");
  if (names.length < 2) throw new TournamentError("Mindestens 2 Teilnehmer.");
  if (names.length > MAX_PARTICIPANTS) throw new TournamentError("Höchstens 64 Teilnehmer.");
  if (t.format === "double" && names.length < 3) throw new TournamentError("Doppel-K.-o. braucht mindestens 3 Teilnehmer.");
  if (t.format === "groups") {
    const g = t.groups ?? 2, adv = t.advance ?? 2;
    if (!Number.isInteger(g) || g < 2 || g > 16) throw new TournamentError("Gruppen: 2 bis 16.");
    if (names.length < g * 2) throw new TournamentError("Jede Gruppe braucht mindestens 2 Teilnehmer.");
    if (!Number.isInteger(adv) || adv < 1 || adv > Math.floor(names.length / g)) throw new TournamentError("So viele können aus den Gruppen nicht weiterkommen.");
    if (g * adv < 2) throw new TournamentError("Für die Finalrunde müssen mindestens 2 weiterkommen.");
  }
}

/** Fair draw: shuffles the participants (seed order). */
export function draw(names: string[], rnd: () => number = Math.random) {
  const a = [...names];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Checks one entered result for a match (scores, no draw in knockout, winner fits the scores). */
export function checkResult(r: Result, allowDraw: boolean): string | null {
  const has = r.scoreA != null || r.scoreB != null;
  if (has) {
    if (r.scoreA == null || r.scoreB == null) return "Beide Ergebnisse eintragen.";
    for (const s of [r.scoreA, r.scoreB]) if (!Number.isInteger(s) || s < 0 || s > 9999) return "Ergebnisse: ganze Zahlen von 0 bis 9999.";
    if (r.scoreA === r.scoreB) {
      if (!allowDraw && !r.winner) return "Unentschieden gibt es im K.-o.-System nicht – Sieger wählen (z. B. nach Verlängerung).";
    } else if (r.winner && (r.winner === "a") !== r.scoreA > r.scoreB) return "Der gewählte Sieger passt nicht zum Ergebnis.";
    return null;
  }
  if (r.draw) return allowDraw ? null : "Unentschieden gibt es im K.-o.-System nicht.";
  return r.winner ? null : "Ergebnis oder Sieger fehlt.";
}

function outcome(r: Result): "a" | "b" | "draw" {
  if (r.scoreA != null && r.scoreB != null && r.scoreA !== r.scoreB) return r.scoreA > r.scoreB ? "a" : "b";
  if (r.winner) return r.winner;
  return "draw";
}

/** Bracket positions for a power of two: seed 1 and 2 meet only in the final, byes go to the top seeds. */
export function seedOrder(size: number): number[] {
  let o = [1, 2];
  while (o.length < size) { const n = o.length * 2 + 1; o = o.flatMap((s) => [s, n - s]); }
  return o;
}

type Slot = { seed: number } | { from: string; take: "winner" | "loser" };
interface Node { id: string; bracket: Match["bracket"]; round: number; label: string; a: Slot; b: Slot; group?: number }

function resolve(nodes: Map<string, Node>, seeds: (string | null)[], results: Record<string, Result>, allowDraw = false) {
  const out = new Map<string, Match>();
  const get = (id: string): Match => {
    const hit = out.get(id);
    if (hit) return hit;
    const n = nodes.get(id)!;
    const side = (s: Slot): { name: string | null; known: boolean } => {
      if ("seed" in s) return { name: seeds[s.seed - 1] ?? null, known: true };
      const m = get(s.from);
      if (m.status === "done" || m.status === "bye") return { name: s.take === "winner" ? m.winner : m.loser, known: true };
      if (m.status === "empty") return { name: null, known: true };
      return { name: null, known: false };
    };
    const A = side(n.a), B = side(n.b);
    const m: Match = { id, bracket: n.bracket, round: n.round, label: n.label, a: A.name, b: B.name, status: "waiting", winner: null, loser: null, group: n.group };
    const r = results[id];
    if (A.known && B.known && (!A.name || !B.name)) {
      // A side stays empty for good (bye): the other one goes on without playing.
      m.status = A.name || B.name ? "bye" : "empty";
      m.winner = A.name ?? B.name; m.loser = null;
      if (r) m.invalid = "Hier wird nicht gespielt (Freilos).";
    } else if (A.known && B.known) {
      m.status = "ready";
      if (r && r.players && (r.players[0] !== A.name || r.players[1] !== B.name)) m.invalid = "Hier spielen inzwischen andere – bitte das Ergebnis neu eintragen.";
      else if (r) {
        const err = checkResult(r, allowDraw);
        if (err) m.invalid = err;
        else {
          const o = outcome(r);
          m.status = "done"; m.result = r;
          if (o !== "draw") { m.winner = o === "a" ? A.name : B.name; m.loser = o === "a" ? B.name : A.name; }
        }
      }
    } else if (r) m.invalid = "Die Gegner stehen noch nicht fest.";
    out.set(id, m);
    return m;
  };
  for (const id of nodes.keys()) get(id);
  return [...out.values()];
}

function pow2(n: number) { let s = 1; while (s < n) s *= 2; return s; }

/** Single elimination nodes for `count` seeds; `prefix` keeps ids unique (knockout after groups uses "K"). */
function singleNodes(count: number, prefix = "W"): Node[] {
  const size = pow2(count), rounds = Math.log2(size), order = seedOrder(size);
  const nodes: Node[] = [];
  const name = (r: number) => (r === rounds ? "Finale" : r === rounds - 1 ? "Halbfinale" : r === rounds - 2 ? "Viertelfinale" : `Runde ${r}`);
  for (let i = 0; i < size / 2; i++) nodes.push({ id: `${prefix}1-${i + 1}`, bracket: "W", round: 1, label: name(1), a: { seed: order[i * 2] }, b: { seed: order[i * 2 + 1] } });
  for (let r = 2; r <= rounds; r++) for (let i = 0; i < size / 2 ** r; i++)
    nodes.push({ id: `${prefix}${r}-${i + 1}`, bracket: "W", round: r, label: name(r), a: { from: `${prefix}${r - 1}-${i * 2 + 1}`, take: "winner" }, b: { from: `${prefix}${r - 1}-${i * 2 + 2}`, take: "winner" } });
  return nodes;
}

/** Double elimination: losers of the winners bracket drop into the losers bracket; grand final, with a second final if the losers-bracket winner wins the first. */
function doubleNodes(count: number): Node[] {
  const size = pow2(count), R = Math.log2(size);
  const nodes = singleNodes(count).map((n) => ({ ...n, label: n.round === R ? "Finale Gewinnerrunde" : `Gewinnerrunde ${n.round}` }));
  // L1: losers of W1, in pairs.
  let prev: string[] = [];
  for (let i = 0; i < size / 4; i++) { const id = `L1-${i + 1}`; nodes.push({ id, bracket: "L", round: 1, label: "Verliererrunde 1", a: { from: `W1-${i * 2 + 1}`, take: "loser" }, b: { from: `W1-${i * 2 + 2}`, take: "loser" } }); prev.push(id); }
  let lr = 1;
  for (let w = 2; w <= R; w++) {
    // Drop-in round: survivors meet the losers of winners round w (reversed order, so rematches come late).
    lr++;
    const drop: string[] = [];
    const losers = Array.from({ length: size / 2 ** w }, (_, i) => `W${w}-${i + 1}`).reverse();
    prev.forEach((p, i) => { const id = `L${lr}-${i + 1}`; nodes.push({ id, bracket: "L", round: lr, label: `Verliererrunde ${lr}`, a: { from: p, take: "winner" }, b: { from: losers[i], take: "loser" } }); drop.push(id); });
    prev = drop;
    if (w === R) break;
    // Reduction round: survivors play each other.
    lr++;
    const red: string[] = [];
    for (let i = 0; i < prev.length / 2; i++) { const id = `L${lr}-${i + 1}`; nodes.push({ id, bracket: "L", round: lr, label: `Verliererrunde ${lr}`, a: { from: prev[i * 2], take: "winner" }, b: { from: prev[i * 2 + 1], take: "winner" } }); red.push(id); }
    prev = red;
  }
  nodes.push({ id: "F1", bracket: "F", round: 1, label: "Großes Finale", a: { from: `W${R}-1`, take: "winner" }, b: { from: prev[0], take: "winner" } });
  nodes.push({ id: "F2", bracket: "F", round: 2, label: "Großes Finale – Entscheidung", a: { from: "F1", take: "winner" }, b: { from: "F1", take: "loser" } });
  return nodes;
}

/** Round robin by the circle method (odd number: one sits out each round). */
export function roundRobinPairs(n: number): [number, number][][] {
  const ids = Array.from({ length: n % 2 ? n + 1 : n }, (_, i) => i);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < ids.length - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const a = ids[i], b = ids[ids.length - 1 - i];
      if (a < n && b < n) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

export interface Standing { name: string; played: number; won: number; drawn: number; lost: number; points: number; for: number; against: number }

export function standings(names: string[], matches: Match[], pts = { win: 3, draw: 1, loss: 0 }): Standing[] {
  const s = new Map(names.map((n) => [n, { name: n, played: 0, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0 }]));
  for (const m of matches) {
    if (m.status !== "done" || !m.a || !m.b) continue;
    const A = s.get(m.a), B = s.get(m.b);
    if (!A || !B) continue;
    A.played++; B.played++;
    A.for += m.result?.scoreA ?? 0; A.against += m.result?.scoreB ?? 0; B.for += m.result?.scoreB ?? 0; B.against += m.result?.scoreA ?? 0;
    if (!m.winner) { A.drawn++; B.drawn++; A.points += pts.draw; B.points += pts.draw; }
    else { const W = m.winner === m.a ? A : B, L = W === A ? B : A; W.won++; L.lost++; W.points += pts.win; L.points += pts.loss; }
  }
  return [...s.values()].sort((a, b) => b.points - a.points || (b.for - b.against) - (a.for - a.against) || b.for - a.for || a.name.localeCompare(b.name));
}

/** Groups: participants dealt out like cards (snake order), so seeds spread evenly. */
export function splitGroups(names: string[], g: number): string[][] {
  const out: string[][] = Array.from({ length: g }, () => []);
  names.forEach((n, i) => { const row = Math.floor(i / g), col = i % g; out[row % 2 ? g - 1 - col : col].push(n); });
  return out;
}

export interface Computed { matches: Match[]; champion: string | null; groups?: { names: string[]; table: Standing[]; done: boolean }[]; table?: Standing[]; invalid: Match[] }

/** The whole tournament from setup + results. */
export function compute(t: TournamentData): Computed {
  checkSetup(t);
  const names = t.participants.map((p) => p.trim());
  const pts = t.points ?? { win: 3, draw: 1, loss: 0 };
  let matches: Match[] = [], champion: string | null = null;
  const res: Computed = { matches, champion, invalid: [] };
  if (t.format === "single" || t.format === "double") {
    const nodes = new Map((t.format === "single" ? singleNodes(names.length) : doubleNodes(names.length)).map((n) => [n.id, n]));
    matches = resolve(nodes, names, t.results);
    if (t.format === "single") champion = matches.find((m) => m.round === Math.log2(pow2(names.length)) && m.bracket === "W")?.winner ?? null;
    else {
      const f1 = matches.find((m) => m.id === "F1")!, f2 = matches.find((m) => m.id === "F2")!;
      const wbChamp = f1.a;
      // The second final is only played when the losers-bracket winner wins the first one.
      if (f1.status === "done" && f1.winner === wbChamp) { champion = wbChamp; f2.status = "empty"; f2.a = f2.b = null; if (t.results.F2) f2.invalid = "Nicht nötig: der Sieger der Gewinnerrunde hat das Finale gewonnen."; }
      else if (f1.status === "done") champion = f2.status === "done" ? f2.winner : null;
      else { f2.status = "waiting"; f2.a = f2.b = null; }
    }
  } else if (t.format === "roundrobin") {
    matches = rrMatches(names, t.results, "R");
    res.table = standings(names, matches, pts);
    champion = matches.every((m) => m.status === "done") ? res.table[0].name : null;
  } else {
    const groups = splitGroups(names, t.groups ?? 2), adv = t.advance ?? 2;
    res.groups = groups.map((g, gi) => {
      const ms = rrMatches(g, t.results, `G${gi + 1}-`, gi + 1);
      matches.push(...ms);
      return { names: g, table: standings(g, ms, pts), done: ms.every((m) => m.status === "done") };
    });
    // Knockout seeds: all group winners first, then the runners-up … (A1, B1, …, A2, B2, …).
    const allDone = res.groups.every((g) => g.done);
    const seeds: (string | null)[] = [];
    for (let k = 0; k < adv; k++) for (const g of res.groups) seeds.push(allDone ? g.table[k]?.name ?? null : null);
    const ko = new Map(singleNodes(seeds.length, "K").map((n) => [n.id, n]));
    const koMatches = allDone ? resolve(ko, seeds, t.results) : [...ko.values()].map((n): Match => ({ id: n.id, bracket: "W", round: n.round, label: n.label, a: null, b: null, status: "waiting", winner: null, loser: null, ...(t.results[n.id] ? { invalid: "Erst nach der Gruppenphase." } : {}) }));
    matches.push(...koMatches);
    champion = koMatches.find((m) => m.round === Math.log2(pow2(seeds.length)))?.winner ?? null;
  }
  res.matches = matches;
  res.champion = champion;
  res.invalid = matches.filter((m) => m.invalid && t.results[m.id]);
  return res;
}

function rrMatches(names: string[], results: Record<string, Result>, prefix: string, group?: number): Match[] {
  const out: Match[] = [];
  roundRobinPairs(names.length).forEach((pairs, r) => pairs.forEach(([a, b], i) => {
    const nodes = new Map<string, Node>([[`${prefix}${r + 1}-${i + 1}`, { id: `${prefix}${r + 1}-${i + 1}`, bracket: "R", round: r + 1, label: `Spieltag ${r + 1}`, a: { seed: a + 1 }, b: { seed: b + 1 }, group }]]);
    out.push(...resolve(nodes, names, results, true));
  }));
  return out;
}

/** Matches as CSV (semicolon, for German Excel). */
export function matchesCsv(c: Computed) {
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
  const rows = [["Runde", "Spiel", "Teilnehmer A", "Teilnehmer B", "Ergebnis A", "Ergebnis B", "Sieger", "Status"],
    ...c.matches.filter((m) => m.status !== "empty").map((m) => [m.label, m.id, m.a ?? "", m.b ?? "", m.result?.scoreA ?? "", m.result?.scoreB ?? "", m.winner ?? (m.status === "done" ? "unentschieden" : ""), m.status])];
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
