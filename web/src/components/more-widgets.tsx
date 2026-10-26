// More built-in home widgets (2.45): from the collections on this device (journal, friends, media, worlds, play) and
// from the PC (captures, storage, history). Every widget shows only real data – empty means "nothing there yet".

import { useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Dices, ExternalLink, Film, Image as ImageIcon } from "lucide-react";
import { t } from "../lib/i18n";
import { useConn, useNow, useRpc } from "../lib/hooks";
import { bytes, duration, relTime } from "../lib/format";
import { useJournal, type Entry } from "../lib/journal";
import type { Memory } from "../lib/journal-logic";
import { tally, rsvpCount, type Invitee, type Poll } from "../lib/friends";
import { taskProgress, type Data } from "../lib/collections";
import { musicService } from "../lib/media";
import type { Challenge } from "../lib/play";
import { useThumbs, type CaptureList } from "../lib/captures";
import type { StorageInfo } from "./MonitorExtras";
import { dailyPick, topPlayed, type Sessions } from "../lib/widget-data";
import { gameLabel, JImage, useGames } from "./journal-ui";
import { Button, Meter } from "./ui";

const empty = (text: string, to: string, link: string) => <span className="small muted">{text} <Link to={to}>{link}</Link></span>;

// ---------------------------------------------------------------- Wo war ich?

