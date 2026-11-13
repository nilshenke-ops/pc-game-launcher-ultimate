// Aussehen und Widgets der Insel: Die Wahrheit liegt im Companion (Einstellungen des PCs) – so kann man sie auch vom Handy
// ändern, und das Insel-Fenster übernimmt jede Änderung sofort. Eine Kopie im Speicher des Fensters sorgt dafür, dass die Insel
// beim Start schon richtig aussieht, bevor der PC antwortet.

import { useEffect } from "react";
import { cacheLayout, cleanLayout, defaultLayout, setOwnLayout, useLayoutStore, type IslandLayout } from "./island-layout";
import { client } from "./rpc";
import { toast, useCan, useConn, useRpc } from "./hooks";
import { cleanWidgets, type IslandWidgetId } from "./island-widgets";
import { isIslandEye, isIslandEyeSize, isIslandStyle, setIslandPrefs, useIslandPrefs, type IslandEye, type IslandEyeSize, type IslandStyle } from "./island";

export type IslandPosition = "center" | "left" | "right";
export const ISLAND_POSITIONS: { id: IslandPosition; label: string }[] = [{ id: "left", label: "Links" }, { id: "center", label: "Mitte" }, { id: "right", label: "Rechts" }];
export const MIN_OPACITY = 50;
export interface IslandLook { style: IslandStyle; eye: IslandEye; eyeSize: IslandEyeSize; widgets: IslandWidgetId[]; position: IslandPosition; opacity: number; layout: IslandLayout | null }
export interface IslandInfo { supported: boolean; visible: boolean; desktop: boolean; games: boolean; gameRunning: boolean; look?: Partial<Record<keyof IslandLook, unknown>> }

/** Checks what the PC sent (or an old companion left out) and fills the rest with the usual look. */
export function cleanLook(v: IslandInfo["look"] | undefined, fallback?: Partial<IslandLook>): IslandLook {
  const opacity = typeof v?.opacity === "number" && Number.isFinite(v.opacity) ? Math.max(MIN_OPACITY, Math.min(100, Math.round(v.opacity))) : fallback?.opacity ?? 100;
  return {
    style: isIslandStyle(v?.style) ? v.style : fallback?.style ?? "default",
    eye: isIslandEye(v?.eye) ? v.eye : fallback?.eye ?? "auto",
    eyeSize: isIslandEyeSize(v?.eyeSize) ? v.eyeSize : fallback?.eyeSize ?? "m",
    widgets: v?.widgets === undefined ? cleanWidgets(fallback?.widgets) : cleanWidgets(v.widgets),
    position: v?.position === "left" || v?.position === "right" ? v.position : "center",
    opacity,
    layout: cleanLayout(v?.layout),
  };
}

/** The look in use: from the PC when it answers, otherwise the copy kept in this window. `save` sends changes to the PC (admin right needed). */
export function useIslandLook() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canManage = useCan("admin");
  const local = useIslandPrefs();
  const info = useRpc<IslandInfo>("island.get", {}, ["island", "session"], online);
  const remote = online && info.data?.look ? cleanLook(info.data.look, local) : null;
  const look: IslandLook = remote ?? cleanLook(undefined, local);
  // Keep the copy up to date for the next start.
  const key = remote ? JSON.stringify([remote.style, remote.eye, remote.eyeSize, remote.widgets]) : "";
  useEffect(() => {
    if (!remote) return;
    if (remote.style !== local.style || remote.eye !== local.eye || remote.eyeSize !== local.eyeSize || JSON.stringify(remote.widgets) !== JSON.stringify(local.widgets))
      setIslandPrefs({ style: remote.style, eye: remote.eye, eyeSize: remote.eyeSize, widgets: remote.widgets });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The PC's layout is kept on this device too, so the island shows it at once on the next start.
  const layoutKey = remote ? JSON.stringify(remote.layout) : "";
  useEffect(() => { if (remote) cacheLayout(remote.layout); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layoutKey]);
  const save = async (patch: Partial<Omit<IslandLook, "layout">>): Promise<boolean> => {
    if (!online || !canManage) return false;
    try { await client.call("island.configure", { look: patch }); info.reload(); return true; }
    catch (e) { toast((e as Error).message, "error"); return false; }
  };
  return { look, remote: !!remote, online, canManage, supported: info.data?.supported !== false, save };
}

/**
 * The island's layout in use and how to change it. A device allowed to change the PC's settings saves it on the PC (every device and the
 * island window then show it); any other device keeps its own layout. Without a saved one, the island looks as it always did.
 */
export function useIslandLayout() {
  const { look, remote, online, canManage } = useIslandLook();
  const store = useLayoutStore();
  const canPc = online && canManage;
  const pcLayout = store.cached ?? (remote ? look.layout : null);
  const layout: IslandLayout = store.own ?? pcLayout ?? defaultLayout(look.widgets);
  const source: "own" | "pc" | "default" = store.own ? "own" : pcLayout ? "pc" : "default";
  const saveLayout = async (l: IslandLayout): Promise<boolean> => {
    if (!canPc) { setOwnLayout(l); return true; }
    const before = store.cached;
    cacheLayout(l); // shown at once, before the PC answers
    try { await client.call("island.configure", { look: { layout: l } }); if (store.own) setOwnLayout(null); return true; }
    catch (e) { cacheLayout(before); toast((e as Error).message, "error"); return false; }
  };
  const reset = async (): Promise<void> => {
    if (store.own) { setOwnLayout(null); return; }
    if (!canPc) return;
    const before = store.cached;
    cacheLayout(null);
    try { await client.call("island.configure", { look: { resetLayout: true } }); }
    catch (e) { cacheLayout(before); toast((e as Error).message, "error"); }
  };
  return { layout, source, canPc, saveLayout, reset, widgets: look.widgets };
}
