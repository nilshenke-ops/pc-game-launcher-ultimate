import { Link } from "react-router-dom";
import { AlertTriangle, BellOff, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useEvent, useRpc, toast } from "../lib/hooks";
import { relTime } from "../lib/format";
import type { Notification, Settings } from "../lib/types";
import { Button, Card, Empty, Loadable, PageHead } from "../components/ui";

export default function Notifications() {
  const q = useRpc<{ items: Notification[] }>("notifications.list", {}, ["notifications"]);
  const s = useRpc<{ settings: Settings }>("settings.get", {}, ["settings"]);
  useEvent("notification", q.reload);
  const muted = s.data?.settings.mutedNotificationKeys ?? [];
  const mute = (key: string) => client.call("settings.save", { mutedNotificationKeys: [...new Set([...muted, key])] }).then(() => toast(t("Diese Art von Meldung wird nicht mehr angezeigt (außer Fehler)."), "info")).catch((e) => toast(e.message, "error"));
  const icon = (sev: string) => sev === "error" ? <XCircle size={20} color="var(--danger)" /> : sev === "warning" ? <AlertTriangle size={20} color="var(--warning)" /> : sev === "success" ? <CheckCircle2 size={20} color="var(--success)" /> : <Info size={20} color="var(--primary)" />;

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Benachrichtigungen")} text={t("Echte Ereignisse vom PC, nach Wichtigkeit sortiert. Wiederholungen werden zusammengefasst.")}
        actions={<Button onClick={() => client.call("notifications.dismissAll")} disabled={!q.data?.items.length}>{t("Alle schließen")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        <Card>
          {(q.data?.items.length ?? 0) === 0 ? <Empty icon={<CheckCircle2 size={28} />} title={t("Keine offenen Benachrichtigungen")} /> : (
            <div className="list">
              {q.data!.items.map((n) => (
                <div key={n.id} className="list-item" style={{ alignItems: "flex-start" }}>
                  {icon(n.severity)}
                  <div className="grow">
                    <div className="title">{n.title}{n.count > 1 && <span className="badge" style={{ marginLeft: 6 }}>{n.count}×</span>}</div>
                    {n.message && <div className="sub" style={{ whiteSpace: "pre-wrap" }}>{n.message}</div>}
                    <div className="tiny muted" style={{ marginTop: 4 }}>{relTime(n.at)}{n.link && <> · <Link to={n.link}>{t("Öffnen")}</Link></>}</div>
                  </div>
                  {n.severity !== "error" && <Button size="sm" variant="ghost" icon={<BellOff size={15} />} onClick={() => mute(n.key)} aria-label={t("Nicht mehr anzeigen")} />}
                  <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => client.call("notifications.dismiss", { id: n.id })} aria-label={t("Schließen")} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </Loadable>
    </>
  );
}
