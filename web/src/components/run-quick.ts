import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import type { QuickAction } from "../lib/types";
import { confirmDialog } from "./ui";

/** Runs a quick action everywhere the same way: asks first if required and reports failed steps instead of "done". */
export async function runQuickAction(a: QuickAction) {
  if (a.requireConfirm && !(await confirmDialog(t("„{n}“ ausführen?", { n: a.name }), t("Diese Quick Action ist als bestätigungspflichtig markiert.")))) return;
  bumpUsage("qa:" + a.id);
  try {
    const r = await client.call<{ results: string[]; background?: boolean }>("quick.run", { id: a.id });
    if (r.background) { toast(t("„{n}“ läuft – Fortschritt und Abbrechen unter Quick Actions", { n: a.name }), "info"); return; }
    const failed = r.results.filter((x) => x.startsWith("Fehler"));
    toast(failed.length ? failed.join(" · ") : t("„{n}“ ausgeführt", { n: a.name }), failed.length ? "warning" : "success");
  } catch (e) { toast((e as Error).message, "error"); }
}
