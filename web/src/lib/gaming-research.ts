// JARVIS recherchiert: was ein Spiel ist, was es kostet, wie viele es gerade spielen, Speedrun-Weltrekorde,
// Free-to-Play-Tipps und „Läuft das auf meinem PC?“. Nur auf deine Frage und nur über erlaubte, offene Schnittstellen
// (Steam über den PC, speedrun.com, FreeToGame, Microsoft Store/Wikipedia) – nie Google-Scraping, nichts erfunden.

import { client } from "./rpc";
import { lookupGame, sameGame } from "./game-lookup";

export type ResearchIntent =
  | { kind: "info"; game: string }
  | { kind: "price"; game: string }
  | { kind: "players"; game: string }
  | { kind: "speedrun"; game: string }
  | { kind: "f2p"; tag: string | null; label: string | null }
  | { kind: "compat"; game: string };

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
