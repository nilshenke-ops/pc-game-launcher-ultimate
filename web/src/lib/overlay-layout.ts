// Arrangement of the large in-game overlay (Game Bar style). Stored on the PC (overlay.saveLayout) so the overlay
// window and every device see the same; editable without the PC (queued in lib/outbox.ts).
import { t } from "./i18n";

export interface OverlayWidgetPlace { id: string; visible: boolean; x: number; y: number; w: number; h: number }
export interface OverlayLayout { opacity: number; widgets: OverlayWidgetPlace[] }

/** Built-in overlay widgets: the website's own functions. Plugin widgets ("plugin:…") come on top. */
export const OVERLAY_BUILTINS = ["system", "capture", "quick", "soundboard", "deck", "media", "timer", "clock", "notes", "next", "favorites", "recent", "audio", "playing", "profile", "session", "notifications", "counter", "break", "today", "ping", "goals", "level", "deals", "controller", "random", "visualizer", "bingo"] as const;
export type OverlayBuiltin = (typeof OVERLAY_BUILTINS)[number];

export function overlayBuiltinTitle(id: OverlayBuiltin): string {
  return ({
    system: t("PC-Auslastung"), capture: t("Aufnahme"), quick: t("Quick Actions"), soundboard: t("Soundboard"), favorites: t("Favoriten"),
    recent: t("Zuletzt gestartet"), audio: t("Audio"), playing: t("Laufende Sounds"), profile: t("Gaming-Profil"), session: t("Aktuelle Spielesitzung"),
    notifications: t("Benachrichtigungen"), deck: t("Mini-Deck"), media: t("Medien & Lautstärke"), timer: t("Stoppuhr & Countdown"),
    clock: t("Uhr & Datum"), notes: t("Notizen"), next: t("Als Nächstes spielen"),
    counter: t("Zähler"), break: t("Pausen-Erinnerung"), today: t("Spielzeit heute"), ping: t("Ping"), goals: t("Aktive Ziele"), level: t("Level & XP"),
    deals: t("Deals"), controller: t("Controller-Akku"), random: t("Zufallsspiel"), visualizer: t("Musik-Visualizer"), bingo: t("Bingo"),
  } as Record<OverlayBuiltin, string>)[id];
}

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  opacity: 0.92,
  widgets: [
    { id: "system", visible: true, x: 0.015, y: 0.09, w: 320, h: 0 },
    { id: "capture", visible: true, x: 0.015, y: 0.45, w: 320, h: 0 },
    { id: "quick", visible: true, x: 0.77, y: 0.09, w: 340, h: 0 },
    { id: "soundboard", visible: true, x: 0.77, y: 0.45, w: 340, h: 0 },
  ],
};

/** Own arrangement, else the default plus the plugin widgets made for the overlay ("overlay": true in plugin.json). */
export function layoutOrDefault(l?: OverlayLayout | null, overlayPluginWidgets: string[] = [], view?: { w: number; h: number }): OverlayLayout {
  return l && Array.isArray(l.widgets) ? l : overlayPluginWidgets.reduce((acc, id) => addWidget(acc, id, view), DEFAULT_OVERLAY_LAYOUT);
}

/** Plugin widgets of active plugins that are made for the overlay. */
export const overlayPluginWidgets = (plugins?: { plugins: { id: string; enabled: boolean; manifest?: { contributes: { widgets: { id: string; overlay?: boolean }[] } } }[] }) =>
  (plugins?.plugins ?? []).filter((p) => p.enabled && p.manifest).flatMap((p) => p.manifest!.contributes.widgets.filter((w) => w.overlay).map((w) => `plugin:${p.id}:${w.id}`));

/** Height assumed for widgets that size themselves to their content. */
const AUTO_H = 340;

/**
 * New widget: on the first free place of the screen, so widgets do not lie on top of each other (hard to read when
 * see-through). Searched in pixels of the real screen, columns from the edges inwards – the middle stays free for the game.
 * Without a known screen (e.g. set up on the phone) a 1920×1080 screen is assumed.
 */
export function addWidget(l: OverlayLayout, id: string, view: { w: number; h: number } = { w: 1920, h: 1080 }): OverlayLayout {
  const existing = l.widgets.find((w) => w.id === id);
  if (existing) return { ...l, widgets: l.widgets.map((w) => (w.id === id ? { ...w, visible: true } : w)) };
  const W = 340, gap = 12;
  const taken = l.widgets.filter((w) => w.visible).map((w) => ({ x: w.x * view.w, y: w.y * view.h, w: w.w, h: w.h || AUTO_H }));
  const cols: number[] = [];
  for (let x = 16; x + W <= view.w - 16; x += W + gap) cols.push(x);
  if (cols.length > 1) cols.push(view.w - 16 - W);
  const edge = (x: number) => Math.min(x, view.w - x - W);
  const free = (x: number, y: number) => !taken.some((r) => x < r.x + r.w + gap && x + W + gap > r.x && y < r.y + r.h + gap && y + AUTO_H + gap > r.y);
  for (const x of [...new Set(cols)].sort((a, b) => edge(a) - edge(b)))
    for (let y = 70; y + AUTO_H <= view.h - 10; y += 30)
      if (free(x, y)) return { ...l, widgets: [...l.widgets, { id, visible: true, x: x / view.w, y: y / view.h, w: W, h: 0 }] };
  const n = l.widgets.length; // screen full: slightly offset, so the title stays reachable
  return { ...l, widgets: [...l.widgets, { id, visible: true, x: Math.min(0.3 + (n % 5) * 0.04, 0.9), y: Math.min(0.15 + (n % 5) * 0.06, 0.9), w: W, h: 0 }] };
}
export const removeWidget = (l: OverlayLayout, id: string): OverlayLayout => ({ ...l, widgets: l.widgets.filter((w) => w.id !== id) });
export const setVisible = (l: OverlayLayout, id: string, visible: boolean): OverlayLayout => ({ ...l, widgets: l.widgets.map((w) => (w.id === id ? { ...w, visible } : w)) });
