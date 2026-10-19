/** Converts a keyboard event into the companion's notation, e.g. "Ctrl+Alt+F9". */
export function comboFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean) as string[];
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = "Num" + e.code.slice(6);
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else key = ({ " ": "Space", Enter: "Enter", Escape: "Escape", Tab: "Tab", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Pause: "Pause", ScrollLock: "ScrollLock", PrintScreen: "PrintScreen",
    MediaPlayPause: "MediaPlayPause", MediaTrackNext: "MediaNextTrack", MediaTrackPrevious: "MediaPreviousTrack", MediaStop: "MediaStop",
    AudioVolumeMute: "VolumeMute", AudioVolumeUp: "VolumeUp", AudioVolumeDown: "VolumeDown" } as Record<string, string>)[e.key] ?? null;
  if (!key) return null;
  return [...mods, key].join("+");
}

/** Mouse side buttons in the companion's notation (button 3 = back = "Mouse4", button 4 = forward = "Mouse5"). */
export function comboFromMouse(e: { button: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  const key = e.button === 3 ? "Mouse4" : e.button === 4 ? "Mouse5" : null;
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean) as string[];
  return [...mods, key].join("+");
}

/** Readable form: "Mouse4" → "Maus-Seitentaste hinten (4)". */
export function describeCombo(keys: string, tr: (s: string) => string): string {
  const media: Record<string, string> = { MediaPlayPause: tr("Medien: Play/Pause"), MediaNextTrack: tr("Medien: Nächster Titel"), MediaPreviousTrack: tr("Medien: Vorheriger Titel"),
    MediaStop: tr("Medien: Stopp"), VolumeMute: tr("Ton aus"), VolumeUp: tr("Lauter"), VolumeDown: tr("Leiser") };
  return keys.replace("Mouse4", tr("Maus-Seitentaste hinten (4)")).replace("Mouse5", tr("Maus-Seitentaste vorne (5)"))
    .replace(/Media\w+|Volume\w+/, (m) => media[m] ?? m).replace(/\+/g, " + ");
}

/** Media keys of the keyboard as hotkeys (e.g. play/pause → soundboard). */
export const MEDIA_SUGGESTIONS = ["MediaPlayPause", "MediaNextTrack", "MediaPreviousTrack", "Ctrl+VolumeMute"];

/** Combinations that work on 60 % keyboards (no F-row, numpad or navigation block) and rarely clash with games. */
export const COMPACT_SUGGESTIONS = ["Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3", "Ctrl+Alt+Q", "Ctrl+Alt+M", "Ctrl+Shift+F1", "F13", "F14", "Mouse4", "Mouse5", "Ctrl+Mouse4"];
