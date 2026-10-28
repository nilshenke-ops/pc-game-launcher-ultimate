// JARVIS – Gaming-Wissen über die Software hinaus: Gratis-Spiele, Neuigkeiten/Patches, Sensitivität umrechnen,
// Gesundheit beim Zocken, Bildschirm & FPS, Lag, Controller, Ausgaben. Nur auf Frage; Zahlen kommen aus einer
// genannten Quelle oder aus einer nachvollziehbaren Rechnung – nichts wird erfunden.

import { client } from "./rpc";
import { listKind, newId, removeEntry, saveEntry } from "./journal";

export type GamingIntent =
  | { kind: "free"; platform: string | null; loot: boolean }
  | { kind: "news"; game: string }
  | { kind: "sens"; from: string; to: string; sens: number; dpi: number | null }
  | { kind: "cm360"; game: string; sens: number; dpi: number }
  | { kind: "advice"; topic: AdviceTopic }
  | { kind: "spend"; amount: number; game: string | null }
  | { kind: "spendSum"; month: number | null; year: number | null };

export type AdviceTopic = "health" | "eyes" | "posture" | "display" | "lag" | "controller" | "headset";

// ------------------------------------------------------------------------------------------------ sensitivity
/** Degrees turned per mouse count at sensitivity 1 – the engines' fixed values (as used by mouse-sensitivity.com). */
export const YAW: Record<string, { name: string; yaw: number }> = {
  cs2: { name: "Counter-Strike 2", yaw: 0.022 },
  apex: { name: "Apex Legends", yaw: 0.022 },
  valorant: { name: "Valorant", yaw: 0.07 },
  overwatch: { name: "Overwatch 2", yaw: 0.0066 },
};
const GAME_ALIASES: [RegExp, keyof typeof YAW][] = [
  [/\b(cs ?2|cs ?go|counter[- ]?strike)\b/i, "cs2"],
  [/\bapex( legends)?\b/i, "apex"],
  [/\bvalo(rant)?\b/i, "valorant"],
  [/\b(overwatch( 2)?|ow ?2?)\b/i, "overwatch"],
];
export function sensGame(text: string): keyof typeof YAW | null {
  for (const [re, k] of GAME_ALIASES) if (re.test(text)) return k;
  return null;
}
/** Same turn per mouse movement in another game: sens × yawFrom ÷ yawTo (DPI unchanged). */
export function convertSens(sens: number, from: keyof typeof YAW, to: keyof typeof YAW) {
  return (sens * YAW[from].yaw) / YAW[to].yaw;
}
/** Centimetres of mouse movement for one full turn. */
export function cm360(sens: number, dpi: number, game: keyof typeof YAW) {
  return (360 / (YAW[game].yaw * sens * dpi)) * 2.54;
}

const num = (s: string) => Number(s.replace(",", "."));

