// "Was spiele ich?": game finder by the time you have, challenge generator and gaming bingo. Works without the PC
// (last known library and history; own entries are kept in this browser and compared with the PC – lib/journal.ts).

import { useMemo, useState, type ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
import { useSearchParams } from "react-router-dom";
import { Clock, Dices, Grid3x3, Pencil, Play, Plus, RefreshCw, Save, Swords, Trash2, Trophy } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime, gradientFor } from "../lib/format";
import { toast, useRpc } from "../lib/hooks";
import type { LibraryItem } from "../lib/types";
import { statusLabel, STATUSES } from "../lib/backlog";
import { newId, removeEntry, useJournal, type Entry } from "../lib/journal";
import { memorySummary, pathProgress, type Find, type GoalPath, type Memory } from "../lib/journal-logic";
import {
  findGames, generateChallenges, OPEN_END, randomSuggestion,
  TIME_PRESETS, type Challenge, type GameStats, type Suggestion,
} from "../lib/play";
import { useLaunch } from "../components/launch-tiles";
import { Banner, Button, Card, confirmDialog, Empty, Field, Modal, PageHead, Switch, Thumb } from "../components/ui";
import { GamePicker, gameLabel, SyncBadge, trySave, useGames } from "../components/journal-ui";
import { BingoArea } from "../components/bingo-view";

type Tab = "time" | "challenges" | "bingo";
const TABS: Tab[] = ["time", "challenges", "bingo"];

interface HistoryData { stats: { itemId: string; totalMinutes: number; lastPlayed: string; sessions: number; typicalMinutes?: number | null }[] }

function useLibraryAndStats() {
  const lib = useRpc<{ items: LibraryItem[]; installed: Record<string, boolean> }>("library.list", {}, ["library"]);
  const hist = useRpc<HistoryData>("history.get", {}, ["history"]);
  const stats = useMemo(() => new Map<string, GameStats>((hist.data?.stats ?? []).map((s) => [s.itemId, s])), [hist.data]);
  const items = lib.data?.items ?? [];
  // Never loaded from a PC (only the empty offline default): say so instead of "nothing fits".
  return { items, installed: lib.data?.installed ?? {}, stats, stale: !!lib.stale && !!lib.updatedAt, hasLib: items.some((i) => i.kind === "game") };
}

export default function PlayPage() {
  const [params, setParams] = useSearchParams();
  const share = params.get("share");
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : share ? "bingo" : "time") as Tab;
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true });
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Was spiele ich?")} text={t("Spiele passend zu deiner Zeit, Challenges für Abwechslung und Gaming-Bingo – auch ohne PC nutzbar.")} actions={<SyncBadge />} />
      <div className="stack">
        <PageTabs page="play" tabs={[["time", <Clock size={15} />, t("Zeit-Finder")], ["challenges", <Swords size={15} />, t("Challenges")], ["bingo", <Grid3x3 size={15} />, t("Bingo")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setTab(v)} />
        {tab === "time" && <TimeFinder />}
        {tab === "challenges" && <Challenges />}
        {tab === "bingo" && <BingoTab share={share} />}
      </div>
    </>
  );
}

// ============================================================================================ F1 – time finder

