import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Download, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileVideo, FolderOpen, HardDriveDownload, Pin, RotateCcw, Send, Smartphone, Trash2, Upload } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Loadable, Meter, PageHead } from "../components/ui";
import {
  deviceBytes, downloadFile, forgetKept, keepFile, MAX_DEVICE_BYTES, MAX_FILE_BYTES, queueFiles, removeOutgoing, retryOutgoing,
  saveToDevice, uploadFile, useTransfer, type FilesList, type PcFile,
} from "../lib/transfer";

const KIND_ICON: Record<PcFile["kind"], typeof FileIcon> = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, document: FileText, other: FileIcon };

/** Files between this device and the PC – sending works without the PC (the file waits on this device). */
export default function FilesPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<FilesList>("files.list", {}, ["files"]);
  const tr = useTransfer();
  const pick = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<{ name: string; p: number } | null>(null);
  const [fetching, setFetching] = useState<Record<string, number>>({});

  const send = async (list: File[]) => {
    if (!list.length) return;
    if (!online) {
      const msgs = await queueFiles(list);
      msgs.forEach((m) => toast(m, "error"));
      if (msgs.length < list.length) toast(t("Gespeichert – wird gesendet, sobald der PC verbunden ist"), "info");
      return;
    }
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) { toast(t("{f}: höchstens 200 MB pro Datei.", { f: f.name }), "error"); continue; }
      setSending({ name: f.name, p: 0 });
      try { const r = await uploadFile(f.name, f, (p) => setSending({ name: f.name, p })); toast(t("{f} ist auf dem PC", { f: r.name }), "success"); }
      catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "offline" || code === "timeout") { await queueFiles([f]); toast(t("Verbindung weg – {f} wartet auf dem Gerät", { f: f.name }), "info"); }
        else toast((e as Error).message, "error");
      }
    }
    setSending(null);
  };

  const fetchFile = async (f: PcFile, keep: boolean) => {
    setFetching((x) => ({ ...x, [f.name]: 0 }));
    try {
      const blob = await downloadFile(f, (p) => setFetching((x) => ({ ...x, [f.name]: p })));
      if (keep) {
        if (await keepFile(f.name, blob)) toast(t("{f} ist jetzt auch ohne PC auf diesem Gerät", { f: f.name }), "success");
        else toast(t("Auf diesem Gerät ist kein Platz mehr (500 MB für Dateien)."), "error");
      } else await saveToDevice(f.name, blob);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setFetching(({ [f.name]: _, ...rest }) => rest); }
  };

  const remove = async (f: PcFile) => {
    if (!(await confirmDialog(t("Datei am PC löschen?"), t("„{f}“ wird im Austausch-Ordner endgültig gelöscht.", { f: f.name }), { danger: true, ok: t("Löschen") }))) return;
    client.call("files.remove", { name: f.name }).catch((e: Error) => toast(e.message, "error"));
  };

  const keptNames = useMemo(() => new Set(tr.kept.map((k) => k.name)), [tr.kept]);
  const used = deviceBytes();

  return (
    <>
      <PageHead eyebrow={t("Verbindung")} title={t("Dateien")}
        text={t("Bilder, Clips, Configs und mehr zwischen Handy und PC. Ohne PC wartet eine Datei auf diesem Gerät und wird beim Verbinden gesendet.")}
        actions={<>
          <input ref={pick} type="file" multiple hidden onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; void send(l); }} />
          <Button variant="primary" icon={<Upload size={17} />} disabled={!canManage || !!sending} onClick={() => pick.current?.click()}>{online ? t("An den PC senden") : t("Zum Senden vormerken")}</Button>
        </>} />
      {!tr.available && <Banner kind="warn">{t("Dieser Browser erlaubt keinen Speicher (z. B. privates Fenster) – Dateien können nur bei verbundenem PC gesendet werden.")}</Banner>}
      {sending && <Card><div className="stack-sm"><div className="row between small"><b className="ellipsis">{t("Sende {f} …", { f: sending.name })}</b><span>{Math.round(sending.p * 100)} %</span></div><Meter value={sending.p * 100} /></div></Card>}

      {tr.outgoing.length > 0 && (
        <Card title={t("Wartet auf PC ({n})", { n: tr.outgoing.length })} icon={<Clock size={18} />}>
          <div className="list">
            {tr.outgoing.map((f) => (
              <div key={f.id} className="list-item sensitive">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title small ellipsis">{f.name}</div>
                  <div className="sub tiny">{bytes(f.size)} · {f.error ? <span className="badge error">{f.error}</span> : tr.progress[f.id] != null ? t("wird gesendet … {n} %", { n: Math.round(tr.progress[f.id] * 100) }) : <span className="badge warn">{t("wartet auf PC")}</span>}</div>
                </div>
                {f.error && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} aria-label={t("Erneut versuchen")} onClick={() => void retryOutgoing(f.id)} />}
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Nicht senden")} onClick={() => void removeOutgoing(f.id)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={t("Auf dem PC")} icon={<HardDriveDownload size={18} />}
        actions={online && canManage && <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => client.call("files.openFolder").catch((e: Error) => toast(e.message, "error"))}>{t("Ordner am PC öffnen")}</Button>}>
        <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
          {q.data && (
            <div className="stack">
              {q.stale && <p className="tiny muted">{t("Ohne PC: Liste vom {d}. Holen geht erst mit PC – außer bei Dateien, die du auf dem Gerät behalten hast.", { d: dateTime(q.updatedAt ? new Date(q.updatedAt).toISOString() : null) })}</p>}
              {q.data.files.length === 0 ? <Empty icon={<Send size={22} />} title={t("Der Austausch-Ordner ist leer")} text={t("Sende eine Datei vom Handy oder lege am PC eine Datei in den Ordner.")} /> : (
                <div className="list">
                  {q.data.files.map((f) => {
                    const Icon = KIND_ICON[f.kind] ?? FileIcon;
                    const busy = fetching[f.name];
                    return (
                      <div key={f.name} className="list-item">
                        <Icon size={20} className="muted" style={{ flex: "0 0 auto" }} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="title small ellipsis">{f.name}</div>
                          <div className="sub tiny">{bytes(f.size)} · {dateTime(f.modified)}{keptNames.has(f.name) ? " · " + t("auch auf diesem Gerät") : ""}{busy != null ? ` · ${Math.round(busy * 100)} %` : ""}</div>
                        </div>
                        {online && <>
                          <Button size="sm" variant="ghost" icon={<Download size={14} />} aria-label={t("Aufs Gerät holen")} busy={busy != null} onClick={() => void fetchFile(f, false)} />
                          {!keptNames.has(f.name) && <Button size="sm" variant="ghost" icon={<Pin size={14} />} aria-label={t("Offline behalten")} disabled={busy != null} onClick={() => void fetchFile(f, true)} />}
                          {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Am PC löschen")} onClick={() => void remove(f)} />}
                        </>}
                      </div>
                    );
                  })}
                </div>
              )}
              {online && <p className="tiny muted mono ellipsis" title={q.data.folder}>{t("Ordner am PC: {p}", { p: q.data.folder })}</p>}
              <p className="tiny muted">{t("Höchstens 200 MB pro Datei. Der PC öffnet oder startet empfangene Dateien nie selbst; unter Windows sind sie als „aus dem Internet“ markiert, Windows warnt also vor dem Ausführen.")}</p>
            </div>
          )}
        </Loadable>
      </Card>

      <Card title={t("Auf diesem Gerät ({n})", { n: tr.kept.length })} icon={<Smartphone size={18} />}>
        {tr.kept.length === 0 ? <p className="small muted">{t("Mit der Stecknadel behältst du eine Datei vom PC auf diesem Gerät – dann öffnet sie auch ohne PC.")}</p> : (
          <div className="list">
            {tr.kept.map((k) => (
              <div key={k.name} className="list-item">
                <KeptPreview name={k.name} data={k.data} />
                <div className="grow" style={{ minWidth: 0 }}><div className="title small ellipsis">{k.name}</div><div className="sub tiny">{bytes(k.size)} · {t("behalten am {d}", { d: dateTime(k.savedAt) })}</div></div>
                <Button size="sm" variant="ghost" icon={<Download size={14} />} aria-label={t("Öffnen/Speichern")} onClick={() => void saveToDevice(k.name, k.data)} />
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Von diesem Gerät entfernen")} onClick={() => void forgetKept(k.name)} />
              </div>
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 8 }}>{t("Belegt auf diesem Gerät: {u} von {m} (wartende und behaltene Dateien).", { u: bytes(used), m: bytes(MAX_DEVICE_BYTES) })}</p>
      </Card>
    </>
  );
}

function KeptPreview({ name, data }: { name: string; data: Blob }) {
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(name);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(data); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, isImage]);
  return url ? <img src={url} alt="" className="file-thumb" /> : <FileIcon size={20} className="muted" style={{ flex: "0 0 auto" }} />;
}
