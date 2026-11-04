// Widgets built in the widget editor (stored on the PC: widgets.list / widgets.save, queued without the PC).
// Elements are placed freely: position and size are percent of the widget box, so a widget looks the same on the
// phone, in the PC app, in the overlay and as a Windows desktop widget. Font sizes are designed for a 360 px wide box.
import { t } from "./i18n";

export type ElementType = "text" | "clock" | "metric" | "button" | "image" | "playtime" | "nowPlaying" | "music" | "shape" | "icon" | "timer";
export type ButtonAction = "quick" | "launch" | "sound" | "profile" | "overlay" | "record" | "replay" | "stopSounds" | "media" | "open";

export interface WidgetElement {
  id: string; type: ElementType; x: number; y: number; w: number; h: number;
  text?: string | null; size: number; color?: string | null; fill?: string | null; align: "left" | "center" | "right"; bold: boolean;
  kind?: string | null; display?: "number" | "bar" | "ring" | null; action?: ButtonAction | null; ref?: string | null; icon?: string | null; image?: string | null;
}

export interface CustomWidget {
  id: string; name: string; height: number; background: string; background2?: string | null; image?: string | null; opacity: number; radius: number;
  textColor: string; elements: WidgetElement[]; desktop: boolean; desktopX: number; desktopY: number; desktopW: number; updatedAt?: string;
}

export const DESIGN_WIDTH = 360;
export const CUSTOM_PREFIX = "custom:";
export { CUSTOM_WIDGET as CUSTOM_WIDGET_ID } from "./prefs-core";
const rid = () => Math.random().toString(36).slice(2, 10);
/** Ids are made here (not on the PC), so a widget made without the PC can be placed on the dashboard at once. */
export const newWidgetId = () => `cw_${rid()}${rid()}`;
export const newElementId = () => `e${rid()}`;

export function elementLabel(type: ElementType): string {
  return ({ text: t("Text"), clock: t("Uhr"), metric: t("Messwert"), button: t("Knopf"), image: t("Bild"), playtime: t("Spielzeit"), nowPlaying: t("Laufendes Spiel"), music: t("Musik/Video am PC"), shape: t("Fläche"), icon: t("Symbol"), timer: t("Stoppuhr/Countdown") } as Record<ElementType, string>)[type];
}

export function newElement(type: ElementType): WidgetElement {
  const base: WidgetElement = { id: newElementId(), type, x: 8, y: 8, w: 50, h: 20, size: 16, align: "left", bold: false };
  switch (type) {
    case "text": return { ...base, text: t("Mein Text"), size: 18, bold: true };
    case "clock": return { ...base, kind: "time", size: 40, bold: true, w: 60, h: 30 };
    case "metric": return { ...base, kind: "cpu", display: "bar", text: "CPU", w: 84, h: 22 };
    case "button": return { ...base, action: "record", text: t("Aufnahme"), icon: "radio", fill: "#22d3ee", color: "#04121a", align: "center", bold: true, w: 40, h: 22 };
    case "image": return { ...base, w: 30, h: 40 };
    case "playtime": return { ...base, kind: "today", text: t("Heute gespielt"), size: 22, bold: true, w: 70, h: 26 };
    case "nowPlaying": return { ...base, size: 16, w: 84, h: 20 };
    case "music": return { ...base, size: 16, w: 84, h: 30, bold: true };
    case "shape": return { ...base, fill: "#ffffff", w: 84, h: 2, x: 8, y: 50 };
    case "icon": return { ...base, icon: "gamepad-2", size: 40, align: "center", w: 22, h: 40 };
    case "timer": return { ...base, kind: "stopwatch", size: 34, bold: true, align: "center", w: 84, h: 40 };
  }
}

const el = (type: ElementType, patch: Partial<WidgetElement>): WidgetElement => ({ ...newElement(type), ...patch });

