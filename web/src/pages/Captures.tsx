import { useEffect, useMemo, useState } from "react";
import { Camera, Download, Film, Heart, Image as ImageIcon, Play, RefreshCw, Search, Tag, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Meter, Modal, PageHead } from "../components/ui";
import { filterCaptures, groupCaptures, readCapture, useThumbs, type Capture, type CaptureList, type GroupBy } from "../lib/captures";
import { saveToDevice } from "../lib/transfer";
import { useLaunch } from "../components/launch-tiles";
import type { LibraryItem } from "../lib/types";

const PAGE = 120;

/** Screenshots and clips from the PC – browsable without the PC (list and thumbnails seen before). */
export default function CapturesPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<CaptureList>("captures.list", {}, ["captures"]);
  const [kind, setKind] = useState<"all" | "image" | "video" | "fav">("all");
  const [group, setGroup] = useState<GroupBy>("game");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Capture | null>(null);

  const items = useMemo(() => filterCaptures(q.data?.items ?? [], kind, search), [q.data, kind, search]);
  const visible = items.slice(0, shown);
  const groups = useMemo(() => groupCaptures(visible, group, t("Ohne erkanntes Spiel")), [visible, group]);
  const thumbs = useThumbs(visible, online);
  useEffect(() => setShown(PAGE), [kind, search, group]);
  const d = q.data;

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Aufnahmen")}
        text={t("Screenshots und Clips vom PC – nach Spiel, Tag oder Ordner. Bereits angesehene Vorschaubilder bleiben auf dem Gerät, Favoriten und Schlagwörter gehen auch ohne PC.")}
        actions={online && <Button icon={<RefreshCw size={16} />} busy={d?.scanning} onClick={() => client.call("captures.scan").catch((e: Error) => toast(e.message, "error"))}>{t("Neu einlesen")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            {q.stale && <Banner kind="info">{t("Ohne PC: Stand vom {d}. Vorschaubilder, die du schon gesehen hast, sind da; ganze Dateien öffnen geht mit dem PC.", { d: dateTime(q.updatedAt ? new Date(q.updatedAt).toISOString() : null) })}</Banner>}
            {d.truncated && <Banner kind="warn">{t("Sehr viele Dateien – gezeigt werden die ersten 5000.")}</Banner>}
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {([["all", t("Alle")], ["image", t("Screenshots")], ["video", t("Clips")], ["fav", t("Favoriten")]] as const).map(([k, l]) => (
                <button key={k} type="button" className={`chip ${kind === k ? "on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
              ))}
              <select className="input" style={{ width: "auto" }} aria-label={t("Gruppieren nach")} value={group} onChange={(e) => setGroup(e.target.value as GroupBy)}>
                <option value="game">{t("Nach Spiel")}</option><option value="day">{t("Nach Tag")}</option><option value="folder">{t("Nach Ordner")}</option>
              </select>
              <label className="search-inline grow"><Search size={15} /><input className="input" placeholder={t("Suchen (Name, Spiel, Schlagwort)")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("Aufnahmen suchen")} /></label>
            </div>
            {items.length === 0 ? (
              <Empty icon={<Camera size={22} />} title={d.items.length ? t("Nichts gefunden") : t("Noch keine Aufnahmen gefunden")}
                text={d.items.length ? t("Anderen Filter oder Suchbegriff probieren.") : t("Gesucht wird in: {f}. Eigene Ordner fügst du am PC hinzu (Einstellungen dieser Seite am PC).", { f: d.folders.map((f) => f.label).join(", ") || t("keinem Ordner") })} />
            ) : groups.map(([name, list]) => (
              <Card key={name} title={`${name} (${list.length})`}>
                <div className="cap-grid">
                  {list.map((c) => {
                    const th = thumbs.get(c.id);
                    return (
                      <button key={c.id} type="button" className="cap-tile" onClick={() => setOpen(c)} aria-label={`${c.name}${c.favorite ? " · " + t("Favorit") : ""}`}>
                        {th ? <img src={th} alt="" loading="lazy" /> : <span className="cap-ph">{c.kind === "video" ? <Film size={26} /> : <ImageIcon size={26} />}</span>}
                        {c.kind === "video" && <span className="cap-badge"><Play size={12} /></span>}
                        {c.favorite && <span className="cap-fav"><Heart size={13} fill="currentColor" /></span>}
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
            {items.length > shown && <Button onClick={() => setShown((n) => n + PAGE)}>{t("Mehr anzeigen ({n} weitere)", { n: items.length - shown })}</Button>}
            <p className="tiny muted">{t("Ordner: {f}. Es werden nur Bilder und Videos gezeigt; im Videos-Ordner nur Dateien erkannter Spiele.", { f: d.folders.map((f) => f.label).join(", ") || "–" })}</p>
            {online && <FolderSettings list={d} />}
          </div>
        )}
      </Loadable>
      {open && <CaptureViewer c={(d?.items ?? []).find((x) => x.id === open.id) ?? open} thumb={thumbs.get(open.id) ?? null} online={online} canManage={canManage} canRecycle={!!d?.canRecycle} onClose={() => setOpen(null)} />}
    </>
  );
}

function CaptureViewer({ c, thumb, online, canManage, canRecycle, onClose }: { c: Capture; thumb: string | null; online: boolean; canManage: boolean; canRecycle: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [tags, setTags] = useState(c.tags.join(", "));
  const { launch } = useLaunch();
  const tooBig = c.size > 300 * 1024 * 1024;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async () => {
    setP(0);
    try { const b = await readCapture(c, setP); setBlob(b); setUrl(URL.createObjectURL(b)); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setP(null); }
  };
  // Pictures load right away (small); clips only on request.
  useEffect(() => { if (online && c.kind === "image" && c.size < 25 * 1024 * 1024) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [c.id]);

  const update = (x: { favorite?: boolean; tags?: string[] }) => client.call("captures.update", { id: c.id, ...x }).catch((e: Error) => toast(e.message, "error"));
  const remove = async () => {
    if (!(await confirmDialog(t("In den Papierkorb?"), t("„{f}“ wird am PC in den Papierkorb verschoben (dort wiederherstellbar).", { f: c.name }), { danger: true, ok: t("Papierkorb") }))) return;
    client.call("captures.remove", { id: c.id }).then(onClose, (e: Error) => toast(e.message, "error"));
  };

  return (
    <Modal title={c.name} wide onClose={onClose} footer={<>
      {canManage && online && canRecycle && <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} style={{ marginRight: "auto" }}>{t("Papierkorb")}</Button>}
      {online && <Button icon={<Download size={15} />} busy={p != null} disabled={tooBig && !blob} onClick={async () => { if (blob) await saveToDevice(c.name, blob); else { setP(0); try { const b = await readCapture(c, setP); await saveToDevice(c.name, b); } catch (e) { toast((e as Error).message, "error"); } finally { setP(null); } } }}>{t("Aufs Gerät")}</Button>}
      <Button onClick={onClose}>{t("Schließen")}</Button>
    </>}>
      <div className="stack">
        <div className="cap-view">
          {url && c.kind === "image" && <img src={url} alt={c.name} />}
          {url && c.kind === "video" && <video src={url} controls playsInline autoPlay />}
          {!url && (thumb ? <img src={thumb} alt={c.name} /> : <span className="cap-ph big">{c.kind === "video" ? <Film size={40} /> : <ImageIcon size={40} />}</span>)}
        </div>
        {p != null && <Meter value={p * 100} />}
        {!url && c.kind === "video" && online && !tooBig && <Button icon={<Play size={15} />} busy={p != null} onClick={() => void load()}>{t("Clip abspielen ({s} laden)", { s: bytes(c.size) })}</Button>}
        {tooBig && <p className="small muted">{t("Über 300 MB – bitte am PC ansehen.")}</p>}
        {!online && <p className="small muted">{t("Ohne PC nur das Vorschaubild. Favorit und Schlagwörter kannst du trotzdem setzen.")}</p>}
        <div className="small muted">{[c.game, c.folder, bytes(c.size), dateTime(c.taken)].filter(Boolean).join(" · ")}</div>
        {canManage && <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button icon={<Heart size={15} fill={c.favorite ? "currentColor" : "none"} />} aria-pressed={c.favorite} onClick={() => void update({ favorite: !c.favorite })}>{c.favorite ? t("Favorit") : t("Als Favorit")}</Button>
            {c.itemId && online && <Button icon={<Play size={15} />} onClick={() => void launch({ id: c.itemId!, name: c.game ?? "" } as LibraryItem)}>{t("{n} starten", { n: c.game ?? "" })}</Button>}
          </div>
          <Field label={t("Schlagwörter (mit Komma trennen)")}>
            <div className="row nowrap" style={{ gap: 8 }}>
              <input className="input" value={tags} maxLength={200} placeholder={t("z. B. Clutch, Ace, Lustig")} onChange={(e) => setTags(e.target.value)} />
              <Button icon={<Tag size={15} />} onClick={() => void update({ tags: tags.split(",").map((x) => x.trim()).filter(Boolean) })}>{t("Speichern")}</Button>
            </div>
          </Field>
        </>}
      </div>
    </Modal>
  );
}

function FolderSettings({ list }: { list: CaptureList }) {
  const canAdmin = useCan("admin");
  const [path, setPath] = useState("");
  return (
    <Card title={t("Ordner")}>
      <div className="list">
        {list.folders.map((f) => (
          <div key={f.path} className="list-item">
            <div className="grow" style={{ minWidth: 0 }}><div className="title small">{f.label}</div><div className="sub tiny mono ellipsis">{f.path}</div></div>
            {!f.exists && <span className="badge warn">{t("fehlt")}</span>}
            {f.source !== "auto" && f.source !== "auto-games" && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Ordner nicht mehr durchsuchen")} onClick={() => client.call("captures.removeFolder", { path: f.path }).catch((e: Error) => toast(e.message, "error"))} />}
          </div>
        ))}
      </div>
      {canAdmin ? (
        <form className="row nowrap" style={{ gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); client.call("captures.addFolder", { path }).then(() => { setPath(""); toast(t("Ordner hinzugefügt"), "success"); }, (err: Error) => toast(err.message, "error")); }}>
          <input className="input" value={path} placeholder={t("z. B. D:\\Aufnahmen")} aria-label={t("Ordnerpfad am PC")} onChange={(e) => setPath(e.target.value)} />
          <Button type="submit" disabled={!path.trim()}>{t("Hinzufügen")}</Button>
        </form>
      ) : <p className="tiny muted" style={{ marginTop: 8 }}>{t("Eigene Ordner fügst du direkt am PC hinzu (dort hat die App Verwaltungsrechte). OBS-Ordner kommen automatisch dazu, sobald OBS etwas speichert; Medal, NVIDIA, Xbox Game Bar und Steam werden von selbst gefunden.")}</p>}
    </Card>
  );
}
