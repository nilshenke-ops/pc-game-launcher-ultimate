// The JARVIS island inside this app (website and phone): a small floating pill at the top that opens into the same widgets as the
// PC's island window. On by default so it can be found; switched off in the island settings. Stored on this device only.
import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

const KEY = "pgl.island.inapp";
let on = (() => { try { return readJson<boolean>(KEY) !== false; } catch { return true; } })();
const listeners = new Set<() => void>();
export function setInAppIsland(v: boolean) { on = v; try { writeJson(KEY, v); } catch { /* storage blocked – only for this visit */ } listeners.forEach((l) => l()); }
export const useInAppIsland = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => on);
