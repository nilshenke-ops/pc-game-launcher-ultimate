// File shelf of the island (3.60): drop files on the island (or pick them) – they land in the PC's exchange folder, one by one
// with progress and "Abbrechen". The list can be renamed, fetched to this device and removed. The QR code opens the exchange
// folder on the phone: it holds only the web app's address and the page, never a key, so it stays valid – the phone signs in
// the usual way (pairing). Without the PC, files wait on this device and go over when it is back.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Check, Download, FolderOpen, Pencil, QrCode, Smartphone, Trash2, Upload, X } from "lucide-react";
import { SharePanel, ShareHistoryList } from "./share-panel";
import type { Direction } from "../lib/share";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useRpc } from "../lib/hooks";
import { bytes } from "../lib/format";
import { downloadFile, MAX_FILE_BYTES, queueFiles, saveToDevice, uploadFile, useTransfer, type FilesList, type PcFile } from "../lib/transfer";
import { carriesFiles, onShelfFiles, shelfUrl } from "../lib/island-shelf";

interface Sending { name: string; p: number; ctl: AbortController }

export function IslandShelf({ online, canManage }: { online: boolean; canManage: boolean }) {
  const list = useRpc<FilesList>("files.list", {}, ["files"], online && canManage);
  const settings = useRpc<{ settings: { webAppUrl?: string } }>("settings.get", {}, ["settings"], online && canManage);
  const tr = useTransfer();
  const [sending, setSending] = useState<Sending | null>(null);
  const [over, setOver] = useState(false);
  const [qr, setQr] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<{ direction: Direction; files: string[] } | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const queue = useRef<File[]>([]);
  const running = useRef(false);

  const url = shelfUrl(settings.data?.settings.webAppUrl, location);
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      .then((svg) => setQr("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)), () => setQr(""));
  }, [url]);

  /** One file after the other; a new drop joins the queue. */
  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const f = queue.current.shift()!;
        if (f.size > MAX_FILE_BYTES) { toast(t("{f}: höchstens 200 MB pro Datei.", { f: f.name }), "error"); continue; }
        if (!online) { const msgs = await queueFiles([f]); msgs.forEach((m) => toast(m, "error")); if (!msgs.length) toast(t("{f} wartet auf dem Gerät und geht zum PC, sobald er verbunden ist.", { f: f.name }), "info"); continue; }
        const ctl = new AbortController();
        setSending({ name: f.name, p: 0, ctl });
        try {
          const done = await uploadFile(f.name, f, (p) => setSending((s) => (s ? { ...s, p } : s)), ctl.signal);
          setPicked((p) => new Set(p).add(done?.name ?? f.name)); // what was just dropped is ready for "Mit Handy übertragen"
          toast(t("{f} liegt in der Ablage am PC", { f: f.name }), "success");
        }
        catch (e) { if ((e as { code?: string }).code !== "cancelled") toast((e as Error).message, "error"); else toast(t("{f}: abgebrochen", { f: f.name }), "info"); }
      }
    } finally { running.current = false; setSending(null); list.reload(); }
  };
  const add = (files: File[]) => { if (!files.length) return; queue.current.push(...files); void pump(); };
  useEffect(() => onShelfFiles(add), [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async () => {
    if (!renaming) return;
    const v = renaming.value.trim();
    if (!v || v === renaming.name) { setRenaming(null); return; }
    try { await client.call("files.rename", { name: renaming.name, newName: v }); setRenaming(null); list.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const fetchFile = async (f: PcFile) => {
    setFetching(f.name);
    try { await saveToDevice(f.name, await downloadFile(f)); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setFetching(null); }
  };
  const remove = (f: PcFile) => client.call("files.remove", { name: f.name }).then(() => list.reload(), (e: Error) => toast(e.message, "error"));

  if (!canManage) return <div className="isl2-empty"><FolderOpen size={18} aria-hidden /><span>{t("Die Ablage braucht das Recht „Verwalten“.")}</span></div>;
  const files = [...(list.data?.files ?? [])].sort((a, b) => b.modified.localeCompare(a.modified));
  const chosen = files.filter((f) => picked.has(f.name)).map((f) => f.name);
  const sizes = Object.fromEntries(files.map((f) => [f.name, f.size]));
  const pickedBytes = files.filter((f) => picked.has(f.name)).reduce((a, f) => a + f.size, 0);
  const toggle = (name: string) => setPicked((p) => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  return (
    <div className="isl3-shelf">
      <div className={`isl3-drop${over ? " over" : ""}`} role="region" aria-label={t("Ablage – Dateien hier ablegen")}
        onDragOver={(e) => { if (carriesFiles(e.dataTransfer)) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); add(Array.from(e.dataTransfer.files)); }}>
        <input ref={pick} type="file" multiple hidden onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; add(l); }} />
        <Upload size={20} aria-hidden />
        <b>{t("Dateien hierher ziehen")}</b>
        <span className="isl2-sub">{t("Sie landen im Austausch-Ordner am PC – fürs Handy per QR-Code.")}</span>
        <button type="button" className="isl3-chipbtn" onClick={() => pick.current?.click()}>{t("Dateien wählen")}</button>
        {sending && (
          <span className="isl3-sending" role="status">
            <span className="ellipsis">{t("Sende {f} …", { f: sending.name })}</span>
            <span className="isl3-agentprog" style={{ ["--p" as string]: sending.p } as React.CSSProperties} aria-hidden><i /></span>
            <button type="button" className="isl3-chipbtn" onClick={() => { sending.ctl.abort(); queue.current = []; }}>{t("Abbrechen")}</button>
          </span>
        )}
        {tr.outgoing.length > 0 && <span className="isl2-sub">{t("{n} Datei(en) warten auf den PC", { n: tr.outgoing.length })}</span>}
      </div>

      <div className="isl3-shelfside">
        <div className="row between isl3-shelfhead">
          <b>{t("In der Ablage")} ({files.length})</b>
          <span className="row">
            <button type="button" className={`isl3-chipbtn${showQr ? " on" : ""}`} aria-pressed={showQr} onClick={() => setShowQr((v) => !v)}><QrCode size={13} aria-hidden /> {t("Aufs Handy")}</button>
            {online && <button type="button" className="isl3-mini" aria-label={t("Ordner am PC öffnen")} title={t("Ordner am PC öffnen")} onClick={() => client.call("files.openFolder", {}).catch((e: Error) => toast(e.message, "error"))}><FolderOpen size={14} /></button>}
          </span>
        </div>
        {online && !sharing && (
          <div className="xs-actions">
            <button type="button" className="isl3-chipbtn on" disabled={!files.length} onClick={() => setSharing({ direction: "send", files: chosen.length ? chosen : files.slice(0, 50).map((f) => f.name) })}>
              <Smartphone size={13} aria-hidden /> {chosen.length ? t("{n} mit Handy übertragen", { n: chosen.length }) : t("Mit Handy übertragen")}
            </button>
            <button type="button" className="isl3-chipbtn" onClick={() => setSharing({ direction: "receive", files: [] })}><Download size={13} aria-hidden /> {t("Vom Handy empfangen")}</button>
            {chosen.length > 0 && <span className="tiny muted">{t("{n} gewählt · {s}", { n: chosen.length, s: bytes(pickedBytes) })} <button type="button" className="isl3-linkbtn" onClick={() => setPicked(new Set())}>{t("Auswahl aufheben")}</button></span>}
          </div>
        )}
        {sharing ? <SharePanel direction={sharing.direction} files={sharing.files} sizes={sizes} onClose={() => { setSharing(null); list.reload(); }} /> : showQr ? (
          <div className="isl3-qr">
            {qr && <img src={qr} alt={t("QR-Code zur Ablage")} width={132} height={132} />}
            <span className="isl2-sub">{t("Mit der Handykamera scannen – die Ablage öffnet sich. Der Code bleibt immer gleich und enthält nur die Adresse, keinen Zugang; das Handy muss einmal gekoppelt sein.")}</span>
            <code className="tiny ellipsis">{url}</code>
          </div>
        ) : !online ? <p className="isl2-sub">{t("PC nicht verbunden")}</p> : files.length === 0 ? <p className="isl2-sub">{t("Noch leer.")}</p> : (
          <ul className="isl3-files" aria-label={t("Dateien in der Ablage")}>
            {files.slice(0, 20).map((f) => (
              <li key={f.name}>
                {renaming?.name === f.name ? (
                  <form className="isl3-rename" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
                    <input className="input" autoFocus value={renaming.value} maxLength={120} aria-label={t("Neuer Name")} onChange={(e) => setRenaming({ ...renaming, value: e.target.value })} />
                    <button type="submit" className="isl3-mini" aria-label={t("Umbenennen")}><Check size={14} /></button>
                    <button type="button" className="isl3-mini" aria-label={t("Abbrechen")} onClick={() => setRenaming(null)}><X size={14} /></button>
                  </form>
                ) : (
                  <>
                    <input type="checkbox" className="xs-check" checked={picked.has(f.name)} onChange={() => toggle(f.name)} aria-label={t("{n} auswählen", { n: f.name })} />
                    <span className="isl3-fname"><b className="ellipsis">{f.name}</b><i>{bytes(f.size)}</i></span>
                    <button type="button" className="isl3-mini" aria-label={t("{n} umbenennen", { n: f.name })} onClick={() => setRenaming({ name: f.name, value: f.name })}><Pencil size={13} /></button>
                    <button type="button" className="isl3-mini" disabled={fetching === f.name} aria-label={t("{n} auf dieses Gerät holen", { n: f.name })} onClick={() => void fetchFile(f)}><Download size={13} /></button>
                    <button type="button" className="isl3-mini" aria-label={t("{n} löschen", { n: f.name })} onClick={() => void remove(f)}><Trash2 size={13} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!sharing && online && <ShareHistoryList />}
      </div>
    </div>
  );
}
