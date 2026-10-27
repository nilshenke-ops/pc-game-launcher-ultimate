// Pure logic of the collections (no React, no storage) – tested in journal.test.ts.

import type { Entry } from "./journal";

/** Which game an entry belongs to: a library game (id) and/or a name (a game not in the library, or the PC is off). */
export interface GameRef { gameId?: string | null; gameName?: string | null }

export const KIND_PATH: Record<string, (id: string) => string> = {
  memory: (id) => `/journal?tab=memory&id=${id}`,
  path: (id) => `/journal?tab=goals&id=${id}`,
  find: (id) => `/journal?tab=finds&id=${id}`,
  story: (id) => `/journal?tab=story&id=${id}`,
  wiki: (id) => `/wiki?id=${id}`,
  world: (id) => `/worlds?tab=world&id=${id}`,
  project: (id) => `/worlds?tab=project&id=${id}`,
  markers: (id) => `/worlds?tab=markers&id=${id}`,
  build: (id) => `/builds?tab=build&id=${id}`,
  modlist: (id) => `/builds?tab=modlist&id=${id}`,
  gfx: (id) => `/builds?tab=gfx&id=${id}`,
  controls: (id) => `/builds?tab=controls&id=${id}`,
  challenge: () => `/play?tab=challenges`,
  player: (id) => `/friends?tab=players&id=${id}`,
  poll: () => `/friends?tab=polls`,
  night: (id) => `/friends?tab=nights&id=${id}`,
  team: (id) => `/friends?tab=teams&id=${id}`,
  tournament: (id) => `/friends?tab=tournaments&id=${id}`,
  server: (id) => `/friends?tab=servers&id=${id}`,
  facts: (id) => `/infos?tab=facts&id=${id}`,
  access: (id) => `/infos?tab=access&id=${id}`,
  release: (id) => `/infos?tab=releases&id=${id}`,
  gameevent: (id) => `/infos?tab=events&id=${id}`,
  patch: (id) => `/infos?tab=patches&id=${id}`,
  editions: (id) => `/infos?tab=editions&id=${id}`,
  recfav: () => `/infos?tab=recs`,
  recpref: () => `/infos?tab=recs`,
  bingo: (id) => `/play?tab=bingo&id=${id}`,
  bingotask: () => `/play?tab=bingo&area=own`,
  photo: (id) => `/media?tab=museum&id=${id}`,
  album: (id) => `/media?tab=museum&album=${id}`,
  book: (id) => `/media?tab=book&id=${id}`,
  clipmark: (id) => `/media?tab=clips&id=${id}`,
  track: (id) => `/media?tab=music&id=${id}`,
  card: (id) => `/studio?tab=cards&id=${id}`,
  design: (id) => `/studio?tab=designs&id=${id}`,
  expo: (id) => `/studio?tab=expo&id=${id}`,
};
export const KIND_LABEL: Record<string, string> = { memory: "Erinnerung", path: "Zielpfad", find: "Sammlung", story: "Story", wiki: "Wiki", world: "Minecraft-Welt", project: "Bauprojekt", markers: "Karten-Marker", build: "Build / Loadout", modlist: "Mod-Sammlung", gfx: "Grafikvergleich", controls: "Steuerung", challenge: "Challenge", bingo: "Bingo", bingotask: "Eigene Bingo-Aufgabe", player: "Spieler-Karte", poll: "Abstimmung", night: "Gaming-Abend", team: "Team", tournament: "Turnier", server: "Server", facts: "Spiel-Fakten", access: "Barrierefreiheit", release: "Release", gameevent: "Saison / Event", patch: "Patchnotes", editions: "Editionen & DLCs", recfav: "Gemerkte Empfehlung", recpref: "Vorlieben", photo: "Foto", album: "Sammlung", book: "Erinnerungsbuch", clipmark: "Clip-Momente", track: "Soundtrack", card: "Sammelkarte", design: "Poster / Banner", expo: "Ausstellung" };

