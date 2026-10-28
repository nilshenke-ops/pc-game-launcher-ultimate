// JARVIS' tone: "sachlich" (default) or "locker" – a cheeky one-liner after an answer, in JARVIS' own style (no imitation
// of a real person). Only added to answers that worked; never to errors, refusals or questions that need a decision.
// Facts, numbers and sources stay exactly as they are – the line comes after them.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

export type JarvisStyle = "sachlich" | "locker";
const KEY = "pgl.jarvis.style";
export const styleOf = (): JarvisStyle => (readJson<string>(KEY) === "locker" ? "locker" : "sachlich");
const listeners = new Set<() => void>();
export const setStyle = (s: JarvisStyle) => { writeJson(KEY, s); listeners.forEach((l) => l()); };
/** The current tone, updated everywhere when it changes (also when changed in the chat). */
export const useStyle = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, styleOf, () => "sachlich" as JarvisStyle);

const pick = (list: string[], seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0; return list[Math.abs(h) % list.length]; };

const LINES: [RegExp, string[]][] = [
  [/Spielzeitanalyse/, ["Das ist kein Spiel mehr, das ist ein Lebensabschnitt.", "Snacks bereitlegen – das wird länger.", "Gute Nachricht: Langweilig wird dir nicht."]],
  [/^✓ Notiert: .*€/m, ["Dein Geldbeutel hat gerade leise geseufzt.", "Investition in Lebensqualität, ganz klar.", "Ich sag's keinem. Versprochen."]],
  [/gratis|kostenlos/i, ["Gratis ist mein Lieblingspreis.", "Zugreifen, bevor es weg ist – ich hab nichts gesagt.", "Kostet nix, außer Freizeit."]],
  [/Weltrekord|Speedrun/i, ["Kleiner Tipp: Den holst du heute nicht mehr.", "Respekt. Ich wär schon beim Laden eingeschlafen."]],
  [/streamt|Twitch/i, ["Popcorn holen, zuschauen, selbst besser werden – so der Plan.", "Zuschauen zählt auch als Training. Fast."]],
  [/Sensitivität|cm für eine volle Drehung/, ["Wenn du jetzt noch triffst, liegt's nicht mehr an der Maus.", "Ausreden-Liste um einen Punkt kürzer."]],
  [/Augen|Haltung|gesund zocken/i, ["Und jetzt: einmal strecken. Ich warte.", "Dein Rücken bedankt sich später bei mir."]],
  [/Wo du warst|was als Nächstes|Gemerkt|Hinweis .* gespeichert/i, ["Ich merk mir das – du kannst ruhig wieder alles vergessen.", "Mein Gedächtnis ist besser als deins. Nur so nebenbei."]],
  [/Lag|Ping|Paketverlust/i, ["Es war das Internet. Es ist immer das Internet.", "Nicht der Skill – das Netz. Sagen wir es so."]],
];
const GENERIC = ["Erledigt. Applaus darf gern kommen.", "Läuft bei uns.", "Zu Befehl, Chef.", "Ich bin gut, ich weiß."];

/** The answer with a one-liner below it – or unchanged (style "sachlich", failed step, open question). */
export function withStyle(text: string, ok: boolean | null, style: JarvisStyle = styleOf(), now = new Date()): string {
  if (style !== "locker" || ok !== true || !text.trim()) return text;
  const hit = LINES.find(([re]) => re.test(text));
  let line = pick(hit ? hit[1] : GENERIC, text);
  const h = now.getHours();
  if (h >= 23 || h < 5) line += ` Übrigens: Es ist ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}. Nur so als Info.`;
  return `${text}\n\n😏 ${line}`;
}
