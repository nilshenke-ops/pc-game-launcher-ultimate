// Medien: photo museum (F3), memory book (F4), screenshot sorting (F21), clip moments (F22) and soundtracks (F23).
// Everything is kept in the collections store (this device + PC); only PC captures need the PC.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
import { useSearchParams } from "react-router-dom";
import { BookHeart, ExternalLink, Film, Images, Music2, Play, SortAsc } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { bytes } from "../lib/format";
import { newId, type Entry } from "../lib/journal";
import type { Data } from "../lib/collections";
import { CLIPMARK, TRACK } from "../lib/collection-schemas";
import { fmtTime, linkAt, musicService, parseTime } from "../lib/media";
import { readCapture } from "../lib/captures";
import { CollectionView } from "../components/collection-view";
import { JImage, SyncBadge, trySave } from "../components/journal-ui";
import { Banner, Button, Field, Meter, PageHead } from "../components/ui";
import { Museum } from "../components/media-museum";
import { MemoryBook } from "../components/media-book";
import { SortView, useCaptureVideos } from "../components/media-sort";

type Tab = "museum" | "book" | "sort" | "clips" | "music";
const TABS: Tab[] = ["museum", "book", "sort", "clips", "music"];

export default function MediaPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "museum") as Tab;
  const focus = params.get("id");
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Medien")} text={t("Fotomuseum, Erinnerungsbuch, Screenshots sortieren, Clip-Momente und Soundtracks – auf diesem Gerät gespeichert, auch ohne PC.")} actions={<SyncBadge />} />
      <div className="stack">
        <PageTabs page="media" tabs={[["museum", <Images size={15} />, t("Fotomuseum")], ["book", <BookHeart size={15} />, t("Erinnerungsbuch")], ["sort", <SortAsc size={15} />, t("Sortieren")], ["clips", <Film size={15} />, t("Clip-Momente")], ["music", <Music2 size={15} />, t("Soundtracks")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
        {tab === "museum" && <Museum key={`m${focus ?? ""}${params.get("album") ?? ""}`} focus={focus} albumFocus={params.get("album")} />}
        {tab === "book" && <MemoryBook key={`b${focus ?? ""}`} focus={focus} />}
        {tab === "sort" && <SortView />}
        {tab === "clips" && <CollectionView key="c" schema={CLIPMARK} icon={<Film size={18} />} focus={focus}
          intro={t("Merke dir Stellen in Aufnahmen, die es schon gibt – als Videolink oder Aufnahme vom PC. Nexus nimmt hier nichts auf und schneidet keine Clips.")}
          cardExtra={(e) => <span className="tiny muted">{t("{n} Momente", { n: ((e.data.marks as Data[]) ?? []).length })}{e.data.captureName ? " · " + t("Aufnahme vom PC") : e.data.url ? " · " + t("Videolink") : ""}</span>}
          editorExtra={(d, set) => <CapturePick d={d} set={set} />}
          detail={(e) => <ClipTools e={e} />} />}
        {tab === "music" && <CollectionView key="s" schema={TRACK} icon={<Music2 size={18} />} focus={focus}
          intro={t("Lieblingsstücke aus Spielen mit Links zu offiziellen Musikdiensten. Es gibt keinen eingebauten Player: Abgespielt wird beim jeweiligen Dienst, nichts wird heruntergeladen.")}
          cardExtra={(e) => <TrackCard e={e} />}
          detail={(e) => <TrackTools e={e} />} />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------ clip moments

function CapturePick({ d, set }: { d: Data; set: (k: string, v: unknown) => void }) {
  const videos = useCaptureVideos();
  return (
    <Field label={t("Aufnahme vom PC")} hint={videos.length ? t("Clips aus den Aufnahme-Ordnern des PCs (Liste vom letzten Abruf).") : t("Keine Clips vom PC bekannt – PC verbinden oder einen Videolink eintragen.")}>
      <select className="input" value={String(d.captureId ?? "")} onChange={(e) => { const c = videos.find((v) => v.id === e.target.value); set("captureId", c?.id ?? null); set("captureName", c?.name ?? null); }}>
        <option value="">–</option>
        {videos.map((v) => <option key={v.id} value={v.id}>{[v.name, v.game, new Date(v.taken).toLocaleDateString()].filter(Boolean).join(" · ")}</option>)}
        {!!d.captureId && !videos.some((v) => v.id === d.captureId) && <option value={String(d.captureId)}>{String(d.captureName ?? d.captureId)} ({t("nicht mehr in der Liste")})</option>}
      </select>
    </Field>
  );
}

function ClipTools({ e }: { e: Entry<Data> }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const videos = useCaptureVideos();
  const cap = videos.find((v) => v.id === e.data.captureId);
  const [url, setUrl] = useState<string | null>(null);
  const [p, setP] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const marks = [...((e.data.marks as { time?: string; text?: string; tag?: string; fav?: boolean }[]) ?? [])].map((m) => ({ ...m, sec: parseTime(String(m.time ?? "")) })).sort((a, b) => (a.sec ?? 0) - (b.sec ?? 0));
  const link = typeof e.data.url === "string" ? e.data.url : null;
  const jumps = link ? linkAt(link, 0) != null : false;
  const load = async () => {
    if (!cap) return;
    setP(0);
    try { setUrl(URL.createObjectURL(await readCapture(cap, setP))); } catch (err) { toast((err as Error).message, "error"); } finally { setP(null); }
  };
  const seek = (sec: number) => { const v = video.current; if (!v) return; v.currentTime = sec; void v.play().catch(() => {}); };
  const toBook = () => {
    const id = newId();
    const favs = marks.filter((m) => m.fav).map((m) => `${m.time} – ${m.text}`);
    if (trySave("book", id, { title: String(e.data.title ?? ""), date: String(e.data.recordedAt ?? new Date().toISOString().slice(0, 10)), game: e.data.game ?? { gameId: null, gameName: null }, category: null, text: favs.join("\n"), imageIds: [], media: link ? [{ label: String(e.data.title ?? ""), url: link }] : [], tags: [], favorite: false, links: [e.id] })) {
      toast(t("Im Erinnerungsbuch angelegt"), "success");
      location.hash = `#/media?tab=book&id=${id}`;
    }
  };
  return (
    <div className="stack">
      {link && <a className="j-link-chip" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> {t("Videolink öffnen")}</a>}
      {link && !jumps && <span className="tiny muted">{t("Diese Seite unterstützt keinen Sprung an eine Zeit – der Link öffnet am Anfang.")}</span>}
      {!!e.data.captureId && (
        <div className="stack-sm">
          <span className="small">{t("Aufnahme vom PC")}: <b>{String(e.data.captureName ?? "")}</b></span>
          {!cap ? <span className="tiny muted">{t("Die Datei ist in der Aufnahme-Liste des PCs gerade nicht zu sehen (verschoben, gelöscht oder PC noch nicht verbunden).")}</span>
            : url ? <video ref={video} src={url} controls playsInline className="m-video" />
            : online ? (cap.size > 300 * 1024 * 1024 ? <span className="tiny muted">{t("Über 300 MB – bitte am PC ansehen.")}</span> : <Button icon={<Play size={15} />} busy={p != null} onClick={() => void load()}>{t("Abspielen ({s} laden)", { s: bytes(cap.size) })}</Button>)
            : <span className="tiny muted">{t("Zum Abspielen den PC verbinden.")}</span>}
          {p != null && <Meter value={p * 100} />}
        </div>
      )}
      {marks.length > 0 && (
        <div className="list">
          {marks.map((m, i) => {
            const at = m.sec != null && link ? linkAt(link, m.sec) : null;
            return (
              <div key={i} className="list-item">
                <span className="badge mono">{m.sec != null ? fmtTime(m.sec) : String(m.time)}</span>
                <div className="grow" style={{ minWidth: 0 }}><div className="small">{String(m.text ?? "")}{m.fav ? " ★" : ""}</div>{!!m.tag && <div className="tiny muted">#{String(m.tag)}</div>}</div>
                {url && m.sec != null && <Button size="sm" variant="ghost" icon={<Play size={14} />} aria-label={t("Hier abspielen")} onClick={() => seek(m.sec!)} />}
                {at && <a className="btn sm ghost" href={at} target="_blank" rel="noopener noreferrer" aria-label={t("Bei {t} öffnen", { t: fmtTime(m.sec!) })}><ExternalLink size={14} /></a>}
              </div>
            );
          })}
        </div>
      )}
      <div><Button size="sm" icon={<BookHeart size={15} />} onClick={toBook}>{t("Ins Erinnerungsbuch")}</Button></div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ soundtracks

const trackLinks = (e: Entry<Data>) => ((e.data.links as Data[]) ?? []).map((l) => String(l.url ?? "")).filter(Boolean);

function TrackCard({ e }: { e: Entry<Data> }) {
  const services = [...new Set(trackLinks(e).map((u) => musicService(u) ?? t("Website")))];
  return (
    <span className="row nowrap" style={{ gap: 8, width: "100%" }}>
      {!!e.data.cover && <span className="m-cover"><JImage id={String(e.data.cover)} /></span>}
      {services.length > 0 && <span className="row" style={{ gap: 4 }}>{services.map((s) => <span key={s} className="badge">{s}</span>)}</span>}
    </span>
  );
}

function TrackTools({ e }: { e: Entry<Data> }) {
  const links = trackLinks(e);
  return (
    <div className="stack-sm">
      {!!e.data.cover && <div className="m-cover big"><JImage id={String(e.data.cover)} /></div>}
      {links.length ? <div className="row" style={{ gap: 6 }}>{links.map((u, i) => <a key={i} className="btn sm" href={u} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {t("Bei {s} öffnen", { s: musicService(u) ?? new URL(u).hostname })}</a>)}</div>
        : <Banner kind="info">{t("Noch kein Link. Füge einen offiziellen Link hinzu (Spotify, Apple Music, YouTube, Bandcamp …), um das Stück dort zu hören.")}</Banner>}
      <span className="tiny muted">{t("Kein eingebauter Player: Nexus spielt nichts selbst ab und speichert keine Musik.")}</span>
    </div>
  );
}