export function entryTitle(e: Entry): string {
  const d = e.data as { title?: string; text?: string; did?: string; gameName?: string };
  return (d.title || d.did || d.text || d.gameName || "").toString().slice(0, 120) || "(ohne Titel)";
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function matchesQuery(e: Entry, q: string): boolean {
  const s = norm(q);
  if (!s) return true;
  // The whole entry as text (titles, notes, tags, stages …) – fast enough for thousands of entries.
  const hay = JSON.stringify(e.data).toLowerCase();
  return s.split(" ").every((w) => hay.includes(w));
}

export function sameGame(a: GameRef, b: GameRef) {
  if (a.gameId && b.gameId) return a.gameId === b.gameId;
  return !!a.gameName && !!b.gameName && norm(a.gameName) === norm(b.gameName);
}

// ------------------------------------------------------------------------------------------ F2 game memory

export interface Memory extends GameRef {
  /** When this was played (ISO). */
  at: string;
  /** Where in the game (level, chapter, place). */
  where?: string;
  did: string;
  /** What to do next time. */
  next?: string;
  notes?: string;
  imageIds?: string[];
  links?: string[];
}

/** Newest first. */
export function memoriesOf(list: Entry<Memory>[], game: GameRef) {
  return list.filter((e) => sameGame(e.data, game)).sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at));
}

/** "Where was I?" for one game: built only from what was written down – nothing is made up. */
export function memorySummary(list: Entry<Memory>[], game: GameRef) {
  const m = memoriesOf(list, game);
  if (!m.length) return null;
  const last = m[0].data;
  // The last note that says where / what next (the newest entry may not have both).
  const where = m.find((e) => e.data.where?.trim())?.data.where ?? null;
  const next = m.find((e) => e.data.next?.trim())?.data.next ?? null;
  return { count: m.length, lastAt: last.at, firstAt: m[m.length - 1].data.at, lastDid: last.did, where, next, latestId: m[0].id };
}

// ------------------------------------------------------------------------------------------ F3 goal path

export interface Stage { id: string; title: string; done?: boolean; doneAt?: string | null; reward?: string; milestone?: boolean; note?: string }
export interface GoalPath extends GameRef { title: string; description?: string; stages: Stage[]; archived?: boolean; template?: boolean; links?: string[] }

export function pathProgress(p: GoalPath) {
  const total = p.stages.length, done = p.stages.filter((s) => s.done).length;
  const next = p.stages.find((s) => !s.done) ?? null;
  const milestones = p.stages.filter((s) => s.milestone);
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0, next, milestonesDone: milestones.filter((s) => s.done).length, milestones: milestones.length, complete: total > 0 && done === total };
}

/** Templates to start from – generic on purpose (they do not claim anything about a particular game). */
export const PATH_TEMPLATES: { id: string; title: string; stages: { title: string; milestone?: boolean }[] }[] = [
  { id: "story", title: "Story durchspielen", stages: [{ title: "Einstieg / Tutorial geschafft" }, { title: "Erstes großes Gebiet abgeschlossen" }, { title: "Hälfte der Story", milestone: true }, { title: "Letztes Kapitel begonnen" }, { title: "Abspann gesehen", milestone: true }] },
  { id: "complete", title: "Komplett (100 %)", stages: [{ title: "Story abgeschlossen", milestone: true }, { title: "Alle Nebenaufgaben" }, { title: "Alle Sammelobjekte" }, { title: "Alle Erfolge / Trophäen", milestone: true }] },
  { id: "skill", title: "Besser werden", stages: [{ title: "Grundlagen sitzen (Steuerung, Ablauf)" }, { title: "Erstes eigenes Ziel erreicht" }, { title: "Schwierige Stelle ohne Hilfe geschafft", milestone: true }, { title: "Höhere Schwierigkeit ausprobiert" }] },
  { id: "build", title: "Großes Bauprojekt", stages: [{ title: "Idee und Ort festgelegt" }, { title: "Material gesammelt" }, { title: "Rohbau fertig", milestone: true }, { title: "Innenausbau und Details" }, { title: "Fertig – Screenshot gemacht", milestone: true }] },
];

// ------------------------------------------------------------------------------------------ F4 finds and quests

