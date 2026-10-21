// Error reports per game. The PC makes one after a crash it can prove (Windows wrote a crash report for the game's
// program) or a very short session, or on request. Only real data; possible causes are always marked as guesses.
import { useMemo, useState } from "react";
import { Bug, Download, FilePlus2, GitCompare, Search, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";

interface WerCrash { eventType: string; app: string; appVersion?: string | null; module?: string | null; moduleVersion?: string | null; exceptionCode?: string | null; at?: string | null; appPath?: string | null }
export interface CrashReport {
  id: string; itemId: string; game: string; at: string; trigger: "crash" | "short" | "manual"; sessionStart?: string | null; sessionEnd?: string | null;
  gameVersion?: string | null; lastLaunch?: string | null; crashes?: WerCrash[]; system?: Record<string, string>; profile?: string | null; changes?: string[]; hints?: { text: string; because: string }[];
}

const TRIGGER: Record<string, string> = { crash: "Absturz erkannt", short: "Sehr kurze Sitzung", manual: "Auf Anforderung" };
const minutes = (r: CrashReport) => (r.sessionStart && r.sessionEnd ? Math.max(0, Math.round((Date.parse(r.sessionEnd) - Date.parse(r.sessionStart)) / 60000)) : null);

/** The facts used to compare two reports side by side. */
export function compareRows(a: CrashReport, b: CrashReport) {
  const ca = a.crashes?.[0], cb = b.crashes?.[0];
  const rows: [string, string | null | undefined, string | null | undefined][] = [
    [t("Anlass"), t(TRIGGER[a.trigger]), t(TRIGGER[b.trigger])],
    [t("Zeitpunkt"), dateTime(a.at), dateTime(b.at)],
    [t("Spielversion"), a.gameVersion, b.gameVersion],
    [t("Fehlerbaustein"), ca?.module, cb?.module],
    [t("Ausnahmecode"), ca?.exceptionCode, cb?.exceptionCode],
    [t("Art"), ca?.eventType, cb?.eventType],
    [t("Grafikkarte"), a.system?.["Grafikkarte"], b.system?.["Grafikkarte"]],
    [t("Gaming-Profil"), a.profile, b.profile],
    [t("Sitzungsdauer"), minutes(a) != null ? t("{n} min", { n: minutes(a)! }) : null, minutes(b) != null ? t("{n} min", { n: minutes(b)! }) : null],
  ];
  return rows.map(([label, x, y]) => ({ label, a: x ?? "–", b: y ?? "–", same: (x ?? "–") === (y ?? "–") }));
}

export default function CrashesPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<{ reports: CrashReport[] }>("crash.list", {}, ["crashreports"]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [creating, setCreating] = useState(false);
  const reports = q.data?.reports ?? [];
  const shown = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? reports.filter((r) => `${r.game} ${r.crashes?.map((c) => `${c.module} ${c.exceptionCode} ${c.app}`).join(" ")} ${r.gameVersion}`.toLowerCase().includes(s)) : reports;
  }, [reports, query]);
  const current = reports.find((r) => r.id === open);
  const pair = pick.map((id) => reports.find((r) => r.id === id)).filter((r): r is CrashReport => !!r);

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Fehlerberichte")}
        text={t("Nach einem Absturz oder einem sehr kurzen Spiel legt der PC einen Bericht an: Windows-Absturzbericht, Spielversion, System, Gaming-Profil und Änderungen kurz davor. Mögliche Ursachen sind immer nur Vermutungen – mit Begründung.")}
        actions={canManage && <Button variant="primary" icon={<FilePlus2 size={16} />} disabled={!online} onClick={() => setCreating(true)}>{t("Bericht erstellen")}</Button>} />
      {!online && <div style={{ marginBottom: 14 }}><Banner kind="info">{t("Fehlerberichte liegen auf dem PC – sie erscheinen, sobald er verbunden ist.")}</Banner></div>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {reports.length === 0 ? (
          <Card><Empty icon={<Bug size={28} />} title={t("Keine Fehlerberichte")} text={t("Gut so. Stürzt ein Spiel ab, erscheint hier automatisch ein Bericht – du bekommst dazu eine Benachrichtigung.")} /></Card>
        ) : (
          <div className="stack">
            <div className="row">
              <div className="input-icon grow"><Search size={16} /><input className="input" placeholder={t("Spiel, Fehlerbaustein oder Code suchen")} aria-label={t("Fehlerberichte durchsuchen")} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
              <Button icon={<GitCompare size={16} />} disabled={pick.length !== 2} onClick={() => setCompare(true)}>{t("Vergleichen ({n}/2)", { n: pick.length })}</Button>
            </div>
            {shown.length === 0 && <p className="small muted">{t("Nichts gefunden.")}</p>}
            {shown.map((r) => {
              const c = r.crashes?.[0];
              const picked = pick.includes(r.id);
              return (
                <Card key={r.id} title={r.game} icon={<Bug size={18} />} meta={relTime(r.at)}
                  actions={<div className="row" style={{ gap: 6 }}>
                    <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={picked} disabled={!picked && pick.length >= 2} onChange={() => setPick(picked ? pick.filter((x) => x !== r.id) : [...pick, r.id])} />{t("Vergleichen")}</label>
                    <Button size="sm" onClick={() => setOpen(r.id)}>{t("Details")}</Button>
                  </div>}>
                  <div className="row small" style={{ gap: 6 }}>
                    <span className={`badge ${r.trigger === "crash" ? "error" : r.trigger === "short" ? "warn" : ""}`}>{t(TRIGGER[r.trigger])}</span>
                    {c?.module && <span className="badge">{t("Baustein")}: {c.module}</span>}
                    {c?.exceptionCode && <span className="badge">{t("Code")} {c.exceptionCode}</span>}
                    {r.gameVersion && <span className="badge">{r.gameVersion}</span>}
                  </div>
                  {(r.hints?.length ?? 0) > 0 && <p className="small muted" style={{ margin: "8px 0 0" }}>{t("Vermutung")}: {r.hints![0].text}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </Loadable>
      {current && <ReportDetail r={current} canManage={canManage} online={online} onClose={() => setOpen(null)} onRemoved={() => { setOpen(null); setPick(pick.filter((x) => x !== current.id)); q.reload(); }} />}
      {compare && pair.length === 2 && <CompareModal a={pair[0]} b={pair[1]} onClose={() => setCompare(false)} />}
      {creating && <CreateReport onClose={(id) => { setCreating(false); q.reload(); if (id) setOpen(id); }} />}
    </>
  );
}

function ReportDetail({ r, canManage, online, onClose, onRemoved }: { r: CrashReport; canManage: boolean; online: boolean; onClose: () => void; onRemoved: () => void }) {
  const [redact, setRedact] = useState(true);
  const [busy, setBusy] = useState(false);
  const exportText = async () => {
    setBusy(true);
    try {
      const { text } = await client.call<{ text: string }>("crash.export", { id: r.id, redact });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      a.download = `fehlerbericht-${r.game.replace(/[^\w-]+/g, "-").toLowerCase()}-${r.at.slice(0, 10)}.txt`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Bericht löschen?"), t("Der Fehlerbericht wird vom PC gelöscht. Der Windows-Absturzbericht selbst bleibt.") , { danger: true, ok: t("Löschen") }))) return;
    try { await client.call("crash.remove", { id: r.id }); toast(t("Gelöscht"), "success"); onRemoved(); } catch (e) { toast((e as Error).message, "error"); }
  };
  const mins = minutes(r);
  return (
    <Modal wide title={`${r.game} – ${dateTime(r.at)}`} onClose={onClose}
      footer={<>
        {canManage && <Button variant="danger" icon={<Trash2 size={16} />} style={{ marginRight: "auto" }} disabled={!online} onClick={() => void remove()}>{t("Löschen")}</Button>}
        <Button icon={<Download size={16} />} busy={busy} disabled={!online} onClick={() => void exportText()}>{t("Als Text exportieren")}</Button>
        <Button onClick={onClose}>{t("Schließen")}</Button>
      </>}>
      <div className="stack">
        <div className="small stack-sm">
          <div><b>{t("Anlass")}:</b> {t(TRIGGER[r.trigger])}</div>
          {r.sessionStart && <div><b>{t("Sitzung")}:</b> {dateTime(r.sessionStart)}{mins != null && ` · ${t("{n} min", { n: mins })}`}</div>}
          {r.gameVersion && <div><b>{t("Spielversion")}:</b> {r.gameVersion}</div>}
          {r.lastLaunch && <div><b>{t("Letzter Start")}:</b> {r.lastLaunch}</div>}
          {r.profile && <div><b>{t("Gaming-Profil")}:</b> {r.profile}</div>}
        </div>
        <Card title={t("Windows-Absturzbericht")} className="flat">
          {(r.crashes?.length ?? 0) === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Kein Windows-Absturzbericht für dieses Spiel in diesem Zeitraum gefunden.")}</p>
            : r.crashes!.map((c, i) => (
              <div key={i} className="small" style={{ marginBottom: 6 }}>
                <b>{c.eventType}</b> · {c.app}{c.appVersion && ` ${c.appVersion}`}{c.at && ` · ${dateTime(c.at)}`}
                <div className="muted">{t("Fehlerbaustein")}: {c.module ?? "?"}{c.moduleVersion && ` ${c.moduleVersion}`} · {t("Ausnahmecode")}: {c.exceptionCode ?? "?"}</div>
              </div>
            ))}
        </Card>
        {(r.hints?.length ?? 0) > 0 && (
          <Card title={t("Mögliche Ursachen (Vermutungen)")} className="flat">
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {r.hints!.map((h, i) => <li key={i} style={{ marginBottom: 6 }}><span className="badge warn">{t("Vermutung")}</span> {h.text}<div className="tiny muted">{t("Weil")}: {h.because}</div></li>)}
            </ul>
          </Card>
        )}
        {(r.changes?.length ?? 0) > 0 && (
          <Card title={t("Änderungen kurz davor")} className="flat"><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{r.changes!.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
        )}
        {r.system && Object.keys(r.system).length > 0 && (
          <Card title={t("System")} className="flat">
            <div className="small stack-sm">{Object.entries(r.system).map(([k, v]) => <div key={k}><b>{t(k)}:</b> {v}</div>)}</div>
          </Card>
        )}
        <Switch checked={redact} onChange={setRedact} label={t("Beim Export persönliche Daten entfernen")} hint={t("Ersetzt Benutzername, PC-Name und E-Mail-Adressen. Der Bericht wird nirgends hochgeladen – du entscheidest, wem du die Datei gibst.")} />
      </div>
    </Modal>
  );
}

function CompareModal({ a, b, onClose }: { a: CrashReport; b: CrashReport; onClose: () => void }) {
  const rows = compareRows(a, b);
  return (
    <Modal wide title={t("Berichte vergleichen")} onClose={onClose} footer={<Button onClick={onClose}>{t("Schließen")}</Button>}>
      <div className="table-wrap">
        <table className="table small">
          <thead><tr><th /><th>{a.game}</th><th>{b.game}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className={r.same ? "" : "diff-row"}><th>{r.label}</th><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="tiny muted">{t("Hervorgehoben: Werte, die sich unterscheiden. Gleicher Fehlerbaustein und Code in mehreren Berichten deuten auf dieselbe Ursache hin.")}</p>
    </Modal>
  );
}

function CreateReport({ onClose }: { onClose: (id?: string) => void }) {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const games = (lib.data?.items ?? []).filter((i) => i.kind !== "program").sort((x, y) => x.name.localeCompare(y.name));
  const [game, setGame] = useState("");
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try { const r = await client.call<CrashReport>("crash.create", { itemId: game }); toast(t("Bericht erstellt"), "success"); onClose(r.id); }
    catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  };
  return (
    <Modal title={t("Fehlerbericht erstellen")} onClose={() => onClose()}
      footer={<><Button variant="ghost" onClick={() => onClose()}>{t("Abbrechen")}</Button><Button variant="primary" busy={busy} disabled={!game} onClick={() => void make()}>{t("Erstellen")}</Button></>}>
      <div className="stack-sm">
        <Field label={t("Spiel")}>
          <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">{t("Spiel wählen …")}</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <p className="small muted" style={{ margin: 0 }}>{t("Der PC sammelt zur letzten Sitzung dieses Spiels die Windows-Absturzberichte, Spielversion, Systemdaten und Änderungen davor.")}</p>
      </div>
    </Modal>
  );
}
