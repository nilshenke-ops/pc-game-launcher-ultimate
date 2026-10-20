import { t } from "./i18n";

/** Key ids as the PC knows them (see KeyCatalog in the companion); labels for a German keyboard. */
const BASE: Record<string, string> = {
  Esc: "Esc", Tab: "Tab", CapsLock: "Caps", LShift: "Shift", RShift: "Shift ⇧", LCtrl: "Strg", RCtrl: "Strg ⇢", LAlt: "Alt", RAlt: "AltGr",
  LWin: "Win", RWin: "Win ⇢", Menu: "☰", Space: "␣", Enter: "Enter", Backspace: "⌫", Insert: "Einfg", Delete: "Entf", Home: "Pos1", End: "Ende",
  PageUp: "Bild↑", PageDown: "Bild↓", Left: "←", Up: "↑", Right: "→", Down: "↓", PrintScreen: "Druck", ScrollLock: "Rollen", Pause: "Pause",
  NumLock: "Num", NumMul: "Num *", NumAdd: "Num +", NumSub: "Num −", NumDecimal: "Num ,", NumDiv: "Num /",
  Oem1: "Ü", OemPlus: "+", OemComma: ",", OemMinus: "-", OemPeriod: ".", Oem2: "#", Oem3: "Ö", Oem4: "ß", Oem5: "^", Oem6: "´", Oem7: "Ä", Oem102: "<",
  VolumeMute: "🔇", VolumeDown: "🔉", VolumeUp: "🔊", MediaNext: "⏭", MediaPrev: "⏮", MediaStop: "⏹", MediaPlayPause: "⏯",
};
for (let i = 0; i <= 9; i++) BASE["Num" + i] = "Num " + i;

const LONG: Record<string, () => string> = {
  Space: () => t("Leertaste"), MouseLeft: () => t("Linke Maustaste"), MouseRight: () => t("Rechte Maustaste"), MouseMiddle: () => t("Mittlere Maustaste (Rad)"),
  Mouse4: () => t("Seitentaste hinten (4)"), Mouse5: () => t("Seitentaste vorne (5)"), VolumeMute: () => t("Ton aus"), VolumeDown: () => t("Leiser"), VolumeUp: () => t("Lauter"),
  MediaNext: () => t("Nächster Titel"), MediaPrev: () => t("Voriger Titel"), MediaStop: () => t("Stopp"), MediaPlayPause: () => t("Play/Pause"),
  LWin: () => t("Windows-Taste links"), RWin: () => t("Windows-Taste rechts"), CapsLock: () => "Caps Lock", Menu: () => t("Kontextmenü-Taste"),
  RShift: () => t("Shift rechts"), RCtrl: () => t("Strg rechts"), Backspace: () => t("Rücktaste"),
  LShift: () => t("Shift links"), LCtrl: () => t("Strg links"), LAlt: () => t("Alt links"),
};

/** Short label for a key cap. */
export const keyCap = (id: string) => BASE[id] ?? id;
/** Readable name for lists ("Seitentaste hinten (4)", "Ü", "F5"). */
export const keyName = (id: string) => LONG[id]?.() ?? BASE[id] ?? id;

export const MODIFIERS = ["Ctrl", "Shift", "Alt", "Win"] as const;
export type Modifier = (typeof MODIFIERS)[number];
const MOD_LABEL: Record<Modifier, string> = { Ctrl: "Strg", Shift: "Shift", Alt: "Alt", Win: "Win" };
export const modLabel = (m: Modifier) => MOD_LABEL[m];

export const MOUSE_BUTTONS = ["MouseLeft", "MouseRight", "MouseMiddle", "Mouse4", "Mouse5"];

/** A target: "None" (key off) or optional modifiers plus one key – never several keys in a row. */
export function parseTarget(to: string): { mods: Modifier[]; key: string | null } {
  if (!to || to === "None") return { mods: [], key: null };
  const parts = to.split("+");
  return { mods: parts.slice(0, -1).filter((p): p is Modifier => (MODIFIERS as readonly string[]).includes(p)), key: parts[parts.length - 1] };
}
export const buildTarget = (mods: Modifier[], key: string | null) => (key ? [...MODIFIERS.filter((m) => mods.includes(m)), key].join("+") : "None");
export function describeTarget(to: string) {
  const { mods, key } = parseTarget(to);
  return key ? [...mods.map(modLabel), keyName(key)].join(" + ") : t("aus (gesperrt)");
}