export const FIND_CATEGORIES = ["quest", "item", "secret", "place", "collectible", "boss", "other"] as const;
export const FIND_CATEGORY_LABEL: Record<string, string> = { quest: "Quest", item: "Gegenstand", secret: "Geheimnis", place: "Ort", collectible: "Sammelobjekt", boss: "Gegner / Boss", other: "Sonstiges" };
export const FIND_STATUS = ["open", "found", "done"] as const;
export const FIND_STATUS_LABEL: Record<string, string> = { open: "Offen", found: "Gefunden", done: "Erledigt" };
export interface Find extends GameRef { title: string; category: string; status: string; tags: string[]; notes?: string; where?: string; favorite?: boolean; imageIds?: string[]; links?: string[] }

export interface FindFilter { q?: string; category?: string; status?: string; tag?: string; favorite?: boolean; game?: GameRef | null }
export type FindSort = "changed" | "title" | "status";

export function filterFinds(list: Entry<Find>[], f: FindFilter, sort: FindSort = "changed") {
  const out = list.filter((e) => (!f.category || e.data.category === f.category) && (!f.status || e.data.status === f.status)
    && (!f.tag || e.data.tags.some((t) => norm(t) === norm(f.tag!))) && (!f.favorite || e.data.favorite)
    && (!f.game || sameGame(e.data, f.game)) && matchesQuery(e, f.q ?? ""));
  const order = { open: 0, found: 1, done: 2 } as Record<string, number>;
  if (sort === "title") out.sort((a, b) => a.data.title.localeCompare(b.data.title));
  else if (sort === "status") out.sort((a, b) => (order[a.data.status] ?? 9) - (order[b.data.status] ?? 9) || b.updatedAt - a.updatedAt);
  else out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export function allTags(list: Entry<{ tags?: string[] }>[]) {
  const m = new Map<string, string>();
  for (const e of list) for (const t of e.data.tags ?? []) if (!m.has(norm(t))) m.set(norm(t), t.trim());
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

export function cleanTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.map((t) => t.trim().slice(0, 40)).filter((t) => t && !seen.has(norm(t)) && seen.add(norm(t))).slice(0, 30);
}

// ------------------------------------------------------------------------------------------ F8 story without spoilers

export interface Chapter { id: string; title: string; summary?: string; spoiler?: boolean }
export interface Character { id: string; name: string; note?: string; spoiler?: boolean; /** Chapter where the character appears first. */ chapterId?: string | null }
export interface Question { id: string; text: string; answer?: string; answered?: boolean; spoiler?: boolean }
export interface Story extends GameRef { title: string; chapters: Chapter[]; characters: Character[]; questions: Question[]; /** Last chapter reached. */ progressId?: string | null; links?: string[] }

/**
 * What can be shown without spoilers: chapters up to the progress marker, characters met by then, no item marked as
 * a spoiler, and answers only to questions that are answered. Hidden items are counted, so it is clear something is there.
 */
export function spoilerFree(s: Story) {
  const reached = s.progressId ? s.chapters.findIndex((c) => c.id === s.progressId) : -1;
  const visibleCh = new Set(s.chapters.slice(0, reached + 1).map((c) => c.id));
  const chapters = s.chapters.map((c, i) => ({ ...c, hidden: i > reached ? "ahead" as const : c.spoiler ? "spoiler" as const : null }));
  const characters = s.characters.map((c) => ({ ...c, hidden: c.spoiler ? "spoiler" as const : c.chapterId && !visibleCh.has(c.chapterId) ? "ahead" as const : null }));
  const questions = s.questions.map((q) => ({ ...q, hidden: q.spoiler ? "spoiler" as const : null, answerHidden: !!q.answer && (q.spoiler || !q.answered) }));
  return { chapters, characters, questions, reached, hiddenCount: [...chapters, ...characters, ...questions].filter((x) => x.hidden).length };
}

// ------------------------------------------------------------------------------------------ F16 wiki

export interface WikiVersion { at: number; title: string; body: string }
export interface WikiPage extends GameRef { title: string; body: string; tags: string[]; aliases?: string[]; history?: WikiVersion[]; links?: string[] }
export const WIKI_HISTORY = 20;

/** [[Titel]] or [[Titel|shown text]] in a text. */
export function wikiLinks(body: string): { target: string; label: string }[] {
  const out: { target: string; label: string }[] = [];
  for (const m of body.matchAll(/\[\[([^[\]|]{1,120})(?:\|([^[\]]{1,120}))?\]\]/g)) out.push({ target: m[1].trim(), label: (m[2] ?? m[1]).trim() });
  return out;
}

/** Finds the page a link means (title or former title of a merged page), then any other entry with that title. */
export function resolveLink(target: string, pages: Entry<WikiPage>[], others: Entry[] = []): Entry | null {
  const n = norm(target);
  return pages.find((p) => norm(p.data.title) === n) ?? pages.find((p) => (p.data.aliases ?? []).some((a) => norm(a) === n))
    ?? others.find((e) => norm(entryTitle(e)) === n) ?? null;
}

/** Pages that link to this one (by its title or a former title) or name it in their links list. */
export function backlinks(page: Entry<WikiPage>, all: Entry<WikiPage>[], others: Entry[] = []) {
  const names = new Set([page.data.title, ...(page.data.aliases ?? [])].map(norm));
  const wiki = all.filter((p) => p.id !== page.id && wikiLinks(p.data.body).some((l) => names.has(norm(l.target))));
  const linked = others.filter((e) => ((e.data as { links?: string[] }).links ?? []).includes(page.id));
  return [...wiki, ...linked];
}

/** Text split into plain parts and links, for showing it. */
export function splitWiki(body: string): ({ text: string } | { link: string; label: string })[] {
  const out: ({ text: string } | { link: string; label: string })[] = [];
  let last = 0;
  for (const m of body.matchAll(/\[\[([^[\]|]{1,120})(?:\|([^[\]]{1,120}))?\]\]/g)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ link: m[1].trim(), label: (m[2] ?? m[1]).trim() });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/**
 * Keeps the previous text as a version when it really changed – at most one version per 5 minutes of editing (so
 * autosave does not fill the history with every word), and at most 20.
 */
export function withVersion(prev: WikiPage | undefined, next: WikiPage, now: number, force = false): WikiPage {
  const history = [...(prev?.history ?? [])];
  if (prev && (prev.body !== next.body || prev.title !== next.title)) {
    const lastAt = history[history.length - 1]?.at ?? 0;
    if (force || now - lastAt >= 5 * 60_000) history.push({ at: now, title: prev.title, body: prev.body });
  }
  return { ...next, history: history.slice(-WIKI_HISTORY) };
}

/** Pages with the same title (or one's title being another's former title) – candidates to merge. */
export function duplicateGroups(pages: Entry<WikiPage>[]): Entry<WikiPage>[][] {
  const groups = new Map<string, Entry<WikiPage>[]>();
  for (const p of pages) { const k = norm(p.data.title); groups.set(k, [...(groups.get(k) ?? []), p]); }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Merges `other` into `keep`: both texts, all tags and links; the other title stays as an alias so its links still work. */
export function mergePages(keep: WikiPage, other: WikiPage, now: number): WikiPage {
  const body = keep.body.trim() === other.body.trim() || !other.body.trim() ? keep.body : `${keep.body.trimEnd()}\n\n— zusammengeführt aus „${other.title}“ —\n${other.body.trim()}`;
  const aliases = [...new Set([...(keep.aliases ?? []), ...(other.aliases ?? []), ...(norm(other.title) !== norm(keep.title) ? [other.title] : [])])];
  return withVersion(keep, {
    ...keep, body, aliases, tags: cleanTags([...keep.tags, ...other.tags]), links: [...new Set([...(keep.links ?? []), ...(other.links ?? [])])],
    gameId: keep.gameId ?? other.gameId, gameName: keep.gameName ?? other.gameName,
  }, now, true);
}

/** A page as Markdown (export of one page). */
export function wikiMarkdown(p: WikiPage) {
  const tags = p.tags.length ? `\n\nTags: ${p.tags.join(", ")}` : "";
  return `# ${p.title}\n\n${p.body}${tags}\n`;
}
