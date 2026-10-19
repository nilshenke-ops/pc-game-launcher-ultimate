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