// ------------------------------------------------------------------------------------------------ what was asked
export function gamingIntent(text: string): GamingIntent | null {
  const q = text.trim();
  const l = q.toLowerCase();
  // Free games right now ("Welche Spiele gibt es gerade gratis auf Epic?").
  if (/\b(gratis|kostenlos\w*|umsonst|free|geschenkt|verschenkt\w*)\b/.test(l) && /\b(spiele?|games?|items?|loot|dlcs?|skins?|giveaways?)\b/.test(l) && !/\bbingo\b/.test(l) && !/free[- ]?to[- ]?play|\bf2p\b/.test(l)) {
    const platform = /\bsteam\b/.test(l) ? "steam" : /\bepic\b/.test(l) ? "epic-games-store" : /\bgog\b/.test(l) ? "gog" : /\bxbox\b/.test(l) ? "xbox-series-xs.xbox-one" : /\b(ps5|ps4|playstation)\b/.test(l) ? "ps5.ps4" : /\bswitch\b/.test(l) ? "switch" : /\b(handy|android)\b/.test(l) ? "android" : /\b(iphone|ios)\b/.test(l) ? "ios" : /\bpc\b/.test(l) ? "pc" : null;
    return { kind: "free", platform, loot: /\b(items?|loot|dlcs?|skins?|ingame|in-game)\b/.test(l) };
  }
  // News / patch notes ("Was ist neu in Hades?", "Gibt es ein Update für Hades?", "Patchnotes von CS2").
  const news = /\b(?:was ist neu (?:in|bei)|neuigkeiten (?:zu|von|aus|über|bei)|news (?:zu|von|über)|patch ?notes? (?:zu|von|für|bei)|patchnotes (?:zu|von|für|bei)|gibt es (?:ein |neue )?(?:update|updates|patch|patches) (?:für|von|bei|zu)|letzte[sn]? (?:update|patch) (?:von|für|bei))\s+(.+?)[?!.]*$/i.exec(q);
  if (news) return { kind: "news", game: news[1].replace(/^(dem|der|das|den)\s+/i, "").trim() };
  // Sensitivity ("Rechne meine CS2-Sensitivität 1,2 in Valorant um", "Sens 2 von Apex nach Overwatch bei 800 DPI").
  if (/\b(sens|sensitivität|sensitivity|empfindlichkeit|mausempfindlichkeit)\b/.test(l) || /cm\s*\/\s*360|cm pro 360/.test(l)) {
    const dpi = /(\d{3,5})\s*dpi\b/i.exec(q);
    const sensM = /(?:sens(?:itivität|itivity)?|empfindlichkeit)\D{0,12}?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:sens\b|in\s)/i.exec(q.replace(/(\d{3,5})\s*dpi/i, ""));
    const sens = sensM ? num(sensM[1] ?? sensM[2]) : NaN;
    const games: (keyof typeof YAW)[] = [];
    for (const m of q.matchAll(/\b(cs ?2|cs ?go|counter[- ]?strike|apex(?: legends)?|valo(?:rant)?|overwatch(?: 2)?|ow ?2?)\b/gi)) { const g = sensGame(m[1]); if (g && !games.includes(g)) games.push(g); }
    if (isFinite(sens) && sens > 0 && sens < 1000) {
      if (games.length >= 2) return { kind: "sens", from: games[0], to: games[1], sens, dpi: dpi ? Number(dpi[1]) : null };
      if (games.length === 1 && dpi) return { kind: "cm360", game: games[0], sens, dpi: Number(dpi[1]) };
    }
  }
  // Spending ("Ich habe 19,99 € für Hades ausgegeben", "Wie viel habe ich diesen Monat für Spiele ausgegeben?").
  const spent = /\bich habe?\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)\s+(?:für|in)\s+(.+?)\s+ausgegeben\b/i.exec(q) ?? /\b(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)\s+(?:für|in)\s+(.+?)\s+ausgegeben\b/i.exec(q);
  if (spent) return { kind: "spend", amount: Math.round(num(spent[1]) * 100) / 100, game: spent[2].replace(/^(das spiel|ein spiel|spiele?)\s*/i, "").trim() || null };
  if (/\bwie ?viel\b.*\bausgegeben\b/i.test(q) && /\b(spiele?n?|games?|gaming|zocken)\b/i.test(q)) {
    const MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
    const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`, "i").test(q));
    const y = /\b(20\d\d)\b/.exec(q);
    const now = new Date();
    if (/\b(dieses jahr|in diesem jahr)\b/i.test(q)) return { kind: "spendSum", month: null, year: now.getFullYear() };
    if (/\b(insgesamt|überhaupt|bisher)\b/i.test(q) && mi < 0) return { kind: "spendSum", month: null, year: null };
    if (/\b(letzten|vorigen|vergangenen) monat\b/i.test(q)) { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { kind: "spendSum", month: d.getMonth(), year: d.getFullYear() }; }
    return { kind: "spendSum", month: mi >= 0 ? mi : now.getMonth(), year: y ? Number(y[1]) : now.getFullYear() };
  }
  // Advice – only when it is clearly about gaming / the setup.
  if (/\b(augen|auge)\b.*\b(brennen|tränen|müde|weh|trocken|schmerz)|\b(augenschmerzen|trockene augen|augen schonen|20-20-20)\b/i.test(q)) return { kind: "advice", topic: "eyes" };
  if (/\b(rücken|nacken|handgelenk|sehnenscheide|haltung|sitzhaltung|schulter)\b/i.test(q) && /\b(zock|spiel|gaming|pc|maus|sitz|weh|schmerz|tut)\w*/i.test(q)) return { kind: "advice", topic: "posture" };
  if (/\b(pausen?|zu lange gezockt|zu viel gezockt|kopfschmerzen|gesund(heit)?)\b/i.test(q) && /\b(zock|spiel|gaming|gamen)\w*/i.test(q)) return { kind: "advice", topic: "health" };
  if (/\b(\d{2,3}\s*hz|hertz|bildwiederholrate|fps[- ]?(limit|cap|begrenz)|v-?sync|g-?sync|freesync|tearing|bildschirmreißen)\b/i.test(q)) return { kind: "advice", topic: "display" };
  if (/\b(lag|lagt|laggt|laggy|ping|packet ?loss|paketverlust|verbindung ruckelt|hohe latenz|rubberbanding)\b/i.test(q) && !/\bping doctor\b/i.test(q)) return { kind: "advice", topic: "lag" };
  if (/\b(drift|stick ?drift|controller (bewegt|zieht|reagiert|spinnt|verbindet|wird nicht erkannt)|controller.*(kaputt|geht nicht))\b/i.test(q)) return { kind: "advice", topic: "controller" };
  if (/\b(headset|mikro(fon)?|mic)\b.*\b(rauscht|geht nicht|hört|leise|knackt|echo|erkannt)\b/i.test(q)) return { kind: "advice", topic: "headset" };
  return null;
}

// ------------------------------------------------------------------------------------------------ answers
export interface GamingReply { text: string; sources: string[]; links: { label: string; url: string }[]; navigate?: { label: string; path: string }[]; ok: boolean | null }

const de = (n: number, d = 2) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE");

export const SPEND_KIND = "spend";
export interface Spend { amount: number; game: string | null; at: string }

type Giveaway = { id: number; title: string; worth: string; open_giveaway_url: string; gamerpower_url?: string; end_date: string; platforms: string; type: string };

export async function gamingAnswer(i: GamingIntent, online: boolean, fetcher: typeof fetch = fetch): Promise<GamingReply> {
  switch (i.kind) {
    case "free": {
      const type = i.loot ? "loot" : "game";
      const url = i.platform ? `https://www.gamerpower.com/api/filter?platform=${i.platform}&type=${type}` : `https://www.gamerpower.com/api/giveaways?type=${type}&sort-by=popularity`;
      try {
        const r = await fetcher(url);
        if (r.status === 201 || r.status === 404) return { text: `Gerade finde ich bei GamerPower keine Gratis-${i.loot ? "Items" : "Spiele"}${i.platform ? " für diese Plattform" : ""}.`, sources: ["GamerPower.com"], links: [{ label: "GamerPower.com", url: "https://www.gamerpower.com" }], ok: null };
        if (!r.ok) throw new Error(`GamerPower antwortet mit ${r.status}`);
        const now = Date.now();
        // Expired offers are left out (GamerPower sometimes still lists them for a day).
        const list = ((await r.json()) as Giveaway[]).filter((g) => g && typeof g.title === "string" && /^https:\/\//.test(g.open_giveaway_url ?? "")
          && !(g.end_date && g.end_date !== "N/A" && new Date(g.end_date.replace(" ", "T")).getTime() < now)).slice(0, 8);
        if (!list.length) return { text: "Gerade finde ich keine passenden Gratis-Angebote.", sources: ["GamerPower.com"], links: [{ label: "GamerPower.com", url: "https://www.gamerpower.com" }], ok: null };
        const name = (g: Giveaway) => g.title.replace(/\s*\([^)]{1,30}\)\s*Giveaway$/i, "").replace(/\s+Giveaway$/i, "");
        const lines = list.map((g) => `• ${name(g)} – ${g.platforms}${g.worth && g.worth !== "N/A" ? ` · sonst ${g.worth}` : ""}${g.end_date && g.end_date !== "N/A" ? ` · bis ${day(g.end_date.replace(" ", "T"))}` : ""}`);
        return {
          text: `JARVIS – gerade gratis${i.loot ? " (Items/DLCs)" : ""}:\n${lines.join("\n")}\n\nℹ Stand jetzt laut GamerPower.com – prüf vor dem Einlösen im jeweiligen Shop, ob es noch gilt. Ich löse nichts für dich ein und melde mich nirgends an.\nQuelle: GamerPower.com`,
          sources: ["GamerPower.com"], links: [...list.slice(0, 4).map((g) => ({ label: name(g).slice(0, 40), url: g.open_giveaway_url })), { label: "Daten: GamerPower.com", url: "https://www.gamerpower.com" }], ok: true,
        };
      } catch (e) {
        return { text: `Die Gratis-Angebote konnte ich nicht abrufen (${(e as Error).message}). Ohne Internet geht das nicht.`, sources: ["GamerPower.com"], links: [], ok: false };
      }
    }
    case "news": {
      if (!online) return { text: `Neuigkeiten zu „${i.game}“ hole ich bei Steam – das geht nur über den PC (Steam erlaubt die Abfrage nicht direkt aus dem Browser). Ohne PC kannst du Patchnotes unter Spiele-Infos → Patchnotes einfügen.`, sources: ["JARVIS"], links: [], navigate: [{ label: "Patchnotes öffnen", path: "/infos?tab=patches" }], ok: null };
      try {
        const r = await client.call<{ app: { id: number; name: string; url: string }; news: { items: { title: string; url: string; date: string; patchNotes: boolean }[] } }>("news.steam", { name: i.game, count: 6 });
        const items = r.news.items.slice(0, 5);
        if (!items.length) return { text: `${r.app.name}: Steam hat keine offiziellen Ankündigungen.`, sources: ["Steam-Ankündigungen"], links: [{ label: "Steam-Seite", url: r.app.url }], ok: null };
        const lines = items.map((n) => `• ${day(n.date)} – ${n.title}${n.patchNotes ? " [Patchnotes]" : ""}`);
        return {
          text: `JARVIS – Neuigkeiten zu ${r.app.name} (offizielle Steam-Ankündigungen):\n${lines.join("\n")}\n\nQuelle: Steam-Ankündigungen des Entwicklers`,
          sources: ["Steam-Ankündigungen (api.steampowered.com)"], links: items.slice(0, 3).map((n) => ({ label: n.title.slice(0, 40), url: n.url })), navigate: [{ label: "Patch-Erklärer öffnen", path: "/infos?tab=patches" }], ok: true,
        };
      } catch (e) {
        return { text: `Neuigkeiten zu „${i.game}“: ${(e as Error).message}`, sources: ["Steam"], links: [], ok: false };
      }
    }
    case "sens": {
      const from = i.from as keyof typeof YAW, to = i.to as keyof typeof YAW;
      const out = convertSens(i.sens, from, to);
      const lines = [`JARVIS – Sensitivität umrechnen: ${YAW[from].name} ${de(i.sens, 3)} → ${YAW[to].name} ${de(out, 3)}`, "• Gleiche Drehung pro Mausweg, bei gleicher DPI [berechnet]."];
      if (i.dpi) lines.push(`• Bei ${i.dpi} DPI: ${de(cm360(i.sens, i.dpi, from), 1)} cm für eine volle Drehung (360°) – in beiden Spielen [berechnet].`);
      lines.push("", `ℹ Gerechnet mit den festen Engine-Werten (${YAW[from].name} ${YAW[from].yaw}, ${YAW[to].name} ${YAW[to].yaw} Grad pro Mauszählschritt). Zoom/Zielfernrohr, Sichtfeld und Maus-Beschleunigung (in Windows ausschalten) sind nicht berücksichtigt.`);
      return { text: lines.join("\n"), sources: ["Berechnung (Engine-Werte)"], links: [], ok: true };
    }
    case "cm360": {
      const g = i.game as keyof typeof YAW;
      const cm = cm360(i.sens, i.dpi, g);
      return { text: `JARVIS – ${YAW[g].name}: Sensitivität ${de(i.sens, 3)} bei ${i.dpi} DPI = ${de(cm, 1)} cm für eine volle Drehung (eDPI ${de(i.sens * i.dpi, 1)}) [berechnet].\n\nℹ Mit dem festen Engine-Wert ${YAW[g].yaw}; Zoom, Sichtfeld und Maus-Beschleunigung nicht berücksichtigt.`, sources: ["Berechnung (Engine-Werte)"], links: [], ok: true };
    }
    case "spend": {
      const e = saveEntry<Spend>(SPEND_KIND, newId(), { amount: i.amount, game: i.game, at: new Date().toISOString() });
      const sum = spendSum(new Date().getMonth(), new Date().getFullYear());
      return { text: `✓ Notiert: ${euro(i.amount)}${i.game ? ` für ${i.game}` : ""} (heute). Diesen Monat bisher: ${euro(sum.total)} in ${sum.count} ${sum.count === 1 ? "Eintrag" : "Einträgen"} [deine Angaben].`, sources: ["deine Angaben"], links: [], navigate: [{ label: "Ausgaben ansehen", path: `/journal?tab=spend&id=${e.id}` }], ok: true };
    }
    case "spendSum": {
      const s = spendSum(i.month, i.year);
      const label = i.month != null ? new Date(i.year ?? new Date().getFullYear(), i.month, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : i.year ? String(i.year) : "insgesamt";
      if (!s.count) return { text: `Für ${label} hast du mir keine Ausgaben genannt. Sag z. B. „Ich habe 19,99 € für Hades ausgegeben“ – ich rechne nur mit dem, was du einträgst (Shop-Konten lese ich nicht aus).`, sources: ["deine Angaben"], links: [], navigate: [{ label: "Ausgaben ansehen", path: "/journal?tab=spend" }], ok: null };
      const top = [...s.byGame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, v]) => `• ${g}: ${euro(v)}`);
      return { text: `JARVIS – Ausgaben ${label}: ${euro(s.total)} in ${s.count} ${s.count === 1 ? "Eintrag" : "Einträgen"} [deine Angaben]\n${top.join("\n")}\n\nℹ Nur was du eingetragen hast – Käufe in Shops sehe ich nicht.`, sources: ["deine Angaben"], links: [], navigate: [{ label: "Ausgaben ansehen", path: "/journal?tab=spend" }], ok: true };
    }
    case "advice":
      return ADVICE[i.topic]();
  }
}

