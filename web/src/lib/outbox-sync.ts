// Sends queued changes (lib/outbox.ts) to the PC after login, strictly in the order they were made.
// A change the PC refuses keeps its reason and stays in the list until it is retried or discarded.

import { client, RpcError } from "./rpc";
import { t } from "./i18n";
import { outbox, prepareForPc, substituteIds, type OutboxEntry } from "./outbox";
import { uploadQueuedPluginFile } from "./plugins-offline";

let running = false;

export async function syncOutbox(opts: { retryFailed?: boolean } = {}): Promise<{ sent: number; failed: number }> {
  if (running || client.status.auth !== "ok") return { sent: 0, failed: 0 };
  running = true;
  let sent = 0, failed = 0;
  try {
    for (const e of [...outbox.list()]) {
      const entry = outbox.all().find((x) => x.id === e.id);
      if (!entry || (entry.error && !opts.retryFailed)) { if (entry?.error) failed++; continue; }
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
        if (er.code === "offline" || er.code === "timeout" || er.code === "needs-pc") break; // connection gone: try again later
        outbox.setError(entry.id, er.message);
        failed++;
      }
    }
  } finally { running = false; }
  return { sent, failed };
}

async function send(e: OutboxEntry): Promise<unknown> {
  if (e.method === "plugins.importFile") return uploadQueuedPluginFile(e);
  return client.call(e.method, prepareForPc(e.method, e.params).params);
}

let started = false;
export function startOutboxSync(onDone: (r: { sent: number; failed: number }) => void) {
  if (started) return;
  started = true;
  const run = () => syncOutbox().then((r) => { if (r.sent || r.failed) onDone(r); });
  client.on("authenticated", run);
  if (client.status.auth === "ok") run();
}

export const syncMessage = (r: { sent: number; failed: number }) =>
  r.failed ? t("{s} Änderungen übertragen, {f} vom PC abgelehnt – Details unter „Wartende Änderungen“", { s: r.sent, f: r.failed })
    : t("{s} offline gemachte Änderungen auf den PC übertragen", { s: r.sent });
