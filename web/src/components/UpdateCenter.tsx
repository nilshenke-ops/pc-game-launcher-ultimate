import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Download, History as HistoryIcon, Monitor, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, Undo2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useEvent, useRpc, toast } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { compareVersions, isMobileDevice, loadHistory, loadLatest, verifySignature, WEB_VERSION, type Release, type ReleaseChanges } from "../lib/release";
import type { UpdateStatus } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Loadable, Modal } from "./ui";

const day = (d?: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString() : "");

export function useLatestRelease() {
  const [latest, setLatest] = useState<Release | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true); setError(null);
    loadLatest()
      .then(async (r) => { setLatest(r); setSigned(await verifySignature(r)); })
      .catch((e) => { setLatest(null); setError((e as Error).message); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  return { latest, error, signed, loading, reload: load };
}

export function ChangeList({ changes }: { changes?: ReleaseChanges }) {
  if (!changes) return null;
  const groups: [string, string[]][] = [[t("Neu"), changes.neu], [t("Verbessert"), changes.verbessert], [t("Behoben"), changes.behoben]];
  return (
    <div className="stack-sm">
      {groups.filter(([, l]) => l?.length).map(([title, list]) => (
        <div key={title}><b className="small">{title}</b><ul className="small" style={{ margin: "4px 0 0", paddingLeft: 20 }}>{list.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}

/** Newest published Windows version with direct download – works on any device, also without a connected PC. */
export function LatestRelease() {
  const { latest: r, error, signed, loading, reload } = useLatestRelease();
  const mobile = isMobileDevice();
  const [history, setHistory] = useState<Release[] | null>(null);
  return (
    <Card title={t("Neueste Version für Windows")} icon={<Download size={18} />} actions={<Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={reload}>{t("Aktualisieren")}</Button>}>
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : error || !r ? (
        <Banner kind="error" title={t("Neueste Version nicht verfügbar")}>{t("Die Versionsangaben konnten nicht geladen werden: {e}. Es wird kein Download angeboten, solange die Datei nicht bestätigt ist.", { e: error ?? "" })}</Banner>
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <b style={{ fontSize: "1.4rem" }}>v{r.version}</b>
            {r.date && <span className="badge">{t("vom {d}", { d: day(r.date) })}</span>}
            <span className="badge">{t("Stabil")}</span>
            {signed === true ? <span className="badge ok"><ShieldCheck size={12} /> {t("Signatur geprüft")}</span>
              : signed === false ? <span className="badge error"><ShieldAlert size={12} /> {t("Nicht signiert")}</span>
              : <span className="badge warn">{t("Signatur hier nicht prüfbar")}</span>}
          </div>
          <dl className="kv small">
            <dt>{t("Datei")}</dt><dd className="mono">{r.fileName || decodeURIComponent(new URL(r.url).pathname.split("/").pop() ?? "")}</dd>
            <dt>{t("Größe")}</dt><dd>{bytes(r.size)}</dd>
            <dt>{t("Quelle")}</dt><dd className="mono">{new URL(r.url).host}</dd>
            <dt>SHA-256</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{r.sha256}</dd>
          </dl>
          {mobile && (
            <Banner kind="info" title={t("Hinweis für Handy und Tablet")}>
              {t("Die Windows-Datei läuft nicht auf iPhone, iPad oder Android. Du kannst sie hier herunterladen und dann auf den PC bringen – z. B. über OneDrive/Google Drive/iCloud, per E-Mail an dich selbst, USB-Kabel oder den Netzwerkordner. Oder öffne diese Seite direkt am PC.")}
            </Banner>
          )}
          {signed === false && <Banner kind="warn">{t("Diese Datei ist nicht signiert. Der Begleiter installiert sie nicht automatisch.")}</Banner>}
          <div className="row">
            <a className="btn primary lg" style={{ whiteSpace: "normal", maxWidth: "100%", height: "auto", textAlign: "center" }} href={r.url} rel="noopener" download={r.fileName}><Download size={18} />{t("Neueste Version für Windows herunterladen")}</a>
            {r.zip && <a className="btn" href={r.zip.url} rel="noopener" download={r.zip.fileName}>{t("Als ZIP ({s})", { s: bytes(r.zip.size) })}</a>}
          </div>
          <p className="tiny muted">{t("Der Download kommt direkt von der oben genannten Quelle, ohne Anmeldung. Windows SmartScreen kann warnen, weil die EXE kein gekauftes Code-Zertifikat hat – Echtheit über Signatur und Prüfsumme oben.")}</p>
          {r.changes && <><b>{t("Was ist neu?")}</b><ChangeList changes={r.changes} /></>}
          <div>
            {history === null
              ? <Button size="sm" variant="ghost" icon={<HistoryIcon size={14} />} onClick={() => loadHistory().then(setHistory)}>{t("Versionsverlauf anzeigen")}</Button>
              : history.length === 0 ? <p className="small muted">{t("Kein Versionsverlauf veröffentlicht.")}</p>
              : <div className="stack">{history.map((h) => (
                  <details key={h.version} className="card" style={{ padding: 12 }}>
                    <summary><b>v{h.version}</b> <span className="small muted">{day(h.date)} · {bytes(h.size)}</span></summary>
                    <div style={{ marginTop: 8 }}><ChangeList changes={h.changes} /><a className="small" href={h.url} rel="noopener">{t("Diese Version herunterladen")}</a></div>
                  </details>
                ))}</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

const STATE: Record<string, [string, string]> = {
  idle: ["", "Noch nicht geprüft"], "no-source": ["warn", "Keine Quelle"], "up-to-date": ["ok", "Aktuell"], available: ["info", "Update verfügbar"],
  downloading: ["info", "Lädt …"], ready: ["info", "Bereit zur Installation"], error: ["error", "Fehler"],
};

/** Installed companion version and the update steps. Installing and rolling back only at the PC itself. */
export function PcUpdates() {
  const conn = useConn();
  const q = useRpc<UpdateStatus>("updates.status", {}, ["updates"]);
  const [progress, setProgress] = useState<{ done: number; total?: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEvent<{ done: number; total?: number }>("update.progress", setProgress);
  const local = !!conn.me?.isLocal;
  const act = async (m: string, label: string) => {
    setBusy(m);
    try {
      // The companion reports failed checks/downloads in the status (state "error") instead of throwing.
      const r = await client.call<{ state?: string; error?: string } | null>(m);
      if (r && (r.state === "error" || r.state === "no-source")) toast(r.error ?? t("Fehlgeschlagen"), "error"); else toast(label, "success");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null); setProgress(null); q.reload();
  };
  const install = async () => {
    if (await confirmDialog(t("Update jetzt installieren?"), t("Vorher wird ein Wiederherstellungspunkt angelegt. Der Begleiter wird beendet, ersetzt und neu gestartet. Einstellungen, Spiele, Profile und Sounds bleiben erhalten.")))
      act("updates.install", t("Update wird installiert – der Begleiter startet neu"));
  };
  const rollback = async () => {
    if (await confirmDialog(t("Vorherige Version wiederherstellen?"), t("Der Begleiter startet mit der vorherigen Version neu. Deine Daten bleiben erhalten.")))
      act("updates.rollback", t("Vorherige Version wird gestartet"));
  };
  const u = q.data;
  const [cls, label] = STATE[u?.state ?? ""] ?? ["", u?.state ?? ""];
  return (
    <Card title={t("Dein PC (Begleiter)")} icon={<Monitor size={18} />} meta={u ? `${t("Installiert")}: v${u.current}` : undefined}>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {u && (
          <div className="stack">
            <div className="row">
              <span className={`badge ${cls}`}>{t(label)}</span>
              {u.checkedAt && <span className="tiny muted">{t("Geprüft {d}", { d: dateTime(u.checkedAt) })}</span>}
              {u.source && <span className="tiny muted">{u.official ? t("Offizielle Quelle") : t("Eigene Quelle: {s}", { s: u.source })}</span>}
            </div>
            {u.error && <Banner kind="error">{u.error}</Banner>}
            {u.available && (
              <Banner kind="info" title={t("v{a} verfügbar – installiert ist v{c}", { a: u.available.version, c: u.current })}>
                <div className="stack-sm">
                  <span className="small">{[u.available.date && day(u.available.date), u.available.size && bytes(u.available.size), u.available.source].filter(Boolean).join(" · ")}
                    {u.available.signed ? ` · ${t("signiert")}` : ` · ${t("nicht signiert")}`}</span>
                  <ChangeList changes={u.available.changes} />
                </div>
              </Banner>
            )}
            {progress && <div className="progress-bar" role="progressbar" aria-valuenow={progress.total ? Math.round((progress.done / progress.total) * 100) : undefined}><i style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "30%" }} /></div>}
            <div className="row">
              <Button icon={<RefreshCw size={16} />} busy={busy === "updates.check"} onClick={() => act("updates.check", t("Prüfung abgeschlossen"))}>{t("Nach Updates suchen")}</Button>
              <Button icon={<Download size={16} />} disabled={!u.available || u.downloaded} busy={busy === "updates.download"} onClick={() => act("updates.download", t("Download abgeschlossen und geprüft"))}>{u.downloaded ? t("Heruntergeladen und geprüft") : t("Herunterladen")}</Button>
              <Button variant="primary" icon={<CheckCircle2 size={16} />} disabled={!u.downloaded || !u.canInstall || !local} onClick={install}>{t("Jetzt aktualisieren")}</Button>
              {u.canRollback && <Button variant="ghost" icon={<Undo2 size={16} />} disabled={!local} onClick={rollback}>{t("Vorherige Version")}</Button>}
            </div>
            {u.guard && (
              <p className="tiny muted">
                {u.guard.stable ? t("Update-Wächter: Diese Version läuft stabil.")
                  : u.guard.lastStable && u.guard.lastStable !== u.current ? t("Update-Wächter: Diese Version wird noch beobachtet – stürzt sie zweimal kurz nach dem Start ab, kehrt der Begleiter automatisch zu v{v} zurück.", { v: u.guard.lastStable })
                  : t("Update-Wächter: Diese Version wird noch beobachtet. Eine stabile Vorversion ist nicht bekannt – automatisch zurückgesetzt wird deshalb nicht.")}
                {u.guard.failures > 0 && " " + t("Bisher {n} Absturz/Abstürze.", { n: u.guard.failures })}
              </p>
            )}
            {!local && <p className="tiny muted">{t("Installieren und Zurücksetzen nur direkt am PC (Sicherheit). Prüfen und Herunterladen geht auch von hier.")}</p>}
            {!u.canInstall && <p className="tiny muted">{t("Automatisches Installieren kann nur der Windows-Begleiter. Sonst: neue EXE herunterladen, Begleiter beenden, Datei ersetzen, neu starten – deine Daten liegen getrennt im Datenordner.")}</p>}
          </div>
        )}
      </Loadable>
    </Card>
  );
}

/** Version of this web page; offers a reload when the published website is newer (service worker cache). */
export function WebsiteVersion() {
  const { latest } = useLatestRelease();
  const newer = latest && compareVersions(latest.version, WEB_VERSION) > 0;
  const reload = async () => {
    try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* not installed */ }
    location.reload();
  };
  return (
    <Card title={t("Diese Webseite")} icon={<Smartphone size={18} />} meta={`v${WEB_VERSION}`}>
      {newer ? <Banner kind="info" title={t("Neuere Webseite verfügbar (v{v})", { v: latest!.version })} actions={<Button size="sm" icon={<RotateCcw size={14} />} onClick={reload}>{t("Neu laden")}</Button>}>{t("Dein Gerät zeigt noch eine gespeicherte ältere Fassung.")}</Banner>
        : <p className="small muted">{t("Webseite und Begleiter nutzen dieselbe Versionsnummer. Die Webseite aktualisiert sich beim nächsten Öffnen von selbst.")}</p>}
    </Card>
  );
}

/** Companion window only: asks once per version when an update is available ("Jetzt aktualisieren", "Später", "Details"). */
export function UpdatePrompt() {
  const conn = useConn();
  const local = !!conn.me?.isLocal && conn.auth === "ok";
  const q = useRpc<UpdateStatus>("updates.status", {}, ["updates"], local);
  const nav = useNavigate();
  const v = q.data?.available?.version;
  const key = `pgl-update-later-${v}`;
  const [hidden, setHidden] = useState(false);
  let later = false;
  try { later = !!v && localStorage.getItem(key) === "1"; } catch { /* storage blocked */ }
  if (!local || !v || later || hidden) return null;
  const close = () => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } setHidden(true); };
  return (
    <Modal title={t("Update verfügbar")} onClose={close} footer={<>
      <Button onClick={close}>{t("Später")}</Button>
      <Button onClick={() => { setHidden(true); nav("/updates"); }}>{t("Details anzeigen")}</Button>
      <Button variant="primary" onClick={() => { setHidden(true); nav("/updates"); client.call("updates.download").then(() => q.reload()).catch((e) => toast((e as Error).message, "error")); }}>{t("Jetzt aktualisieren")}</Button>
    </>}>
      <div className="stack">
        <p>{t("Installiert: v{c} · Neu: v{a}", { c: q.data!.current, a: v })}</p>
        <ChangeList changes={q.data!.available!.changes} />
        <p className="tiny muted">{t("„Jetzt aktualisieren“ lädt die Datei herunter und prüft sie; danach bestätigst du die Installation. Nichts wird ohne deine Zustimmung installiert.")}</p>
      </div>
    </Modal>
  );
}

export function UpdatesLink() {
  return <Link to="/updates" className="btn sm">{t("Updates & Versionen")}</Link>;
}
