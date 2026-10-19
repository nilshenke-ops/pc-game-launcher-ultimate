// Sends queued changes (lib/outbox.ts) to the PC after login, strictly in the order they were made.
// A change the PC refuses keeps its reason and stays in the list until it is retried or discarded.

import { client, RpcError } from "./rpc";
import { t } from "./i18n";
import { needsConfirm, outbox, prepareForPc, substituteIds, type OutboxEntry } from "./outbox";
import { uploadQueuedPluginFile } from "./plugins-offline";
import { syncPending } from "./pending-sounds";

let running = false;

export async function syncOutbox(opts: { retryFailed?: boolean } = {}): Promise<{ sent: number; failed: number; waiting?: number }> {
  if (running || client.status.auth !== "ok") return { sent: 0, failed: 0 };
  running = true;
  let sent = 0, failed = 0, waiting = 0;
  try {
    await syncPending(); // sounds first: queued hotkeys/actions may refer to them
    for (const e of [...outbox.list()]) {
      const entry = outbox.all().find((x) => x.id === e.id);
      if (!entry || (entry.error && !opts.retryFailed)) { if (entry?.error) failed++; continue; }
      // Plugins (new code, new rights) and very old changes go only after a confirmation; the others are sent meanwhile
      // (they do not depend on a plugin – plugin changes all wait together).
      if (needsConfirm(entry)) { waiting++; continue; }
      try {
        const result = await send(entry);
        outbox.remove(entry.id);
        sent++;
        // A new object got its real id from the PC: later queued changes that refer to it now use that id.
        const tempId = prepareForPc(entry.method, entry.params).tempId;
        const realId = (result as { id?: string } | null)?.id;
        if (tempId && realId) outbox.replaceAll(outbox.all().map((x) => ({ ...x, params: substituteIds(x.params, new Map([[tempId, realId]])) })));
      } catch (err) {
        const er = err as RpcError;
        if (er.code === "offline" || er.code === "timeout" || er.code === "needs-pc") {
          // No answer: maybe applied, maybe not. Sent again later with the same id – the PC applies it only once.
          outbox.countAttempt(entry.id);
          retryLater(outbox.all().find((x) => x.id === entry.id)?.attempts ?? 1);
          break;
        }
        outbox.setError(entry.id, er.message);
        failed++;
      }
    }
  } finally { running = false; }
  return { sent, failed, waiting };
}

async function send(e: OutboxEntry): Promise<unknown> {
  if (JSON.stringify(e.params).includes('"pending:')) throw new RpcError("pending-sound", t("Bezieht sich auf einen Sound, der noch nicht auf dem PC ist (siehe Soundboard → Wartet auf PC)."));
  if (e.method === "plugins.importFile") return uploadQueuedPluginFile(e);
  // Only the audio values changed offline are applied on top of the PC's current settings.
  if (e.method === "audio.save") {
    const st = await client.call<{ settings: Record<string, unknown> }>("audio.state");
    return client.call("audio.save", { ...st.settings, ...e.params }, { op: e.id });
  }
  return client.call(e.method, prepareForPc(e.method, e.params).params, { op: e.id });
}

let retryTimer: number | undefined;
/** Next try after 5 s, 10 s, 20 s … at most 5 min – while still connected (a new login retries at once anyway). */
function retryLater(attempts: number) {
  window.clearTimeout(retryTimer);
  const ms = Math.min(300_000, 5000 * 2 ** Math.max(0, attempts - 1));
  retryTimer = window.setTimeout(() => { if (client.status.auth === "ok") void syncOutbox(); }, ms);
}

let started = false;
export function startOutboxSync(onDone: (r: { sent: number; failed: number }) => void) {
  if (started) return;
  started = true;
  const run = () => syncOutbox().then((r) => { if (r.sent || r.failed || r.waiting) onDone(r); });
  client.on("authenticated", run);
  if (client.status.auth === "ok") run();
}

export const syncMessage = (r: { sent: number; failed: number; waiting?: number }) =>
  r.waiting && !r.sent && !r.failed ? t("{n} Änderungen warten auf deine Bestätigung – unter „Wartende Änderungen“ ansehen", { n: r.waiting })
  : r.failed ? t("{s} Änderungen übertragen, {f} vom PC abgelehnt – Details unter „Wartende Änderungen“", { s: r.sent, f: r.failed })
    : t("{s} offline gemachte Änderungen auf den PC übertragen", { s: r.sent });
