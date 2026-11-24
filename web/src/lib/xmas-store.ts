// The wish list of this browser: kept in the browser storage (pgl.xmas) and, as part of the account (account-backup.ts), sealed and synced to
// the other devices. Every change tells the account to save ("pgl-keys").
import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { cleanList, XMAS_KEY, type XmasList } from "./xmas-list";

const EVENT = "pgl-xmas";
let snap: XmasList | null = null, raw = "";

export function readXmas(): XmasList {
  const r = readJson<unknown>(XMAS_KEY);
  return cleanList(r);
}
function current(): XmasList {
  let now = "";
  try { now = localStorage.getItem(XMAS_KEY) ?? ""; } catch { /* blocked: keep what is in memory */ }
  if (!snap || now !== raw) { snap = readXmas(); raw = now; }
  return snap;
}
export function saveXmas(list: XmasList) {
  const clean = cleanList(list);
  writeJson(XMAS_KEY, clean.items.length || clean.title ? clean : null);
  snap = clean; try { raw = localStorage.getItem(XMAS_KEY) ?? ""; } catch { raw = ""; }
  if (typeof window !== "undefined") { window.dispatchEvent(new Event(EVENT)); window.dispatchEvent(new Event("pgl-keys")); }
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); window.addEventListener("pgl-account", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); window.removeEventListener("pgl-account", cb); };
};
export const useXmas = () => useSyncExternalStore(subscribe, current, () => ({ title: "", items: [] }));