export function MemoryWidget() {
  const list = useJournal<Memory>("memory");
  const games = useGames();
  const last = [...list].sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at))[0];
  if (!last) return empty(t("Noch keine Notiz."), "/journal", t("Wo war ich?"));
  const d = last.data;
  return (
    <Link to={`/journal?tab=memory&id=${last.id}`} className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      <b className="ellipsis">{gameLabel(d, games) || t("Spiel")}</b>
      {d.where && <span className="small">{t("Wo")}: {d.where}</span>}
      {d.next && <span className="small">{t("Als Nächstes")}: {d.next}</span>}
      {!d.where && !d.next && <span className="small ellipsis">{d.did}</span>}
      <span className="tiny muted">{relTime(d.at)}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- next gaming night

interface Night { title: string; start: string; minutes: number; games: string[]; invitees: Invitee[]; cancelled?: boolean }

export function NightWidget() {
  const list = useJournal<Night>("night");
  const now = useNow(60000);
  const next = list.filter((n) => !n.data.cancelled && Date.parse(n.data.start) + Math.max(n.data.minutes, 1) * 60000 > now)
    .sort((a, b) => Date.parse(a.data.start) - Date.parse(b.data.start))[0];
  if (!next) return empty(t("Kein Gaming-Abend geplant."), "/friends?tab=nights", t("Planen"));
  const n = next.data, c = rsvpCount(n.invitees);
  const running = Date.parse(n.start) <= now;
  return (
    <Link to={`/friends?tab=nights&id=${next.id}`} className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      <b className="ellipsis">{n.title}</b>
      <span className="small">{running ? t("läuft gerade") : new Date(n.start).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      {n.games.length > 0 && <span className="small muted ellipsis">{n.games.join(", ")}</span>}
      <span className="tiny muted">{t("{y} Zusagen · {m} vielleicht · {o} offen", { y: c.yes, m: c.maybe, o: c.open })}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- open poll

export function PollWidget() {
  const list = useJournal<Poll>("poll");
  const now = useNow(60000);
  const open = list.filter((p) => !p.data.closed && (!p.data.until || Date.parse(p.data.until) > now)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!open) return empty(t("Keine offene Abstimmung."), "/friends?tab=polls", t("Abstimmung starten"));
  const r = tally(open.data);
  const top = [...r.counts].sort((a, b) => b.votes - a.votes).slice(0, 3);
  return (
    <Link to="/friends?tab=polls" className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      <b className="ellipsis">{open.data.title}</b>
      {top.map((o) => (
        <div key={o.index} className="stack-xs">
          <span className="row between small"><span className="ellipsis">{o.text}</span><b>{o.votes}</b></span>
          <Meter value={r.voters ? (o.votes / r.voters) * 100 : 0} />
        </div>
      ))}
      <span className="tiny muted">{t("{n} haben abgestimmt", { n: r.voters })}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- photo of the day

interface PhotoLite { title: string; imageId: string; thumbId?: string; takenAt?: string | null; favorite?: boolean; game?: { gameId?: string | null; gameName?: string | null } }

export function PhotoWidget() {
  const list = useJournal<PhotoLite>("photo");
  const now = useNow(3600000);
  const games = useGames();
  const favs = list.filter((p) => p.data.favorite);
  const p = dailyPick(favs.length ? favs : list, now);
  if (!p) return empty(t("Noch keine Fotos im Museum."), "/media?tab=museum", t("Fotos importieren"));
  return (
    <Link to={`/media?tab=museum&id=${p.id}`} className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      <div className="w-photo"><JImage id={p.data.thumbId || p.data.imageId} alt={p.data.title} /></div>
      <span className="small ellipsis"><b>{p.data.title}</b>{gameLabel(p.data.game ?? {}, games) ? ` · ${gameLabel(p.data.game ?? {}, games)}` : ""}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- build projects

export function ProjectsWidget() {
  const list = useJournal<Data>("project");
  const active = list.filter((e) => !e.data.archived && e.data.status !== "done").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  if (!active.length) return empty(t("Kein offenes Bauprojekt."), "/worlds?tab=project", t("Projekt anlegen"));
  return (
    <div className="stack-xs">
      {active.map((e: Entry<Data>) => {
        const p = taskProgress((e.data.tasks as { done?: boolean }[]) ?? []);
        return (
          <Link key={e.id} to={`/worlds?tab=project&id=${e.id}`} className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="row between small"><span className="ellipsis">{String(e.data.title ?? "")}</span><b>{p.total ? `${p.percent} %` : "–"}</b></span>
            <Meter value={p.percent} />
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- soundtrack tip

export function TrackWidget() {
  const list = useJournal<Data>("track");
  const now = useNow(3600000);
  const games = useGames();
  const favs = list.filter((e) => e.data.favorite && !e.data.archived);
  const tr = dailyPick(favs.length ? favs : list.filter((e) => !e.data.archived), now);
  if (!tr) return empty(t("Noch keine Soundtracks."), "/media?tab=music", t("Lieblingsstück eintragen"));
  const d = tr.data;
  const link = ((d.links as { url?: string }[]) ?? []).map((l) => l.url).find((u): u is string => !!u);
  return (
    <div className="row nowrap" style={{ gap: 10 }}>
      {!!d.cover && <span className="m-cover"><JImage id={String(d.cover)} /></span>}
      <div className="stack-xs" style={{ minWidth: 0 }}>
        <b className="ellipsis">{String(d.title ?? "")}</b>
        <span className="small muted ellipsis">{[String(d.artist ?? d.composer ?? ""), gameLabel((d.game as object) ?? {}, games)].filter(Boolean).join(" · ")}</span>
        {link ? <a className="small" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {t("Bei {s} hören", { s: musicService(link) ?? t("Website") })}</a>
          : <Link className="small" to={`/media?tab=music&id=${tr.id}`}>{t("Link hinzufügen")}</Link>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- open challenges

export function ChallengesWidget() {
  const list = useJournal<Challenge>("challenge");
  const open = list.filter((c) => c.data.status === "open").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  if (!open.length) return empty(t("Keine offene Challenge."), "/play?tab=challenges", t("Challenge ziehen"));
  return (
    <Link to="/play?tab=challenges" className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      {open.map((c) => <span key={c.id} className="small ellipsis">• {c.data.text}{c.data.gameName ? <span className="muted"> · {c.data.gameName}</span> : null}</span>)}
    </Link>
  );
}

// ---------------------------------------------------------------- dice & coin (in the browser, crypto random)

const roll = (sides: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % sides) + 1; };

export function DiceWidget() {
  const [res, setRes] = useState<{ label: string; value: string } | null>(null);
  return (
    <div className="stack-xs">
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" icon={<Dices size={14} />} onClick={() => setRes({ label: "W6", value: String(roll(6)) })}>W6</Button>
        <Button size="sm" icon={<Dices size={14} />} onClick={() => setRes({ label: "W20", value: String(roll(20)) })}>W20</Button>
        <Button size="sm" icon={<Coins size={14} />} onClick={() => setRes({ label: t("Münze"), value: roll(2) === 1 ? t("Kopf") : t("Zahl") })}>{t("Münze")}</Button>
      </div>
      <div className="w-dice" aria-live="polite">{res ? <><span className="tiny muted">{res.label}</span><b>{res.value}</b></> : <span className="small muted">{t("Antippen zum Würfeln")}</span>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- latest captures (PC, list kept on this device)

export function CapturesWidget() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const q = useRpc<CaptureList>("captures.list", {}, ["captures"]);
  const items = (q.data?.items ?? []).slice(0, 4);
  const thumbs = useThumbs(items, online);
  if (!q.data) return <span className="small muted">{q.error ? t("Braucht einmal den PC (Aufnahmen).") : "…"}</span>;
  if (!items.length) return empty(t("Noch keine Aufnahmen gefunden."), "/captures", t("Aufnahmen"));
  return (
    <Link to="/captures" className="w-caps" aria-label={t("Aufnahmen öffnen")}>
      {items.map((c) => {
        const th = thumbs.get(c.id);
        return <span key={c.id} className="w-cap">{th ? <img src={th} alt="" /> : c.kind === "video" ? <Film size={18} /> : <ImageIcon size={18} />}</span>;
      })}
    </Link>
  );
}

// ---------------------------------------------------------------- storage (drives of the PC)

export function StorageWidget() {
  const q = useRpc<StorageInfo>("storage.get", {}, ["storage"]);
  if (!q.data) return <span className="small muted">{q.error ? t("Braucht einmal den PC (Speicher).") : "…"}</span>;
  const drives = q.data.drives.filter((d) => d.total > 0).slice(0, 4);
  if (!drives.length) return <span className="small muted">{t("Keine Laufwerke gemeldet.")}</span>;
  return (
    <Link to="/storage" className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      {drives.map((d) => {
        const used = ((d.total - d.free) / d.total) * 100;
        return (
          <div key={d.name} className="stack-xs">
            <span className="row between small"><span className="ellipsis">{d.label || d.name}</span><span className={used > 90 ? "" : "muted"} style={{ color: used > 90 ? "var(--danger)" : undefined }}>{t("{f} frei", { f: bytes(d.free) })}</span></span>
            <Meter value={used} />
          </div>
        );
      })}
      {q.stale && <span className="tiny muted">{t("Stand vom letzten Verbinden")}</span>}
    </Link>
  );
}

// ---------------------------------------------------------------- most played (last 7 days)


export function TopPlayedWidget() {
  const q = useRpc<Sessions>("history.get", {}, ["history"]);
  const now = useNow(300000);
  if (!q.data) return <span className="small muted">{q.error ? t("Braucht einmal den PC (Gaming-Verlauf).") : "…"}</span>;
  const top = topPlayed(q.data.sessions, now).slice(0, 4);
  if (!top.length) return empty(t("In den letzten 7 Tagen nichts gespielt."), "/history", t("Verlauf"));
  const max = top[0].minutes;
  return (
    <Link to="/history" className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      {top.map((g) => (
        <div key={g.name} className="stack-xs">
          <span className="row between small"><span className="ellipsis">{g.name}</span><b>{duration(Math.round(g.minutes))}</b></span>
          <Meter value={(g.minutes / max) * 100} />
        </div>
      ))}
      {q.stale && <span className="tiny muted">{t("Stand vom letzten Verbinden")}</span>}
    </Link>
  );
}