/** Starting points in the editor – everything in them can be changed. Every value in them is real (measured by the PC or read from it). */
export function templates(): { name: string; make: () => CustomWidget }[] {
  const base = (name: string, height: number, background: string, background2: string | null, elements: WidgetElement[]): CustomWidget =>
    ({ id: newWidgetId(), name, height, background, background2, image: null, opacity: 1, radius: 16, textColor: "#f8fafc", elements, desktop: false, desktopX: 0.75, desktopY: 0.08, desktopW: 320 });
  const btn = (action: NonNullable<WidgetElement["action"]>, text: string, icon: string, x: number, y: number, w: number, h: number, fill = "rgba(255,255,255,0.14)", color = "#ffffff", ref?: string): WidgetElement =>
    el("button", { action, text, icon, fill, color, x, y, w, h, ref: ref ?? null, size: 14 });
  const dark = ["#0f172a", "#1e1b4b"] as const;
  return [
    { name: t("Leer"), make: () => base(t("Mein Widget"), 200, "#111827", null, []) },
    // ---- PC
    { name: t("Leistung"), make: () => base(t("Leistung"), 210, dark[0], dark[1], [
      el("text", { text: t("PC-Leistung"), x: 6, y: 6, w: 70, h: 14, size: 15, color: "#94a3b8" }),
      el("metric", { kind: "cpu", text: "CPU", display: "bar", x: 6, y: 24, w: 88, h: 18 }),
      el("metric", { kind: "ram", text: "RAM", display: "bar", x: 6, y: 46, w: 88, h: 18 }),
      el("metric", { kind: "gpu", text: "GPU", display: "bar", x: 6, y: 68, w: 88, h: 18 }),
    ]) },
    { name: t("Leistung als Ringe"), make: () => base(t("Leistung"), 170, "#0b1220", "#12263f", [
      el("metric", { kind: "cpu", text: "CPU", display: "ring", fill: "#22d3ee", x: 4, y: 8, w: 28, h: 62, size: 20 }),
      el("metric", { kind: "ram", text: "RAM", display: "ring", fill: "#a78bfa", x: 36, y: 8, w: 28, h: 62, size: 20 }),
      el("metric", { kind: "gpu", text: "GPU", display: "ring", fill: "#34d399", x: 68, y: 8, w: 28, h: 62, size: 20 }),
      el("text", { text: "CPU", x: 4, y: 76, w: 28, h: 14, size: 13, align: "center", color: "#94a3b8" }),
      el("text", { text: "RAM", x: 36, y: 76, w: 28, h: 14, size: 13, align: "center", color: "#94a3b8" }),
      el("text", { text: "GPU", x: 68, y: 76, w: 28, h: 14, size: 13, align: "center", color: "#94a3b8" }),
    ]) },
    { name: t("Temperaturen"), make: () => base(t("Temperaturen"), 150, "#1f1111", "#3b1d12", [
      el("text", { text: t("Temperaturen"), x: 6, y: 8, w: 70, h: 14, size: 15, color: "#fca5a5" }),
      el("metric", { kind: "cputemp", text: "CPU", display: "number", x: 6, y: 32, w: 42, h: 34, size: 26, bold: true }),
      el("metric", { kind: "gputemp", text: "GPU", display: "number", x: 52, y: 32, w: 42, h: 34, size: 26, bold: true }),
      el("text", { text: t("Nur Werte, die dein PC wirklich misst"), x: 6, y: 74, w: 88, h: 14, size: 11, color: "#94a3b8", bold: false }),
    ]) },
    { name: t("Speicher"), make: () => base(t("Speicher"), 150, dark[0], "#0c4a6e", [
      el("metric", { kind: "ram", text: t("Arbeitsspeicher"), display: "bar", x: 6, y: 14, w: 88, h: 24 }),
      el("metric", { kind: "disk", text: t("Laufwerk (belegt)"), display: "bar", fill: "#f59e0b", x: 6, y: 50, w: 88, h: 24 }),
    ]) },
    { name: t("Zahlen im Überblick"), make: () => base(t("Zahlen"), 110, "#111827", null, [
      el("metric", { kind: "cpu", text: "CPU", display: "number", x: 4, y: 24, w: 30, h: 40, size: 22, bold: false, align: "center" }),
      el("metric", { kind: "ram", text: "RAM", display: "number", x: 35, y: 24, w: 30, h: 40, size: 22, bold: false, align: "center" }),
      el("metric", { kind: "gpu", text: "GPU", display: "number", x: 66, y: 24, w: 30, h: 40, size: 22, bold: false, align: "center" }),
    ]) },
    // ---- Zeit
    { name: t("Uhr & Spielzeit"), make: () => base(t("Uhr & Spielzeit"), 190, "#1e3a8a", "#7c3aed", [
      el("clock", { kind: "time", x: 6, y: 8, w: 88, h: 34, size: 48, align: "center" }),
      el("clock", { kind: "date", x: 6, y: 44, w: 88, h: 12, size: 14, align: "center", bold: false, color: "#c7d2fe" }),
      el("playtime", { kind: "today", text: t("Heute gespielt"), x: 6, y: 66, w: 88, h: 22, size: 18, align: "center" }),
    ]) },
    { name: t("Große Uhr"), make: () => base(t("Uhr"), 140, "#0f172a", "#312e81", [
      el("clock", { kind: "time", x: 4, y: 10, w: 92, h: 56, size: 64, align: "center" }),
      el("clock", { kind: "date", x: 4, y: 68, w: 92, h: 18, size: 15, align: "center", bold: false, color: "#c7d2fe" }),
    ]) },
    { name: t("Spielzeit"), make: () => base(t("Spielzeit"), 150, "#052e16", "#14532d", [
      el("playtime", { kind: "today", text: t("Heute"), x: 6, y: 12, w: 42, h: 60, size: 26, align: "left" }),
      el("playtime", { kind: "week", text: t("7 Tage"), x: 52, y: 12, w: 42, h: 60, size: 26, align: "left" }),
    ]) },
    { name: t("Fokus-Timer (25 Minuten)"), make: () => base(t("Fokus"), 130, "#1f2937", "#134e4a", [
      el("text", { text: t("Fokus"), x: 6, y: 8, w: 50, h: 14, size: 15, color: "#99f6e4" }),
      el("timer", { kind: "countdown", ref: "1500", x: 6, y: 26, w: 88, h: 62, size: 44, align: "center" }),
    ]) },
    { name: t("Stoppuhr"), make: () => base(t("Stoppuhr"), 130, "#1c1917", "#44403c", [
      el("timer", { kind: "stopwatch", x: 6, y: 12, w: 88, h: 74, size: 44, align: "center" }),
    ]) },
    // ---- Spiele und Medien
    { name: t("Laufendes Spiel"), make: () => base(t("Laufendes Spiel"), 120, "#1e1b4b", "#4c1d95", [
      el("text", { text: t("Gerade am PC"), x: 6, y: 10, w: 70, h: 14, size: 13, color: "#c4b5fd", bold: false }),
      el("nowPlaying", { x: 6, y: 30, w: 88, h: 26, size: 20, bold: true }),
      el("playtime", { kind: "today", text: t("Heute gespielt"), x: 6, y: 62, w: 88, h: 28, size: 15 }),
    ]) },
    { name: t("Musik am PC"), make: () => base(t("Musik am PC"), 170, "#1e1b4b", "#831843", [
      el("text", { text: t("Läuft gerade"), x: 6, y: 8, w: 60, h: 12, size: 12, color: "#f9a8d4", bold: false }),
      el("music", { x: 6, y: 22, w: 88, h: 30, size: 17 }),
      btn("media", "", "skip-back", 6, 62, 26, 28, "rgba(255,255,255,0.14)", "#ffffff", "prev"),
      btn("media", "", "play", 37, 62, 26, 28, "#f472b6", "#1f0a14", "playpause"),
      btn("media", "", "skip-forward", 68, 62, 26, 28, "rgba(255,255,255,0.14)", "#ffffff", "next"),
    ]) },
    { name: t("Lautstärke"), make: () => base(t("Lautstärke"), 110, "#0f172a", "#1e293b", [
      btn("media", "", "volume-1", 6, 24, 26, 52, "rgba(255,255,255,0.14)", "#ffffff", "voldown"),
      btn("media", "", "volume-x", 37, 24, 26, 52, "rgba(255,255,255,0.14)", "#ffffff", "mute"),
      btn("media", "", "volume-2", 68, 24, 26, 52, "rgba(255,255,255,0.14)", "#ffffff", "volup"),
    ]) },
    { name: t("Aufnahme-Knöpfe"), make: () => base(t("Aufnahme"), 150, "#111827", "#3f0d12", [
      el("nowPlaying", { x: 6, y: 8, w: 88, h: 18 }),
      el("button", { action: "record", text: t("Aufnahme"), icon: "radio", fill: "#ef4444", color: "#ffffff", x: 6, y: 40, w: 42, h: 34 }),
      el("button", { action: "replay", text: t("Replay"), icon: "star", fill: "#22d3ee", color: "#04121a", x: 52, y: 40, w: 42, h: 34 }),
    ]) },
    { name: t("Overlay & Sounds"), make: () => base(t("Overlay & Sounds"), 120, "#0b1220", "#1e3a5f", [
      btn("overlay", t("Overlay"), "layers", 6, 22, 42, 56, "#22d3ee", "#04121a"),
      btn("stopSounds", t("Sounds stoppen"), "square", 52, 22, 42, 56),
    ]) },
    { name: t("Schnellzugriff"), make: () => base(t("Schnellzugriff"), 130, "#111827", "#312e81", [
      btn("open", t("Spiele"), "gamepad-2", 4, 20, 29, 60, "rgba(255,255,255,0.14)", "#ffffff", "/games"),
      btn("open", t("Deck"), "layout-grid", 35, 20, 29, 60, "rgba(255,255,255,0.14)", "#ffffff", "/deck"),
      btn("open", "JARVIS", "mic", 66, 20, 29, 60, "rgba(255,255,255,0.14)", "#ffffff", "/assistant"),
    ]) },
    { name: t("Notiz"), make: () => base(t("Notiz"), 150, "#fef3c7", "#fde68a", [
      el("text", { text: t("Hier steht deine Notiz …"), x: 6, y: 10, w: 88, h: 76, size: 18, bold: false, color: "#422006" }),
    ]) },
  ];
}
