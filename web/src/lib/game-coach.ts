// JARVIS Quest-Coach: nutzt dein Gaming-Gedächtnis (Spiele-Journal: „Wo war ich?“, Zielpfade, Sammlung, Story,
// Spielzeit) statt jede Frage ohne Zusammenhang zu beantworten. Liest und schreibt nur, was du sagst oder einträgst –
// erfindet keinen Fortschritt. Spoiler-Stufe je Spiel: ohne Angabe gilt „keine Spoiler“.

import { client } from "./rpc";
import { listKind, newId, saveEntry } from "./journal";
import { memoriesOf, memorySummary, norm, pathProgress, sameGame, spoilerFree, type Find, type GoalPath, type Memory, type Story } from "./journal-logic";
import { findGames, type GameStats } from "./play";
import type { LibraryItem } from "./types";
import { findPlaytime, savePlaytime } from "./playtime-chat";
import { estimateRemaining, fmtRange } from "./playtime";
import { readCache } from "./offline-cache";
import { gameInText } from "./challenge-chat";
import type { Challenge } from "./play";

export type Spoiler = "none" | "hints" | "solution" | "full";
export const SPOILER_LABEL: Record<Spoiler, string> = { none: "keine Story-Spoiler", hints: "nur Hinweise zur aktuellen Stelle", solution: "ausführliche Lösung", full: "vollständige Story auf Wunsch" };

export type CoachIntent =
  | { kind: "where"; game: string | null }
  | { kind: "next"; game: string }
  | { kind: "note"; game: string; text: string }
  | { kind: "todo"; game: string; text: string }
  | { kind: "at"; game: string; where: string }
  | { kind: "spoiler"; game: string; level: Spoiler }
  | { kind: "help"; game: string; topic: string | null }
  | { kind: "story"; game: string }
  | { kind: "fits"; minutes: number }
  | { kind: "plan"; game: string; text: string }
  | { kind: "projects" }
  | { kind: "profile" }
  | { kind: "top" }
  | { kind: "recent" };

