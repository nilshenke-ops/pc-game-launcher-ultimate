// One way to run a deck key everywhere (deck page, mini deck on the home screen and in the overlay).
import { client } from "./rpc";
import { t } from "./i18n";
import { toast } from "./hooks";
import { commandFor, type DeckAction } from "./deck";
import { runQuickAction } from "../components/run-quick";
import type { QuickAction } from "./types";

/** Runs a key that talks to the PC (not folder/back/open – those only navigate). Errors are shown, never thrown. */
export async function runDeckAction(a: DeckAction, label: string) {
  try {
    if (a.type === "quick") {
      const q = (await client.call<{ actions: QuickAction[] }>("quick.list")).actions.find((x) => x.id === a.ref);
      if (!q) throw new Error(t("Diese Quick Action gibt es nicht mehr."));
      await runQuickAction(q);
      return;
    }
    // Asks first (restart/shutdown with 60 s to cancel); locking right away.
    if (a.type === "power") { const { powerFromDeck } = await import("../components/power-panel"); await powerFromDeck(a.ref as "lock" | "sleep" | "restart" | "shutdown"); return; }
    const c = commandFor(a);
    if (!c) return;
    const r = await client.call<{ ok?: boolean; message?: string }>(c.method, c.params);
    if (a.type === "launch") toast(r && r.ok === false ? r.message ?? t("Start fehlgeschlagen") : t("{name} wird gestartet", { name: label }), r && r.ok === false ? "error" : "success");
  } catch (e) { toast((e as Error).message, "error"); }
}
