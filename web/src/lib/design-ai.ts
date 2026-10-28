// JARVIS design editor: understands design wishes in plain language ("Mach mein Dashboard etwas heller", "dunkles Design
// mit lila Neon-Akzenten", "Mach die Schaltflächen größer für mein iPad") and turns them into theme values. Nothing is
// saved by this module – the result is shown as a preview first (prefs.ts: previewTheme → Übernehmen / Verwerfen).
// Only design values change; navigation, widgets and functions stay as they are. Readability is protected.

import { contrast, mix, PRESETS, type Theme } from "./prefs-core";

export type DesignIntent =
  | { kind: "change"; theme: Theme; changes: string[]; notes: string[] }
  | { kind: "apply" | "discard" | "undo" | "original" };

const lc = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** Named looks (also the ones from the brief: Neon Gaming, Minimal Dark, Cyberpunk, Minecraft, Purple, Blue, Schwarz-Weiß, Light). */
const THEMES: [RegExp, string, string][] = [
  [/neon.?gaming|\bneon\b(?!.?akzent)/, "neonglow", "Neon Gaming"],
  [/cyberpunk/, "cyberpunk", "Cyberpunk"],
  [/minecraft/, "minecraft", "Minecraft"],
  [/purple.?gaming|lila.?gaming|violett.?gaming/, "purple", "Purple Gaming"],
  [/blue.?gaming|blau.?gaming/, "blue", "Blue Gaming"],
  [/schwarz.?weiss|black.?(and|&).?white|\bmono\b/, "mono", "Schwarz-Weiß"],
  [/light.?mode|helles? (design|theme)|tag.?modus/, "daylight", "Light Mode"],
  [/synthwave/, "synth", "Synthwave"], [/weltraum|space/, "space", "Space"], [/eis\b|\bice\b/, "ice", "Ice"], [/feuer|\bfire\b/, "fire", "Fire"],
  [/fantasy/, "fantasy", "Fantasy"], [/retro|arcade/, "retro", "Retro Arcade"], [/glas\b|glass/, "glass", "Glass"], [/ozean|ocean/, "ocean", "Deep Ocean"],
];

/** Accent colours; the second value is the brighter "neon" version. */
const COLORS: [RegExp, string, string, string][] = [
  [/lila|violett|purple|magenta/, "#a855f7", "#c084fc", "Lila"],
  [/pink|rosa/, "#ec4899", "#f472b6", "Pink"],
  [/blau|blue/, "#3b82f6", "#60a5fa", "Blau"],
  [/tuerkis|cyan/, "#06b6d4", "#22d3ee", "Türkis"],
  [/gruen|green/, "#22c55e", "#4ade80", "Grün"],
  [/gelb|gold|yellow/, "#eab308", "#facc15", "Gelb"],
  [/orange/, "#f97316", "#fb923c", "Orange"],
  [/\brot|\bred\b/, "#ef4444", "#f87171", "Rot"],
  [/weiss|white/, "#e5e7eb", "#f5f5f5", "Weiß"],
];

const DESIGN_WORDS = /design|theme|\bstil|\blook|aussehen|farb|akzent|\bhell|dunkl|dunkel|dashboard|website|seite|app\b|schaltflaech|button|knoepf|tasten|schrift|ecken|abstand|abstaende|schatten|rahmen|animation|karten|minimal|transparent|durchsichtig|deckend|kompakt|luftig/;

function isDark(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) < 128;
}