export function spendSum(month: number | null, year: number | null) {
  let total = 0, count = 0;
  const byGame = new Map<string, number>();
  for (const e of listKind<Spend>(SPEND_KIND)) {
    const d = new Date(e.data.at);
    if (year != null && d.getFullYear() !== year) continue;
    if (month != null && d.getMonth() !== month) continue;
    total += e.data.amount; count++;
    const g = e.data.game || "ohne Spiel";
    byGame.set(g, (byGame.get(g) ?? 0) + e.data.amount);
  }
  return { total: Math.round(total * 100) / 100, count, byGame };
}
export const removeSpend = (id: string) => removeEntry(id);

const ADVICE: Record<AdviceTopic, () => GamingReply> = {
  eyes: () => ({
    text: "JARVIS – Augen beim Zocken:\n• 20-20-20: alle 20 Minuten 20 Sekunden auf etwas etwa 6 m Entferntes schauen.\n• Bewusst blinken – beim Spielen blinkt man seltener, die Augen trocknen aus.\n• Bildschirm etwa eine Armlänge entfernt, Helligkeit an den Raum anpassen, nicht im Dunkeln vor einem hellen Bild.\n• Bleiben Beschwerden (Schmerzen, verschwommen sehen, Kopfweh), lass die Augen prüfen – das hier ersetzt keinen Arzt.\n\nQuelle: American Academy of Ophthalmology (aao.org)",
    sources: ["American Academy of Ophthalmology"], links: [{ label: "AAO: Bildschirm & Augen", url: "https://www.aao.org/eye-health/tips-prevention/computer-usage" }], ok: true,
  }),
  posture: () => ({
    text: "JARVIS – Haltung beim Zocken:\n• Oberkante des Bildschirms auf oder knapp unter Augenhöhe, Abstand mindestens ca. 50 cm.\n• Rücken angelehnt, Füße flach auf dem Boden, Knie etwa im rechten Winkel.\n• Handgelenke gerade (nicht abgeknickt), Maus und Tastatur nah am Körper, Unterarme abgestützt.\n• Regelmäßig aufstehen und Schultern, Nacken, Handgelenke lockern.\n• Schmerzen, Kribbeln oder Taubheit, die bleiben: bitte ärztlich abklären lassen.\n\nQuelle: OSHA – Computer Workstations eTool",
    sources: ["OSHA Computer Workstations"], links: [{ label: "OSHA: Arbeitsplatz am Bildschirm", url: "https://www.osha.gov/etools/computer-workstations" }], ok: true,
  }),
  health: () => ({
    text: "JARVIS – gesund zocken:\n• Pausen: nach etwa jeder Stunde kurz aufstehen, bewegen, etwas trinken (übliche Empfehlung, keine feste Regel).\n• Augen: 20-20-20 (alle 20 Min. 20 Sek. in die Ferne schauen).\n• Kopfschmerzen: Pause, Wasser, Helligkeit runter, Abstand zum Bildschirm prüfen; kommen sie oft oder stark, ärztlich abklären.\n• Schlaf: spät abends lieber aufhören, bevor es zu spät wird.\n• Eine Pausen-Erinnerung gibt es als Widget auf Home – ich stelle sie nur ein, wenn du es sagst.\n\nQuelle: American Academy of Ophthalmology (20-20-20)",
    sources: ["American Academy of Ophthalmology"], links: [{ label: "AAO: Bildschirm & Augen", url: "https://www.aao.org/eye-health/tips-prevention/computer-usage" }], ok: true,
  }),
  display: () => ({
    text: "JARVIS – Bildschirm & FPS:\n• Erst prüfen: Läuft der Monitor wirklich mit seinen Hz? Windows → Anzeige → Erweiterte Anzeige → Bildwiederholfrequenz (Standard ist oft 60 Hz). Kabel: DisplayPort bzw. passendes HDMI.\n• Mit G-Sync/FreeSync (VRR): VRR an, V-Sync im Treiber an, im Spiel aus, FPS-Limit ein paar Bilder unter der Hz-Zahl (z. B. 141 bei 144 Hz) – so bleibt VRR aktiv ohne zusätzliche Verzögerung.\n• Ohne VRR, schnelle Shooter: V-Sync aus für die geringste Verzögerung (dafür Tearing möglich).\n• Ohne VRR, Story-Spiele: V-Sync an oder Limit auf die Hz-Zahl, damit das Bild nicht reißt.\n\nQuelle: Blur Busters – G-SYNC 101",
    sources: ["Blur Busters"], links: [{ label: "Blur Busters: G-SYNC 101", url: "https://blurbusters.com/gsync/gsync101-input-lag-tests-and-settings/14/" }], ok: true,
  }),
  lag: () => ({
    text: "JARVIS – Lag finden:\n• Ruckelt das Bild (niedrige FPS) oder springen Gegner (Netz)? Das sind zwei verschiedene Probleme.\n• Netz: wenn möglich LAN-Kabel; im WLAN 5-GHz-Band und nah am Router.\n• Downloads, Updates und Streams auf anderen Geräten pausieren.\n• Im Spiel den nächsten Server/die richtige Region wählen; VPN aus.\n• Router neu starten, wenn es plötzlich schlechter wurde.\n• Mit PC: Ping Doctor misst Ping, Schwankung und Paketverlust zu deinen Zielen – ich starte ihn nur, wenn du es sagst.",
    sources: ["JARVIS"], links: [], navigate: [{ label: "Ping Doctor öffnen", path: "/network" }], ok: true,
  }),
  controller: () => ({
    text: "JARVIS – Controller zickt:\n• Stick-Drift: in Steam (Einstellungen → Controller → Kalibrieren) oder Windows (joy.cpl) kalibrieren, im Spiel die Totzone etwas erhöhen.\n• Firmware aktualisieren (Xbox-Zubehör-App bzw. PlayStation-Zubehör-Software).\n• Wird nicht erkannt: anderes USB-Kabel/Port (viele Kabel laden nur), Bluetooth neu koppeln, Steam Input für das Spiel an- oder ausschalten.\n• Hilft nichts: Garantie bzw. Hersteller-Support fragen – Öffnen kann die Garantie kosten.\n• Mit PC zeigt die Seite „Controller & RGB“, welche Tasten und Sticks ankommen.",
    sources: ["JARVIS"], links: [], navigate: [{ label: "Controller-Test öffnen", path: "/peripherals" }], ok: true,
  }),
  headset: () => ({
    text: "JARVIS – Headset/Mikrofon:\n• In Windows (Einstellungen → System → Sound) das richtige Gerät für Ausgabe und Eingabe wählen – und im Spiel/Discord auch.\n• Datenschutz → Mikrofon: Zugriff für Apps erlaubt?\n• Rauschen/Echo: Rauschunterdrückung im Spiel/Discord an, Lautsprecher leiser, Mikro näher an den Mund, nicht über einen USB-Hub.\n• Leise: Eingangspegel in Windows erhöhen, Mikro-Stummschalter am Kabel prüfen.\n• Mit PC: Audio Center hat einen Mikrofon-Test.",
    sources: ["JARVIS"], links: [], navigate: [{ label: "Audio Center öffnen", path: "/audio" }], ok: true,
  }),
};
