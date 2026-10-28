// JARVIS recherchiert: was ein Spiel ist, was es kostet, wie viele es gerade spielen, Speedrun-Weltrekorde,
// Free-to-Play-Tipps und „Läuft das auf meinem PC?“. Nur auf deine Frage und nur über erlaubte, offene Schnittstellen
// (Steam über den PC, speedrun.com, FreeToGame, Microsoft Store/Wikipedia) – nie Google-Scraping, nichts erfunden.

import { client } from "./rpc";
import { lookupGame, sameGame } from "./game-lookup";
import { fetchMsPrice } from "./ms-store";

export type ResearchIntent =
  | { kind: "info"; game: string }
  | { kind: "price"; game: string }
  | { kind: "players"; game: string }
  | { kind: "speedrun"; game: string }
  | { kind: "f2p"; tag: string | null; label: string | null }
  | { kind: "compat"; game: string }
  | { kind: "gamepass"; game: string }
  | { kind: "xboxPrice"; game: string }
  | { kind: "twitch"; game: string }
  | { kind: "youtube"; query: string };

const clean = (g: string) => g.replace(/^(?:das spiel|dem spiel|das|dem|den|der|die)\s+/i, "").replace(/\s+(?:auf steam|bei steam|gerade|aktuell|momentan|eigentlich|so)$/i, "").replace(/[„“"]/g, "").trim();
const ok = (g: string) => g.length >= 2 && g.length <= 80 && !/^(es|das|ich|mein|meinem|du|ein|eine)$/i.test(g);
const pick = (re: RegExp, q: string) => { const m = re.exec(q); return m && ok(clean(m[1])) ? clean(m[1]) : null; };

const F2P_TAGS: [RegExp, string, string][] = [
  [/\bbattle ?royale\b/i, "battle-royale", "Battle Royale"], [/\bshooter|ego-?shooter|fps\b/i, "shooter", "Shooter"], [/\bmmorpg|mmo\b/i, "mmorpg", "MMORPG"],
  [/\bmoba\b/i, "moba", "MOBA"], [/\bstrategie|strategy\b/i, "strategy", "Strategie"], [/\brenn|racing\b/i, "racing", "Rennspiele"], [/\bsport/i, "sports", "Sport"],
  [/\bkarten|card\b/i, "card", "Kartenspiele"], [/\bkampfspiel|fighting|prügel/i, "fighting", "Kampfspiele"], [/\bhorror\b/i, "horror", "Horror"],
  [/\bsurvival|überleben/i, "survival", "Survival"], [/\bsandbox\b/i, "sandbox", "Sandbox"], [/\bfantasy\b/i, "fantasy", "Fantasy"], [/\bsci-?fi|science.?fiction\b/i, "sci-fi", "Sci-Fi"],
  [/\banime\b/i, "anime", "Anime"], [/\b(schwache[nrm]? (pcs?|laptops?|rechner)|low.?spec|alte[nrm]? (pcs?|laptops?))\b/i, "low-spec", "für schwache PCs"], [/\bopen.?world\b/i, "open-world", "Open World"],
];

export function researchIntent(text: string): ResearchIntent | null {
  const q = text.trim().replace(/^jarvis[,:]?\s*/i, "");
  if (/\b(free[- ]?to[- ]?play|f2p|dauerhaft kostenlos|für immer kostenlos)\b/i.test(q)) {
    const t = F2P_TAGS.find(([re]) => re.test(q));
    return { kind: "f2p", tag: t?.[1] ?? null, label: t?.[2] ?? null };
  }
  let g: string | null;
  if ((g = pick(/\b(?:ist|gibt es)\s+(.+?)\s+(?:im|in|bei)\s+(?:dem\s+)?(?:pc[- ]?|xbox[- ]?)?game ?pass(?: ultimate)?(?: drin| dabei)?[?!.]*$/i, q))) return { kind: "gamepass", game: g };
  if ((g = pick(/\b(?:was kostet|wie teuer ist|preis (?:von|für))\s+(.+?)\s+(?:auf|bei|im|in)\s+(?:der\s+|dem\s+)?(?:xbox|microsoft[- ]?store)(?:[- ]store)?[?!.]*$/i, q))) return { kind: "xboxPrice", game: g };
  if ((g = pick(/\bwer streamt\s+(?:gerade\s+|aktuell\s+|jetzt\s+|momentan\s+)?(.+?)[?!.]*$/i, q) ?? pick(/\b(?:twitch[- ]?streams?|streams?|livestreams?)\s+(?:zu|von|für|über)\s+(.+?)(?:\s+auf twitch)?[?!.]*$/i, q) ?? pick(/^(?:zeig mir\s+)?(.+?)\s+auf twitch[?!.]*$/i, q)))
    return { kind: "twitch", game: g };
  const yt = /\b(?:zeig|such|finde?|gib)(?:\s+mir)?\s+(?:ein(?:e|en)?\s+|ein paar\s+|den\s+|die\s+|das\s+)?(?:youtube[- ]?)?(?:videos?|guides?|tutorials?|anleitung(?:en)?|walkthroughs?|let'?s plays?|trailer)\s+(?:zu|für|über|von|zum|zur)\s+(.+?)(?:\s+auf youtube)?[?!.]*$/i.exec(q) ?? /\byoutube[- ]?(?:videos?|suche)?\s+(?:zu|für|über|von)\s+(.+?)[?!.]*$/i.exec(q) ?? /^(?:such\s+)?(.+?)\s+auf youtube[?!.]*$/i.exec(q);
  if (yt && ok(clean(yt[1]))) {
    const kind = /trailer/i.test(q) ? " Trailer" : /guide|tutorial|anleitung|walkthrough/i.test(q) ? " Guide" : "";
    return { kind: "youtube", query: clean(yt[1]) + (kind && !new RegExp(kind.trim(), "i").test(yt[1]) ? kind : "") };
  }
  if ((g = pick(/\b(?:weltrekord|world ?record|wr|speedrun(?:-?rekord)?|schnellste[rn]? speedrun|bestzeit)\s+(?:in|von|bei|für|im)\s+(.+?)[?!.]*$/i, q)))
    return { kind: "speedrun", game: g };
  if ((g = pick(/\bwie ?viele (?:leute|spieler|menschen|personen)?\s*(?:spielen|zocken)\s+(?:gerade|aktuell|momentan|jetzt|noch)?\s*(.+?)[?!.]*$/i, q) ?? pick(/\bspielerzahl(?:en)?\s+(?:von|bei|in|für)\s+(.+?)[?!.]*$/i, q)))
    return { kind: "players", game: g };
  if ((g = pick(/\b(?:was kostet|wie teuer ist|preis (?:von|für))\s+(.+?)[?!.]*$/i, q) ?? pick(/\bist\s+(.+?)\s+(?:gerade |im moment |aktuell )?(?:im angebot|reduziert|im sale)[?!.]*$/i, q)))
    return { kind: "price", game: g };
  if ((g = pick(/\b(?:läuft|laeuft)\s+(.+?)\s+(?:auf|bei) (?:meinem|dem|diesem) (?:pc|rechner|computer)[?!.]*$/i, q) ?? pick(/\bkann ich\s+(.+?)\s+(?:auf meinem (?:pc|rechner) )?(?:flüssig )?spielen[?!.]*$/i, q)
    ?? pick(/\b(?:systemanforderungen|mindestanforderungen|anforderungen)\s+(?:von|für|bei)\s+(.+?)[?!.]*$/i, q)))
    return { kind: "compat", game: g };
  if ((g = pick(/\bwas ist\s+(.+?)\s+für ein (?:spiel|game)[?!.]*$/i, q) ?? pick(/\b(?:erzähl|erzaehl) mir (?:was|etwas|mehr) (?:über|ueber|zu)\s+(.+?)[?!.]*$/i, q)
    ?? pick(/\b(?:infos?|informationen) (?:zu|über|ueber)\s+(.+?)[?!.]*$/i, q) ?? pick(/\bwas weißt du (?:über|ueber|zu)\s+(.+?)[?!.]*$/i, q)
    ?? pick(/\bwer hat\s+(.+?)\s+(?:entwickelt|gemacht|programmiert|herausgebracht)[?!.]*$/i, q) ?? pick(/\bwann (?:ist|kam|erschien|erscheint|kommt)\s+(.+?)(?:\s+(?:raus|heraus|erschienen|herausgekommen|rausgekommen))?[?!.]*$/i, q)
    ?? pick(/\blohnt sich\s+(.+?)(?:\s+noch)?[?!.]*$/i, q) ?? pick(/\bwie gut ist\s+(.+?)[?!.]*$/i, q)))
    return { kind: "info", game: g };
  return null;
}

export interface ResearchReply { text: string; sources: string[]; links: { label: string; url: string }[]; navigate?: { label: string; path: string }[]; ok: boolean | null }

type Facts = {
  appId: number; name: string; url: string; developers: string[]; publishers: string[]; release?: string | null; comingSoon: boolean; free: boolean;
  priceCents?: number | null; initialCents?: number | null; discount: number; currency?: string | null; metacritic?: number | null; metacriticUrl?: string | null;
  genres: string[]; description?: string | null; platforms: string[]; playersNow?: number | null; fetchedAt: string; source: string;
};
const money = (c: number, cur = "EUR") => (c / 100).toLocaleString("de-DE", { style: "currency", currency: cur });
const time = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const NEEDS_PC = (what: string) => `${what} hole ich bei Steam – das geht nur mit verbundenem PC (Steam erlaubt die Abfrage nicht direkt aus dem Browser).`;

export function fmtRun(sec: number): string {
  const whole = Math.floor(sec), ms = Math.round((sec - whole) * 1000);
  const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
  const tail = `${String(s).padStart(2, "0")}${ms ? "," + String(ms).padStart(3, "0") : ""}`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${tail}` : `${m}:${tail}`;
}

const twitchSearch = (g: string) => `https://www.twitch.tv/search?term=${encodeURIComponent(g)}`;
const ytSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export async function researchAnswer(i: ResearchIntent, online: boolean, fetcher: typeof fetch = fetch): Promise<ResearchReply> {
  switch (i.kind) {
    case "info": {
      if (online) {
        try {
          const f = await client.call<Facts>("games.facts", { name: i.game });
          const lines = [`JARVIS – ${f.name}`];
          if (f.description) lines.push(f.description);
          lines.push("");
          if (f.genres.length) lines.push(`• Genre: ${f.genres.join(", ")}`);
          if (f.developers.length) lines.push(`• Entwickler: ${f.developers.join(", ")}${f.publishers.length && f.publishers.join() !== f.developers.join() ? ` · Publisher: ${f.publishers.join(", ")}` : ""}`);
          if (f.release) lines.push(`• ${f.comingSoon ? "Erscheint" : "Erschienen"}: ${f.release}`);
          lines.push(`• Preis auf Steam: ${f.free ? "kostenlos" : f.priceCents != null ? money(f.priceCents, f.currency ?? "EUR") + (f.discount ? ` (−${f.discount} %, sonst ${money(f.initialCents ?? f.priceCents, f.currency ?? "EUR")})` : "") : "nicht angegeben"}`);
          lines.push(`• Metacritic: ${f.metacritic != null ? `${f.metacritic}/100` : "keine Wertung bei Steam angegeben"}`);
          if (f.platforms.length) lines.push(`• Läuft auf: ${f.platforms.join(", ")}`);
          if (f.playersNow != null) lines.push(`• Gerade spielen auf Steam: ${f.playersNow.toLocaleString("de-DE")} (Stand ${time()})`);
          lines.push("", `ℹ Frag „Läuft ${f.name} auf meinem PC?“, dann vergleiche ich die Anforderungen mit deinem PC.`, "Quelle: Steam-Shop (Angaben des Entwicklers bzw. von Steam)");
          return { text: lines.join("\n"), sources: ["Steam-Shop"], links: [{ label: "Steam-Seite", url: f.url }, ...(f.metacriticUrl ? [{ label: "Metacritic", url: f.metacriticUrl }] : [])], ok: true };
        } catch (e) {
          if ((e as { code?: string }).code !== "not-found") return { text: `Zu „${i.game}“ konnte ich bei Steam nichts abrufen: ${(e as Error).message}`, sources: ["Steam"], links: [], ok: false };
          // Not on Steam → Microsoft Store / Wikipedia below.
        }
      }
      try {
        const g = await lookupGame(i.game);
        const lines = [`JARVIS – ${g.name}`, g.description ?? "", "", g.genres.length ? `• Kategorie: ${g.genres.join(", ")}` : "", `\nQuelle: ${g.source}`].filter((x) => x !== "");
        if (!online) lines.splice(1, 0, "ℹ Ohne PC – deshalb aus dem Microsoft Store bzw. Wikipedia statt Steam (Preis und Spielerzahl gibt es nur über den PC).");
        return { text: lines.join("\n"), sources: [g.source], links: [{ label: g.source.split(" ")[0], url: g.url }], ok: true };
      } catch (e) {
        return { text: `Zu „${i.game}“ habe ich nichts Verlässliches gefunden (${(e as Error).message}).`, sources: ["JARVIS"], links: [], ok: null };
      }
    }
    case "price":
    case "players": {
      if (!online) return { text: NEEDS_PC(i.kind === "price" ? "Den Steam-Preis" : "Die aktuelle Spielerzahl") + (i.kind === "price" ? " Ohne PC: Deal Radar zeigt deine gemerkten Preise." : ""), sources: ["JARVIS"], links: [], navigate: i.kind === "price" ? [{ label: "Deal Radar öffnen", path: "/deals" }] : [], ok: null };
      try {
        const f = await client.call<Facts>("games.facts", { name: i.game });
        if (i.kind === "players") {
          if (f.playersNow == null) return { text: `${f.name}: Steam nennt gerade keine Spielerzahl.`, sources: ["Steam"], links: [{ label: "Steam-Seite", url: f.url }], ok: null };
          return { text: `JARVIS – ${f.name}: gerade ${f.playersNow.toLocaleString("de-DE")} Spieler auf Steam (Stand ${time()}).\n\nℹ Nur Steam – Spieler auf Konsole, Epic, Xbox-App usw. sind nicht mitgezählt.\nQuelle: Steam (ISteamUserStats)`, sources: ["Steam"], links: [{ label: "Steam-Seite", url: f.url }], ok: true };
        }
        const price = f.free ? "kostenlos" : f.priceCents != null ? money(f.priceCents, f.currency ?? "EUR") : null;
        if (!price) return { text: `${f.name}: Steam nennt keinen Preis (${f.comingSoon ? "noch nicht erschienen" : "evtl. nicht einzeln kaufbar"}).`, sources: ["Steam"], links: [{ label: "Steam-Seite", url: f.url }], ok: null };
        return {
          text: `JARVIS – ${f.name} auf Steam: ${price}${f.discount ? ` – gerade −${f.discount} % (sonst ${money(f.initialCents ?? 0, f.currency ?? "EUR")})` : ""} (Stand ${time()}, Steam-Shop Deutschland).\n\nℹ Andere Shops vergleicht Deal Radar; dort kannst du einen Wunschpreis setzen – ein Preisalarm gibt es nur, wenn du ihn einrichtest.\nQuelle: Steam-Shop`,
          sources: ["Steam-Shop"], links: [{ label: "Steam-Seite", url: f.url }], navigate: [{ label: "Deal Radar öffnen", path: "/deals" }], ok: true,
        };
      } catch (e) { return { text: `${i.game}: ${(e as Error).message}`, sources: ["Steam"], links: [], ok: false }; }
    }
    case "compat": {
      if (!online) return { text: "Ob ein Spiel auf deinem PC läuft, prüfe ich mit den echten Werten deines PCs – dafür muss der PC verbunden sein.", sources: ["JARVIS"], links: [], ok: null };
      try {
        const f = await client.call<Facts>("games.facts", { name: i.game });
        type Side = { lines: { label: string; text: string }[]; checks: { what: string; needGb?: number | null; verdict: string; detail: string }[] };
        const r = await client.call<{ verdict: string; minimum: Side; recommended: Side; note: string }>("compat.check", { appId: String(f.appId) });
        const V: Record<string, string> = { recommended: "✓ Erfüllt die empfohlenen Anforderungen (soweit prüfbar).", minimum: "Erfüllt die Mindestanforderungen, aber nicht alle empfohlenen (soweit prüfbar).", "below-minimum": "✗ Unter den Mindestanforderungen.", unknown: "Nicht automatisch prüfbar – bitte die Angaben vergleichen." };
        const side = r.recommended.checks.length ? r.recommended : r.minimum;
        const mark = (v: string) => (v === "ok" ? "✓" : v === "low" ? "✗" : "?");
        const checks = side.checks.slice(0, 6).map((c) => `• ${mark(c.verdict)} ${c.what}: ${c.needGb ? `verlangt ${c.needGb.toLocaleString("de-DE")} GB · ` : ""}${c.detail}`);
        const req = [...r.minimum.lines.filter((l) => /prozessor|cpu|grafik|gpu/i.test(l.label)).slice(0, 2).map((l) => `• Mindestens ${l.label}: ${l.text.slice(0, 120)}`),
          ...r.recommended.lines.filter((l) => /prozessor|cpu|grafik|gpu/i.test(l.label)).slice(0, 2).map((l) => `• Empfohlen ${l.label}: ${l.text.slice(0, 120)}`)];
        checks.push(...req);
        return { text: `JARVIS – Läuft ${f.name} auf deinem PC?\n${V[r.verdict] ?? r.verdict}\n${checks.join("\n")}${r.note ? `\n\nℹ ${r.note}` : ""}\nQuelle: Systemanforderungen im Steam-Shop + Werte deines PCs`, sources: ["Steam-Shop", "dein PC"], links: [{ label: "Steam-Seite", url: f.url }], ok: true };
      } catch (e) { return { text: `Prüfung für „${i.game}“ nicht möglich: ${(e as Error).message}`, sources: ["Steam"], links: [], ok: false }; }
    }
    case "gamepass": {
      if (!online) return { text: "Den PC-Game-Pass-Katalog lädt der PC – ohne Verbindung kann ich das nicht nachsehen.", sources: ["JARVIS"], links: [], ok: null };
      try {
        const gp = await client.call<{ enabled: boolean; lastSync?: string | null; games: { title: string; installed: boolean; isNew: boolean }[] }>("gamepass.list");
        if (!gp.enabled || !gp.lastSync) return { text: "Der Game-Pass-Katalog ist am PC noch nicht eingeschaltet bzw. geladen (Einstellungen → Game Pass). Danach kann ich nachsehen.", sources: ["JARVIS"], links: [], navigate: [{ label: "Einstellungen öffnen", path: "/settings" }], ok: null };
        const hit = gp.games.find((x) => x.title.toLowerCase() === i.game.toLowerCase()) ?? gp.games.find((x) => sameGame(x.title, i.game));
        const when = new Date(gp.lastSync).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
        return hit
          ? { text: `✓ Ja – ${hit.title} ist im PC Game Pass${hit.isNew ? " (neu dazugekommen)" : ""}${hit.installed ? ", und es ist auf deinem PC installiert" : ""}.\n\nℹ Stand des Katalogs: ${when}. Geprüft ist PC Game Pass; Spiele können den Pass wieder verlassen.\nQuelle: Microsofts PC-Game-Pass-Katalog`, sources: ["Microsoft PC Game Pass"], links: [], ok: true }
          : { text: `${i.game} ist laut PC-Game-Pass-Katalog (Stand ${when}) gerade nicht dabei.\n\nℹ Geprüft ist nur PC Game Pass – nicht die Konsolen- oder Cloud-Liste.\nQuelle: Microsofts PC-Game-Pass-Katalog`, sources: ["Microsoft PC Game Pass"], links: [], ok: null };
      } catch (e) { return { text: `Game Pass: ${(e as Error).message}`, sources: ["Microsoft"], links: [], ok: false }; }
    }
    case "xboxPrice": {
      const r = await fetchMsPrice(i.game, "DE", fetcher);
      if ("error" in r) return { text: `Im Microsoft Store (Xbox) finde ich keinen Preis für „${i.game}“: ${r.error}`, sources: ["Microsoft Store"], links: [], ok: null };
      const m = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: r.currency || "EUR" });
      return { text: `JARVIS – ${r.title} im Microsoft Store (Xbox/PC): ${r.finalCents === 0 ? "kostenlos" : m(r.finalCents)}${r.initialCents > r.finalCents ? ` – reduziert (sonst ${m(r.initialCents)})` : ""} (Stand ${time()}, Deutschland).\n\nℹ Günstigste kaufbare Edition mit passendem Namen; mit Game Pass evtl. enthalten.\nQuelle: Microsoft Store (displaycatalog.mp.microsoft.com)`, sources: ["Microsoft Store"], links: [{ label: "Im Microsoft Store", url: `https://www.xbox.com/de-DE/games/store/x/${r.productId}` }], ok: true };
    }
    case "twitch": {
      if (!online) return { text: `Live-Streams frage ich über deine Twitch-Anwendung am PC ab – ohne PC öffne ich dir die Twitch-Suche.`, sources: ["Twitch"], links: [{ label: `„${i.game}“ auf Twitch`, url: twitchSearch(i.game) }], ok: null };
      try {
        const r = await client.call<{ game: string; url: string; streams: { user: string; title: string; viewers: number; language: string; url: string }[] }>("media.twitch", { game: i.game });
        if (!r.streams.length) return { text: `${r.game}: gerade streamt niemand auf Twitch.`, sources: ["Twitch"], links: [{ label: "Kategorie auf Twitch", url: r.url }], ok: null };
        const lines = r.streams.map((x) => `• ${x.user} – ${x.viewers.toLocaleString("de-DE")} Zuschauer${x.language ? ` · ${x.language.toUpperCase()}` : ""} · „${x.title}“`);
        return { text: `JARVIS – gerade live auf Twitch: ${r.game} (Stand ${time()})\n${lines.join("\n")}\n\nQuelle: Twitch`, sources: ["Twitch"], links: [...r.streams.slice(0, 3).map((x) => ({ label: x.user, url: x.url })), { label: "Alle Streams", url: r.url }], ok: true };
      } catch (e) {
        const code = (e as { code?: string }).code;
        return { text: code === "not-configured" ? `${(e as Error).message}\nBis dahin öffne ich dir die Twitch-Suche.` : `Twitch: ${(e as Error).message}`, sources: ["Twitch"], links: [{ label: `„${i.game}“ auf Twitch`, url: twitchSearch(i.game) }], ok: code === "not-configured" ? null : false };
      }
    }
    case "youtube": {
      const link = { label: `YouTube: „${i.query}“`, url: ytSearch(i.query) };
      if (!online) return { text: `Hier ist die YouTube-Suche zu „${i.query}“. Eine Liste mit Videos kann ich nur über den PC mit eigenem YouTube-Schlüssel holen.`, sources: ["YouTube"], links: [link], ok: null };
      try {
        const r = await client.call<{ configured: boolean; searchUrl: string; videos: { title: string; channel: string; published: string; url: string }[] }>("media.youtube", { query: i.query });
        if (!r.configured) return { text: `Hier ist die YouTube-Suche zu „${i.query}“.\n\nℹ Für eine Liste der passenden Videos direkt hier: am PC unter Spiele-Journal → Spielzeit einen kostenlosen YouTube-API-Schlüssel eintragen (optional). Ich lese YouTube sonst nicht aus.`, sources: ["YouTube"], links: [link], ok: null };
        if (!r.videos.length) return { text: `Zu „${i.query}“ finde ich auf YouTube keine Videos.`, sources: ["YouTube"], links: [link], ok: null };
        const lines = r.videos.map((v) => `• ${v.title} – ${v.channel}${v.published ? ` (${new Date(v.published).toLocaleDateString("de-DE")})` : ""}`);
        return { text: `JARVIS – Videos zu „${i.query}“:\n${lines.join("\n")}\n\nQuelle: YouTube`, sources: ["YouTube"], links: [...r.videos.slice(0, 3).map((v) => ({ label: v.title.slice(0, 40), url: v.url })), link], ok: true };
      } catch (e) { return { text: `YouTube: ${(e as Error).message}`, sources: ["YouTube"], links: [link], ok: false }; }
    }
    case "speedrun": {
      try {
        const s = await fetcher(`https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(i.game)}&max=10`);
        if (!s.ok) throw new Error(`speedrun.com antwortet mit ${s.status}`);
        const games = ((await s.json()) as { data: { id: string; names: { international: string }; weblink: string }[] }).data ?? [];
        const game = games.find((x) => x.names.international.toLowerCase() === i.game.toLowerCase()) ?? games.find((x) => sameGame(x.names.international, i.game));
        if (!game) return { text: `Bei speedrun.com finde ich „${i.game}“ nicht eindeutig.`, sources: ["speedrun.com"], links: [{ label: "speedrun.com", url: "https://www.speedrun.com" }], ok: null };
        const r = await fetcher(`https://www.speedrun.com/api/v1/games/${game.id}/records?top=1&scope=full-game&miscellaneous=no&embed=category,players`);
        if (!r.ok) throw new Error(`speedrun.com antwortet mit ${r.status}`);
        type Rec = { category: { data: { name: string } }; players: { data: { rel: string; name?: string; names?: { international: string } }[] }; runs: { run: { weblink: string; times: { primary_t: number }; date?: string | null } }[] };
        const recs = ((await r.json()) as { data: Rec[] }).data.filter((x) => x.runs.length).slice(0, 4);
        if (!recs.length) return { text: `${game.names.international}: bei speedrun.com noch keine bestätigten Rekorde.`, sources: ["speedrun.com"], links: [{ label: "speedrun.com", url: game.weblink }], ok: null };
        const lines = recs.map((x) => `• ${x.category.data.name}: ${fmtRun(x.runs[0].run.times.primary_t)} – ${x.players.data.map((p) => p.names?.international ?? p.name ?? "?").join(", ")}${x.runs[0].run.date ? ` (${new Date(x.runs[0].run.date).toLocaleDateString("de-DE")})` : ""}`);
        return { text: `JARVIS – Speedrun-Weltrekorde in ${game.names.international} (bestätigt):\n${lines.join("\n")}\n\nQuelle: speedrun.com`, sources: ["speedrun.com"], links: [{ label: "Bestenliste", url: game.weblink }, { label: "Rekord-Video/Lauf", url: recs[0].runs[0].run.weblink }], ok: true };
      } catch (e) { return { text: `Die Speedrun-Rekorde konnte ich nicht abrufen (${(e as Error).message}).`, sources: ["speedrun.com"], links: [], ok: false }; }
    }
    case "f2p": {
      try {
        const r = await fetcher(i.tag ? `https://www.freetogame.com/api/games?platform=pc&category=${i.tag}&sort-by=popularity` : "https://www.freetogame.com/api/games?platform=pc&sort-by=popularity");
        if (!r.ok) throw new Error(`FreeToGame antwortet mit ${r.status}`);
        const list = ((await r.json()) as { title: string; short_description: string; genre: string; game_url: string; publisher: string; release_date: string }[]).slice(0, 7);
        if (!list.length) return { text: "Dazu finde ich bei FreeToGame keine Spiele.", sources: ["FreeToGame.com"], links: [{ label: "FreeToGame.com", url: "https://www.freetogame.com" }], ok: null };
        const lines = list.map((g) => `• ${g.title} (${g.genre}, ${g.publisher}) – ${g.short_description.slice(0, 110)}${g.short_description.length > 110 ? " …" : ""}`);
        return { text: `JARVIS – beliebte Free-to-Play-Spiele für PC${i.label ? ` (${i.label})` : ""}:\n${lines.join("\n")}\n\nℹ Kostenlos spielbar, oft mit Käufen im Spiel. Reihenfolge: Beliebtheit laut FreeToGame.\nQuelle: FreeToGame.com`, sources: ["FreeToGame.com"], links: [...list.slice(0, 3).map((g) => ({ label: g.title, url: g.game_url })), { label: "Daten: FreeToGame.com", url: "https://www.freetogame.com" }], ok: true };
      } catch (e) { return { text: `Die Free-to-Play-Liste konnte ich nicht abrufen (${(e as Error).message}).`, sources: ["FreeToGame.com"], links: [], ok: false }; }
    }
  }
}
