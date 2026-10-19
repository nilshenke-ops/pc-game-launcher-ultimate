// Home widgets that are useful without a PC: shortcuts, clock, notes, "play next" (cached backlog) and first steps.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, Dices, Play } from "lucide-react";
import { client, readJson, writeJson } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useConn, useNow, useRpc } from "../lib/hooks";
import { navItems } from "../lib/nav";
import { DEFAULT_THEME, setPrefs, usePrefs } from "../lib/prefs";
import { pickRandom, statusLabel } from "../lib/backlog";
import { gradientFor } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Button, Thumb } from "./ui";
import { DeckIcon, KeyFace } from "./deck-icons";
import { slots, textOn, type Deck, type DeckKey } from "../lib/deck";
import { runDeckAction } from "../lib/deck-run";
import { useAppState } from "../lib/state";

export const DEFAULT_SHORTCUTS = ["/deck", "/backlog", "/assistant", "/soundboard", "/games", "/settings"];

/** Big tiles for the most used areas; chosen in the edit mode of the home screen. */
export function ShortcutsWidget({ edit }: { edit: boolean }) {
  const prefs = usePrefs();
  const all = navItems();
  const paths = prefs.homeShortcuts.length ? prefs.homeShortcuts : DEFAULT_SHORTCUTS;
  const shown = paths.map((p) => all.find((i) => i.path === p)).filter((i): i is NonNullable<typeof i> => !!i && !prefs.nav.hidden.includes(i.path));
  const toggle = (path: string) => setPrefs((p) => {
    const cur = p.homeShortcuts.length ? p.homeShortcuts : DEFAULT_SHORTCUTS;
    return { ...p, homeShortcuts: cur.includes(path) ? cur.filter((x) => x !== path) : [...cur, path].slice(0, 8) };
  });
  return (
    <div className="stack-sm">
      <div className="home-tiles">
        {shown.map((i) => (
          <Link key={i.path} to={i.path} className="home-tile" style={{ ["--tile" as string]: gradientFor(i.path) }}>
            <span className="home-tile-icon"><i.icon size={22} /></span>
            <span className="home-tile-label">{i.short ?? i.label}</span>
          </Link>
        ))}
      </div>
      {edit && (
        <div className="chips" role="group" aria-label={t("Schnellstart wählen")} style={{ flexWrap: "wrap" }}>
          {all.filter((i) => i.path !== "/").map((i) => (
            <button key={i.path} type="button" aria-pressed={shown.some((s) => s.path === i.path)} className={`chip ${shown.some((s) => s.path === i.path) ? "on" : ""}`} onClick={() => toggle(i.path)}>{i.short ?? i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClockWidget() {
  const now = useNow(15000);
  const d = new Date(now);
  return (
    <div className="home-clock">
      <div className="home-time">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="muted">{d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
    </div>
  );
}

const NOTES_KEY = "pgl.notes";
/** Own notes on this device (e.g. codes, plans for the evening). Never sent anywhere. */
export function NotesWidget() {
  const [text, setText] = useState(() => readJson<string>(NOTES_KEY) ?? "");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const change = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => writeJson(NOTES_KEY, v), 400);
  };
  return (
    <div className="stack-sm">
      <textarea className="input home-notes" value={text} maxLength={2000} onChange={(e) => change(e.target.value)} placeholder={t("Notizen, z. B. Pläne für heute Abend …")} aria-label={t("Notizen")} />
      <span className="tiny muted">{t("Nur auf diesem Gerät gespeichert.")}</span>
    </div>
  );
}

/** "Als Nächstes spielen" from the backlog – the list comes from the PC and is kept on the device, so it also shows offline. */
export function NextWidget() {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const list = useMemo(() => (lib.data?.items ?? []).filter((i) => i.backlog === "playing" || i.backlog === "next")
    .sort((a, b) => (a.backlog === "playing" ? -1 : 0) - (b.backlog === "playing" ? -1 : 0) || (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 4), [lib.data]);
  const pool = (lib.data?.items ?? []).filter((i) => i.backlog === "backlog" || i.backlog === "next");
  const launch = (i: LibraryItem) => client.call("library.launch", { id: i.id }).then(() => toast(t("{name} wird gestartet", { name: i.name }), "success"), (e: Error) => toast(e.message, "error"));
  const [pick, setPick] = useState<LibraryItem | null>(null);
  if (!list.length && !pool.length) return <p className="small muted">{t("Noch nichts geplant.")} <Link to="/backlog">{t("Zum Backlog")}</Link></p>;
  return (
    <div className="stack-sm">
      <div className="list">
        {(pick ? [pick] : list).map((i) => (
          <div key={i.id} className="list-item">
            <Thumb name={i.name} icon={i.iconData} cover={i.coverUrl} gradient={gradientFor(i.name)} />
            <div className="grow" style={{ minWidth: 0 }}><div className="title ellipsis">{i.name}</div><div className="sub">{statusLabel(i.backlog ?? "")}</div></div>
            <Button size="sm" variant="primary" icon={<Play size={14} />} disabled={!online} title={online ? undefined : t("Braucht den PC")} onClick={() => launch(i)} aria-label={t("{name} starten", { name: i.name })} />
          </div>
        ))}
      </div>
      {pool.length > 1 && <Button size="sm" icon={<Dices size={15} />} onClick={() => setPick(pickRandom(pool, true))}>{pick ? t("Nochmal") : t("Zufällig auswählen")}</Button>}
    </div>
  );
}

/** First steps until everything is set up; disappears by itself afterwards. */
export function StartWidget() {
  const prefs = usePrefs();
  const deck = useRpc<{ decks: unknown[] }>("deck.list", {}, ["deck"]);
  const steps = [
    { done: !!client.credentials || client.status.auth === "ok", label: t("PC verbinden (QR-Code aus dem Nexus Gaming Hub scannen)"), to: "/connect" },
    { done: (deck.data?.decks.length ?? 0) > 0, label: t("Deck mit großen Tasten anlegen"), to: "/deck" },
    { done: prefs.theme.preset !== DEFAULT_THEME.preset || prefs.theme.primary !== DEFAULT_THEME.primary || !!prefs.theme.bgScene, label: t("Design wählen"), to: "/settings?s=design" },
    { done: prefs.homeShortcuts.length > 0 || prefs.nav.bottom.join() !== "/,/deck,/games,/soundboard", label: t("Untere Leiste anpassen (lange auf die Leiste drücken)"), to: "/settings?s=design" },
  ];
  const open = steps.filter((s) => !s.done).length;
  return (
    <div className="stack-sm">
      <div className="small muted">{open ? t("Noch {n} von {m} Schritten", { n: open, m: steps.length }) : t("Alles eingerichtet.")}</div>
      {steps.map((s) => (
        <Link key={s.label} to={s.to} className={`home-step ${s.done ? "done" : ""}`}>
          {s.done ? <Check size={18} /> : <Circle size={18} />}<span>{s.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Play/pause, tracks and volume on the PC – like the media keys of the keyboard (Windows companion). */
export function MediaWidget() {
  const press = (key: string) => client.call("media.key", { key }).catch((e: Error) => toast(e.message, "error"));
  const keys: [string, string, string][] = [["prev", "skip-back", t("Vorheriger Titel")], ["playpause", "play", t("Play/Pause")], ["next", "skip-forward", t("Nächster Titel")],
    ["voldown", "volume-1", t("Leiser")], ["mute", "volume-x", t("Ton aus/an")], ["volup", "volume-2", t("Lauter")]];
  return (
    <div className="media-pad">
      {keys.map(([k, icon, label]) => <button key={k} type="button" className="media-key" aria-label={label} title={label} onClick={() => press(k)}><DeckIcon name={icon} size={22} /></button>)}
    </div>
  );
}

/** Stopwatch with quick countdowns (e.g. respawn, break, oven). Runs on this device only. */
export function TimerWidget() {
  const [target, setTarget] = useState<number | null>(null); // countdown end (ms) or null = stopwatch
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (startedAt == null && target == null) return; const id = window.setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(id); }, [startedAt, target]);
  const now = Date.now();
  const left = target != null ? Math.max(0, target - now) : 0;
  const done = target != null && left === 0;
  const notified = useRef(false);
  useEffect(() => { if (done && !notified.current) { notified.current = true; navigator.vibrate?.([200, 100, 200]); } if (!done) notified.current = false; }, [done]);
  const ms = target != null ? left : acc + (startedAt != null ? now - startedAt : 0);
  const sec = target != null ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const text = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const countdown = (m: number) => { setStartedAt(null); setAcc(0); setTarget(Date.now() + m * 60000); };
  const toggle = () => { if (target != null) { setTarget(null); return; } if (startedAt != null) { setAcc(ms); setStartedAt(null); } else setStartedAt(Date.now()); };
  return (
    <div className="stack-sm" style={{ alignItems: "center" }}>
      <div className="home-time" style={{ color: done ? "var(--danger)" : undefined }} aria-live="polite">{done ? t("Zeit um!") : text}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <Button size="sm" variant="primary" onClick={toggle}>{target != null ? t("Stopp") : startedAt != null ? t("Pause") : t("Stoppuhr")}</Button>
        <Button size="sm" onClick={() => { setStartedAt(null); setAcc(0); setTarget(null); }}>{t("Zurücksetzen")}</Button>
      </div>
      <div className="chips" style={{ justifyContent: "center", flexWrap: "wrap" }}>{[1, 3, 5, 10, 15].map((m) => <button key={m} type="button" className="chip" onClick={() => countdown(m)}>{m} min</button>)}</div>
    </div>
  );
}

/** The deck in small – first page of the deck shown on the deck page (or the one linked to the active profile). */
export function MiniDeckWidget() {
  const decks = useRpc<{ decks: Deck[] }>("deck.list", {}, ["deck"]);
  const lib = useRpc<{ items: LibraryItem[]; running: string[] }>("library.list", {}, ["library"]);
  const { state } = useAppState();
  const [stack, setStack] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const list = decks.data?.decks ?? [];
  const picked = readJson<string>("pgl.deck.selected") ?? (() => { try { return localStorage.getItem("pgl.deck.selected"); } catch { return null; } })();
  const deck = list.find((d) => d.profileId && d.profileId === state?.activeProfile?.id) ?? list.find((d) => d.id === picked) ?? list[0];
  if (!deck) return <p className="small muted">{t("Noch kein Deck.")} <Link to="/deck">{t("Deck anlegen")}</Link></p>;
  const page = deck.pages.find((p) => p.id === stack[stack.length - 1]) ?? deck.pages[0];
  const used = Math.max(0, ...page.keys.map((k) => k.slot)) + 1;
  const cells = slots(page, deck.cols, Math.min(deck.rows, Math.ceil(used / deck.cols)));
  const items = new Map((lib.data?.items ?? []).map((i) => [i.id, i]));
  const press = async (k: DeckKey) => {
    const a = k.action;
    if (a.type === "folder" && a.ref) { setStack((s) => [...s, a.ref!]); return; }
    if (a.type === "back") { setStack((s) => s.slice(0, -1)); return; }
    if (a.type === "open" && a.ref) { location.hash = "#" + a.ref; return; }
    if (a.type === "none" || busy) return;
    setBusy(k.id);
    try { await runDeckAction(a, items.get(a.ref ?? "")?.name ?? k.label ?? ""); } finally { setBusy(null); }
  };
  return (
    <div className="mini-deck" style={{ gridTemplateColumns: `repeat(${deck.cols}, minmax(0, 1fr))` }}>
      {cells.map((k, i) => k ? (
        <button key={k.id} type="button" className={`deck-key ${k.action.type === "launch" && lib.data?.running.includes(k.action.ref ?? "") ? "on" : ""}`} style={{ background: k.color ?? undefined, color: k.textColor ?? textOn(k.color), ["--key" as string]: "64px" }}
          aria-busy={busy === k.id} aria-label={k.label ?? ""} onClick={() => press(k)}><KeyFace k={k} item={items.get(k.action.ref ?? "")} /></button>
      ) : <span key={`e${i}`} />)}
    </div>
  );
}
