// Sharing one home page (F27): only which built-in or plugin widgets are on it, in which size. Own widgets from the
// widget editor are left out (they are the user's own code), and nothing else travels – no settings, permissions,
// keys or plugin code. An imported page is checked and always added as a new page, never over an existing one.

import { ALL_WIDGETS, PLUGIN_WIDGET, type Layout, type WidgetConf, type WidgetSize } from "./prefs-core";

export const PAGE_FORMAT = "pgl-page";
export interface SharedPage { format: typeof PAGE_FORMAT; version: 1; name: string; widgets: { id: string; size: WidgetSize }[] }

const BUILTIN = new Set<string>(ALL_WIDGETS.map((w) => w.id));
const SIZES: WidgetSize[] = ["s", "m", "l"];

export function sharePage(l: Layout): { page: SharedPage; leftOut: number } {
  const widgets = l.widgets.filter((w) => w.visible && (BUILTIN.has(w.id) || PLUGIN_WIDGET.test(w.id))).map((w) => ({ id: w.id, size: w.size }));
  return { page: { format: PAGE_FORMAT, version: 1, name: l.name.slice(0, 40), widgets }, leftOut: l.widgets.filter((w) => w.visible).length - widgets.length };
}

export interface CheckedPage { name: string; widgets: WidgetConf[]; needsPlugin: string[]; dropped: number }

/** Checks a shared page (file or link). Unknown widgets are dropped and counted; plugin widgets need their plugin. */
export function checkPage(v: unknown, installedPluginWidgets: string[] = []): CheckedPage | { error: string } {
  const p = v as Partial<SharedPage> | null;
  if (!p || p.format !== PAGE_FORMAT || !Array.isArray(p.widgets)) return { error: "Keine Startseiten-Datei von Nexus." };
  if (p.version !== 1) return { error: "Die Seite stammt aus einer neueren Version der App." };
  const seen = new Set<string>();
  const widgets: WidgetConf[] = [];
  let dropped = 0;
  const needsPlugin: string[] = [];
  for (const w of p.widgets.slice(0, 60)) {
    const id = typeof w?.id === "string" ? w.id : "";
    if (seen.has(id) || !(BUILTIN.has(id) || PLUGIN_WIDGET.test(id))) { dropped++; continue; }
    seen.add(id);
    const size = SIZES.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : "m";
    widgets.push({ id: id as WidgetConf["id"], visible: true, size });
    if (PLUGIN_WIDGET.test(id) && !installedPluginWidgets.includes(id)) needsPlugin.push(id);
  }
  dropped += Math.max(0, p.widgets.length - 60);
  if (!widgets.length) return { error: "Die Seite enthält keine bekannten Widgets." };
  const name = typeof p.name === "string" && p.name.trim() ? p.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) : "Geteilte Seite";
  return { name, widgets, needsPlugin, dropped };
}
