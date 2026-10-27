// The JARVIS session: switched on in the website, it tells the PC that this connection may have named gaming
// actions run directly. It starts when the JARVIS page is opened (and JARVIS is on), lives as long as this tab is
// open, ends when switched off, when the tab closes (the connection closes – the PC drops it) or after 15 minutes
// without a request. No timer, no polling: it is renewed only together with a request.

import { useSyncExternalStore } from "react";
import { client, readJson, writeJson } from "./rpc";
import { JARVIS_KEY } from "./jarvis";

let enabled = readJson<boolean>(JARVIS_KEY) ?? true;
let wanted = false;          // the JARVIS page was opened in this tab
let activeSince = 0;         // when the PC confirmed the session (0 = none)
const IDLE_MS = 14 * 60_000; // renew a bit before the PC's 15 minutes run out
const listeners = new Set<() => void>();
let snap = { enabled, active: false };
const publish = () => { snap = { enabled, active: activeSince > 0 }; listeners.forEach((l) => l()); };
const online = () => client.status.auth === "ok" && client.status.phase === "online";

async function start() {
  if (!enabled || !wanted || !online()) return;
  try { await client.call("jarvis.session", { active: true }); activeSince = Date.now(); } catch { activeSince = 0; }
  publish();
}
function stop() {
  const was = activeSince > 0;
  activeSince = 0;
  if (was && online()) client.call("jarvis.session", { active: false }).catch(() => {});
  publish();
}

// A new connection has no session on the PC – start again if JARVIS was in use in this tab.
client.on("authenticated", () => { activeSince = 0; void start(); });
client.subscribe(() => { if (!online() && activeSince) { activeSince = 0; publish(); } });
if (typeof window !== "undefined") window.addEventListener("pagehide", () => stop());

/** Called when the JARVIS page opens. */
export function openJarvis() { wanted = true; if (!activeSince) void start(); }

export function setJarvisEnabled(on: boolean) {
  enabled = on;
  writeJson(JARVIS_KEY, on);
  if (on) void start(); else stop();
  publish();
}

/** Before a request: renews the session if it is about to run out (one call, only when needed). */
export async function ensureJarvis(): Promise<boolean> {
  if (!enabled || !online()) return false;
  if (!activeSince || Date.now() - activeSince > IDLE_MS) await start();
  else activeSince = Date.now();
  return activeSince > 0;
}

export function useJarvis() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snap);
}
