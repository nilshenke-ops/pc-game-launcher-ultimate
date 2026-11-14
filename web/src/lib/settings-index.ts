// Settings search (3.62): one static list of every setting in the app – where it lives (category, page, section), how it is
// called on screen and the words people use for it ("dunkel", "langsam", "Akku", "Handy" …). The search runs locally on this
// list – no request, no network – and a hit opens the page and highlights the setting itself.
//
// `label` is the German text exactly as it appears on screen (a switch, a field or a card title); the highlighter looks for it
// after the page opened. Settings marked "advanced" are hidden in the simple view; opening one from the search switches the
// view to "advanced" for that visit so the hit is never invisible.

export type SettingsCat =
  | "general" | "design" | "gaming" | "audio" | "jarvis" | "island" | "connection" | "cloud" | "privacy" | "performance" | "advanced" | "help";

export const SETTINGS_CATS: { id: SettingsCat; label: string; desc: string }[] = [
  { id: "general", label: "Allgemein", desc: "Name, Sprache, Benachrichtigungen, Autostart" },
  { id: "design", label: "Personalisierung", desc: "Design, Farben, Hintergrund, Leiste, Layouts, Animationen beim Spielstart" },
  { id: "gaming", label: "Gaming", desc: "Profile, Spielmodus, Overlay und Aufnahme, Automatisierungen" },
  { id: "audio", label: "Audio", desc: "Soundboard-Ausgabe, Mikrofon, Discord, Stimmenwechsler" },
  { id: "jarvis", label: "JARVIS", desc: "KI-Modelle, Websuche, Gedächtnis, Aufträge" },
  { id: "island", label: "Dynamic Island", desc: "Insel am PC und in der App, Aussehen, Widgets" },
  { id: "connection", label: "Verbindung & Geräte", desc: "WLAN, Fernzugriff, gekoppelte Geräte" },
  { id: "cloud", label: "Cloud & Sync", desc: "Konto, Anmeldedaten, Backup, Wiederherstellung" },
  { id: "privacy", label: "Datenschutz & Sicherheit", desc: "Zugriff, Verlauf, was gespeichert wird" },
  { id: "performance", label: "Performance", desc: "Leistungs-Presets, Animationen, leichte Darstellung, Spielerkennung" },
  { id: "advanced", label: "Erweitert", desc: "Update-Quelle, Plugin-Katalog, eigener Server" },
  { id: "help", label: "Hilfe", desc: "Anleitungen und Antworten" },
];

/** Old `?s=` values (before 3.62) still open the right place – links in the app, bookmarks and tests keep working. */
export const SECTION_ALIAS: Record<string, SettingsCat> = {
  account: "cloud", backup: "cloud", security: "privacy", notifications: "general", autostart: "general", updates: "advanced",
};
export function sectionOf(s: string | null | undefined): SettingsCat {
  if (!s) return "general";
  if (SECTION_ALIAS[s]) return SECTION_ALIAS[s];
  return SETTINGS_CATS.some((c) => c.id === s) ? (s as SettingsCat) : "general";
}

export interface SettingEntry {
  id: string;
  /** Text on screen (German source string) – used for the result and to find the setting on the page. */
  label: string;
  cat: SettingsCat;
  /** Route that holds it; settings pages use `/settings?s=<cat>`. */
  to: string;
  /** Extra words people search for (lowercase, without umlauts is fine – both are folded). */
  words?: string;
  /** Short explanation shown under the result. */
  desc?: string;
  level?: "simple" | "advanced";
}

const S = (cat: SettingsCat) => `/settings?s=${cat}`;