/** All keys for the pickers, in groups. */
export function keyGroups(): { label: string; keys: string[] }[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return [
    { label: t("Maus"), keys: MOUSE_BUTTONS },
    { label: t("Buchstaben"), keys: letters },
    { label: t("Zahlen"), keys: "1234567890".split("") },
    { label: t("Funktionstasten"), keys: Array.from({ length: 24 }, (_, i) => "F" + (i + 1)) },
    { label: t("Sondertasten"), keys: ["Esc", "Tab", "CapsLock", "LShift", "RShift", "LCtrl", "RCtrl", "LAlt", "RAlt", "LWin", "RWin", "Menu", "Space", "Enter", "Backspace", "Insert", "Delete", "Home", "End", "PageUp", "PageDown", "Up", "Down", "Left", "Right", "PrintScreen", "ScrollLock", "Pause"] },
    { label: t("Zeichen"), keys: ["Oem5", "Oem4", "Oem6", "Oem1", "OemPlus", "Oem3", "Oem7", "Oem2", "Oem102", "OemComma", "OemPeriod", "OemMinus"] },
    { label: t("Ziffernblock"), keys: ["NumLock", ...Array.from({ length: 10 }, (_, i) => "Num" + i), "NumAdd", "NumSub", "NumMul", "NumDiv", "NumDecimal"] },
    { label: t("Medien"), keys: ["MediaPlayPause", "MediaNext", "MediaPrev", "MediaStop", "VolumeUp", "VolumeDown", "VolumeMute"] },
  ];
}

/** German TKL/75 % layout for the clickable keyboard (w = width in key units, null = gap). */
/** Width of every row in key units. */
export const KEYBOARD_UNITS = 18.25;

export const KEYBOARD_ROWS: { id: string | null; w?: number }[][] = [
  [{ id: "Esc" }, { id: null, w: 1 }, ...["F1", "F2", "F3", "F4"].map((id) => ({ id })), { id: null, w: 0.5 }, ...["F5", "F6", "F7", "F8"].map((id) => ({ id })), { id: null, w: 0.5 }, ...["F9", "F10", "F11", "F12"].map((id) => ({ id })), { id: null, w: 0.25 }, { id: "PrintScreen" }, { id: "ScrollLock" }, { id: "Pause" }],
  [{ id: "Oem5" }, ..."1234567890".split("").map((id) => ({ id })), { id: "Oem4" }, { id: "Oem6" }, { id: "Backspace", w: 2 }, { id: null, w: 0.25 }, { id: "Insert" }, { id: "Home" }, { id: "PageUp" }],
  [{ id: "Tab", w: 1.5 }, ..."QWERTZUIOP".split("").map((id) => ({ id })), { id: "Oem1" }, { id: "OemPlus" }, { id: "Enter", w: 1.5 }, { id: null, w: 0.25 }, { id: "Delete" }, { id: "End" }, { id: "PageDown" }],
  [{ id: "CapsLock", w: 1.75 }, ..."ASDFGHJKL".split("").map((id) => ({ id })), { id: "Oem3" }, { id: "Oem7" }, { id: "Oem2" }, { id: null, w: 1.25 }, { id: null, w: 0.25 }, { id: null, w: 3 }],
  [{ id: "LShift", w: 1.25 }, { id: "Oem102" }, ..."YXCVBNM".split("").map((id) => ({ id })), { id: "OemComma" }, { id: "OemPeriod" }, { id: "OemMinus" }, { id: "RShift", w: 2.75 }, { id: null, w: 1.25 }, { id: "Up" }, { id: null, w: 1 }],
  [{ id: "LCtrl", w: 1.25 }, { id: "LWin", w: 1.25 }, { id: "LAlt", w: 1.25 }, { id: "Space", w: 6.25 }, { id: "RAlt", w: 1.25 }, { id: "RWin", w: 1.25 }, { id: "Menu", w: 1.25 }, { id: "RCtrl", w: 1.25 }, { id: null, w: 0.25 }, { id: "Left" }, { id: "Down" }, { id: "Right" }],
];
