// Cloud page: the state of the automatic sync in plain words – cloud, PC, what is running, what is still waiting – and the PC's own link to the account.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloudCog, RefreshCw } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useConn, useRpc } from "../lib/hooks";
import { relTime } from "../lib/format";
import { describeSync, flushOps, linkPcNow, pullNow, setAutoLink, useCloudSync } from "../lib/cloud-sync";
import { session } from "../lib/design-account";
import { Banner, Button, Card, Modal } from "./ui";
import { AccountPanel } from "./design-profile";

interface PcCloud { linked: boolean; user: string | null; state: string; lastPushAt: string | null; lastOkAt: string | null; lastError: string | null; conflicts: string[] }

export function CloudSyncCard() {
  const conn = useConn();
  const s = useCloudSync();
  const pcOnline = conn.phase === "online" && conn.auth === "ok";
  const canAdmin = pcOnline && (!!conn.me?.isLocal || !!conn.me?.permissions.includes("admin"));
  const pc = useRpc<PcCloud>("cloud.status", {}, ["cloud"], pcOnline);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [, setTick] = useState(0);
  // The card follows sign-in/sign-out at once (before it only changed when the next sync round ran).
  useEffect(() => { const f = () => setTick((n) => n + 1); window.addEventListener("pgl-account", f); window.addEventListener("storage", f); return () => { window.removeEventListener("pgl-account", f); window.removeEventListener("storage", f); }; }, []);
  const acct = session();
  if (!acct?.cloud) return (
    <Card title={t("Automatische Synchronisierung")} icon={<CloudCog size={18} />}>
      <div className="stack-sm">
        <p className="small muted" style={{ margin: 0 }}>{t("Melde dich oben mit deinem Cloud-Konto an – dann hält die Cloud den letzten Stand deines PCs für alle deine Geräte bereit, auch bei ausgeschaltetem PC.")}</p>
        <p className="small" style={{ margin: 0 }}>{t("Wichtig: Auch am PC selbst muss dieses Cloud-Konto angemeldet sein – ein Konto „am PC“ oder ein anderes Konto lädt nichts in die Cloud.")}</p>
        <p className="small muted" style={{ margin: 0 }}>{acct ? t("Dieses Gerät ist als „{u}“ nur lokal angemeldet (Konto am PC) – für die Cloud melde dich mit dem Cloud-Konto an.", { u: acct.user }) : t("Dieses Gerät ist noch nicht angemeldet.")}</p>
        <div><Button variant="primary" onClick={() => setLoginOpen(true)}>{t("Jetzt anmelden")}</Button></div>
        {loginOpen && createPortal(<Modal title={t("Anmelden oder registrieren")} onClose={() => setLoginOpen(false)}><AccountPanel onDone={() => setLoginOpen(false)} /></Modal>, document.body)}
      </div>
    </Card>
  );
  const d = describeSync(s, pcOnline);
  const dot = (kind: "ok" | "warn" | "off") => <span className={`dot ${kind === "ok" ? "ok" : kind === "warn" ? "warn" : ""}`} aria-hidden style={{ display: "inline-block", marginRight: 8 }} />;
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } };
  const pcLinked = !!pc.data?.linked && pc.data.user === acct.user;
  return (
    <Card title={t("Automatische Synchronisierung")} icon={<CloudCog size={18} />}
      meta={<span className={`badge ${s.cloud === "ok" && s.pending === 0 ? "ok" : "warn"}`}>{s.syncing ? t("läuft") : s.pending > 0 ? t("ausstehend") : s.cloud === "ok" ? t("aktuell") : t("wartet")}</span>}>
      <div className="stack-sm">
        <div className="small" role="status" aria-live="polite">
          <div>{dot(s.cloud === "ok" ? "ok" : s.cloud === "unreachable" ? "warn" : "off")}{d.cloud}{s.okAt ? <span className="muted"> · {t("zuletzt {w}", { w: relTime(new Date(s.okAt).toISOString()) })}</span> : null}</div>
          <div>{dot(pcOnline ? "ok" : "off")}{d.pc}</div>
          <div>{dot(s.syncing ? "warn" : s.pending > 0 ? "warn" : s.upToDate ? "ok" : "off")}{d.sync}</div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {s.pcSyncedAt
            ? t("Der PC „{n}“ hat seine Daten zuletzt {w} in die Cloud übertragen. Dieses Gerät zeigt genau diesen Stand – auch wenn der PC jetzt aus ist.", { n: s.pcName ?? "PC", w: relTime(new Date(s.pcSyncedAt).toISOString()) })
            : t("Noch hat kein PC Daten in die Cloud übertragen. Sobald der PC-Begleiter mit diesem Konto verbunden ist und läuft, geschieht das von selbst.")}
        </p>
        {s.pending > 0 && <Banner kind="info">{t("{n} Änderung(en) von diesem Gerät warten darauf, in die Cloud zu kommen. Sie werden automatisch gesendet, sobald die Verbindung da ist – nichts geht verloren.", { n: s.pending })}</Banner>}
        {s.error && <Banner kind="warn">{s.error}</Banner>}
        {pcOnline && pc.data && (
          <div className="stack-sm">
            <div className="small">{pcLinked
              ? t("Dieser PC ist mit dem Konto „{u}“ verbunden und überträgt Änderungen automatisch (sofort nach einer Änderung, zusätzlich alle 30 Sekunden).", { u: acct.user })
              : t("Dieser PC ist noch nicht mit dem Konto verbunden – deshalb liegen seine Daten nicht in der Cloud.")}</div>
            {pcLinked && pc.data.lastPushAt && <div className="tiny muted">{t("Zuletzt vom PC übertragen {w}.", { w: relTime(pc.data.lastPushAt) })}</div>}
            {pc.data.lastError && <Banner kind="warn">{pc.data.lastError}</Banner>}
            {pc.data.conflicts.length > 0 && (
              <details className="small"><summary>{t("{n} Änderung(en) von anderen Geräten waren überholt", { n: pc.data.conflicts.length })}</summary>
                <ul className="steps small">{pc.data.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
                <p className="tiny muted">{t("Wurde dasselbe Feld am PC und auf einem anderen Gerät geändert, gilt der Stand vom PC.")}</p>
              </details>
            )}
          </div>
        )}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button icon={<RefreshCw size={16} />} busy={busy} onClick={() => run(async () => { await flushOps(); await pullNow(); if (pcOnline) await client.call("cloud.syncNow").catch(() => undefined); }, t("Abgleich abgeschlossen"))}>{t("Jetzt abgleichen")}</Button>
          {canAdmin && !pcLinked && <Button variant="primary" busy={busy} onClick={() => run(async () => { setAutoLink(true); const r = await linkPcNow(true); if (r === "failed") throw new Error(t("Der PC konnte nicht mit der Cloud verbunden werden.")); }, t("PC mit dem Konto verbunden"))}>{t("PC mit diesem Konto verbinden")}</Button>}
          {canAdmin && pcLinked && <Button variant="ghost" busy={busy} onClick={() => run(async () => { setAutoLink(false); await client.call("cloud.unlink"); }, t("PC von der Cloud getrennt"))}>{t("PC von der Cloud trennen")}</Button>}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{t("Nur Funktionen, die auf dem Windows-PC etwas ausführen (Spiel starten, Soundboard, Fernsteuerung …), brauchen eine aktive PC-Verbindung. Alles andere siehst und änderst du auch ohne PC.")}</p>
      </div>
    </Card>
  );
}


/**
 * Shown on pages that list the PC's data when this device is signed in to the cloud but the PC never uploaded anything:
 * says plainly why the lists are empty and what to do at the PC (instead of silently showing defaults).
 */
export function CloudEmptyHint() {
  const conn = useConn();
  const s = useCloudSync();
  if (!s.active || conn.phase === "online" && conn.auth === "ok" || s.pcSyncedAt || s.cloud === "unknown") return null;
  return (
    <Banner kind="info">
      {t("Dein PC hat noch nichts in die Cloud übertragen – darum siehst du hier noch keine Spiele und Apps. Öffne die Seite am PC, melde dich dort mit demselben Konto „{u}“ an (Profil) und lass den Begleiter laufen. Danach erscheint alles hier, auch bei ausgeschaltetem PC.", { u: s.user ?? "" })}
    </Banner>
  );
}