export function designIntent(raw: string, current: Theme): DesignIntent | null {
  const f = lc(raw.trim().replace(/^jarvis[,:]?\s*/i, "")).replace(/[!?.]+$/, "");
  // Answers to a preview.
  if (/^(ja,?\s*)?(design |vorschau |aenderung(en)? )?(uebernehmen|uebernimm|speichern|passt so|so lassen)( (das|die)? ?(design|vorschau|aenderung(en)?))?$/.test(f)) return { kind: "apply" };
  if (/^(nein,?\s*)?(design |vorschau |aenderung(en)? )?(verwerfen|verwirf|abbrechen|doch nicht)( (das|die)? ?(design|vorschau|aenderung(en)?))?$/.test(f)) return { kind: "discard" };
  if (/(letzte )?(design.?)?aenderung rueckgaengig|design rueckgaengig|vorheriges design|altes design zurueck/.test(f)) return { kind: "undo" };
  if (/(urspruengliche|original|anfangs|ausgangs)\w*\s+design|design\s+(wie am anfang|wiederherstellen)/.test(f)) return { kind: "original" };
  // A theme name alone ("Neon Gaming") counts; "Starte Minecraft" does not.
  const onlyName = THEMES.some(([re]) => re.test(f)) && f.split(/\s+/).length <= 3 && !/start|oeffne|spiel|zock/.test(f);
  if (!DESIGN_WORDS.test(f) && !onlyName) return null;
  // The navigation, widgets, the bar and pictures are the other setup assistant's job.
  if (/leiste|widget|menue|navigation|sprache|hintergrundbild|hintergrund (weltall|cartoon|wald|ozean|vulkan)/.test(f)) return null;

  let t: Theme = { ...current };
  const changes: string[] = [];
  const notes: string[] = [];
  const named = THEMES.find(([re]) => re.test(f));
  if (named) {
    const p = PRESETS[named[1]];
    t = { ...t, preset: named[1], mode: p.mode, primary: p.primary, accent: p.accent, background: p.background, bgScene: null, bgImage: null };
    changes.push(`Theme „${named[2]}“`);
  }
  // Light / dark.
  const brighter = /(etwas|bisschen|ein wenig|leicht) heller|heller/.test(f) && !/viel heller|ganz hell/.test(f);
  if (/viel heller|ganz hell|\bhelles?\b(?! ?(lila|blau|gruen|rosa))|\blight\b/.test(f) && !named?.[1].startsWith("daylight") && !brighter) {
    t.mode = "light"; if (isDark(t.background)) t.background = "#eef2f7"; changes.push("Heller Modus");
  } else if (brighter) {
    t.background = t.mode === "dark" ? mix(t.background, "#ffffff", 0.07) : mix(t.background, "#ffffff", 0.4);
    t.surfaceAlpha = Math.min(1, Math.round((t.surfaceAlpha + 0.08) * 100) / 100);
    changes.push("Etwas heller");
  } else if (/dunkler/.test(f)) {
    t.background = mix(t.background, "#000000", 0.35); if (t.mode === "light" && isDark(t.background)) t.mode = "dark"; changes.push("Etwas dunkler");
  } else if (/dunkl|dunkel|\bdark\b|schwarz(?!.?weiss)/.test(f) && !named) {
    t.mode = "dark"; if (!isDark(t.background)) t.background = "#070b16"; changes.push("Dunkler Modus");
  }
  // Accent colours ("mit lila Neon-Akzenten", "blau und pink").
  const neon = /neon/.test(f);
  // Colour words that are part of the theme's name ("Purple Gaming", "Blue Gaming") are not extra wishes.
  const rest = named ? f.replace(named[0], " ") : f;
  const found = COLORS.map(([re, base, bright, name]) => ({ i: rest.search(re), base, bright, name })).filter((c) => c.i >= 0).sort((a, b) => a.i - b.i);
  const colourWanted = found.length && (/akzent|farbe|farben|\bin\b|mit|mach|design|theme|neon|gruenen|lila|blau/.test(rest));
  if (colourWanted && !(named && found.length === 1 && named[1] === "minecraft" && found[0].name === "Grün")) {
    const a = found[0], b = found[1];
    t.primary = neon || t.mode === "dark" ? a.bright : a.base;
    if (b) t.accent = neon || t.mode === "dark" ? b.bright : b.base;
    else if (contrast(t.accent, t.primary) < 1.3) t.accent = mix(t.primary, t.mode === "dark" ? "#ffffff" : "#000000", 0.35);
    t.preset = "custom";
    changes.push(`${neon ? "Neon-" : ""}Akzent ${a.name}${b ? ` und ${b.name}` : ""}`);
  }
  if (/minimal/.test(f)) {
    t = { ...t, shadow: "none", border: "subtle", radius: Math.min(t.radius, 10), surfaceAlpha: Math.max(t.surfaceAlpha, 0.88), bgScene: null, bgImage: null };
    if (!named && !/neon/.test(f)) { t.primary = t.mode === "dark" ? "#e5e7eb" : "#111827"; t.accent = "#9ca3af"; t.preset = "minimal"; }
    changes.push("Minimalistischer (ohne Schatten, schlichte Karten)");
  }
  // Buttons, text, corners, spacing, shadows, borders, motion, cards.
  if (/(schaltflaech|button|knoepf|tasten)\w*/.test(f) && /groesser|gross|ipad|tablet|touch|finger|besser (treffen|bedienen)/.test(f)) { t.touch = true; changes.push("Größere Schaltflächen und Felder"); }
  else if (/(schaltflaech|button|knoepf)\w*/.test(f) && /kleiner|normal/.test(f)) { t.touch = false; changes.push("Normale Schaltflächen"); }
  if (/(schrift|text)/.test(f) && /groesser|gross/.test(f)) { t.fontScale = Math.min(1.3, Math.round((t.fontScale + 0.1) * 100) / 100); changes.push("Größere Schrift"); }
  if (/(schrift|text)/.test(f) && /kleiner/.test(f)) { t.fontScale = Math.max(0.85, Math.round((t.fontScale - 0.1) * 100) / 100); changes.push("Kleinere Schrift"); }
  if (/runder|abgerundet|weicher/.test(f)) { t.radius = Math.min(28, t.radius + 6); changes.push("Rundere Ecken"); }
  if (/eckiger|kantiger|eckig|keine runden/.test(f)) { t.radius = /eckig$|keine runden/.test(f) ? 2 : Math.max(0, t.radius - 6); changes.push("Eckigere Ecken"); }
  if (/kompakter|enger|weniger abstand|weniger platz/.test(f)) { t.density = "compact"; changes.push("Kompaktere Abstände"); }
  if (/luftiger|mehr abstand|mehr platz|grosszuegiger/.test(f)) { t.density = "roomy"; changes.push("Mehr Abstand"); }
  if (/(keine|ohne|weniger) schatten/.test(f)) { t.shadow = "none"; changes.push("Ohne Schatten"); }
  else if (/(mehr|staerkere|kraeftigere) schatten/.test(f)) { t.shadow = "strong"; changes.push("Kräftigere Schatten"); }
  if (/(deutlicher|kraeftiger|staerker|dicker)\w* rahmen|rahmen (deutlicher|staerker|kraeftiger)/.test(f)) { t.border = "bold"; changes.push("Deutlichere Rahmen"); }
  if (/(dezenter|feiner|weniger)\w* rahmen/.test(f)) { t.border = "subtle"; changes.push("Dezente Rahmen"); }
  if (/animation|bewegung|effekte/.test(f) && /(aus|weniger|ruhig|keine)/.test(f)) { t.reduceMotion = true; changes.push("Weniger Animationen"); }
  else if (/animation|effekte/.test(f) && /(an\b|mehr|wieder)/.test(f)) { t.reduceMotion = false; changes.push("Animationen an"); }
  if (/(karten|panels?)/.test(f) && /transparent|durchsichtig|glas/.test(f)) { t.surfaceAlpha = Math.max(0.4, Math.round((t.surfaceAlpha - 0.15) * 100) / 100); changes.push("Durchsichtigere Karten"); }
  if (/(karten|panels?)/.test(f) && /deckend|weniger transparent|undurchsichtig/.test(f)) { t.surfaceAlpha = Math.min(1, Math.round((t.surfaceAlpha + 0.15) * 100) / 100); changes.push("Deckendere Karten"); }
  if (!changes.length) return null;

  // Readability: mode follows the background, accent colours must stand out against it.
  t.mode = isDark(t.background) ? "dark" : "light";
  if (contrast(t.primary, t.background) < 2.2) {
    const fixed = t.mode === "dark" ? mix(t.primary, "#ffffff", 0.45) : mix(t.primary, "#000000", 0.45);
    if (contrast(fixed, t.background) >= 2.2) { t.primary = fixed; notes.push("Die Akzentfarbe wurde etwas angepasst, damit sie auf dem Hintergrund lesbar bleibt."); }
    else { t.primary = current.primary; notes.push("Die gewünschte Akzentfarbe wäre auf diesem Hintergrund schlecht lesbar – ich habe sie deshalb nicht übernommen."); }
  }
  return { kind: "change", theme: t, changes, notes };
}
