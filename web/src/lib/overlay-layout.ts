// Arrangement of the large in-game overlay (Game Bar style). Stored on the PC (overlay.saveLayout) so the overlay
// window and every device see the same; editable without the PC (queued in lib/outbox.ts).
import { t } from "./i18n";

export interface OverlayWidgetPlace { id: string; visible: boolean; x: number; y: number; w: number; h: number }
export interface OverlayLayout { opacity: number; widgets: OverlayWidgetPlace[] }

/** Built-in overlay widgets: the website's own functions. Plugin widgets ("plugin:…") come on top. */
export const OVERLAY_BUILTINS = ["system", "capture", "quick", "soundboard", "favorites", "recent", "audio", "playing", "profile", "session", "notifications"] as const;
export type OverlayBuiltin = (typeof OVERLAY_BUILTINS)[number];

export function overlayBuiltinTitle(id: OverlayBuiltin): string {
  return ({
    system: t("PC-Auslastung"), capture: t("Aufnahme"), quick: t("Quick Actions"), soundboard: t("Soundboard"), favorites: t("Favoriten"),
    recent: t("Zuletzt gestartet"), audio: t("Audio"), playing: t("Laufende Sounds"), profile: t("Gaming-Profil"), session: t("Aktuelle Spielesitzung"),
    notifications: t("Benachrichtigungen"),
  } as Record<OverlayBuiltin, string>)[id];
}

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  opacity: 0.85,
  widgets: [
    { id: "system", visible: true, x: 0.015, y: 0.09, w: 320, h: 0 },
    { id: "capture", visible: true, x: 0.015, y: 0.45, w: 320, h: 0 },
    { id: "quick", visible: true, x: 0.77, y: 0.09, w: 340, h: 0 },
    { id: "soundboard", visible: true, x: 0.77, y: 0.45, w: 340, h: 0 },
  ],
};

/** Own arrangement, else the default plus the plugin widgets made for the overlay ("overlay": true in plugin.json). */
export function layoutOrDefault(l?: OverlayLayout | null, overlayPluginWidgets: string[] = []): OverlayLayout {
  return l && Array.isArray(l.widgets) ? l : overlayPluginWidgets.reduce(addWidget, DEFAULT_OVERLAY_LAYOUT);
}

/** Plugin widgets of active plugins that are made for the overlay. */
export const overlayPluginWidgets = (plugins?: { plugins: { id: string; enabled: boolean; manifest?: { contributes: { widgets: { id: string; overlay?: boolean }[] } } }[] }) =>
  (plugins?.plugins ?? []).filter((p) => p.enabled && p.manifest).flatMap((p) => p.manifest!.contributes.widgets.filter((w) => w.overlay).map((w) => `plugin:${p.id}:${w.id}`));

/** New widget: placed a bit further down/right than the last one so it is not hidden behind another. */
export function addWidget(l: OverlayLayout, id: string): OverlayLayout {
  const existing = l.widgets.find((w) => w.id === id);
  if (existing) return { ...l, widgets: l.widgets.map((w) => (w.id === id ? { ...w, visible: true } : w)) };
  const n = l.widgets.length;
  return { ...l, widgets: [...l.widgets, { id, visible: true, x: Math.min(0.3 + (n % 5) * 0.04, 0.9), y: Math.min(0.15 + (n % 5) * 0.06, 0.9), w: 340, h: 0 }] };
}
export const removeWidget = (l: OverlayLayout, id: string): OverlayLayout => ({ ...l, widgets: l.widgets.filter((w) => w.id !== id) });
export const setVisible = (l: OverlayLayout, id: string, visible: boolean): OverlayLayout => ({ ...l, widgets: l.widgets.map((w) => (w.id === id ? { ...w, visible } : w)) });
