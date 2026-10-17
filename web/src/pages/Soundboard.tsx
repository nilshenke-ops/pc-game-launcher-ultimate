import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileAudio, Link2, ListMusic, Music, Pause, Pencil, Play, Plus, Search, Square, Star, Trash2, Upload, Volume2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useEvent, useRpc, toast } from "../lib/hooks";
import { bytes } from "../lib/format";
import type { AudioSettings, PlayingState, Sound, SoundCollection, SoundsFile } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented } from "../components/ui";

const COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb923c", "#f87171", "#60a5fa"];
const CHUNK = 256 * 1024;

function toBase64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Uploads a local audio file to the PC in 256 KB chunks over the existing connection (works via relay, too). */
export async function uploadSound(file: File, onProgress?: (p: number) => void) {
  if (file.size > 20 * 1024 * 1024) throw new Error(t("{f}: Datei ist zu groß (max. 20 MB).", { f: file.name }));
  const { uploadId } = await client.call<{ uploadId: string }>("sounds.uploadBegin", { name: file.name, size: file.size });
  const data = new Uint8Array(await file.arrayBuffer());
  for (let off = 0; off < data.length; off += CHUNK) {
    await client.call("sounds.uploadChunk", { uploadId, data: toBase64(data.subarray(off, off + CHUNK)) });
    onProgress?.(Math.min(1, (off + CHUNK) / data.length));
  }
  return client.call<Sound>("sounds.uploadEnd", { uploadId });
}

