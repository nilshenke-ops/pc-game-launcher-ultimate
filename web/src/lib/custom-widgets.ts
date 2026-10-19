// Widgets built in the widget editor (stored on the PC: widgets.list / widgets.save, queued without the PC).
// Elements are placed freely: position and size are percent of the widget box, so a widget looks the same on the
// phone, in the PC app, in the overlay and as a Windows desktop widget. Font sizes are designed for a 360 px wide box.
import { t } from "./i18n";

export type ElementType = "text" | "clock" | "metric" | "button" | "image" | "playtime" | "nowPlaying" | "shape" | "icon" | "timer";
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
  return ({ text: t("Text"), clock: t("Uhr"), metric: t("Messwert"), button: t("Knopf"), image: t("Bild"), playtime: t("Spielzeit"), nowPlaying: t("Läuft gerade"), shape: t("Fläche"), icon: t("Symbol"), timer: t("Stoppuhr/Countdown") } as Record<ElementType, string>)[type];
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
    case "shape": return { ...base, fill: "#ffffff", w: 84, h: 2, x: 8, y: 50 };
    case "icon": return { ...base, icon: "gamepad-2", size: 40, align: "center", w: 22, h: 40 };
    case "timer": return { ...base, kind: "stopwatch", size: 34, bold: true, align: "center", w: 84, h: 40 };
  }
}

const el = (type: ElementType, patch: Partial<WidgetElement>): WidgetElement => ({ ...newElement(type), ...patch });

/** Starting points in the editor – everything in them can be changed. */
export function templates(): { name: string; make: () => CustomWidget }[] {
  const base = (name: string, height: number, background: string, background2: string | null, elements: WidgetElement[]): CustomWidget =>
    ({ id: newWidgetId(), name, height, background, background2, image: null, opacity: 1, radius: 16, textColor: "#f8fafc", elements, desktop: false, desktopX: 0.75, desktopY: 0.08, desktopW: 320 });
  return [
    { name: t("Leer"), make: () => base(t("Mein Widget"), 200, "#111827", null, []) },
    { name: t("Leistung"), make: () => base(t("Leistung"), 210, "#0f172a", "#1e1b4b", [
      el("text", { text: t("PC-Leistung"), x: 6, y: 6, w: 70, h: 14, size: 15, color: "#94a3b8" }),
      el("metric", { kind: "cpu", text: "CPU", display: "bar", x: 6, y: 24, w: 88, h: 18 }),
      el("metric", { kind: "ram", text: "RAM", display: "bar", x: 6, y: 46, w: 88, h: 18 }),
      el("metric", { kind: "gpu", text: "GPU", display: "bar", x: 6, y: 68, w: 88, h: 18 }),
    ]) },
    { name: t("Uhr & Spielzeit"), make: () => base(t("Uhr & Spielzeit"), 190, "#1e3a8a", "#7c3aed", [
      el("clock", { kind: "time", x: 6, y: 8, w: 88, h: 34, size: 48, align: "center" }),
      el("clock", { kind: "date", x: 6, y: 44, w: 88, h: 12, size: 14, align: "center", bold: false, color: "#c7d2fe" }),
      el("playtime", { kind: "today", text: t("Heute gespielt"), x: 6, y: 66, w: 88, h: 22, size: 18, align: "center" }),
    ]) },
    { name: t("Aufnahme-Knöpfe"), make: () => base(t("Aufnahme"), 150, "#111827", "#3f0d12", [
      el("nowPlaying", { x: 6, y: 8, w: 88, h: 18 }),
      el("button", { action: "record", text: t("Aufnahme"), icon: "radio", fill: "#ef4444", color: "#ffffff", x: 6, y: 40, w: 42, h: 34 }),
      el("button", { action: "replay", text: t("Replay"), icon: "star", fill: "#22d3ee", color: "#04121a", x: 52, y: 40, w: 42, h: 34 }),
    ]) },
  ];
}
