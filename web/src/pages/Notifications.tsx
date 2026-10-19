import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BellOff, CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useCan, useConn, useEvent, useRpc, toast } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import type { Notification, Settings } from "../lib/types";
import { Button, Card, confirmDialog, Empty, Loadable, PageHead, Segmented } from "../components/ui";

const CATEGORIES = ["update", "launch", "automation", "gamemode", "plugin", "quest", "deal", "recording", "assistant", "system"] as const;
const categoryLabel = (c: string) => ({
  update: t("Updates"), launch: t("Starts"), automation: t("Automatisierungen"), gamemode: t("Spielmodus"), plugin: t("Plugins"), quest: t("GameQuest"),
  deal: t("Deal Radar"), recording: t("Aufnahme"), assistant: t("Assistent"), system: t("System"),
} as Record<string, string>)[c] ?? c;

export default function Notifications() {
  const [view, setView] = useState<"open" | "history">("open");
  const [cat, setCat] = useState<string | null>(null);
  const conn = useConn();
  const canManage = useCan("manage");
  const q = useRpc<{ items: Notification[]; unread: number }>("notifications.list", { history: view === "history", category: cat }, ["notifications"]);
  const s = useRpc<{ settings: Settings }>("settings.get", {}, ["settings"]);
  useEvent("notification", q.reload);
  const muted = s.data?.settings.mutedNotificationKeys ?? [];
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  // Opening the page counts as reading (the dots stay visible until the next visit).
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (conn.auth !== "ok" || unread === 0) return;
    const id = window.setTimeout(() => client.call("notifications.markRead", {}).catch(() => {}), 1500);
    return () => window.clearTimeout(id);
  }, [conn.auth, unread]);
  useEffect(() => { if (items.length) setSeen((x) => new Set([...x, ...items.filter((n) => !n.read).map((n) => n.id)])); }, [items]);
  const mute = (key: string) => client.call("settings.save", { mutedNotificationKeys: [...new Set([...muted, key])] }).then(() => toast(t("Diese Art von Meldung wird nicht mehr angezeigt (außer Fehler)."), "info")).catch((e) => toast(e.message, "error"));
  const clearHistory = async () => {
    if (!(await confirmDialog(t("Verlauf löschen?"), t("Alle geschlossenen Benachrichtigungen werden gelöscht. Offene bleiben."), { danger: true, ok: t("Löschen") }))) return;
    client.call("notifications.clearHistory").then(() => toast(t("Verlauf gelöscht"), "success"), (e: Error) => toast(e.message, "error"));
  };
  const icon = (sev: string) => sev === "error" ? <XCircle size={20} color="var(--danger)" /> : sev === "warning" ? <AlertTriangle size={20} color="var(--warning)" /> : sev === "success" ? <CheckCircle2 size={20} color="var(--success)" /> : <Info size={20} color="var(--primary)" />;
  const present = new Set(items.map((n) => n.category));

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Benachrichtigungen")} text={t("Echte Ereignisse vom PC, nach Wichtigkeit sortiert. Wiederholungen werden zusammengefasst; der Verlauf bleibt 30 Tage auf dem PC.")}
        actions={view === "open"
          ? <Button onClick={() => client.call("notifications.dismissAll")} disabled={!items.length}>{t("Alle schließen")}</Button>
          : canManage && <Button variant="danger" icon={<Trash2 size={16} />} onClick={clearHistory}>{t("Verlauf löschen")}</Button>} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Segmented value={view} onChange={(v) => setView(v)} label={t("Ansicht")} options={[{ value: "open", label: t("Offen") }, { value: "history", label: t("Verlauf") }]} />
        <div className="chips" role="radiogroup" aria-label={t("Kategorie")}>
          <button type="button" role="radio" aria-checked={cat == null} className={`chip ${cat == null ? "on" : ""}`} onClick={() => setCat(null)}>{t("Alle")}</button>
          {CATEGORIES.filter((c) => present.has(c) || c === cat).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{categoryLabel(c)}</button>
          ))}
        </div>
      </div>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        <Card>
          {items.length === 0 ? <Empty icon={<CheckCircle2 size={28} />} title={view === "open" ? t("Keine offenen Benachrichtigungen") : t("Kein Verlauf")} /> : (
            <div className="list">
              {items.map((n) => (
                <div key={n.id} className={`list-item ntf ${n.dismissed ? "closed" : ""}`} style={{ alignItems: "flex-start" }}>
                  {icon(n.severity)}
                  <div className="grow">
                    <div className="title">
                      {(!n.read || seen.has(n.id)) && !n.dismissed && <span className="ntf-dot" aria-label={t("neu")} />}
                      {n.title}{n.count > 1 && <span className="badge" style={{ marginLeft: 6 }}>{n.count}×</span>}
                      <span className="badge" style={{ marginLeft: 6 }}>{categoryLabel(n.category)}</span>
                    </div>
                    {n.message && <div className="sub" style={{ whiteSpace: "pre-wrap" }}>{n.message}</div>}
                    <div className="tiny muted" style={{ marginTop: 4 }}>
                      <span title={dateTime(n.at)}>{relTime(n.at)}</span>{n.dismissed && ` · ${t("geschlossen")}`}{n.link && <> · <Link to={n.link}>{t("Öffnen")}</Link></>}
                    </div>
                  </div>
                  {n.severity !== "error" && <Button size="sm" variant="ghost" icon={<BellOff size={15} />} onClick={() => mute(n.key)} aria-label={t("Nicht mehr anzeigen")} />}
                  {!n.dismissed && <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => client.call("notifications.dismiss", { id: n.id })} aria-label={t("Schließen")} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Loadable>
    </>
  );
}
