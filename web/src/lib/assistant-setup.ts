// Setting up the app by telling the assistant what to do ("Mach das Design hell", "Pack das Deck in die Leiste").
// Runs on this device, with or without the PC, at no cost. The assistant only proposes: every change is a button,
// applied when tapped and undoable – nothing changes by itself. Only the device's own settings (design, navigation,
// home screen, language) are touched; nothing is sent as a command to the PC.
import { t } from "./i18n";
import { fold, tokens } from "./knowledge";
import { ALL_WIDGETS, BG_SCENES, DEFAULT_THEME, PRESETS, sanitizePrefs, type Prefs } from "./prefs-core";
import type { AssistantAction, AssistantReply } from "./assistant";
import type { NavItem } from "./nav";

export const MAX_BAR = 4;
/** Areas that cannot be hidden (same as the navigation editor). */
const FIXED = new Set(["/", "/settings", "/connect"]);

export type SetupOp =
  | { op: "mode"; value: "light" | "dark" }
  | { op: "preset"; id: string }
  | { op: "scene"; id: string | null }
  | { op: "font"; value: number }
  | { op: "motion"; reduce: boolean }
  | { op: "navColors"; on: boolean }
  | { op: "bar"; paths: string[] }
  | { op: "navHidden"; path: string; hidden: boolean }
  | { op: "widget"; id: string; visible: boolean }
  | { op: "lang"; value: "de" | "en" }
  | { op: "profileThemes"; on: boolean }
  | { op: "resetTheme" };

/** Applies one change to a copy of the settings; the result is checked like everything else that is stored. */
export function applySetup(p: Prefs, o: SetupOp, mobile: boolean): Prefs {
  const n = structuredClone(p);
  switch (o.op) {
    case "mode": n.theme.mode = o.value; n.theme.preset = "custom"; if (o.value === "light" && isDark(n.theme.background)) n.theme.background = "#eef2f7"; if (o.value === "dark" && !isDark(n.theme.background)) n.theme.background = "#070b16"; break;
    case "preset": { const x = PRESETS[o.id]; if (x) n.theme = { ...n.theme, preset: o.id, mode: x.mode, primary: x.primary, accent: x.accent, background: x.background }; break; }
    case "scene": {
      const s = BG_SCENES.find((b) => b.id === o.id);
      n.theme = s ? { ...n.theme, bgScene: s.id, bgImage: null, mode: s.mode, primary: s.primary, accent: s.accent, background: s.background, bgDim: s.dim, preset: "custom" } : { ...n.theme, bgScene: null, bgImage: null };
      break;
    }
    case "font": n.theme.fontScale = o.value; break;
    case "motion": n.theme.reduceMotion = o.reduce; break;
    case "navColors": n.nav.colors = o.on; break;
    case "bar": n.nav.bottom = o.paths.slice(0, MAX_BAR); break;
    case "navHidden": if (!FIXED.has(o.path)) n.nav.hidden = o.hidden ? [...new Set([...n.nav.hidden, o.path])] : n.nav.hidden.filter((x) => x !== o.path); break;
    case "widget": {
      const id = mobile ? n.activeLayout.mobile : n.activeLayout.desktop;
      const layout = n.layouts.find((l) => l.id === id) ?? n.layouts[0];
      const w = layout.widgets.find((x) => x.id === o.id);
      if (w) {
        w.visible = o.visible;
        // A widget switched on goes to the top, so it is seen right away.
        if (o.visible) layout.widgets = [w, ...layout.widgets.filter((x) => x !== w)];
      }
      break;
    }
    case "lang": n.lang = o.value; break;
    case "profileThemes": n.profileThemes = o.on; break;
    case "resetTheme": n.theme = { ...DEFAULT_THEME }; break;
  }
  return sanitizePrefs(n);
}

function isDark(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) < 128;
}

// ------------------------------------------------------------------ understanding the request