export const SETTINGS_INDEX: SettingEntry[] = [
  // Allgemein
  { id: "user-name", label: "Dein Name auf der Startseite", cat: "general", to: S("general"), words: "begrüßung hallo name nutzer" },
  { id: "pc-name", label: "Name dieses PCs", cat: "general", to: S("general"), words: "computer rechner pc name umbenennen" },
  { id: "language", label: "Sprache", cat: "general", to: S("general"), words: "deutsch englisch english language übersetzung" },
  { id: "notify-info", label: "Info-Meldungen anzeigen", cat: "general", to: S("general"), words: "benachrichtigung meldung hinweis popup" },
  { id: "quiet-gaming", label: "Während des Spielens reduzieren", cat: "general", to: S("general"), words: "nicht stören ruhe spielen benachrichtigung leise" },
  { id: "autostart", label: "Mit Windows starten", cat: "general", to: S("general"), words: "autostart hochfahren start windows boot" },
  { id: "start-min", label: "Beim Autostart nur im Infobereich starten", cat: "general", to: S("general"), words: "minimiert tray infobereich" },
  { id: "tray", label: "Beim Schließen des Fensters im Hintergrund weiterlaufen", cat: "general", to: S("general"), words: "tray hintergrund schließen beenden" },
  // Personalisierung
  { id: "themes", label: "Themes", cat: "design", to: S("design"), words: "design aussehen farbe dunkel hell dark light theme stil" },
  { id: "colors", label: "Farben", cat: "design", to: S("design"), words: "hauptfarbe akzent farbe hintergrundfarbe kontrast" },
  { id: "ai-design", label: "KI-Design-Editor", cat: "design", to: S("design"), words: "ki design vorschlag automatisch" },
  { id: "font", label: "Schriftgröße", cat: "design", to: S("design"), words: "schrift text größer kleiner lesen zoom" },
  { id: "radius", label: "Ecken-Rundung", cat: "design", to: S("design"), words: "ecken rund radius" },
  { id: "surface", label: "Oberfläche", cat: "design", to: S("design"), words: "glas flach 3d karten transparent" },
  { id: "tilt", label: "Karten neigen sich zur Maus (3D)", cat: "design", to: S("design"), words: "3d neigen maus effekt" },
  { id: "touch", label: "Große Schaltflächen (iPad, Touch)", cat: "design", to: S("design"), words: "touch ipad tablet groß knöpfe finger" },
  { id: "status-pill", label: "Status-Pille unter der oberen Leiste (Handy und iPad)", cat: "design", to: S("design"), words: "pille status handy" },
  { id: "background", label: "Hintergrund", cat: "design", to: S("design"), words: "hintergrundbild wallpaper bild szene" },
  { id: "nav", label: "Navigation", cat: "design", to: S("design"), words: "leiste menü seitenleiste untere leiste navigation reihenfolge" },
  { id: "launch-fx", label: "Spielstart-Animation", cat: "design", to: S("design"), words: "ladebildschirm animation spielstart kino" },
  { id: "layouts", label: "Dashboard-Layouts", cat: "design", to: S("design"), words: "startseite layout dashboard widgets anordnung" },
  { id: "design-reset", label: "Standard-Design wiederherstellen", cat: "design", to: S("design"), words: "zurücksetzen standard reset design" },
  // Gaming
  { id: "profiles", label: "Gaming-Profile", cat: "gaming", to: "/profiles", words: "profil wechseln automatisch spiel" },
  { id: "auto-profile", label: "Automatischer Profilwechsel", cat: "gaming", to: "/profiles", words: "profil automatisch wechseln" },
  { id: "gamemode-close", label: "Beim Spielstart Programme schließen", cat: "gaming", to: "/profiles", words: "spielmodus programme schließen fps leistung game mode" },
  { id: "overlay", label: "Overlay-Inhalt", cat: "gaming", to: "/overlay-settings", words: "overlay ingame anzeige" },
  { id: "obs", label: "Aufnahme mit OBS Studio", cat: "gaming", to: "/overlay-settings", words: "obs aufnahme aufnehmen recording clip replay stream" },
  { id: "replay", label: "Replay-Puffer automatisch, solange ein Spiel läuft", cat: "gaming", to: "/overlay-settings", words: "replay clip highlight puffer" },
  { id: "hotkeys", label: "Tastenkürzel", cat: "gaming", to: "/overlay-settings", words: "hotkey tastenkombination shortcut" },
  { id: "automations", label: "Automatisierungen", cat: "gaming", to: "/automations", words: "regeln wenn dann automatisch auslöser" },
  { id: "history", label: "Spielverlauf aufzeichnen", cat: "privacy", to: S("privacy"), words: "verlauf spielzeit statistik aufzeichnen" },
  // Audio
  { id: "sb-output", label: "Soundboard-Ausgabe", cat: "audio", to: "/audio", words: "soundboard ausgabe lautsprecher kopfhörer gerät" },
  { id: "monitoring", label: "Monitoring (selbst mithören)", cat: "audio", to: "/audio", words: "mithören hören kopfhörer monitoring" },
  { id: "mic-along", label: "Meine Stimme automatisch mitsenden", cat: "audio", to: "/audio", words: "mikrofon mic stimme discord hört mich nicht sprechen" },
  { id: "mic-rescue", label: "Mikrofon wiederherstellen", cat: "audio", to: "/audio", words: "mikrofon kaputt zurücksetzen discord stumm reparieren" },
  { id: "discord", label: "Discord einrichten", cat: "audio", to: "/audio", words: "discord voice sprachchat" },
  { id: "audio-diag", label: "Audio-Diagnose", cat: "audio", to: "/audio", words: "ton geht nicht kein sound fehler prüfen" },
  { id: "voice-changer", label: "Stimmenwechsler", cat: "audio", to: "/voice-changer", words: "stimme verändern voice changer effekt" },
  // JARVIS
  { id: "ai-who", label: "Wer antwortet?", cat: "jarvis", to: "/assistant?tab=ai", words: "ki modell ai assistent antwort wer" },
  { id: "ai-router", label: "KI-Router (OpenRouter, Groq, MixRoute …)", cat: "jarvis", to: "/assistant?tab=ai", words: "openrouter groq gratis ki schlüssel api key modell" },
  { id: "ollama", label: "Lokale KI (Ollama) – kostenlos", cat: "jarvis", to: "/assistant?tab=ai", words: "ollama lokal offline modell" },
  { id: "claude", label: "Claude", cat: "jarvis", to: "/assistant?tab=ai", words: "claude anthropic schlüssel" },
  { id: "web-search", label: "Websuche für aktuelle Fragen (kostenlos)", cat: "jarvis", to: "/assistant?tab=ai", words: "internet suche recherche tavily brave aktuell" },
  { id: "memory", label: "JARVIS MEMORY", cat: "jarvis", to: "/memory", words: "gedächtnis merken obsidian erinnern" },
  { id: "tasks-keep", label: "Aufträge im Verlauf behalten", cat: "jarvis", to: "/assistant?tab=tasks", words: "aufträge verlauf history speichern" },
  // Dynamic Island
  { id: "island-pc", label: "Insel oben auf dem PC-Bildschirm", cat: "island", to: S("island"), words: "insel notch dynamic island pc bildschirm" },
  { id: "island-app", label: "Insel auch in dieser App zeigen", cat: "island", to: S("island"), words: "insel app webseite" },
  { id: "island-where", label: "Wo die Insel erscheint", cat: "island", to: S("island"), words: "insel spiele programme sichtbar wann" },
  { id: "island-look", label: "Aussehen der Insel", cat: "island", to: S("island"), words: "insel augen farbe größe position aussehen" },
  { id: "island-widgets", label: "Widgets im Bereich „PC“", cat: "island", to: S("island"), words: "insel widgets kacheln" },
  // Verbindung & Geräte
  { id: "lan", label: "Im WLAN erreichbar", cat: "connection", to: S("connection"), words: "wlan wifi handy tablet netzwerk lan erreichbar verbinden" },
  { id: "port", label: "Port", cat: "connection", to: S("connection"), words: "port 8787 netzwerk" },
  { id: "tailscale", label: "Unterwegs mit Tailscale", cat: "connection", to: S("connection"), words: "unterwegs fernzugriff vpn tailscale" },
  { id: "relay", label: "Eigener Server (für Fortgeschrittene)", cat: "connection", to: S("connection"), words: "relay server tunnel cloudflare unterwegs", level: "advanced" },
  { id: "browser-server", label: "Server für diesen Browser", cat: "connection", to: S("connection"), words: "websocket adresse server browser", level: "advanced" },
  { id: "devices", label: "Gekoppelte Geräte", cat: "connection", to: "/devices", words: "handy koppeln geräte rechte berechtigungen entfernen" },
  // Cloud & Sync
  { id: "account", label: "Zugangsdaten", cat: "cloud", to: S("cloud"), words: "konto passwort benutzername anmelden login geheimcode" },
  { id: "backup", label: "Backup erstellen", cat: "cloud", to: S("cloud"), words: "sichern backup export zip speichern" },
  { id: "restore-points", label: "Wiederherstellungspunkte", cat: "cloud", to: S("cloud"), words: "wiederherstellen rückgängig zurück punkt" },
  { id: "restore", label: "Wiederherstellen", cat: "cloud", to: S("cloud"), words: "import einspielen backup laden" },
  { id: "data-center", label: "Datenzentrum", cat: "cloud", to: S("cloud"), words: "export import csv design sammlungen datei" },
  { id: "cloud-profile", label: "Cloud-Dienst", cat: "cloud", to: "/profile", words: "cloud synchronisieren sync geräte konto" },
  // Datenschutz & Sicherheit
  { id: "security", label: "Sicherheit", cat: "privacy", to: S("privacy"), words: "sicherheit zugriff schutz" },
  { id: "session-perf", label: "Leistungswerte während Spielsitzungen aufzeichnen", cat: "privacy", to: S("privacy"), words: "leistung messwerte aufzeichnen archiv" },
  { id: "cover-search", label: "Cover automatisch suchen", cat: "privacy", to: S("privacy"), words: "cover bilder internet suchen" },
  { id: "steam-cdn", label: "Steam-Cover aus dem Steam-CDN laden", cat: "privacy", to: S("privacy"), words: "steam cover cdn bilder" },
  { id: "download-notices", label: "Fertige Downloads melden", cat: "privacy", to: S("privacy"), words: "download fertig meldung" },
  // Performance
  { id: "perf-preset", label: "Leistungs-Preset", cat: "performance", to: S("performance"), words: "langsam ruckelt laggt schnell akku energie sparen leistung fps performance preset" },
  { id: "reduce-motion", label: "Animationen reduzieren", cat: "performance", to: S("performance"), words: "animation bewegung ruhig ausschalten" },
  { id: "follow-os", label: "Systemeinstellung „Bewegung reduzieren“ beachten", cat: "performance", to: S("performance"), words: "system bewegung reduzieren windows ipad" },
  { id: "lite", label: "Leichte Darstellung (spart Leistung)", cat: "performance", to: S("performance"), words: "leicht lite akku schwach langsam unschärfe effekte aus" },
  { id: "bg-anim", label: "Bewegter Hintergrund", cat: "design", to: S("design"), words: "partikel sterne hintergrund animation" },
  { id: "scan", label: "Spielerkennung", cat: "performance", to: S("performance"), words: "erkennung intervall prüfen spielstart erkennen sekunden", level: "advanced" },
  { id: "monitor", label: "PC Monitor", cat: "performance", to: "/monitor", words: "cpu gpu ram temperatur auslastung monitor" },
  // Erweitert
  { id: "update-source", label: "Update-Quelle", cat: "advanced", to: S("advanced"), words: "update manifest quelle url", level: "advanced" },
  { id: "plugin-catalog", label: "Plugin-Katalog (Store)", cat: "advanced", to: S("advanced"), words: "plugin store katalog", level: "advanced" },
  { id: "updates", label: "Updates & Versionen", cat: "advanced", to: "/updates", words: "update aktualisieren version neu installieren" },
  { id: "help", label: "Hilfe", cat: "help", to: S("help"), words: "hilfe anleitung frage problem faq" },
];