export default function Soundboard() {
  const q = useRpc<{ data: SoundsFile; playing: PlayingState; supported: boolean; reason?: string }>("sounds.list", {}, ["sounds"]);
  const audio = useRpc<{ settings: AudioSettings }>("audio.state", {}, ["audio"]);
  const conn = useConn();
  const canManage = conn.me?.permissions.includes("manage");
  const [playing, setPlaying] = useState<PlayingState | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("__all");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Sound | null>(null);
  const [colEdit, setColEdit] = useState<SoundCollection | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  useEvent<PlayingState>("sounds.playing", setPlaying);

  const data = q.data?.data;
  const now = playing ?? q.data?.playing ?? { playing: [], queued: 0 };
  const activeCol = data?.collections.find((c) => c.id === data.activeCollectionId);
  const cats = useMemo(() => [...new Set((data?.sounds ?? []).flatMap((s) => s.categories))].sort(), [data]);
  const shown = useMemo(() => {
    const s = search.toLowerCase();
    return (data?.sounds ?? []).filter((x) =>
      (!activeCol || activeCol.soundIds.includes(x.id)) && (!s || x.name.toLowerCase().includes(s)) &&
      (filter === "__all" || (filter === "__fav" ? x.favorite : x.categories.includes(filter))),
    ).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [data, search, filter, activeCol]);

  const play = (s: Sound) => client.call("sounds.play", { id: s.id }).catch((e) => toast(e.message, "error"));
  const vol = volume ?? audio.data?.settings.soundboardVolume ?? 80;
  const saveVolume = (v: number) => {
    const s = audio.data?.settings;
    if (s) client.call("audio.save", { ...s, soundboardVolume: v }).catch((e) => toast(e.message, "error"));
  };
  const playingIds = new Set(now.playing.map((p) => p.soundId));

  return (
    <>
      <PageHead eyebrow={t("Audio")} title={t("Soundboard")} text={t("Sounds werden auf dem PC abgespielt – mit virtuellem Audiokabel auch für alle im Discord-Sprachkanal hörbar.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setImporting(true)}>{t("Sounds importieren")}</Button>} />

      {q.data && !q.data.supported && <div style={{ marginBottom: 16 }}><Banner kind="warn" title={t("Wiedergabe auf diesem Server nicht möglich")}>{q.data.reason}</Banner></div>}

      <Card className="nowplaying" style={{ marginBottom: 16, padding: 14 }}>
        <div className="row">
          <div className="row nowrap grow" style={{ minWidth: 220 }}>
            <Volume2 size={18} className="muted" />
            <input type="range" min={0} max={100} value={vol} onChange={(e) => setVolume(+e.target.value)} onPointerUp={() => saveVolume(vol)} onKeyUp={() => saveVolume(vol)} aria-label={t("Lautstärke Soundboard")} />
            <b className="small" style={{ width: 44, textAlign: "right" }}>{vol}%</b>
          </div>
          <div className="row nowrap">
            {now.playing.length > 0 ? <span className="badge ok"><span className="dot ok pulse" />{t("{n} aktiv", { n: now.playing.length })}{now.queued ? ` · ${t("{n} in Warteschlange", { n: now.queued })}` : ""}</span> : <span className="badge">{t("Ruhe")}</span>}
            <Button variant="danger" size="sm" icon={<Square size={14} />} disabled={!now.playing.length && !now.queued} onClick={() => client.call("sounds.stopAll")}>{t("Alle stoppen")}</Button>
          </div>
        </div>
        {now.playing.length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            {now.playing.map((p) => (
              <span key={p.playbackId} className="badge info" style={{ gap: 8 }}>
                {p.name}
                <button className="btn ghost icon sm" style={{ width: 22, minHeight: 22 }} onClick={() => client.call(p.paused ? "sounds.resume" : "sounds.pause", { playbackId: p.playbackId })} aria-label={p.paused ? t("Fortsetzen") : t("Pause")}>{p.paused ? <Play size={12} /> : <Pause size={12} />}</button>
                <button className="btn ghost icon sm" style={{ width: 22, minHeight: 22 }} onClick={() => client.call("sounds.stop", { playbackId: p.playbackId })} aria-label={t("Stopp")}><Square size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="stack" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="input-icon grow" style={{ minWidth: 200 }}><Search size={17} /><input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Sounds durchsuchen …")} aria-label={t("Suche")} /></div>
          <select className="input" style={{ width: "auto", minWidth: 180 }} value={data?.activeCollectionId ?? ""} onChange={(e) => client.call("sounds.setActiveCollection", { id: e.target.value || null })} aria-label={t("Sammlung")}>
            <option value="">{t("Alle Sounds")}</option>
            {data?.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.soundIds.length})</option>)}
          </select>
          {canManage && <Button icon={<ListMusic size={16} />} onClick={() => setColEdit(activeCol ? structuredClone(activeCol) : { id: "", name: "", soundIds: [] })}>{activeCol ? t("Sammlung bearbeiten") : t("Neue Sammlung")}</Button>}
        </div>
        <div className="chips">
          {[["__all", t("Alle")], ["__fav", "★ " + t("Favoriten")], ...cats.map((c) => [c, c])].map(([k, l]) => <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>

      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {(data?.sounds.length ?? 0) === 0 ? (
          <Card><Empty icon={<Music size={28} />} title={t("Noch keine Sounds")} text={t("Importiere MP3/WAV-Dateien vom Gerät oder füge einen MyInstants-Link ein.")} action={canManage && <Button variant="primary" onClick={() => setImporting(true)}>{t("Sounds importieren")}</Button>} /></Card>
        ) : shown.length === 0 ? <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} /></Card> : (
          <div className="pads">
            {shown.map((s, i) => {
              const live = now.playing.find((p) => p.soundId === s.id);
              return (
                <button key={s.id} className={`pad ${playingIds.has(s.id) ? "playing" : ""}`} style={{ ["--pad" as string]: s.color ?? COLORS[i % COLORS.length], ["--dur" as string]: `${(live?.durationMs ?? 2000) / 1000}s` }} onClick={() => play(s)} aria-label={t("{n} abspielen", { n: s.name })}>
                  <b>{s.name}</b>
                  <span className="pad-meta">{s.favorite && <Star size={12} fill="currentColor" color="#fde047" />}{s.categories[0] ?? s.format.toUpperCase()}{s.volume !== 100 ? ` · ${s.volume}%` : ""}</span>
                  {canManage && <span className="pad-edit btn ghost icon sm" role="button" tabIndex={0} aria-label={t("Bearbeiten")} onClick={(e) => { e.stopPropagation(); setEditing(s); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditing(s); } }}><Pencil size={13} /></span>}
                </button>
              );
            })}
          </div>
        )}
      </Loadable>

      <p className="tiny muted" style={{ marginTop: 18 }}>{t("Andere in Discord hören die Sounds nur, wenn die Soundboard-Ausgabe auf ein virtuelles Kabel geht.")} <Link to="/audio">{t("Audio einrichten")}</Link></p>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {editing && <EditSound sound={editing} onClose={() => setEditing(null)} />}
      {colEdit && data && <CollectionEditor col={colEdit} sounds={data.sounds} onClose={() => setColEdit(null)} />}
    </>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"file" | "url" | "config">("file");
  const [progress, setProgress] = useState<{ name: string; p: number }[]>([]);
  const [results, setResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadAll = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const res: typeof results = [];
    for (const f of Array.from(files)) {
      setProgress([{ name: f.name, p: 0 }]);
      try { const s = await uploadSound(f, (p) => setProgress([{ name: f.name, p }])); res.push({ name: f.name, ok: true, msg: t("Importiert als „{n}“", { n: s.name }) }); }
      catch (e) { res.push({ name: f.name, ok: false, msg: (e as Error).message }); }
      setResults([...res]);
    }
    setProgress([]);
    setBusy(false);
  };
  const importUrl = async () => {
    setBusy(true);
    try { const s = await client.call<Sound>("sounds.importUrl", { url }); setResults((r) => [...r, { name: url, ok: true, msg: t("Importiert als „{n}“", { n: s.name }) }]); setUrl(""); }
    catch (e) { setResults((r) => [...r, { name: url, ok: false, msg: (e as Error).message }]); }
    setBusy(false);
  };
  const exportCfg = async () => {
    const cfg = await client.call("sounds.exportConfig");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
    a.download = "soundboard-konfiguration.json";
    a.click();
  };
  const importCfg = async (file?: File) => {
    if (!file) return;
    try { const r = await client.call<{ applied: number }>("sounds.importConfig", { config: JSON.parse(await file.text()) }); toast(t("{n} Sounds aktualisiert", { n: r.applied }), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Modal title={t("Sounds importieren")} onClose={onClose} wide>
      <Segmented value={tab} onChange={setTab} options={[{ value: "file", label: t("Dateien") }, { value: "url", label: t("Link / MyInstants") }, { value: "config", label: t("Konfiguration") }]} />
      {tab === "file" && (
        <div className="stack">
          <label className="card flat" style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer", padding: 30 }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadAll(e.dataTransfer.files); }}>
            <Upload size={28} style={{ color: "var(--primary)" }} />
            <div><b>{t("Dateien auswählen oder hierher ziehen")}</b></div>
            <div className="small muted">{t("MP3, WAV, FLAC, M4A · max. 20 MB pro Datei · Duplikate werden erkannt")}</div>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.wma" multiple hidden onChange={(e) => uploadAll(e.target.files)} />
          </label>
          {progress.map((p) => <div key={p.name} className="stack-sm"><span className="small">{p.name}</span><div className="progress-bar"><i style={{ width: `${p.p * 100}%` }} /></div></div>)}
        </div>
      )}
      {tab === "url" && (
        <div className="stack">
          <Field label={t("Link")} hint={t("Direkter Audio-Link (.mp3/.wav) oder eine MyInstants-Seite (myinstants.com/…/instant/…).")}>
            <div className="row nowrap">
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.myinstants.com/de/instant/…" inputMode="url" />
              <Button variant="primary" busy={busy} disabled={!url} icon={<Link2 size={16} />} onClick={importUrl}>{t("Importieren")}</Button>
            </div>
          </Field>
          <Banner kind="info">{t("Bitte nur Sounds verwenden, die du nutzen darfst. Links, die keinen öffentlichen Audio-Link enthalten, werden abgelehnt – dann die Datei herunterladen und als Datei importieren.")}</Banner>
        </div>
      )}
      {tab === "config" && (
        <div className="stack">
          <p className="small muted">{t("Exportiert Namen, Kategorien, Favoriten, Lautstärken und Sammlungen (ohne Audiodateien). Beim Import werden vorhandene Sounds über ihre Prüfsumme zugeordnet. Komplett mit Audiodateien: Einstellungen → Backup.")}</p>
          <div className="row">
            <Button icon={<Download size={16} />} onClick={exportCfg}>{t("Konfiguration exportieren")}</Button>
            <label className="btn"><FileAudio size={16} />{t("Konfiguration importieren")}<input type="file" accept="application/json,.json" hidden onChange={(e) => importCfg(e.target.files?.[0])} /></label>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div className="list">
          {results.map((r, i) => <div key={i} className="list-item"><span className={`dot ${r.ok ? "ok" : "error"}`} /><div className="grow"><div className="title small ellipsis">{r.name}</div><div className="sub">{r.msg}</div></div></div>)}
        </div>
      )}
    </Modal>
  );
}

function EditSound({ sound, onClose }: { sound: Sound; onClose: () => void }) {
  const [s, setS] = useState({ ...sound, cats: sound.categories.join(", ") });
  const save = async () => {
    try { await client.call("sounds.update", { id: s.id, name: s.name, favorite: s.favorite, volume: s.volume, color: s.color ?? "", categories: s.cats.split(",").map((x) => x.trim()).filter(Boolean) }); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Sound löschen?"), t("„{n}“ und die Audiodatei werden vom PC gelöscht.", { n: sound.name }), { danger: true, ok: t("Löschen") }))) return;
    await client.call("sounds.remove", { id: sound.id });
    onClose();
  };
  return (
    <Modal title={t("Sound bearbeiten")} onClose={onClose} footer={<>
      <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>
      <Button onClick={() => client.call("sounds.play", { id: sound.id }).catch((e) => toast(e.message, "error"))} icon={<Play size={15} />}>{t("Vorschau")}</Button>
      <Button variant="primary" onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Name")}><input className="input" value={s.name} maxLength={60} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
      <Field label={t("Kategorien")} hint={t("Kommagetrennt")}><input className="input" value={s.cats} onChange={(e) => setS({ ...s, cats: e.target.value })} /></Field>
      <Field label={t("Eigene Lautstärke: {v} %", { v: s.volume })}><input type="range" min={0} max={200} value={s.volume} onChange={(e) => setS({ ...s, volume: +e.target.value })} /></Field>
      <Field label={t("Farbe")}>
        <div className="row">{COLORS.map((c) => <button key={c} type="button" onClick={() => setS({ ...s, color: c })} aria-label={c} style={{ width: 34, height: 34, borderRadius: 10, background: c, border: s.color === c ? "3px solid var(--text)" : "1px solid var(--border)", cursor: "pointer" }} />)}</div>
      </Field>
      <label className="checkbox"><input type="checkbox" checked={s.favorite} onChange={(e) => setS({ ...s, favorite: e.target.checked })} />{t("Favorit")}</label>
      <p className="tiny muted">{sound.format.toUpperCase()} · {bytes(sound.size)}{sound.sourceUrl ? ` · ${t("Quelle")}: ${sound.sourceUrl}` : ""}</p>
    </Modal>
  );
}

function CollectionEditor({ col, sounds, onClose }: { col: SoundCollection; sounds: Sound[]; onClose: () => void }) {
  const [c, setC] = useState(col);
  const toggle = (id: string) => setC({ ...c, soundIds: c.soundIds.includes(id) ? c.soundIds.filter((x) => x !== id) : [...c.soundIds, id] });
  const save = async () => {
    try { const saved = await client.call<SoundCollection>("sounds.saveCollection", c); await client.call("sounds.setActiveCollection", { id: saved.id }); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async () => { await client.call("sounds.removeCollection", { id: c.id }); onClose(); };
  return (
    <Modal title={c.id ? t("Sammlung bearbeiten") : t("Neue Sammlung")} onClose={onClose} footer={<>
      {c.id && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button variant="primary" disabled={!c.name.trim()} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Name")}><input className="input" value={c.name} maxLength={40} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder={t("z. B. Memes")} /></Field>
      <div className="list" style={{ maxHeight: "45vh", overflow: "auto" }}>
        {sounds.map((s) => <label key={s.id} className="list-item checkbox"><input type="checkbox" checked={c.soundIds.includes(s.id)} onChange={() => toggle(s.id)} />{s.name}</label>)}
      </div>
    </Modal>
  );
}
