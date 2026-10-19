import { useEffect, useRef, useState } from "react";
import { BarChart3, Download, History as HistoryIcon, Image as ImageIcon, Pencil, Trash2, XCircle } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { dateTime, duration, relTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Meter, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { compute, draw, toCsv, type CardOptions, type Period } from "../lib/stats-card";

interface SessionPerf { samples: number; cpuAvg?: number; cpuMax?: number; ramAvg?: number; gpuAvg?: number; gpuMax?: number }

const pct = (v?: number) => (v == null ? "–" : `${Math.round(v)} %`);

interface HistoryData {
  enabled: boolean;
  sessions: { itemId: string; name: string; startedAt: string; endedAt?: string; minutes: number; note?: string | null; perf?: SessionPerf | null }[];
  launches: { itemId: string; name: string; at: string; ok: boolean; error?: string; by?: string }[];
  stats: { itemId: string; name: string; sessions: number; totalMinutes: number; lastPlayed: string }[];
  launchStats: { itemId: string; name: string; launches: number; failures: number }[];
  failures: { name: string; at: string; error?: string }[];
}

export default function History() {
  const q = useRpc<HistoryData>("history.get", {}, ["history", "settings"]);
  const canManage = useCan("manage");
  const [card, setCard] = useState(false);
  const d = q.data;
  const max = Math.max(1, ...(d?.stats.map((s) => s.totalMinutes) ?? [1]));
  const clear = async () => {
    if (!(await confirmDialog(t("Verlauf löschen?"), t("Alle Sitzungen und Startprotokolle werden unwiderruflich gelöscht."), { danger: true, ok: t("Löschen") }))) return;
    client.call("history.clear").then(() => toast(t("Verlauf gelöscht"), "success")).catch((e) => toast(e.message, "error"));
  };
  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Gaming-Verlauf")} text={t("Lokale Statistik – bleibt auf deinem PC und wird nirgendwohin übertragen.")}
        actions={<>
          <Button icon={<ImageIcon size={16} />} disabled={!d?.sessions.length} onClick={() => setCard(true)}>{t("Statistik-Karte")}</Button>
          {canManage && <Button variant="danger" icon={<Trash2 size={16} />} onClick={clear}>{t("Verlauf löschen")}</Button>}
        </>} />
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
              {d.sessions.length === 0 ? <p className="muted small">{t("Keine Sitzungen.")}</p> : (<>
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>{t("Spiel")}</th><th>{t("Start")}</th><th>{t("Dauer")}</th><th title={t("Mittel / Spitze, gemessen während des Spiels")}>{t("CPU")}</th><th>{t("GPU")}</th><th>{t("RAM")}</th><th>{t("Notiz")}</th></tr></thead>
                  <tbody>{d.sessions.slice(0, 30).map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td><td>{dateTime(s.startedAt)}</td><td>{s.endedAt ? duration(s.minutes) : <span className="badge ok">{t("läuft")}</span>}</td>
                      <td>{s.perf ? `${pct(s.perf.cpuAvg)} / ${pct(s.perf.cpuMax)}` : "–"}</td>
                      <td>{s.perf ? `${pct(s.perf.gpuAvg)} / ${pct(s.perf.gpuMax)}` : "–"}</td>
                      <td>{s.perf ? pct(s.perf.ramAvg) : "–"}</td>
                      <td style={{ minWidth: 160 }}>
                        <span className="small">{s.note ?? ""}</span>{" "}
                        {canManage && <Button size="sm" variant="ghost" aria-label={t("Notiz bearbeiten")} icon={<Pencil size={13} />} onClick={async () => {
                          const note = window.prompt(t("Notiz zur Sitzung ({n}, {d})", { n: s.name, d: dateTime(s.startedAt) }), s.note ?? "");
                          if (note == null) return;
                          client.call("history.setNote", { itemId: s.itemId, startedAt: s.startedAt, note }).then(() => toast(t("Notiz gespeichert"), "success")).catch((e) => toast((e as Error).message, "error"));
                        }} />}
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
                <p className="tiny muted">{t("CPU/GPU: Mittel / Spitze, gemessen alle 10 s während des Spiels (abschaltbar unter Einstellungen → Datenschutz). FPS misst Windows ohne Overlay nicht – daher keine FPS-Werte.")}</p>
              </>)}
            </Card>
            {d.failures.length > 0 && (
              <Card title={t("Letzte Startfehler")} icon={<XCircle size={18} />}>
                <div className="list">{d.failures.map((f, i) => <div key={i} className="list-item"><span className="dot error" /><div className="grow"><div className="title small">{f.name}</div><div className="sub">{f.error} · {relTime(f.at)}</div></div></div>)}</div>
              </Card>
            )}
          </div>
        )}
      </Loadable>
      {card && d && <StatsCardDialog sessions={d.sessions} onClose={() => setCard(false)} />}
    </>
  );
}