const COLORS: [RegExp, string][] = [
  [/gruen|green|smaragd|emerald/, "emerald"], [/pink|rosa|lila|violett|purple|synth/, "synth"], [/orange|rot|red|ember|feuer/, "ember"],
  [/blau|blue|ozean|ocean/, "ocean"], [/cyan|tuerkis|neon|standard ?farbe/, "neon"],
];
const WIDGET_WORDS: [RegExp, string][] = [
  [/uhr|datum|clock/, "clock"], [/notiz/, "notes"], [/timer|stoppuhr|countdown|wecker/, "timer"], [/medien|lautstaerke|musik ?steuer|media/, "media"],
  [/mini.?deck|deck/, "deck"], [/schnellstart|kacheln|shortcuts/, "shortcuts"], [/als naechstes|backlog/, "next"], [/erste schritte/, "start"],
  [/favorit/, "favorites"], [/zuletzt/, "recent"], [/quick ?action|schnellaktion/, "quick"], [/auslastung|pc.?werte|cpu|system/, "system"],
  [/sitzung|session/, "session"], [/laufende sounds|spielende sounds/, "playing"], [/audio/, "audio"], [/benachrichtigung|meldung/, "notifications"],
  [/geraete/, "devices"], [/profil/, "profile"], [/verbindung|status/, "status"], [/updates|begleiter/, "download"],
  [/wo war ich|erinnerung|spielgedaechtnis/, "memory"], [/gaming.?abend|spieleabend/, "night"], [/abstimmung|umfrage/, "poll"],
  [/foto|bild des tages|screenshot des tages/, "photo"], [/bauprojekt|projekte/, "projects"], [/soundtrack|lieblingslied|musik.?tipp/, "track"],
  [/challenge/, "challenges"], [/wuerfel|muenze|zufall/, "dice"], [/aufnahmen|clips/, "captures"], [/speicher|festplatte|laufwerk/, "storage"],
  [/meistgespielt|top spiele/, "topplayed"],
];

/** Area of the app by name ("Deck", "Sounds", "Backlog" …). */
export function findArea(items: NavItem[], text: string): NavItem | undefined {
  const target = fold(text).replace(/^(das|die|den|der|mein(e|en)?|the)\s+/, "").trim();
  if (!target) return undefined;
  const tt = tokens(target);
  return items.find((i) => fold(i.label) === target || fold(i.short ?? "") === target)
    ?? items.find((i) => tt.length > 0 && tt.every((w) => tokens(`${i.label} ${i.short ?? ""} ${i.keywords ?? ""}`).some((k) => k.startsWith(w) || w.startsWith(k))));
}

const reply = (text: string, actions: AssistantAction[] = [], suggestions: string[] = []): AssistantReply => ({ text, actions, sources: [t("Einstellungen dieses Geräts")], suggestions, mode: "device" });
const act = (label: string, o: SetupOp): AssistantAction => ({ kind: "setup", label, params: o as unknown as Record<string, unknown> });
const areaName = (i: NavItem) => i.short ?? i.label;