function TimeFinder() {
  const { items, installed, stats, stale, hasLib } = useLibraryAndStats();
  const memories = useJournal<Memory>("memory");
  const [minutes, setMinutes] = useState(30);
  const [custom, setCustom] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [installedOnly, setInstalledOnly] = useState(true);
  const [category, setCategory] = useState("");
  const [notPlayed, setNotPlayed] = useState(0);
  const [pick, setPick] = useState<Suggestion | null>(null);
  const { launch, launching } = useLaunch();
  const categories = useMemo(() => [...new Set(items.filter((i) => i.kind === "game").flatMap((i) => i.categories))].sort(), [items]);
  const res = useMemo(() => findGames(items, stats, { minutes, statuses, installedOnly, installed, category: category || undefined, notPlayedDays: notPlayed || undefined },
    (i) => !!memorySummary(memories, { gameId: i.id, gameName: i.name })), [items, stats, minutes, statuses, installedOnly, installed, category, notPlayed, memories]);
  const setCustomMinutes = (v: string) => { setCustom(v); const n = Number(v); if (Number.isInteger(n) && n >= 5 && n <= 600) setMinutes(n); };
  return (
    <>
      <Card title={t("Wie viel Zeit hast du?")} icon={<Clock size={18} />}>
        <div className="stack-sm">
          <div className="chips" role="radiogroup" aria-label={t("Verfügbare Zeit")}>
            {TIME_PRESETS.map((m) => <button key={m} type="button" role="radio" aria-checked={minutes === m && !custom} className={`chip ${minutes === m && !custom ? "on" : ""}`} onClick={() => { setCustom(""); setMinutes(m); setPick(null); }}>{m === 15 ? t("10–15 Min.") : m === OPEN_END ? t("120+ Min.") : t("{m} Min.", { m })}</button>)}
            <label className={`chip ${custom ? "on" : ""}`}>{t("Eigene")}: <input className="j-search-input" style={{ width: 52 }} inputMode="numeric" value={custom} placeholder="75" aria-label={t("Eigene Zeit in Minuten")} onChange={(e) => setCustomMinutes(e.target.value.replace(/\D/g, ""))} /> {t("Min.")}</label>
          </div>
          {custom && !(Number(custom) >= 5 && Number(custom) <= 600) && <span className="tiny" style={{ color: "var(--warning)" }}>{t("Bitte 5 bis 600 Minuten eingeben.")}</span>}
          <div className="row" style={{ gap: 8 }}>
            <select className="input" style={{ maxWidth: 220 }} value={statuses[0] ?? ""} onChange={(e) => setStatuses(e.target.value ? [e.target.value] : [])} aria-label={t("Backlog-Status")}>
              <option value="">{t("Alle Spiele (außer durchgespielt)")}</option>
              {STATUSES.filter((s) => s !== "completed" && s !== "dropped").map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            {categories.length > 0 && <select className="input" style={{ maxWidth: 200 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("Kategorie")}><option value="">{t("Alle Kategorien")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
            <select className="input" style={{ maxWidth: 220 }} value={notPlayed} onChange={(e) => setNotPlayed(Number(e.target.value))} aria-label={t("Zuletzt gespielt")}>
              <option value={0}>{t("Egal, wann zuletzt gespielt")}</option><option value={7}>{t("Mindestens 7 Tage nicht gespielt")}</option><option value={30}>{t("Mindestens 30 Tage nicht gespielt")}</option>
            </select>
          </div>
          <Switch checked={installedOnly} onChange={setInstalledOnly} label={t("Nur installierte Spiele")} hint={t("Laut letzter Prüfung des PCs")} />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" icon={<Dices size={16} />} disabled={!res.fits.length} onClick={() => setPick(randomSuggestion(res.fits))}>{t("Zufällig eins davon")}</Button>
            <span className="tiny muted">{t("{n} passen", { n: res.fits.length })}{res.unknown.length > 0 && " · " + t("{n} ohne bekannte Dauer", { n: res.unknown.length })}</span>
          </div>
          {stale && <span className="tiny muted">{t("Spieleliste und Verlauf: zuletzt bekannter Stand vom PC.")}</span>}
        </div>
      </Card>
      {!hasLib ? <Card><Empty icon={<Clock size={28} />} title={t("Noch keine Spieleliste")} text={t("Die Spiele kommen vom PC. Verbinde ihn einmal – danach geht der Zeit-Finder auch ohne PC.")} /></Card> : <>
        {pick && <SuggestionCard s={pick} highlight launching={launching.has(pick.item.id)} onLaunch={() => void launch(pick.item)} />}
        {res.fits.length === 0 ? <Card><Empty icon={<Clock size={26} />} title={t("Kein Spiel mit bekannter Dauer passt")} text={t("Trage im Backlog bei einem Spiel „Eine Sitzung dauert etwa …“ ein – oder spiele es ein paar Mal, dann zählt der Verlauf mit.")} /></Card>
          : <div className="grid-3">{res.fits.slice(0, 30).map((s) => <SuggestionCard key={s.item.id} s={s} launching={launching.has(s.item.id)} onLaunch={() => void launch(s.item)} />)}</div>}
        {res.unknown.length > 0 && (
          <Card title={t("Dauer unbekannt")} meta={String(res.unknown.length)}>
            <p className="small muted" style={{ marginTop: 0 }}>{t("Für diese Spiele gibt es weder eine eigene Angabe noch genug Sitzungen im Verlauf. Ob sie in {m} Minuten passen, ist unbekannt.", { m: minutes })}</p>
            <div className="row" style={{ gap: 6 }}>{res.unknown.slice(0, 40).map((s) => <span key={s.item.id} className="badge">{s.item.name}</span>)}</div>
          </Card>
        )}
      </>}
    </>
  );
}

function SuggestionCard({ s, highlight, launching, onLaunch }: { s: Suggestion; highlight?: boolean; launching: boolean; onLaunch: () => void }) {
  return (
    <article className={`j-item ${highlight ? "focus" : ""}`}>
      <div className="row nowrap">
        <Thumb name={s.item.name} icon={s.item.iconData} cover={s.item.coverUrl} gradient={gradientFor(s.item.name)} />
        <div className="grow"><b>{s.item.name}</b>{s.session && <div className="tiny muted">{s.session.source === "own" ? t("≈ {m} Min. (deine Schätzung)", { m: s.session.minutes }) : t("≈ {m} Min. (Median aus dem Verlauf)", { m: s.session.minutes })}</div>}</div>
        <Button size="sm" variant="primary" icon={<Play size={14} />} busy={launching} onClick={onLaunch}>{t("Spielen")}</Button>
      </div>
      <ul className="j-reasons">{s.reasons.map((r) => <li key={r.key}>{t(r.text, r.vars)}</li>)}</ul>
    </article>
  );
}

// ============================================================================================ F5 – challenges

const SOURCE_LABEL: Record<string, string> = { generic: "Allgemeiner Vorschlag", data: "Aus deinen Daten", own: "Eigene Challenge" };

function Challenges() {
  const { items, stats } = useLibraryAndStats();
  const saved = useJournal<Challenge>("challenge");
  const paths = useJournal<GoalPath>("path");
  const finds = useJournal<Find>("find");
  const games = useGames();
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [withData, setWithData] = useState(true);
  const [shown, setShown] = useState<Challenge[]>([]);
  const [edit, setEdit] = useState<Entry<Challenge> | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const ctx = useMemo(() => ({
    games: items, stats,
    nextStages: paths.filter((p) => !p.data.archived && !p.data.template).flatMap((p) => { const n = pathProgress(p.data).next; return n ? [{ pathId: p.id, title: p.data.title, stage: n.title }] : []; }),
    openFinds: finds.filter((f) => f.data.status === "open").slice(0, 20).map((f) => ({ id: f.id, title: f.data.title })),
  }), [items, stats, paths, finds]);
  const roll = () => setShown(generateChallenges(ctx, 3, { withData, maxMinutes: maxMinutes || undefined, exclude: [...shown.map((c) => c.text), ...saved.map((s) => s.data.text)] }, Math.random, (x, v) => t(x, v)));
  const save = (c: Challenge) => { if (trySave("challenge", newId(), { ...c, status: "open" })) { toast(t("Challenge gespeichert"), "success"); setShown((l) => l.filter((x) => x !== c)); } };
  const open = saved.filter((s) => s.data.status === "open"), done = saved.filter((s) => s.data.status === "done");
  return (
    <>
      <Card title={t("Challenge-Generator")} icon={<Swords size={18} />} actions={<Button size="sm" icon={<Plus size={15} />} onClick={() => setEdit("new")}>{t("Eigene Challenge")}</Button>}>
        <div className="stack-sm">
          <Banner kind="info">{t("Allgemeine Vorschläge passen nicht zu jedem Spiel („falls das Spiel es erlaubt“). Vorschläge „aus deinen Daten“ stammen aus Backlog, Verlauf, Zielpfaden und Funden. Geprüfte spielspezifische Challenges gibt es nur, wenn du sie selbst anlegst – Nexus erfindet keine.")}</Banner>
          <div className="row" style={{ gap: 8 }}>
            <select className="input" style={{ maxWidth: 200 }} value={maxMinutes} onChange={(e) => setMaxMinutes(Number(e.target.value))} aria-label={t("Zeit")}>
              <option value={0}>{t("Beliebige Dauer")}</option><option value={15}>{t("Bis 15 Min.")}</option><option value={30}>{t("Bis 30 Min.")}</option>
            </select>
            <Switch checked={withData} onChange={setWithData} label={t("Auch aus meinen Daten")} />
          </div>
          <div><Button variant="primary" icon={shown.length ? <RefreshCw size={15} /> : <Dices size={15} />} onClick={roll}>{shown.length ? t("Neu würfeln") : t("Vorschläge erzeugen")}</Button></div>
          {shown.map((c) => (
            <div key={c.text} className="j-conflict">
              <div className="grow"><div className="small">{c.text}</div><span className={`badge ${c.source === "data" ? "info" : ""}`}>{t(SOURCE_LABEL[c.source])}</span>{c.minutes ? <span className="tiny muted"> · {t("ca. {m} Min.", { m: c.minutes })}</span> : null}</div>
              <Button size="sm" icon={<Save size={14} />} onClick={() => save(c)}>{t("Speichern")}</Button>
            </div>
          ))}
        </div>
      </Card>
      <Card title={t("Meine Challenges")} icon={<Trophy size={18} />} meta={t("{o} offen · {d} geschafft", { o: open.length, d: done.length })}>
        {saved.length === 0 ? <Empty icon={<Swords size={26} />} title={t("Noch keine gespeichert")} text={t("Erzeuge Vorschläge und speichere die, die dir gefallen – oder lege eigene an.")} /> : (
          <div className="stack-sm">
            {(showDone ? [...open, ...done] : open).map((e) => (
              <div key={e.id} className="j-conflict">
                <label className="checkbox grow"><input type="checkbox" checked={e.data.status === "done"} onChange={() => trySave("challenge", e.id, { ...e.data, status: e.data.status === "done" ? "open" : "done", doneAt: e.data.status === "done" ? null : new Date().toISOString() })} />
                  <span><span className={e.data.status === "done" ? "muted" : ""}>{e.data.text}</span><br /><span className="badge">{t(SOURCE_LABEL[e.data.source])}</span>{gameLabel(e.data, games) && <span className="tiny muted"> · {gameLabel(e.data, games)}</span>}{e.data.doneAt && <span className="tiny muted"> · {t("geschafft {d}", { d: dateTime(e.data.doneAt) })}</span>}</span></label>
                <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Bearbeiten")} onClick={() => setEdit(e)} />
              </div>
            ))}
            {done.length > 0 && <div><Button size="sm" variant="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? t("Geschaffte ausblenden") : t("Geschaffte zeigen ({n})", { n: done.length })}</Button></div>}
          </div>
        )}
      </Card>
      {edit && <ChallengeEditor entry={edit === "new" ? null : edit} games={games} onClose={() => setEdit(null)} />}
    </>
  );
}

function ChallengeEditor({ entry, games, onClose }: { entry: Entry<Challenge> | null; games: { id: string; name: string }[]; onClose: () => void }) {
  const [id] = useState(entry?.id ?? newId());
  const [f, setF] = useState<Challenge>(entry?.data ?? { text: "", source: "own", status: "open", gameId: null, gameName: null, note: "" });
  const set = (p: Partial<Challenge>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal title={entry ? t("Challenge bearbeiten") : t("Eigene Challenge")} onClose={onClose} footer={<>
      {entry && <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Challenge löschen?"), t("Sie wird auf allen Geräten gelöscht."), { danger: true })) { removeEntry(id); onClose(); } }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!f.text.trim()} onClick={() => { if (trySave("challenge", id, { ...f, text: f.text.trim() })) onClose(); }}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Challenge")}><textarea className="input" rows={2} maxLength={300} value={f.text} onChange={(e) => set({ text: e.target.value })} placeholder={t("z. B. Den Wächter ohne Schild besiegen")} /></Field>
        <GamePicker value={f} onChange={(g) => set(g)} games={games} />
        {entry && entry.data.source !== "own" && <span className="tiny muted">{t("Herkunft")}: {t(SOURCE_LABEL[entry.data.source])}</span>}
        <Field label={t("Notiz")}><input className="input" maxLength={300} value={f.note ?? ""} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ============================================================================================ F6 – bingo (Ultimate Gaming Bingo)

function BingoTab({ share }: { share: string | null }) {
  return <BingoArea share={share} />;
}