/** Lowercase, umlauts and ß folded, punctuation to spaces – „Größe“ and "groesse" and "grosse" meet. */
export function fold(s: string) {
  return s.toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Everyday words → the words the settings use. Searching "dunkel" also finds the themes, "laggt" finds performance … */
export const SYNONYMS: Record<string, string[]> = {
  dunkel: ["dark", "theme", "design"], hell: ["light", "theme", "design"], darkmode: ["dark", "theme"], nachtmodus: ["dark", "theme"],
  langsam: ["leistung", "performance"], ruckelt: ["leistung", "performance"], laggt: ["leistung", "performance"], lag: ["leistung", "ping"], stottert: ["leistung"],
  akku: ["energie", "lite", "leicht"], batterie: ["akku", "energie"], strom: ["energie"], energiesparen: ["energie", "lite"],
  handy: ["wlan", "koppeln", "geraete"], smartphone: ["handy", "wlan", "koppeln"], iphone: ["handy", "koppeln"], tablet: ["ipad", "touch", "wlan"],
  mikro: ["mikrofon"], mic: ["mikrofon"], micro: ["mikrofon"], ton: ["audio", "sound"], lautsprecher: ["ausgabe"], headset: ["kopfhorer", "ausgabe", "mikrofon"],
  kennwort: ["passwort"], password: ["passwort"], login: ["anmelden", "konto"], account: ["konto"],
  sichern: ["backup"], sicherung: ["backup"], export: ["backup", "export"], exportieren: ["export", "backup"], importieren: ["import", "wiederherstellen"],
  animationen: ["animation", "bewegung"], effekte: ["animation", "effekt", "lite"], bewegung: ["animation"],
  ki: ["ki", "modell", "jarvis"], ai: ["ki", "modell"], chatbot: ["ki", "jarvis"], assistent: ["jarvis", "ki"],
  notch: ["insel"], island: ["insel"], benachrichtigungen: ["meldung", "benachrichtigung"], popups: ["meldung"],
  englisch: ["sprache"], english: ["sprache"], language: ["sprache"], schrift: ["schriftgrosse", "text"],
  aufnehmen: ["aufnahme", "obs"], streamen: ["obs", "stream"], clip: ["replay", "aufnahme"],
  internet: ["websuche", "wlan"], wifi: ["wlan"], fernzugriff: ["tailscale", "relay", "unterwegs"],
  reset: ["zurucksetzen", "standard"], zurucksetzen: ["standard", "reset"], update: ["update", "version"],
};

export interface SettingHit { entry: SettingEntry; score: number }

/** Ranks every entry against the query: words in the label count most, then the extra words, then the category name. All
 *  query words must match somewhere (directly or through a synonym); partial words count from 3 letters ("schri" → Schriftgröße). */
export function searchSettings(query: string, limit = 8): SettingHit[] {
  const words = fold(query).split(" ").filter((w) => w.length >= 2);
  if (!words.length) return [];
  const hits: SettingHit[] = [];
  for (const entry of SETTINGS_INDEX) {
    const label = fold(entry.label);
    const extra = fold((entry.words ?? "") + " " + (entry.desc ?? ""));
    const cat = fold(SETTINGS_CATS.find((c) => c.id === entry.cat)?.label ?? "");
    let score = 0;
    let all = true;
    for (const w of words) {
      const forms = [w, ...(SYNONYMS[w] ?? []).map(fold)];
      const inText = (text: string, f: string) => (` ${text} `).includes(` ${f} `) ? 2 : f.length >= 3 && text.split(" ").some((x) => x.startsWith(f)) ? 1 : 0;
      let best = 0;
      for (const [i, f] of forms.entries()) {
        const weight = i === 0 ? 1 : 0.4; // the word itself counts more than a synonym ("laggt" in a setting's own words beats "Leistung" in another label)
        best = Math.max(best, weight * Math.max(inText(label, f) * 5, inText(extra, f) * 3, inText(cat, f) * 1.5));
      }
      if (best === 0) { all = false; break; }
      score += best;
    }
    if (all) hits.push({ entry, score: score + (label.startsWith(words[0]) ? 2 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label)).slice(0, limit);
}

/** Number of settings that only the advanced view shows, per category (for the "n more hidden" line). */
export function advancedCount(cat: SettingsCat) {
  return SETTINGS_INDEX.filter((e) => e.cat === cat && e.level === "advanced" && e.to.startsWith("/settings")).length;
}

// ---- simple / advanced view (this device only; changes no setting) -----------------------------------------------------
const LEVEL_KEY = "pgl.settings.level";
type Level = "simple" | "advanced";
const listeners = new Set<() => void>();
let level: Level = (() => { try { return localStorage.getItem(LEVEL_KEY) === "advanced" ? "advanced" : "simple"; } catch { return "simple"; } })();
export function settingsLevel(): Level { return level; }
export function setSettingsLevel(v: Level) {
  level = v;
  try { localStorage.setItem(LEVEL_KEY, v); } catch { /* private mode: only for this visit */ }
  listeners.forEach((l) => l());
}
export function onSettingsLevel(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
