import { BarChart3, History as HistoryIcon, Trash2, XCircle } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { dateTime, duration, relTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Loadable, Meter, PageHead, Switch } from "../components/ui";

interface HistoryData {
  enabled: boolean;
  sessions: { itemId: string; name: string; startedAt: string; endedAt?: string; minutes: number }[];
  launches: { itemId: string; name: string; at: string; ok: boolean; error?: string; by?: string }[];
  stats: { itemId: string; name: string; sessions: number; totalMinutes: number; lastPlayed: string }[];
  launchStats: { itemId: string; name: string; launches: number; failures: number }[];
  failures: { name: string; at: string; error?: string }[];
}

export default function History() {
  const q = useRpc<HistoryData>("history.get", {}, ["history", "settings"]);
  const conn = useConn();
  const canManage = conn.me?.permissions.includes("manage");
  const d = q.data;
  const max = Math.max(1, ...(d?.stats.map((s) => s.totalMinutes) ?? [1]));
  const clear = async () => {
    if (!(await confirmDialog(t("Verlauf löschen?"), t("Alle Sitzungen und Startprotokolle werden unwiderruflich gelöscht."), { danger: true, ok: t("Löschen") }))) return;
    client.call("history.clear").then(() => toast(t("Verlauf gelöscht"), "success")).catch((e) => toast(e.message, "error"));
  };
  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Gaming-Verlauf")} text={t("Lokale Statistik – bleibt auf deinem PC und wird nirgendwohin übertragen.")}
        actions={canManage && <Button variant="danger" icon={<Trash2 size={16} />} onClick={clear}>{t("Verlauf löschen")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            <Card className="flat">
              <Switch checked={d.enabled} disabled={!canManage} onChange={(v) => client.call("settings.save", { historyEnabled: v })} label={t("Spielzeit und Starts aufzeichnen")} hint={t("Aus = es werden keine neuen Daten erfasst.")} />
            </Card>
            {!d.enabled && <Banner kind="info">{t("Aufzeichnung ist ausgeschaltet. Bereits erfasste Daten bleiben bis zum Löschen sichtbar.")}</Banner>}
            <div className="grid-2">
              <Card title={t("Meistgespielt")} icon={<BarChart3 size={18} />}>
                {d.stats.length === 0 ? <Empty icon={<BarChart3 size={26} />} title={t("Noch keine Sitzungen erfasst")} text={t("Sitzungen werden erkannt, sobald ein Spiel aus der Bibliothek läuft.")} /> : (
                  <div className="stack">
                    {d.stats.slice(0, 10).map((s) => (
                      <div key={s.itemId} className="stack-sm">
                        <div className="row between small"><b className="ellipsis">{s.name}</b><span className="muted">{duration(s.totalMinutes)} · {t("{n} Sitzungen", { n: s.sessions })}</span></div>
                        <Meter value={s.totalMinutes} max={max} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title={t("Häufig gestartet")} icon={<HistoryIcon size={18} />}>
                {d.launchStats.length === 0 ? <p className="muted small">{t("Noch keine Starts erfasst.")}</p> : (
                  <div className="list">
                    {d.launchStats.slice(0, 10).map((s) => (
                      <div key={s.itemId} className="list-item"><div className="grow title small ellipsis">{s.name}</div><span className="badge">{t("{n}× gestartet", { n: s.launches })}</span>{s.failures > 0 && <span className="badge error">{t("{n} Fehler", { n: s.failures })}</span>}</div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <Card title={t("Letzte Sitzungen")}>
              {d.sessions.length === 0 ? <p className="muted small">{t("Keine Sitzungen.")}</p> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>{t("Spiel")}</th><th>{t("Start")}</th><th>{t("Dauer")}</th></tr></thead>
                  <tbody>{d.sessions.slice(0, 30).map((s, i) => <tr key={i}><td>{s.name}</td><td>{dateTime(s.startedAt)}</td><td>{s.endedAt ? duration(s.minutes) : <span className="badge ok">{t("läuft")}</span>}</td></tr>)}</tbody>
                </table></div>
              )}
            </Card>
            {d.failures.length > 0 && (
              <Card title={t("Letzte Startfehler")} icon={<XCircle size={18} />}>
                <div className="list">{d.failures.map((f, i) => <div key={i} className="list-item"><span className="dot error" /><div className="grow"><div className="title small">{f.name}</div><div className="sub">{f.error} · {relTime(f.at)}</div></div></div>)}</div>
              </Card>
            )}
          </div>
        )}
      </Loadable>
    </>
  );
}