const clean = (g: string) => g.replace(/^(?:dem spiel|das spiel|dem|der|die|das)\s+/i, "").replace(/[„“"]/g, "").replace(/[?!.]+$/, "").trim();
const ok = (g: string | undefined | null) => !!g && g.length >= 2 && g.length <= 80 && !/^(es|da|hier|dort|dem|meinem spiel)$/i.test(g);

export function coachIntent(raw: string): CoachIntent | null {
  const q = raw.trim().replace(/^jarvis[,:]?\s*/i, "").replace(/[.!]+$/, "");
  let m: RegExpExecArray | null;
  // Time that fits ("Ich habe heute 20 Minuten", "Welches Spiel passt in 30 Minuten?").
  if ((m = /\b(?:ich habe|hab|habe)\s+(?:heute|jetzt|noch|gerade)?\s*(?:nur\s+)?(\d+(?:[.,]\d+)?)\s*(min|minuten|std|stunden?|h)\b/i.exec(q)) ?? (m = /\bwelches spiel\b.*?\b(?:in|für)\s+(\d+(?:[.,]\d+)?)\s*(min|minuten|std|stunden?|h)\b/i.exec(q)))
    if (!/\bausgegeben\b|€|euro|\bbis\b|täglich|pro tag/i.test(q)) {
      const n = Number(m[1].replace(",", ".")), unit = m[2].toLowerCase();
      return { kind: "fits", minutes: Math.round(unit.startsWith("min") ? n : n * 60) };
    }
  // The gamer behind the games: profile, most played, last played – from the PC's history and your journal.
  if (/\bwas (?:weißt|weisst) du (?:alles )?über mich als (?:gamer|spieler|zocker)\b|\bmein(?:em)? (?:gamer|spieler)[- ]?profil\b|\bwas für ein (?:gamer|spieler|zocker) bin ich\b/i.test(q)) return { kind: "profile" };
  if (/\bwas (?:spiele|zocke) ich am (?:meisten|liebsten|häufigsten|haeufigsten)\b|\bmeine (?:meistgespielten|lieblings-?spiele)\b|\bwelche spiele spiele ich am meisten\b/i.test(q)) return { kind: "top" };
  if (/\bwas (?:habe|hab) ich (?:zuletzt|als letztes|gestern|diese woche) gespielt\b|\bmeine letzten? (?:spielsitzung(?:en)?|sitzungen)\b/i.test(q)) return { kind: "recent" };
  // All open projects across games.
  if (/\b(?:zeig|liste|welche|was sind|gib)\b.*\boffenen?\s+(?:projekte|aufgaben|ziele|vorhaben)\b|\b(?:alle|meine) offenen (?:projekte|aufgaben|ziele|vorhaben)\b/i.test(q) && !/\bchallenge/i.test(q)) return { kind: "projects" };
  // "Merke dir, dass ich als Nächstes mein Minecraft-Haus fertigbauen möchte" – a plan for the game named in the sentence.
  if ((m = /\b(?:merk|merke|speicher|speichere|notier|notiere)\s+(?:dir|mir)?,?\s*(?:bitte\s+)?,?\s*dass ich\s+(.{4,240}?)\s+(?:machen |erledigen |fertig ?(?:bauen|machen|stellen) )?(?:möchte|will|muss|vorhabe|plane)$/i.exec(q))) {
    const game = gameInText(m[1]);
    if (game) {
      const text = m[1].replace(/\b(?:als (?:nächstes|naechstes|erstes)|demnächst|beim nächsten mal|nächstes mal)\b/gi, "").replace(/\b(?:in|bei)\s+[^,]+?(?=\s+(?:mein|meine|den|die|das|noch)\b)/i, "").replace(/\s{2,}/g, " ").trim();
      const tail = /(fertig ?bauen|fertig ?machen|fertigstellen|machen|erledigen)\s+(?:möchte|will|muss|vorhabe|plane)$/i.exec(q)?.[1];
      return { kind: "plan", game, text: (tail && !text.endsWith(tail) ? `${text} ${tail}` : text).replace(/^./, (c) => c.toUpperCase()) };
    }
  }
  // Where was I?
  if ((m = /\bwo war ich\s+(?:zuletzt\s+|als letztes\s+|noch\s+)?(?:in|bei)\s+(.+?)(?:\s+stehen ?geblieben)?\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "where", game: clean(m[1]) };
  if (/\bwo war ich(?: (?:noch|zuletzt))?(?: stehen ?geblieben)?\??$/i.test(q)) return { kind: "where", game: null };
  // What next?
  if ((m = /\bwas (?:sollte|soll|kann|könnte) ich\s+(?:in|bei)\s+(.+?)\s+als (?:nächstes|naechstes)(?:\s+(?:machen|tun|spielen))?\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "next", game: clean(m[1]) };
  if ((m = /\bwie geht es\s+(?:in|bei)\s+(.+?)\s+weiter\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "next", game: clean(m[1]) };
  if ((m = /\bwas (?:sollte|soll|kann|könnte|mache) ich\s+(?:heute|jetzt|nachher|heute abend)\s+(?:in|bei)\s+(.+?)\s+(?:machen|tun|spielen|erledigen)\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "next", game: clean(m[1]) };
  // Save a hint / a to-do.
  if ((m = /\b(?:speicher|speichere|notier|notiere|merk dir|merke dir)\s+(?:mir\s+)?(?:bitte\s+)?(?:einen|den|diesen|folgenden)?\s*(?:hinweis|tipp|notiz)\s+(?:für|zu|in|bei)\s+(.+?)\s*:\s*(.{3,500})$/i.exec(q)) && ok(clean(m[1]))) return { kind: "note", game: clean(m[1]), text: m[2].trim() };
  if ((m = /\berinnere? mich(?:\s+daran)?,?\s+dass ich\s+(?:in|bei)\s+(.+?)\s+noch\s+(.{3,200}?)\s+(?:machen|erledigen|holen|finden|besiegen|suchen|sammeln|bauen|abschließen)\s+(?:will|möchte|muss|wollte)$/i.exec(q)
    ?? /\berinnere? mich(?:\s+daran)?,?\s+dass ich\s+(?:in|bei)\s+(.+?)\s+((?:die|den|das|eine?n?)\s+.{3,200}?)\s+(?:machen|erledigen|holen|finden|besiegen|suchen|sammeln|bauen|abschließen)\s+(?:will|möchte|muss|wollte)$/i.exec(q)) && ok(clean(m[1])))
    return { kind: "todo", game: clean(m[1]), text: m[2].replace(/^(?:die|den|das|eine?n?)\s+/i, "").trim() };
  // Where I am now ("Ich bin in Hogwarts Legacy gerade bei der Quest Der Kartenraum").
  if (!/%|prozent/i.test(q) && (m = /^ich bin\s+(?:in|bei)\s+(.+?)\s+(?:gerade|jetzt|aktuell)\s+(?:bei|in|an|im|am)\s+(.{2,200})$/i.exec(q)) && ok(clean(m[1]))) return { kind: "at", game: clean(m[1]), where: m[2].trim() };
  // Spoiler level.
  const lvl: Spoiler | null = /\b(keine spoiler|spoilerfrei|ohne spoiler)\b/i.test(q) ? "none" : /\bnur hinweise\b/i.test(q) ? "hints" : /\b(ausführliche|komplette|ganze) lösung(en)?\b/i.test(q) ? "solution" : /\b(alles verraten|volle story|vollständige story|spoiler sind ok|spoiler erlaubt)\b/i.test(q) ? "full" : null;
  if (lvl && (m = /\b(?:für|bei|in)\s+(.+?)$/i.exec(q)) && ok(clean(m[1])) && /\b(spoiler|hinweise|lösung|verraten|story)\b/i.test(q) && !/\bwie komme\b|\berkl/i.test(q)) return { kind: "spoiler", game: clean(m[1]), level: lvl };
  // Help at the current spot.
  if ((m = /\bwie komme ich\s+(?:in|bei)\s+(.+?)\s+weiter(?:\s+(?:bei|an|im|in)\s+(.+?))?\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "help", game: clean(m[1]), topic: m[2] ? clean(m[2]) : null };
  if ((m = /\bich (?:hänge|haenge|stecke|komme nicht weiter)\s+(?:in|bei)\s+(.+?)(?:\s+(?:bei|an|im|am)\s+(.+?))?(?:\s+fest)?\??$/i.exec(q)) && ok(clean(m[1]))) return { kind: "help", game: clean(m[1]), topic: m[2] ? clean(m[2]) : null };
  if ((m = /\berkl(?:ä|ae)r(?:e)? mir\s+(?:die|den|das)?\s*(?:quest|mission|aufgabe|stelle)\s+(.+?)\s+(?:in|bei|aus)\s+(.+?)\??$/i.exec(q)) && ok(clean(m[2]))) return { kind: "help", game: clean(m[2]), topic: clean(m[1]) };
  // Story so far.
  if ((m = /\b(?:fasse?|zusammenfassung)\b.*?\b(?:geschichte|story|handlung)\b.*?\b(?:von|in|bei|aus)\s+(.+?)(?:\s+bis\b.*)?\s*(?:zusammen)?\??$/i.exec(q)) && ok(clean(m[1].replace(/\s+zusammen$/i, "")))) return { kind: "story", game: clean(m[1].replace(/\s+zusammen$/i, "")) };
  return null;
}

export interface CoachReply { text: string; sources: string[]; links: { label: string; url: string }[]; navigate: { label: string; path: string }[]; ok: boolean | null }

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
const of = <T,>(kind: string) => listKind<T>(kind);
const ref = (game: string) => ({ gameName: game });

/** The spelling used in the journal / library ("hogwarts" → "Hogwarts Legacy"), if the game is known there. */
function known(game: string): string {
  const n = norm(game);
  for (const kind of ["memory", "path", "find", "story", "playtime"]) {
    for (const e of listKind<{ gameName?: string | null }>(kind)) {
      const g = e.data.gameName;
      if (g && (norm(g) === n || (n.length >= 4 && norm(g).startsWith(n)))) return g;
    }
  }
  return game;
}

export function spoilerOf(game: string): Spoiler { return findPlaytime(game)?.data.spoiler ?? "none"; }

function gameContext(game: string) {
  const memories = of<Memory>("memory");
  const sum = memorySummary(memories, ref(game));
  const paths = of<GoalPath>("path").filter((e) => sameGame(e.data, ref(game)) && !e.data.archived);
  const finds = of<Find>("find").filter((e) => sameGame(e.data, ref(game)) && e.data.status === "open");
  const stories = of<Story>("story").filter((e) => sameGame(e.data, ref(game)));
  const pt = findPlaytime(game);
  return { sum, paths, finds, stories, pt, latest: memoriesOf(memories, ref(game))[0] };
}

/** Bauprojekte (Welten & Bauen) that are not done, with the number of open tasks. */
function openProjects(): { title: string; game: string | null; left: number }[] {
  return of<{ title: string; status?: string; game?: { gameName?: string | null } | string | null; gameName?: string | null; worldId?: string; tasks?: { text: string; done?: boolean }[] }>("project")
    .filter((e) => e.data.status !== "done")
    .map((e) => ({ title: e.data.title, game: (typeof e.data.game === "string" ? e.data.game : e.data.game?.gameName) ?? e.data.gameName ?? (e.data.worldId ? "Minecraft" : null), left: (e.data.tasks ?? []).filter((t) => !t.done).length }));
}

type PcStat = { itemId: string; totalMinutes: number; lastPlayed: string; sessions: number };
/** Library and play times: live from the PC, else the last copy on this device ("cache"), else nothing. */
async function pcData(online: boolean): Promise<{ items: LibraryItem[]; stats: PcStat[]; measured: "live" | "cache" | "none" }> {
  if (online) {
    try {
      const [lib, hist] = await Promise.all([client.call<{ items: LibraryItem[] }>("library.list"), client.call<{ stats: PcStat[] }>("history.get")]);
      return { items: lib.items ?? [], stats: hist.stats ?? [], measured: "live" };
    } catch { /* fall back to the stored copy */ }
  }
  const lib = readCache<{ items: LibraryItem[] }>("library.list"), hist = readCache<{ stats: PcStat[] }>("history.get");
  return { items: lib?.data.items ?? [], stats: hist?.data.stats ?? [], measured: hist ? "cache" : "none" };
}

/** "Letzte Sitzung …" from the PC's history (measured), or null. */
async function lastSession(game: string, online: boolean): Promise<string | null> {
  const { items, stats, measured } = await pcData(online);
  const it = items.find((x) => norm(x.name) === norm(game));
  const st = it && stats.find((x) => x.itemId === it.id);
  if (!st || !st.lastPlayed) return null;
  return `Letzte Spielsitzung: ${new Date(st.lastPlayed).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}, insgesamt ${Math.round(st.totalMinutes / 6) / 10} Std. [vom PC gemessen${measured === "cache" ? ", gespeicherter Stand" : ""}]`;
}

export async function coachAnswer(i: CoachIntent, online: boolean): Promise<CoachReply> {
  const nav = (label: string, path: string) => ({ label, path });
  switch (i.kind) {
    case "where": {
      if (!i.game) {
        const all = of<Memory>("memory").sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at));
        if (!all.length) return { text: "Du hast noch nichts notiert, wo du warst. Sag z. B. „Ich bin in Hogwarts Legacy gerade bei der Quest Der Kartenraum“ – dann weiß ich es beim nächsten Mal.", sources: ["dein Spiele-Journal"], links: [], navigate: [nav("„Wo war ich?“ öffnen", "/journal?tab=memory")], ok: null };
        const last = all[0].data;
        i = { kind: "where", game: last.gameName ?? "" };
      }
      const game = known(i.game!);
      const c = gameContext(game);
      if (!c.sum && !c.pt && !c.paths.length && !c.finds.length) return { text: `Zu ${game} habe ich nichts gespeichert – ich kenne deinen Stand also nicht und rate nicht. Sag z. B. „Ich bin in ${game} gerade bei …“.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Notiz anlegen", `/journal?tab=memory`)], ok: null };
      const lines = [`JARVIS – ${game}: wo du warst`];
      if (c.sum) {
        lines.push(`• Zuletzt (${day(c.sum.lastAt)}): ${c.sum.lastDid || "—"}`);
        if (c.sum.where) lines.push(`• Stelle: ${c.sum.where}`);
        if (c.sum.next) lines.push(`• Vorgenommen für nächstes Mal: ${c.sum.next}`);
      }
      const lastS = await lastSession(game, online);
      if (lastS) lines.push("• " + lastS);
      if (c.pt?.data.progress) lines.push(`• Fortschritt: ${c.pt.data.progress.percent} % (deine Angabe vom ${day(c.pt.data.progress.at)})`);
      for (const p of c.paths.slice(0, 2)) { const pp = pathProgress(p.data); if (pp.next) lines.push(`• Zielpfad „${p.data.title}“: ${pp.done}/${pp.total} – nächste Etappe: ${pp.next.title}`); }
      if (c.finds.length) lines.push(`• Offen: ${c.finds.slice(0, 4).map((f) => f.data.title).join(", ")}${c.finds.length > 4 ? ` (+${c.finds.length - 4})` : ""}`);
      lines.push("", "Quelle: dein Spiele-Journal (nur was du eingetragen hast)" + (lastS ? " und der Spielverlauf des PCs (gemessen)" : "") + ". Einen Spielstand lese ich nicht aus.");
      return { text: lines.join("\n"), sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Im Journal ansehen", c.latest ? `/journal?tab=memory&id=${c.latest.id}` : "/journal?tab=memory")], ok: true };
    }
    case "next": {
      const game = known(i.game);
      const c = gameContext(game);
      const ideas: string[] = [];
      if (c.sum?.next) ideas.push(`Dein eigener Plan vom ${day(c.sum.lastAt)}: ${c.sum.next}`);
      for (const p of c.paths) { const pp = pathProgress(p.data); if (pp.next) ideas.push(`Zielpfad „${p.data.title}“ – nächste Etappe: ${pp.next.title}${pp.next.note ? ` (${pp.next.note})` : ""}`); }
      for (const f of c.finds.slice(0, 3)) ideas.push(`Noch offen: ${f.data.title}${f.data.where ? ` (${f.data.where})` : ""}`);
      for (const p of openProjects().filter((x) => sameGame({ gameName: x.game }, ref(game))).slice(0, 2)) ideas.push(`Bauprojekt „${p.title}“${p.left ? ` – noch ${p.left} Aufgabe${p.left === 1 ? "" : "n"}` : ""}`);
      for (const ch of of<Challenge>("challenge").filter((e) => e.data.status === "open" && sameGame(e.data, ref(game))).slice(0, 2)) ideas.push(`Offene Challenge: ${ch.data.text.replace(/^.*?:\s/, "")}`);
      if (c.pt) {
        const est = estimateRemaining(c.pt.data, "main");
        if (est.range && est.kind !== "done") ideas.push(`Hauptstory: geschätzt noch ${fmtRange(est.range)} [Schätzung]`);
      }
      if (!ideas.length) return { text: `Für ${game} habe ich keinen Plan, keine offenen Aufgaben und keinen Stand gespeichert – ich empfehle dir deshalb nichts Erfundenes. Sag mir, wo du gerade bist („Ich bin in ${game} gerade bei …“), oder leg unter Zielpfade deine Etappen an.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Zielpfad anlegen", "/journal?tab=goals")], ok: null };
      const last = await lastSession(game, online);
      if (last) ideas.unshift(last);
      return { text: [`JARVIS – ${game}: was als Nächstes`, ...ideas.map((x) => "• " + x), "", `ℹ Spoiler-Stufe für ${game}: ${SPOILER_LABEL[spoilerOf(game)]}. Nur aus deinen Einträgen – nichts aus der Story verraten.`, "Quelle: dein Spiele-Journal"].join("\n"), sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Zielpfade", "/journal?tab=goals"), nav("Sammlung", "/journal?tab=finds")], ok: true };
    }
    case "note": {
      const game = known(i.game);
      const e = saveEntry<Memory>("memory", newId(), { gameName: game, at: new Date().toISOString(), did: "Hinweis", notes: i.text, imageIds: [], links: [] });
      return { text: `✓ Hinweis für ${game} gespeichert: „${i.text}“ (heute). Du findest ihn unter „Wo war ich?“ – änderbar und löschbar.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Hinweis ansehen", `/journal?tab=memory&id=${e.id}`)], ok: true };
    }
    case "todo": {
      const game = known(i.game);
      const e = saveEntry<Find>("find", newId(), { gameName: game, title: i.text.replace(/^./, (c) => c.toUpperCase()), category: /quest|mission|auftrag/i.test(i.text) ? "quest" : /boss|gegner/i.test(i.text) ? "boss" : "other", status: "open", tags: ["jarvis"], notes: `Von JARVIS am ${day(new Date().toISOString())} notiert.`, imageIds: [], links: [] });
      return { text: `✓ Gemerkt: In ${game} willst du noch „${e.data.title}“. Das steht jetzt offen in deiner Sammlung – ich erinnere dich, wenn du „Was sollte ich in ${game} als Nächstes machen?“ fragst. Eine Push-Erinnerung stelle ich nur, wenn du das ausdrücklich einrichtest.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("In der Sammlung ansehen", `/journal?tab=finds&id=${e.id}`)], ok: true };
    }
    case "at": {
      const game = known(i.game);
      const e = saveEntry<Memory>("memory", newId(), { gameName: game, at: new Date().toISOString(), did: "Stand gemerkt", where: i.where, imageIds: [], links: [] });
      return { text: `✓ Gemerkt: ${game} – du bist gerade bei „${i.where}“ (heute). Frag später „Wo war ich in ${game}?“.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Ansehen", `/journal?tab=memory&id=${e.id}`)], ok: true };
    }
    case "spoiler": {
      const game = known(i.game);
      savePlaytime(game, { spoiler: i.level });
      return { text: `✓ Spoiler-Stufe für ${game}: ${SPOILER_LABEL[i.level]}. Daran halte ich mich bei Hinweisen und Links. Ändern kannst du das jederzeit hier im Chat oder unter Spiele-Journal → Spielzeit.`, sources: ["deine Einstellung"], links: [], navigate: [nav("Ansehen", "/journal?tab=playtime")], ok: true };
    }
    case "help": {
      const game = known(i.game);
      const level = spoilerOf(game);
      const c = gameContext(game);
      const spot = i.topic ?? c.sum?.where ?? null;
      const q = `${game}${spot ? " " + spot : ""}`;
      const lines = [`JARVIS – ${game}${spot ? `: ${spot}` : ""}`];
      if (!spot) lines.push(`Ich weiß nicht, an welcher Stelle du gerade bist – sag es mir („Wie komme ich in ${game} weiter bei …?“), damit ich nichts Späteres verrate.`);
      else if (c.sum?.where && !i.topic) lines.push(`Laut deiner Notiz vom ${day(c.sum.lastAt)} bist du bei „${c.sum.where}“.`);
      const search = level === "none" || level === "hints" ? `${q} Tipps ohne Spoiler` : level === "solution" ? `${q} Lösung` : `${q} Walkthrough`;
      lines.push(`• Spoiler-Stufe: ${SPOILER_LABEL[level]}${level === "none" ? " – deshalb nur Links zu spoilerfreien Tipps; „ausführliche Lösung für " + game + "“ schaltet mehr frei." : "."}`);
      const own = [...c.finds.filter((f) => !spot || norm(f.data.title).includes(norm(spot)) || norm(f.data.where ?? "").includes(norm(spot))).slice(0, 2).map((f) => `Deine Notiz: ${f.data.title}${f.data.notes ? ` – ${f.data.notes}` : ""}`)];
      lines.push(...own.map((x) => "• " + x));
      lines.push("", "ℹ Den genauen Lösungsweg kenne ich nicht aus erster Hand und erfinde ihn nicht – die Links führen zu Videos bzw. Suchergebnissen passend zu deiner Spoiler-Stufe.");
      const links = [{ label: `YouTube: ${search}`.slice(0, 60), url: `https://www.youtube.com/results?search_query=${encodeURIComponent(search)}` }];
      if (online && spot) {
        try {
          const r = await client.call<{ configured: boolean; videos: { title: string; channel: string; url: string }[] }>("media.youtube", { query: search });
          if (r.configured && r.videos.length) { lines.splice(lines.length - 2, 0, ...r.videos.slice(0, 3).map((v) => `• Video: ${v.title} – ${v.channel}`)); links.unshift(...r.videos.slice(0, 2).map((v) => ({ label: v.title.slice(0, 40), url: v.url }))); }
        } catch { /* links stay */ }
      }
      return { text: lines.join("\n"), sources: ["dein Spiele-Journal", "YouTube-Suche"], links, navigate: [], ok: spot ? true : null };
    }
    case "story": {
      const game = known(i.game);
      const st = of<Story>("story").find((e) => sameGame(e.data, ref(game)));
      if (!st || !st.data.chapters.length) return { text: `Für ${game} hast du noch keine Story-Notizen. Eine Zusammenfassung „bis zu deinem Stand“ schreibe ich nur aus deinen eigenen Kapitel-Notizen – sonst würde ich raten oder spoilern. Leg sie unter Spiele-Journal → Story an.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Story öffnen", "/journal?tab=story")], ok: null };
      const v = spoilerFree(st.data);
      const shown = v.chapters.filter((c) => !c.hidden);
      const hidden = v.chapters.length - shown.length;
      const lines = [`JARVIS – ${game}: Story bis zu deinem Stand (aus deinen Notizen)`, ...shown.map((c) => `• ${c.title}${c.summary ? `: ${c.summary}` : ""}`)];
      if (hidden) lines.push(`ℹ ${hidden} weitere Kapitel/Einträge sind ausgeblendet (nach deinem Stand oder als Spoiler markiert).`);
      return { text: lines.join("\n"), sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Story öffnen", `/journal?tab=story&id=${st.id}`)], ok: true };
    }
    case "plan": {
      const game = known(i.game);
      const e = saveEntry<Memory>("memory", newId(), { gameName: game, at: new Date().toISOString(), did: "Plan gemerkt", next: i.text, imageIds: [], links: [] });
      return { text: `✓ Für ${game} gemerkt – als Nächstes: „${i.text}“ [deine Angabe]. Frag „Was sollte ich heute in ${game} machen?“ oder „Wo war ich zuletzt in ${game}?“ – änderbar und löschbar unter „Wo war ich?“.`, sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Ansehen", `/journal?tab=memory&id=${e.id}`)], ok: true };
    }
    case "projects": {
      const groups = new Map<string, string[]>();
      const add = (game: string | null | undefined, line: string) => { const g = game?.trim() || "Ohne Spiel"; groups.set(g, [...(groups.get(g) ?? []), line]); };
      const mem = of<Memory>("memory");
      for (const g of new Set(mem.map((e) => e.data.gameName).filter(Boolean) as string[])) { const sum = memorySummary(mem, ref(g)); if (sum?.next) add(g, `Plan: ${sum.next} (${day(sum.lastAt)})`); }
      for (const p of of<GoalPath>("path").filter((e) => !e.data.archived && !e.data.template)) { const pp = pathProgress(p.data); if (pp.next) add(p.data.gameName, `Zielpfad „${p.data.title}“: ${pp.done}/${pp.total}, nächste Etappe ${pp.next.title}`); }
      for (const f of of<Find>("find").filter((e) => e.data.status === "open")) add(f.data.gameName, `Offen: ${f.data.title}`);
      for (const p of openProjects()) add(p.game, `Bauprojekt „${p.title}“${p.left ? ` – noch ${p.left} Aufgabe${p.left === 1 ? "" : "n"}` : ""}`);
      for (const ch of of<Challenge>("challenge").filter((e) => e.data.status === "open")) add(ch.data.gameName, `Challenge: ${ch.data.text.replace(/^.*?:\s/, "")}`);
      if (!groups.size) return { text: "Du hast keine offenen Projekte, Pläne, Aufgaben oder Challenges gespeichert. Sag z. B. „Merke dir, dass ich als Nächstes mein Minecraft-Haus fertigbauen möchte“.", sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Spiele-Journal", "/journal")], ok: null };
      const lines = ["JARVIS – deine offenen Projekte"];
      for (const [g, l] of [...groups].sort((a, b) => b[1].length - a[1].length)) { lines.push(`▸ ${g}`); lines.push(...l.slice(0, 6).map((x) => "   • " + x)); if (l.length > 6) lines.push(`   … und ${l.length - 6} weitere`); }
      lines.push("", "Alles davon hast du selbst eingetragen (oder mir gesagt) – nichts aus einem Spielstand gelesen.");
      return { text: lines.join("\n"), sources: ["dein Spiele-Journal"], links: [], navigate: [nav("Sammlung", "/journal?tab=finds"), nav("Zielpfade", "/journal?tab=goals"), nav("Challenges", "/play?tab=challenges")], ok: true };
    }
    case "profile":
    case "top":
    case "recent": {
      const { items, stats, measured } = await pcData(online);
      const games = items.filter((x) => x.kind === "game" && !x.duplicateOf);
      const played = stats.filter((s) => s.totalMinutes > 0 && games.some((g) => g.id === s.itemId)).map((s) => ({ ...s, name: games.find((g) => g.id === s.itemId)!.name }));
      const h = (m: number) => m >= 60 ? `${Math.round(m / 6) / 10} Std.` : `${m} Min.`;
      const tag = measured === "live" ? "[vom PC gemessen]" : measured === "cache" ? "[vom PC gemessen, gespeicherter Stand]" : "";
      if (i.kind !== "profile" && !played.length) return { text: measured === "none" ? "Deine Spielzeiten misst der PC – verbinde ihn einmal, danach kann ich das auch ohne PC sagen." : "Der PC hat noch keine Spielzeit gemessen.", sources: ["Gaming-Verlauf"], links: [], navigate: [nav("Verlauf", "/history")], ok: null };
      if (i.kind === "top") {
        const top = [...played].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 5);
        return { text: [`JARVIS – am meisten gespielt ${tag}`, ...top.map((s, n) => `${n + 1}. ${s.name} – ${h(s.totalMinutes)} in ${s.sessions} Sitzung${s.sessions === 1 ? "" : "en"}`)].join("\n"), sources: ["Gaming-Verlauf"], links: [], navigate: [nav("Verlauf", "/history")], ok: true };
      }
      if (i.kind === "recent") {
        const rec = [...played].sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed)).slice(0, 5);
        return { text: [`JARVIS – zuletzt gespielt ${tag}`, ...rec.map((s) => `• ${s.name} – ${new Date(s.lastPlayed).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`)].join("\n"), sources: ["Gaming-Verlauf"], links: [], navigate: [nav("Verlauf", "/history")], ok: true };
      }
      const lines = ["JARVIS – was ich über dich als Gamer weiß"];
      if (played.length) {
        const total = played.reduce((a, s) => a + s.totalMinutes, 0);
        const top = [...played].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 3);
        const lastP = [...played].sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed))[0];
        lines.push(`• Meistgespielt: ${top.map((s) => `${s.name} (${h(s.totalMinutes)})`).join(", ")} ${tag}`, `• Zuletzt: ${lastP.name} am ${day(lastP.lastPlayed)} ${tag}`, `• Insgesamt erfasst: ${h(total)} in ${played.length} Spielen ${tag}`);
      } else lines.push(measured === "none" ? "• Spielzeiten: noch keine – die misst der PC, sobald er verbunden ist." : "• Spielzeiten: noch keine gemessen.");
      if (games.length) {
        const by = (b: string) => games.filter((g) => g.backlog === b).length;
        lines.push(`• Bibliothek: ${games.length} Spiele${by("playing") ? `, ${by("playing")} am Spielen` : ""}${by("next") ? `, ${by("next")} als Nächstes` : ""}${by("completed") ? `, ${by("completed")} durch` : ""} [deine Bibliothek]`);
      }
      const styles = of<{ gameName?: string; playstyle?: string; platform?: string }>("playtime").map((e) => e.data).filter((d) => d.playstyle || d.platform);
      if (styles.length) lines.push(`• Spielweise: ${styles.slice(0, 3).map((d) => `${d.gameName}: ${[d.playstyle, d.platform].filter(Boolean).join(", ")}`).join(" · ")} [deine Angabe]`);
      const facts = (await import("./jarvis-memory")).recall(null);
      if (facts.length) lines.push(`• Gemerkt: ${facts.slice(0, 4).join(" · ")}${facts.length > 4 ? ` (+${facts.length - 4})` : ""} [deine Angabe]`);
      const ch = of<Challenge>("challenge");
      if (ch.length) lines.push(`• Challenges: ${ch.filter((e) => e.data.status === "done").length} geschafft, ${ch.filter((e) => e.data.status === "open").length} offen [deine Einträge]`);
      const proj = openProjects();
      if (proj.length) lines.push(`• Offene Bauprojekte: ${proj.slice(0, 3).map((p) => p.title).join(", ")} [deine Einträge]`);
      if (lines.length === 1) lines.push("Noch nichts – sag mir z. B. „Merk dir, dass ich am liebsten Koop spiele“ oder verbinde den PC für deine Spielzeiten.");
      lines.push("", "Gemessene Werte stammen vom PC, alles andere hast du eingetragen. Löschen und ändern: Spiele-Journal bzw. „Vergiss …“.");
      return { text: lines.join("\n"), sources: measured === "none" ? ["dein Spiele-Journal"] : ["Gaming-Verlauf", "dein Spiele-Journal"], links: [], navigate: [nav("Verlauf", "/history"), nav("Spiele-Journal", "/journal")], ok: true };
    }
    case "fits": {
      let items: LibraryItem[] = [], installed: Record<string, boolean> = {}, stats = new Map<string, GameStats>();
      try {
        const [lib, hist] = await Promise.all([
          client.call<{ items: LibraryItem[]; installed: Record<string, boolean> }>("library.list"),
          client.call<{ stats: { itemId: string; totalMinutes: number; lastPlayed: string; sessions: number; typicalMinutes?: number | null }[] }>("history.get").catch(() => ({ stats: [] })),
        ]);
        items = lib.items ?? []; installed = lib.installed ?? {}; stats = new Map((hist.stats ?? []).map((s) => [s.itemId, s]));
      } catch { /* no library on this device yet */ }
      if (!items.some((x) => x.kind === "game")) return { text: "Deine Spieleliste kommt vom PC – verbinde ihn einmal, danach geht das auch ohne PC.", sources: ["JARVIS"], links: [], navigate: [nav("Zeit-Finder öffnen", "/play?tab=time")], ok: null };
      const memories = of<Memory>("memory");
      const r = findGames(items, stats, { minutes: i.minutes, statuses: [], installedOnly: false, installed }, (it) => memoriesOf(memories, { gameId: it.id, gameName: it.name }).length > 0);
      const fmt = (t: string, v?: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));
      const top = r.fits.slice(0, 4);
      if (!top.length) return { text: `Für ${i.minutes} Min. kenne ich kein Spiel mit passender Sitzungslänge${r.unknown.length ? ` – bei ${r.unknown.slice(0, 3).map((s) => s.item.name).join(", ")} weiß ich die Dauer nicht` : ""}. Unter Backlog kannst du je Spiel eintragen, wie lange eine Sitzung dauert.`, sources: ["deine Bibliothek", "Gaming-Verlauf"], links: [], navigate: [nav("Zeit-Finder öffnen", "/play?tab=time")], ok: null };
      return { text: [`JARVIS – passt in ${i.minutes} Min.:`, ...top.map((s) => `• ${s.item.name} – ${s.reasons.slice(0, 2).map((x) => fmt(x.text, x.vars)).join(" · ")}`), "", "ℹ Sitzungslängen aus deinen Angaben bzw. dem Verlauf – Schätzung, keine Garantie. Starten tue ich erst, wenn du es sagst."].join("\n"), sources: ["deine Bibliothek", "Gaming-Verlauf"], links: [], navigate: [nav("Zeit-Finder öffnen", "/play?tab=time")], ok: true };
    }
  }
}
