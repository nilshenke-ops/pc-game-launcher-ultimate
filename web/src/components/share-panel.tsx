// The PC side of the QR transfer (3.64), inside the island's shelf: make a QR code for the chosen files (PC → phone) or for receiving
// (phone → PC), see who scanned it, allow or refuse with the 4-digit code, watch the progress, end it at any time; plus a short history.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, History, Loader2, ShieldCheck, Smartphone, X } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useRpc } from "../lib/hooks";
import { bytes } from "../lib/format";
import { createShare, shareBase, shareLink, type Created, type Direction, type ShareList, type ShareView } from "../lib/share";

interface Net { settings: { lanAccess?: boolean; webAppUrl?: string; publicUrl?: string; shareTtlMinutes?: number } }

export function SharePanel({ direction, files, sizes, onClose }: { direction: Direction; files: string[]; sizes: Record<string, number>; onClose: () => void }) {
  const settings = useRpc<Net>("settings.get", {}, ["settings"]);
  const state = useRpc<{ lanUrls: string[] }>("state.get", {}, []);
  const [share, setShare] = useState<Created | null>(null);
  const [view, setView] = useState<ShareView | null>(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());

  const start = () => {
    setErr(""); setView(null); setShare(null);
    createShare(direction, direction === "send" ? files : undefined).then(setShare, (e: Error) => setErr(e.message));
  };
  useEffect(start, [direction, files.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ending the panel ends an open share that nobody used (nothing stays valid in the background).
  useEffect(() => () => { if (share) client.call("share.revoke", { id: share.id }).catch(() => undefined); }, [share?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = shareBase({ lanUrls: state.data?.lanUrls, lanAccess: settings.data?.settings.lanAccess, webAppUrl: settings.data?.settings.webAppUrl, publicUrl: settings.data?.settings.publicUrl, here: location });
  const link = share ? shareLink(route.base, share.id, share.secret) : "";
  useEffect(() => {
    if (!link) { setQr(""); return; }
    QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M" }).then((svg) => setQr("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)), () => setQr(""));
  }, [link]);
  useEffect(() => client.on("share.update", (d) => { const v = d as ShareView; if (share && v.id === share.id) setView(v); }), [share]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const st = view?.state ?? "open";
  const left = share ? Math.max(0, Math.round((Date.parse(share.expiresAt) - now) / 1000)) : 0;
  const total = direction === "send" ? files.reduce((a, f) => a + (sizes[f] ?? 0), 0) : 0;
  const pct = total ? Math.min(100, Math.round(((view?.bytes ?? 0) / total) * 100)) : 0;
  const act = (m: string) => share && client.call(m, { id: share.id }).catch((e: Error) => toast(e.message, "error"));

  return (
    <div className="xs-panel" role="region" aria-label={t("Übertragung mit dem Handy")}>
      <div className="row between">
        <b>{direction === "send" ? t("Mit Handy übertragen") : t("Vom Handy empfangen")}</b>
        <button type="button" className="isl3-mini" onClick={() => { if (share && st !== "done") void act("share.revoke"); onClose(); }} aria-label={t("Schließen")}><X size={14} /></button>
      </div>
      {err && <p className="isl2-sub xs-bad">{err}</p>}
      {!share && !err && <Loader2 size={18} className="spin" aria-label={t("Wird vorbereitet")} />}

      {share && st === "open" && (
        <div className="xs-qrbox">
          {qr ? <img src={qr} alt={t("QR-Code für die Übertragung")} width={150} height={150} data-link={link} /> : <Loader2 size={18} className="spin" />}
          <div className="xs-qrtext">
            <span className="isl2-sub">{direction === "send" ? t("{n} Datei(en) · {s}", { n: files.length, s: bytes(total) }) : t("Das Handy wählt die Dateien aus.")}</span>
            <span className="isl2-sub">{t("Mit der Handykamera scannen. Danach fragt die Insel hier nach – erst dann geht etwas los.")}</span>
            <span className={`badge ${left < 30 ? "warn" : ""}`}>{left > 0 ? t("gültig noch {t}", { t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` }) : t("abgelaufen")}</span>
            <span className="tiny muted">{route.route === "lan" ? t("Direkt im WLAN (Handy muss im selben WLAN sein).") : t("Über die Webseite – das Handy erreicht den PC wie ein gekoppeltes Gerät.")}</span>
            {left === 0 && <button type="button" className="isl3-chipbtn" onClick={start}>{t("Neuen Code erzeugen")}</button>}
          </div>
        </div>
      )}

      {st === "waiting" && view && (
        <div className="xs-ask" role="alertdialog" aria-label={t("Gerät möchte übertragen")}>
          <ShieldCheck size={22} aria-hidden />
          <span><b>{t("{d} möchte {w}", { d: view.device ?? t("Ein Gerät"), w: direction === "send" ? t("die Dateien empfangen") : t("Dateien senden") })}</b>
            <span className="isl2-sub">{t("Steht auf dem Handy derselbe Code?")}</span></span>
          <span className="xs-code sm">{view.code}</span>
          <span className="row">
            <button type="button" className="isl3-chipbtn on" onClick={() => void act("share.approve")}>{t("Erlauben")}</button>
            <button type="button" className="isl3-chipbtn" onClick={() => void act("share.reject")}>{t("Ablehnen")}</button>
          </span>
        </div>
      )}

      {st === "approved" && view && (
        <div className="xs-live" role="status">
          <Smartphone size={18} aria-hidden />
          <span className="xs-livebody">
            <b>{t("Verbunden mit {d}", { d: view.device ?? "" })}</b>
            <span className="isl2-sub ellipsis">{view.current ? t("Überträgt {f}", { f: view.current }) : direction === "send" ? t("Wartet auf „Dateien empfangen“ am Handy …") : t("Wartet auf Dateien vom Handy …")}</span>
            {direction === "send"
              ? <><span className="isl3-agentprog" style={{ ["--p" as string]: pct / 100 } as React.CSSProperties} aria-hidden><i /></span><span className="tiny muted">{pct} % · {bytes(view.bytes)} / {bytes(total)} · {t("{a} von {b} fertig", { a: view.done.length, b: files.length })}</span></>
              : <span className="tiny muted">{t("{n} Datei(en) empfangen · {s}", { n: view.done.length, s: bytes(view.bytes) })}</span>}
          </span>
          <button type="button" className="isl3-chipbtn" onClick={() => void act("share.revoke")}>{t("Beenden")}</button>
        </div>
      )}

      {st === "done" && view && <p className="xs-ok"><CheckCircle2 size={16} aria-hidden /> {direction === "send" ? t("{n} Datei(en) an {d} übertragen.", { n: view.done.length, d: view.device ?? "" }) : t("{n} Datei(en) von {d} empfangen – sie liegen jetzt in der Ablage.", { n: view.done.length, d: view.device ?? "" })}</p>}
      {(st === "rejected" || st === "revoked" || st === "expired") && (
        <p className="isl2-sub">{st === "rejected" ? t("Abgelehnt.") : st === "expired" ? t("Abgelaufen.") : t("Beendet.")} <button type="button" className="isl3-chipbtn" onClick={start}>{t("Neuen Code erzeugen")}</button></p>
      )}
    </div>
  );
}

/** The last transfers (kept on the PC, can be switched off and cleared in the settings). */
export function ShareHistoryList() {
  const q = useRpc<ShareList>("share.list", {}, ["shares"]);
  if (!q.data?.historyEnabled || !q.data.history.length) return null;
  const RESULT: Record<string, string> = { done: "fertig", rejected: "abgelehnt", revoked: "beendet", expired: "abgelaufen" };
  return (
    <details className="xs-hist">
      <summary><History size={13} aria-hidden /> {t("Verlauf")} ({q.data.history.length})</summary>
      <ul>
        {q.data.history.slice(0, 8).map((h) => (
          <li key={h.id}><span>{h.direction === "send" ? "→" : "←"} {h.device ?? "?"}</span><span className="tiny muted">{t("{n} Datei(en)", { n: h.files })} · {bytes(h.bytes)} · {t(RESULT[h.result] ?? h.result)} · {new Date(h.at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></li>
        ))}
      </ul>
    </details>
  );
}