function StatsCardDialog({ sessions, onClose }: { sessions: HistoryData["sessions"]; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("month");
  const [o, setO] = useState<CardOptions>({ top: true, totals: true, longest: true, perf: true, compare: true, milestones: true, title: t("Meine Gaming-Statistik"), layout: "poster" });
  const quests = useRpc<{ level: number; achievements: { unlocked: boolean }[] }>("quests.get", {}, ["quests"]);
  const ref = useRef<HTMLCanvasElement>(null);
  const data = compute(sessions, period);
  const periodText = data.from ? `${data.from.toLocaleDateString()} – ${data.to.toLocaleDateString()}` : t("Gesamter Verlauf");
  const milestone = quests.data ? t("Level {l} · {n} Erfolge freigeschaltet", { l: quests.data.level, n: quests.data.achievements.filter((a) => a.unlocked).length }) : undefined;
  useEffect(() => { if (ref.current) draw(ref.current, data, o, periodText, milestone); });
  const set = (x: Partial<CardOptions>) => setO((v) => ({ ...v, ...x }));
  const save = (blob: Blob | null, name: string) => {
    if (!blob) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Modal title={t("Statistik-Karte")} onClose={onClose} wide footer={<>
      <Button icon={<Download size={15} />} onClick={() => save(new Blob([toCsv(data)], { type: "text/csv" }), `gaming-statistik-${stamp}.csv`)}>{t("Daten (CSV)")}</Button>
      <Button icon={<Download size={15} />} onClick={() => save(new Blob([JSON.stringify({ format: "nexus-stats", period, ...data }, null, 2)], { type: "application/json" }), `gaming-statistik-${stamp}.json`)}>{t("Daten (JSON)")}</Button>
      <Button variant="primary" icon={<ImageIcon size={15} />} onClick={() => ref.current?.toBlob((b) => save(b, `gaming-statistik-${stamp}.png`), "image/png")}>{t("Als Bild speichern")}</Button>
    </>}>
      <div className="stats-card-editor">
        <div className="stack-sm">
          <Segmented value={period} onChange={setPeriod} label={t("Zeitraum")} options={[{ value: "week", label: t("7 Tage") }, { value: "month", label: t("Monat") }, { value: "year", label: t("Jahr") }, { value: "all", label: t("Alles") }]} />
          <Segmented value={o.layout} onChange={(layout) => set({ layout })} label={t("Format")} options={[{ value: "poster", label: t("Hochformat") }, { value: "wide", label: t("Querformat") }]} />
          <Field label={t("Titel")}><input className="input" value={o.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} /></Field>
          {([["totals", t("Spielzeit, Sitzungen, Spiele, Tage")], ["compare", t("Vergleich mit dem vorherigen Zeitraum")], ["top", t("Meistgespielte Spiele")], ["longest", t("Längste Sitzung")], ["perf", t("Auslastung beim Spielen (falls gemessen)")], ["milestones", t("Level und Erfolge (GameQuest)")]] as [keyof CardOptions, string][]).map(([k, label]) => (
            <label key={k} className="checkbox small"><input type="checkbox" checked={!!o[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<CardOptions>)} />{label}</label>
          ))}
          <p className="tiny muted">{t("Die Karte wird nur auf diesem Gerät erstellt und nirgends veröffentlicht. Fehlende Werte (z. B. keine Leistungsmessung) werden weggelassen statt geschätzt.")}</p>
        </div>
        <canvas ref={ref} className="stats-card-canvas" role="img" aria-label={t("Vorschau der Statistik-Karte")} />
      </div>
    </Modal>
  );
}
