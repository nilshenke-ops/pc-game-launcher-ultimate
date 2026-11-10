// Set up once per account: the memory folder (with its rules) and the AI keys are handed to the PC through the account, as sealed changes
// (see cloud-sync.ts), and the PC applies them itself with its own rights. So nothing has to be typed a second time at the PC – and it works
// while the PC is off: the change waits in the cloud until the PC comes back. Only sent when it differs from what this device sent last.
import { memorySettings } from "./memory-config";
import { exportKeyBundle } from "./free-ai-local";
import { queueCloudOp } from "./cloud-sync";
import { session } from "./design-account";
import { readJson, writeJson } from "./rpc";

const SENT_KEY = "pgl.toPc.sent";
interface Sent { memory?: string; keys?: Record<string, string> }
/** A short fingerprint to notice a change – not the key itself. */
const fingerprint = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };

/** Queues what changed since the last time; force = everything again (a new PC was linked). Returns how many changes were queued. */
export function sendAccountToPc(force = false): number {
  const acct = session();
  if (!acct?.cloud) return 0;
  const all = readJson<Record<string, Sent>>(SENT_KEY) ?? {};
  const mine: Sent = all[acct.user] ?? {};
  let n = 0;
  const m = memorySettings();
  if (m.path) {
    const tag = [m.path, m.enabled, m.writeEnabled, m.deleteEnabled, m.auto].join("|");
    if (force || mine.memory !== tag) {
      queueCloudOp("memory.configure", { path: m.path, enabled: m.enabled, writeEnabled: m.writeEnabled, deleteEnabled: m.deleteEnabled, auto: m.auto });
      mine.memory = tag; n++;
    }
  }
  const keys = { ...(mine.keys ?? {}) };
  const bundle = exportKeyBundle();
  for (const [provider, e] of Object.entries(bundle?.providers ?? {})) {
    if (!e) continue;
    const fp = fingerprint(provider + "\u0000" + e.key);
    if (!force && keys[provider] === fp) continue;
    queueCloudOp("ai.set", { provider, key: e.key, ...(provider !== "openrouter" ? { attested: e.attested } : {}) });
    keys[provider] = fp; n++;
  }
  mine.keys = keys;
  all[acct.user] = mine;
  writeJson(SENT_KEY, all);
  return n;
}

let timer: number | undefined;
/** Sends after a short pause whenever the keys or the memory settings change, the account changes, or the app starts. */
export function startAccountToPc() {
  const soon = (ms = 2500) => { window.clearTimeout(timer); timer = window.setTimeout(() => { try { sendAccountToPc(); } catch { /* the next change tries again */ } }, ms); };
  for (const ev of ["pgl-keys", "pgl-memory-config"]) window.addEventListener(ev, () => soon());
  window.addEventListener("pgl-account", () => soon(4000));
  soon(6000);
}