/** Recognises a request to set up the app. Null if the question is about something else. */
export function setupReply(question: string, prefs: Prefs, items: NavItem[]): AssistantReply | null {
  const f = fold(question).replace(/[!?.]+$/, "").trim();
  const bar = /(untere[nr]? )?(leiste|taskleiste|navigationsleiste|tab ?bar)/.test(f);
  const menu = /\bmenue|navigation|seitenleiste\b/.test(f);
  const home = /\b(home|startseite|dashboard|startbildschirm)\b/.test(f);
  const remove = /(entfern|weg|raus|loesch|nimm .* (aus|von)|aus (der|dem) |ausblend|blend.* aus|versteck|verberg|remove|hide)/.test(f);

  // Colourful or plain symbols.
  if ((bar || menu || /symbole|icons/.test(f)) && /(farbig|bunt|farbe|colou?r)/.test(f) && !/(schlicht|grau|einfarbig|ohne farbe)/.test(f))
    return reply(t("Farbige Symbole in Leiste und Menü."), [act(t("Symbole farbig"), { op: "navColors", on: true })]);
  if ((bar || menu || /symbole|icons/.test(f)) && /(schlicht|grau|einfarbig|ohne farbe|wie (vorher|frueher|davor)|plain)/.test(f))
    return reply(t("Schlichte Symbole wie früher – die aktive Seite bleibt farbig markiert."), [act(t("Symbole schlicht"), { op: "navColors", on: false })]);

  // Bottom bar: add, remove, replace.
  if (bar) {
    const m = /(?:pack|setz|leg|tu|fueg|nimm|bring|mach|hol|add|put)\w*\s+(?:mir\s+)?(.+?)\s+(?:in|auf|zu|zur|an|unten in)\s+(?:die\s+|der\s+)?(?:untere[nr]?\s+)?(?:leiste|taskleiste)/.exec(f)
      ?? /(.+?)\s+(?:in|auf)\s+(?:die\s+)?(?:untere\s+)?(?:leiste|taskleiste)/.exec(f);
    const r = /(?:entfern|nimm|wirf|loesch|schmeiss)\w*\s+(.+?)\s+(?:aus|von)\s+(?:der\s+)?(?:untere[nr]?\s+)?(?:leiste|taskleiste)/.exec(f)
      ?? /(.+?)\s+(?:aus der|von der)\s+(?:untere[nr]?\s+)?(?:leiste|taskleiste)\s*(?:entfernen|raus|weg)?/.exec(f);
    const current = prefs.nav.bottom.filter((p) => p !== "/connect");
    const byPath = (p: string) => items.find((i) => i.path === p);
    if (r && remove) {
      const area = findArea(items, r[1].replace(/^(bitte|mal)\s+/, ""));
      if (!area) return reply(t("Welchen Bereich soll ich aus der Leiste nehmen? In der Leiste sind: {l}.", { l: current.map((p) => byPath(p) ? areaName(byPath(p)!) : p).join(", ") }));
      if (!current.includes(area.path)) return reply(t("„{n}“ ist gar nicht in der Leiste.", { n: areaName(area) }));
      return reply(t("„{n}“ kommt aus der Leiste – erreichbar bleibt es über „Mehr“.", { n: areaName(area) }), [act(t("„{n}“ aus der Leiste nehmen", { n: areaName(area) }), { op: "bar", paths: current.filter((p) => p !== area.path) })]);
    }
    if (m && !remove) {
      const area = findArea(items, m[1].replace(/^(bitte|mal|auch)\s+/, ""));
      if (!area || area.path === "/connect") return reply(t("Welchen Bereich soll ich in die Leiste legen? Zum Beispiel Deck, Spiele, Sounds, Backlog oder Assistent."));
      if (current.includes(area.path)) return reply(t("„{n}“ ist schon in der Leiste.", { n: areaName(area) }));
      if (current.length < MAX_BAR) return reply(t("„{n}“ kommt in die Leiste.", { n: areaName(area) }), [act(t("„{n}“ in die Leiste", { n: areaName(area) }), { op: "bar", paths: [...current, area.path] })]);
      // Full: never overfill – offer to swap one place.
      return reply(t("Die Leiste hat schon {n} Plätze (plus „Mehr“). Wofür soll „{a}“ hinein?", { n: MAX_BAR, a: areaName(area) }),
        current.map((p) => act(t("statt „{n}“", { n: byPath(p) ? areaName(byPath(p)!) : p }), { op: "bar", paths: current.map((x) => (x === p ? area.path : x)) })));
    }
    if (/standard|zuruecksetzen|reset/.test(f)) return reply(t("Leiste wie am Anfang: Home, Deck, Spiele, Sounds."), [act(t("Leiste zurücksetzen"), { op: "bar", paths: ["/", "/deck", "/games", "/soundboard"] })]);
  }

  // Home screen widgets.
  if (home || /widget/.test(f)) {
    const w = WIDGET_WORDS.find(([rx]) => rx.test(f.replace(/\b(home|startseite|dashboard|widget)\b/g, "")));
    if (w) {
      const label = t(ALL_WIDGETS.find((x) => x.id === w[1])!.label);
      return remove
        ? reply(t("„{n}“ wird auf Home ausgeblendet (wieder einblenden: Home → Anpassen).", { n: label }), [act(t("„{n}“ ausblenden", { n: label }), { op: "widget", id: w[1], visible: false })])
        : reply(t("„{n}“ kommt oben auf Home.", { n: label }), [act(t("„{n}“ auf Home zeigen", { n: label }), { op: "widget", id: w[1], visible: true })]);
    }
  }

  // Hide or show an area in the menu.
  const hide = /(?:blend|versteck|verberg)\w*\s+(.+?)\s+aus$|(.+?)\s+(?:ausblenden|verstecken)$|(?:hide)\s+(.+)$/.exec(f);
  const show = /(?:blend)\w*\s+(.+?)\s+(?:wieder\s+)?ein$|(.+?)\s+(?:wieder\s+)?einblenden$|(?:zeig)\w*\s+(.+?)\s+(?:wieder\s+)?im menue$/.exec(f);
  for (const [m, hidden] of [[hide, true], [show, false]] as const) {
    if (!m) continue;
    const area = findArea(items, (m[1] ?? m[2] ?? m[3] ?? "").replace(/\s+(im|aus dem) (menue|navigation)$/, ""));
    if (!area) continue;
    if (hidden && FIXED.has(area.path)) return reply(t("„{n}“ bleibt immer im Menü – sonst kommst du nicht mehr zurück.", { n: area.label }));
    return reply(hidden ? t("„{n}“ wird im Menü ausgeblendet – über die Suche bleibt es erreichbar.", { n: area.label }) : t("„{n}“ wird wieder im Menü gezeigt.", { n: area.label }),
      [act(hidden ? t("„{n}“ ausblenden", { n: area.label }) : t("„{n}“ einblenden", { n: area.label }), { op: "navHidden", path: area.path, hidden })]);
  }

  // Language.
  if (/(sprache|language|stell|schalt|wechsel|mach).*(englisch|english)|^english$/.test(f)) return reply(t("Die App wird auf Englisch umgestellt."), [act("English", { op: "lang", value: "en" })]);
  if (/(sprache|language|stell|schalt|wechsel|mach|switch).*(deutsch|german)|^deutsch$/.test(f)) return reply(t("Die App wird auf Deutsch umgestellt."), [act("Deutsch", { op: "lang", value: "de" })]);

  const design = /(design|farbe|farben|theme|modus|aussehen|look|hintergrund|app|alles|es|seite|website)/.test(f);
  // Background scene.
  if (/hintergrund|background|wallpaper/.test(f)) {
    if (remove || /(kein|ohne|aus\b)/.test(f)) return reply(t("Hintergrundbild aus – nur die Farbe bleibt."), [act(t("Hintergrund entfernen"), { op: "scene", id: null })]);
    const scene = BG_SCENES.find((s) => f.includes(fold(s.name)) || f.includes(s.id.replace("-", " ")) || (s.id === "space" && /weltall|space/.test(f) && !/cartoon/.test(f)));
    if (scene) return reply(t("Hintergrund „{n}“ mit passenden Farben.", { n: scene.name }), [act(t("Hintergrund „{n}“", { n: scene.name }), { op: "scene", id: scene.id }), { kind: "navigate", label: t("Alle Hintergründe ansehen"), path: "/settings?s=design" }]);
    return reply(t("Welcher Hintergrund? Zur Auswahl: {l}.", { l: BG_SCENES.map((s) => s.name).join(", ") }), BG_SCENES.slice(0, 4).map((s) => act(s.name, { op: "scene", id: s.id })));
  }
  // Light or dark.
  if (design && /(\bhell|\blight\b|\bweiss|\btag\b)/.test(f)) return reply(t("Helles Design."), [act(t("Design hell"), PRESETS.daylight && !/farbe/.test(f) ? { op: "preset", id: "daylight" } : { op: "mode", value: "light" })]);
  if (design && /(dunkel|dunkl|\bdark\b|schwarz|\bnacht)/.test(f)) return reply(t("Dunkles Design."), [act(t("Design dunkel"), { op: "mode", value: "dark" })]);
  // Colour.
  if (design || /mach .* (gruen|blau|pink|lila|orange|rot|cyan|tuerkis)/.test(f)) {
    const c = COLORS.find(([rx]) => rx.test(f));
    if (c) return reply(t("Farben „{n}“.", { n: PRESETS[c[1]].name }), [act(t("Farben „{n}“", { n: PRESETS[c[1]].name }), { op: "preset", id: c[1] })]);
  }
  // Text size and motion.
  if (/(schrift|text|font)/.test(f) && /(groesser|gross|bigger|larger)/.test(f)) return reply(t("Größere Schrift."), [act(t("Schrift größer"), { op: "font", value: Math.min(1.3, Math.round((prefs.theme.fontScale + 0.1) * 100) / 100) })]);
  if (/(schrift|text|font)/.test(f) && /(kleiner|klein|smaller)/.test(f)) return reply(t("Kleinere Schrift."), [act(t("Schrift kleiner"), { op: "font", value: Math.max(0.85, Math.round((prefs.theme.fontScale - 0.1) * 100) / 100) })]);
  if (/(animation|bewegung|effekte)/.test(f) && /(aus|weniger|ruhig|stopp|off)/.test(f)) return reply(t("Weniger Bewegung: Animationen werden reduziert."), [act(t("Animationen aus"), { op: "motion", reduce: true })]);
  if (/(animation|bewegung|effekte)/.test(f) && /(an|ein|on)\b/.test(f)) return reply(t("Animationen wieder an."), [act(t("Animationen an"), { op: "motion", reduce: false })]);
  if (/profil.?(theme|design|farben)/.test(f)) {
    const off = /(aus|nicht|kein|off)/.test(f);
    return reply(off ? t("Spiele-Profile ändern das Design dieses Geräts nicht mehr.") : t("Spiele-Profile dürfen das Design dieses Geräts wieder ändern."), [act(off ? t("Profil-Designs aus") : t("Profil-Designs an"), { op: "profileThemes", on: !off })]);
  }
  if (/(design|farben|theme).*(zuruecksetzen|standard|reset|wie am anfang)/.test(f)) return reply(t("Design wie am Anfang (Neon Cyan, dunkel)."), [act(t("Design zurücksetzen"), { op: "resetTheme" })]);
  return null;
}

/** Examples for the help text of the assistant. */
export const setupExamples = () => [t("Mach das Design hell"), t("Pack den Backlog in die Leiste"), t("Zeig die Uhr auf Home"), t("Leiste schlicht wie früher"), t("Hintergrund Weltall")];
