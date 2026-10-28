// Ultimate Gaming Bingo (in "Was spiele ich?"): create by sentence or settings, play, own collection, own tasks,
// share links. Logic in lib/bingo.ts, creation in lib/bingo-make.ts, the field in bingo-board.tsx.

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookMarked, Copy, Download, Grid3x3, Heart, Image as ImageIcon, Info, LayoutDashboard, Link2, ListPlus, Plus, RefreshCw, Replace, RotateCcw, Shuffle, Sparkles, Star, Trash2, Wand2,
} from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn, useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { downloadText, exportJournal, newId, removeEntry, useJournal, type Entry } from "../lib/journal";
import { decodeShare, encodeShare } from "../lib/play";
import type { Schema } from "../lib/collections";
import {
  categoriesFor, CATEGORY_LABEL, DEFAULT_OPTIONS, DIFFICULTIES, DIFFICULTY_LABEL, findGame, LEVEL_LABEL, MODE_LABEL, modesFor, parseRequest, poolFor, progress,
  replaceCell, resetCard, resolveOptions, sanitizeCard, shuffleCard, status, STATUS_LABEL, type BingoOptions, type Card, type Status,
} from "../lib/bingo";
import { CATALOG, GENRE_IDS, GENRES } from "../lib/bingo-catalog";
import { createCard, isCreating, ownTasksFor, setActiveCard } from "../lib/bingo-make";
import { setWebAlways, webAlways } from "../lib/bingo-chat";
import { BingoBoard, CAT_ICON, fxOn, setFx } from "./bingo-board";
import { CollectionView } from "./collection-view";
import { trySave, useGames } from "./journal-ui";
import { Button, Card as UiCard, confirmDialog, Empty, Field } from "./ui";

type Area = "make" | "library" | "own";

export const BINGOTASK: Schema = {
  kind: "bingotask", label: "Eigene Bingo-Aufgabe",
  fields: [
    { key: "title", label: "Aufgabe", type: "text", required: true, maxLen: 90, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "allGames", label: "Für alle Spiele", type: "bool", filter: true },
    { key: "level", label: "Schwierigkeit", type: "select", required: true, options: [{ value: "1", label: "Leicht" }, { value: "2", label: "Mittel" }, { value: "3", label: "Schwer" }, { value: "4", label: "Sehr schwer" }], card: true, filter: true },
    { key: "category", label: "Kategorie", type: "select", required: true, options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })), filter: true },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 400 },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
  check: (d) => (!d.allGames && !(d.game as { gameName?: string } | undefined)?.gameName ? [{ key: "game", message: "Spiel wählen – oder „Für alle Spiele“ ankreuzen." }] : []),
};

/** Is an AI on the PC ready to write tasks? (Without the PC the catalog is used – said on the card.) */
export function useBingoAi() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const st = useRpc<{ bingoProvider?: string | null }>("assistant.status", {}, ["assistant"], online);
  return { online, provider: online ? st.data?.bingoProvider ?? null : null };
}

export function BingoArea({ share }: { share: string | null }) {
  const [params, setParams] = useSearchParams();
  const cards = useJournal<Card>("bingo");
  const openId = params.get("id");
  const area = (["make", "library", "own"].includes(params.get("area") ?? "") ? params.get("area") : cards.length ? "library" : "make") as Area;
  const go = (p: Record<string, string>) => setParams({ tab: "bingo", ...p }, { replace: true });
  const [template, setTemplate] = useState<Partial<BingoOptions> | null>(null);
  if (share) return <SharedCard raw={share} onDone={(id) => go(id ? { id } : {})} />;
  const cur = openId ? cards.find((c) => c.id === openId) : undefined;
  if (cur) return <BingoPlay e={cur} onBack={() => go({ area: "library" })} onTemplate={(o) => { setTemplate(o); go({ area: "make" }); }} onOpen={(id) => go({ id })} />;
  return (
    <div className="stack">
      <div className="chips" role="tablist" aria-label={t("Bingo")}>
        {([["make", <Wand2 size={15} />, t("Bingo erstellen")], ["library", <BookMarked size={15} />, t("Meine Bingos") + (cards.length ? ` (${cards.length})` : "")], ["own", <ListPlus size={15} />, t("Eigene Aufgaben")]] as [Area, ReactNode, string][]).map(([v, icon, label]) => (
          <button key={v} type="button" role="tab" aria-selected={area === v} className={`chip ${area === v ? "on" : ""}`} onClick={() => go({ area: v })}>{icon}{label}</button>
        ))}
      </div>
      {area === "make" && <BingoMaker key={JSON.stringify(template)} initial={template} onMade={(id) => { setTemplate(null); go({ id }); }} />}
      {area === "library" && <BingoLibrary cards={cards} onOpen={(id) => go({ id })} onNew={() => go({ area: "make" })} />}
      {area === "own" && <CollectionView schema={BINGOTASK} icon={<ListPlus size={18} />} intro={t("Eigene Aufgaben für künftige Bingos – je Spiel oder für alle Spiele. Beim Erstellen wählst du: nur KI/Katalog, gemischt oder nur eigene.")} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ create

const GAME_NAMES = CATALOG.map((g) => g.name);

export function BingoMaker({ initial, onMade }: { initial?: Partial<BingoOptions> | null; onMade: (id: string) => void }) {
  const games = useGames();
  const ai = useBingoAi();
  const cards = useJournal<Card>("bingo");
  const [o, setO] = useState<BingoOptions>({ ...DEFAULT_OPTIONS, ...initial });
  const [names, setNames] = useState<string[]>([]);
  const [multi, setMulti] = useState<"shared" | "versus">("shared");
  const [sentence, setSentence] = useState("");
  const [recognized, setRecognized] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(true);
  // Steam achievements only for games without own catalog tasks, only with the PC, only when ticked (= asked first).
  const [web, setWeb] = useState(webAlways);
  const webOk = o.taskSource !== "own" && o.game.trim().length > 1;
  const [noRepeat, setNoRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof BingoOptions>(k: K, v: BingoOptions[K]) => setO((x) => ({ ...x, [k]: v }));
  const known = findGame(o.game);
  const modes = modesFor(o.game, o.players, o.genre);
  const cats = categoriesFor(o.game, o.players, o.genre);
  const ownCount = useMemo(() => (o.game ? ownTasksFor(o.game).length : 0), [o.game, useJournal<unknown>("bingotask").length]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = cards.find((c) => (c.data.gameName ?? "").toLowerCase() === o.game.trim().toLowerCase());
  const allNames = useMemo(() => [...new Set([...GAME_NAMES, ...games.map((g) => g.name)])].sort((a, b) => a.localeCompare(b)), [games]);

  const understand = () => {
    const r = parseRequest(sentence, { library: games.map((g) => g.name), previous: cards[0]?.data ?? null });
    const res = resolveOptions(r, cards[0]?.data ?? null, () => (games.length ? games[Math.floor(Math.random() * games.length)].name : null));
    if ("error" in res) { setRecognized(t(res.error)); setO((x) => ({ ...x, ...r.options })); return; }
    setO(res);
    setRecognized(t("Erkannt: {g}, {s}×{s}, {d}, {m}, {p} Spieler", { g: res.game, s: res.size, d: t(DIFFICULTY_LABEL[res.difficulty]), m: t(MODE_LABEL[res.mode]), p: res.players }));
  };

  const make = async () => {
    if (busy || isCreating()) return;
    if (!o.game.trim()) { toast(t("Für welches Spiel soll das Bingo sein?"), "error"); return; }
    setBusy(true);
    try {
      const opts: BingoOptions = { ...o, web: webOk && web, game: o.game.trim(), mode: modes.includes(o.mode) ? o.mode : "classic", categories: o.categories.filter((c) => cats.includes(c)),
        exclude: noRepeat && last ? [...last.data.cells.map((c) => c.text), ...(last.data.history ?? [])] : o.exclude };
      const players = o.players > 1 ? Array.from({ length: o.players }, (_, i) => names[i]?.trim() || `${t("Spieler")} ${i + 1}`) : undefined;
      let r: Awaited<ReturnType<typeof createCard>>;
      try { r = await createCard(opts, { useAi, aiAvailable: !!ai.provider, players, pcOnline: ai.online }); }
      catch (e) {
        // KI or internet failed: the card is still made from the fitting general tasks, the toast says why.
        if (opts.taskSource === "own" || (!opts.web && !(useAi && ai.provider))) throw e;
        r = await createCard({ ...opts, web: false }, { useAi: false, aiAvailable: false, players, pcOnline: ai.online });
        toast(t("{w} hat nicht geklappt ({e}) – deshalb anders erstellt.", { w: opts.web ? t("Die Suche im Internet") : t("Die KI"), e: (e as Error).message }), "info");
      }
      if (players && multi === "versus") trySave("bingo", r.id, { ...r.card, multi: "versus" });
      setActiveCard(r.id);
      toast(t("Bingo erstellt"), "success");
      onMade(r.id);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <UiCard title={t("Bingo erstellen")} icon={<Sparkles size={18} />}>
        <div className="stack">
          <Field label={t("Sag einfach, was du willst")} hint={t("z. B. „4×4-Bingo für Minecraft auf mittel“ oder „Elden-Ring-Bingo für zwei Spieler auf schwer“. Funktioniert auch im KI-Assistenten.")}>
            <div className="row" style={{ gap: 8 }}>
              <input className="input grow" value={sentence} maxLength={300} placeholder={t("Erstelle ein 4×4-Bingo für Minecraft auf mittel")} onChange={(e) => setSentence(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && sentence.trim()) understand(); }} />
              <Button icon={<Wand2 size={15} />} disabled={!sentence.trim()} onClick={understand}>{t("Übernehmen")}</Button>
            </div>
          </Field>
          {recognized && <span className="small muted">{recognized}</span>}
          <div className="grid-2">
            <Field label={t("Spiel")}>
              <input className="input" list="bingo-games" value={o.game} maxLength={100} placeholder="Minecraft" onChange={(e) => set("game", e.target.value)} />
            </Field>
            {o.game && !known && (
              <Field label={t("Art des Spiels")} hint={t("Für dieses Spiel gibt es keine eigenen Katalog-Aufgaben. Ohne KI werden allgemeine Aufgaben dieser Art genommen.")}>
                <select className="input" value={o.genre ?? "generic"} onChange={(e) => set("genre", e.target.value)}>{GENRE_IDS.map((g) => <option key={g} value={g}>{t(GENRES[g].name)}</option>)}</select>
              </Field>
            )}
          </div>
          <datalist id="bingo-games">{allNames.map((n) => <option key={n} value={n} />)}</datalist>
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <div className="stack-xs"><b className="small">{t("Größe")}</b>
              <div className="chips" role="radiogroup" aria-label={t("Größe")}>{([3, 4, 5] as const).map((n) => <button key={n} type="button" role="radio" aria-checked={o.size === n} className={`chip ${o.size === n ? "on" : ""}`} onClick={() => set("size", n)}>{n}×{n}</button>)}</div>
            </div>
            <div className="stack-xs"><b className="small">{t("Schwierigkeit")}</b>
              <div className="chips" role="radiogroup" aria-label={t("Schwierigkeit")}>{DIFFICULTIES.map((d) => <button key={d} type="button" role="radio" aria-checked={o.difficulty === d} className={`chip ${o.difficulty === d ? "on" : ""}`} onClick={() => set("difficulty", d)}>{t(DIFFICULTY_LABEL[d])}</button>)}</div>
            </div>
          </div>
          <div className="grid-2">
            <Field label={t("Spieler")}>
              <select className="input" value={o.players} onChange={(e) => set("players", Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n === 1 ? t("Einzelspieler") : t("{n} Spieler", { n })}</option>)}</select>
            </Field>
            <Field label={t("Spielmodus")}>
              <select className="input" value={modes.includes(o.mode) ? o.mode : "classic"} onChange={(e) => set("mode", e.target.value as BingoOptions["mode"])}>{modes.map((m) => <option key={m} value={m}>{t(MODE_LABEL[m])}</option>)}</select>
            </Field>
          </div>
          {o.players > 1 && (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{Array.from({ length: o.players }, (_, i) => <input key={i} className="input" style={{ maxWidth: 150 }} maxLength={20} aria-label={t("Name Spieler {n}", { n: i + 1 })} placeholder={`${t("Spieler")} ${i + 1}`} value={names[i] ?? ""} onChange={(e) => setNames((n) => { const x = [...n]; x[i] = e.target.value; return x; })} />)}</div>
              <div className="chips" role="radiogroup" aria-label={t("Mehrspieler")}>
                <button type="button" role="radio" aria-checked={multi === "shared"} className={`chip ${multi === "shared" ? "on" : ""}`} onClick={() => setMulti("shared")}>{t("Gemeinsame Karte (Team)")}</button>
                <button type="button" role="radio" aria-checked={multi === "versus"} className={`chip ${multi === "versus" ? "on" : ""}`} onClick={() => setMulti("versus")}>{t("Jeder für sich (Wettbewerb)")}</button>
              </div>
            </div>
          )}
          <div className="stack-xs"><b className="small">{t("Arten von Aufgaben (bevorzugt)")}</b>
            <div className="chips">{cats.map((c) => <button key={c} type="button" aria-pressed={o.categories.includes(c)} className={`chip ${o.categories.includes(c) ? "on" : ""}`} onClick={() => set("categories", o.categories.includes(c) ? o.categories.filter((x) => x !== c) : [...o.categories, c])}>{CAT_ICON[c]}{t(CATEGORY_LABEL[c])}</button>)}</div>
          </div>
          <details className="bingo-more">
            <summary className="small">{t("Weitere Einstellungen")}</summary>
            <div className="stack-sm" style={{ marginTop: 10 }}>
              <Field label={t("Aufgaben aus")}>
                <select className="input" value={o.taskSource} onChange={(e) => set("taskSource", e.target.value as BingoOptions["taskSource"])}>
                  <option value="auto">{t("KI bzw. Katalog")}</option><option value="mixed">{t("Gemischt mit eigenen Aufgaben ({n})", { n: ownCount })}</option><option value="own">{t("Nur eigene Aufgaben ({n})", { n: ownCount })}</option>
                </select>
              </Field>
              <label className="checkbox"><input type="checkbox" checked={!!o.beginner} onChange={(e) => setO((x) => ({ ...x, beginner: e.target.checked, expert: e.target.checked ? false : x.expert }))} />{t("Nur Aufgaben für Anfänger")}</label>
              <label className="checkbox"><input type="checkbox" checked={!!o.expert} onChange={(e) => setO((x) => ({ ...x, expert: e.target.checked, beginner: e.target.checked ? false : x.beginner }))} />{t("Nur Aufgaben für erfahrene Spieler")}</label>
              <label className="checkbox"><input type="checkbox" checked={!!o.spoilers} onChange={(e) => set("spoilers", e.target.checked)} />{t("Spoiler erlaubt (späte Bosse und Orte)")}</label>
              {o.size % 2 === 1 && <label className="checkbox"><input type="checkbox" checked={!!o.freeCenter} onChange={(e) => set("freeCenter", e.target.checked)} />{t("Freies Feld in der Mitte")}</label>}
              {last && <label className="checkbox"><input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} />{t("Keine Aufgaben aus „{n}“ wiederholen", { n: last.data.title })}</label>}
              <Field label={t("Zeitlimit (Minuten, optional)")}><input className="input" inputMode="numeric" value={o.timeLimitMin ?? ""} placeholder={o.mode === "speed" ? "30" : "–"} onChange={(e) => set("timeLimitMin", e.target.value ? Math.min(600, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) : null)} /></Field>
              <Field label={t("Spielfortschritt (für die KI)")}><input className="input" maxLength={200} value={o.progress ?? ""} placeholder={t("z. B. gerade erst angefangen, im Nether, durchgespielt")} onChange={(e) => set("progress", e.target.value)} /></Field>
              <Field label={t("Eigene Regeln")} hint={t("Werden auf der Karte angezeigt; die KI hält sich beim Schreiben daran (z. B. „ohne Rüstung“, „ohne Mods“).")}><input className="input" maxLength={300} value={o.rules ?? ""} onChange={(e) => set("rules", e.target.value)} /></Field>
            </div>
          </details>
          <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="tiny muted">
              {webOk && <label className="checkbox" style={{ display: "flex", marginBottom: 4 }}><input type="checkbox" checked={web} onChange={(e) => { setWeb(e.target.checked); if (!e.target.checked && webAlways()) setWebAlways(false); }} />{t("Passende Aufgaben aus dem Internet laden (Steam-Erfolge und Spielart von „{g}“, sonst Microsoft Store/Xbox oder Wikipedia) – dein PC fragt dafür diese Seiten", { g: o.game.trim() })}{webAlways() && <span className="tiny muted"> · {t("immer erlaubt – Häkchen weg nimmt das zurück")}</span>}</label>}
              {o.taskSource === "own" ? t("Aufgaben: nur deine eigenen.") : ai.provider ? <label className="checkbox"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />{t("KI am PC benutzen: {p}", { p: ai.provider })}</label>
                : ai.online ? t("Keine KI am PC eingerichtet – Aufgaben aus dem eingebauten Katalog. (KI-Assistent → Einrichten)") : t("Ohne PC: Aufgaben aus dem eingebauten Katalog.")}
            </span>
            <Button variant="primary" icon={<Sparkles size={16} />} busy={busy} disabled={!o.game.trim()} onClick={() => void make()}>{t("Bingo erstellen")}</Button>
          </div>
        </div>
      </UiCard>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ collection

function Stars({ value, onChange, size = 16 }: { value?: number | null; onChange?: (v: number | null) => void; size?: number }) {
  return (
    <span className="bingo-stars" role={onChange ? "radiogroup" : undefined} aria-label={t("Bewertung")}>
      {[1, 2, 3, 4, 5].map((n) => onChange
        ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t("{n} Sterne", { n })} onClick={() => onChange(value === n ? null : n)}><Star size={size} fill={(value ?? 0) >= n ? "currentColor" : "none"} /></button>
        : <Star key={n} size={size} fill={(value ?? 0) >= n ? "currentColor" : "none"} />)}
    </span>
  );
}

export function BingoLibrary({ cards, onOpen, onNew }: { cards: Entry<Card>[]; onOpen: (id: string) => void; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [diff, setDiff] = useState("");
  const [st, setSt] = useState("");
  const [fav, setFav] = useState(false);
  const [sort, setSort] = useState<"new" | "old" | "progress" | "rating">("new");
  const games = [...new Set(cards.map((c) => c.data.gameName ?? "").filter(Boolean))].sort();
  const shown = cards.filter((c) => {
    const d = c.data;
    return (!q || `${d.title} ${d.gameName ?? ""} ${d.cells.map((x) => x.text).join(" ")}`.toLowerCase().includes(q.toLowerCase())) && (!game || d.gameName === game) && (!diff || d.difficulty === diff) && (!st || status(d) === st) && (!fav || d.favorite);
  }).sort((a, b) => sort === "old" ? String(a.data.createdAt ?? "").localeCompare(String(b.data.createdAt ?? "")) : sort === "progress" ? progress(b.data).percent - progress(a.data).percent : sort === "rating" ? (b.data.rating ?? 0) - (a.data.rating ?? 0) : String(b.data.createdAt ?? b.updatedAt).localeCompare(String(a.data.createdAt ?? a.updatedAt)));
  if (!cards.length) return <UiCard><Empty icon={<Grid3x3 size={28} />} title={t("Noch kein Bingo")} text={t("Erstelle dein erstes – per Satz, mit Einstellungen oder direkt im KI-Assistenten.")} action={<Button variant="primary" icon={<Plus size={15} />} onClick={onNew}>{t("Bingo erstellen")}</Button>} /></UiCard>;
  return (
    <UiCard title={t("Meine Bingos")} icon={<BookMarked size={18} />} meta={String(cards.length)} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={onNew}>{t("Neu")}</Button>}>
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" style={{ maxWidth: 220 }} placeholder={t("Suchen …")} aria-label={t("Suchen")} value={q} onChange={(e) => setQ(e.target.value)} />
          {games.length > 1 && <select className="input" style={{ maxWidth: 180 }} aria-label={t("Spiel")} value={game} onChange={(e) => setGame(e.target.value)}><option value="">{t("Spiel")}: {t("alle")}</option>{games.map((g) => <option key={g}>{g}</option>)}</select>}
          <select className="input" style={{ maxWidth: 180 }} aria-label={t("Schwierigkeit")} value={diff} onChange={(e) => setDiff(e.target.value)}><option value="">{t("Schwierigkeit")}: {t("alle")}</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{t(DIFFICULTY_LABEL[d])}</option>)}</select>
          <select className="input" style={{ maxWidth: 180 }} aria-label={t("Status")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">{t("Status")}: {t("alle")}</option>{(["new", "running", "done"] as Status[]).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}</select>
          <select className="input" style={{ maxWidth: 180 }} aria-label={t("Sortierung")} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="new">{t("Neueste zuerst")}</option><option value="old">{t("Älteste zuerst")}</option><option value="progress">{t("Fortschritt")}</option><option value="rating">{t("Bewertung")}</option></select>
          <button type="button" className={`chip ${fav ? "on" : ""}`} onClick={() => setFav(!fav)}><Heart size={13} />{t("Favoriten")}</button>
        </div>
        {shown.length === 0 ? <span className="small muted">{t("Nichts passt zum Filter.")}</span> : (
          <div className="list">{shown.map((c) => {
            const d = c.data, p = progress(d), s = status(d);
            return (
              <button key={c.id} type="button" className="list-item" onClick={() => onOpen(c.id)}>
                <Grid3x3 size={18} />
                <div className="grow">
                  <div className="title">{d.title}{d.favorite ? " ♥" : ""}</div>
                  <div className="sub">{[d.gameName, `${d.size}×${d.size}`, d.difficulty && t(DIFFICULTY_LABEL[d.difficulty]), d.createdAt && dateTime(d.createdAt)].filter(Boolean).join(" · ")}</div>
                  <div className="bingo-bar slim"><span style={{ width: `${p.percent}%` }} /></div>
                </div>
                <div className="stack-xs" style={{ alignItems: "flex-end" }}>
                  <span className={`badge ${s === "done" ? "ok" : s === "running" ? "accent" : ""}`}>{t(STATUS_LABEL[s])}</span>
                  <span className="tiny muted">{p.done}/{p.total}</span>
                  {d.rating ? <Stars value={d.rating} size={12} /> : null}
                </div>
              </button>
            );
          })}</div>
        )}
      </div>
    </UiCard>
  );
}

// ------------------------------------------------------------------------------------------ playing

function shareLink(d: Card) {
  const payload = { title: d.title, size: d.size, cells: d.cells.map(({ text, free, level, category }) => ({ text, free, level, category })), freeCenter: d.freeCenter, gameName: d.gameName, difficulty: d.difficulty, mode: d.mode };
  return `${location.origin}${location.pathname}#/play?tab=bingo&share=${encodeShare(payload)}`;
}

export function BingoPlay({ e, onBack, onTemplate, onOpen }: { e: Entry<Card>; onBack: () => void; onTemplate: (o: Partial<BingoOptions>) => void; onOpen: (id: string) => void }) {
  const d = e.data;
  const p = progress(d);
  const [editing, setEditing] = useState<number | null>(null);
  const [fx, setFxState] = useState(fxOn());
  const [notes, setNotes] = useState(d.notes ?? "");
  const save = (next: Card) => trySave("bingo", e.id, next);
  const pool = useMemo(() => [...poolFor(d.gameName ?? "", d.genre).tasks, ...ownTasksFor(d.gameName ?? "")], [d.gameName, d.genre]);
  const optionsOf = (): Partial<BingoOptions> => ({ game: d.gameName ?? "", size: d.size, difficulty: d.difficulty ?? "medium", mode: d.mode ?? "classic", players: d.players?.length ?? 1, freeCenter: d.freeCenter, rules: d.rules, genre: d.genre ?? null, timeLimitMin: d.timeLimitMin ?? null });
  const doneList = d.cells.filter((c) => !c.free && (c.done || c.doneBy?.length));
  const cur = editing != null ? d.cells[editing] : null;

  const reset = async () => { if (await confirmDialog(t("Bingo zurücksetzen?"), t("Alle Häkchen werden entfernt. Die Aufgaben bleiben."), { danger: true, ok: t("Zurücksetzen") })) save(resetCard(d)); };
  const reshuffle = async () => { if (!p.done || await confirmDialog(t("Neu mischen?"), t("Die Aufgaben tauschen die Plätze – deine Häkchen bleiben bei ihrer Aufgabe."))) save(shuffleCard(d)); };
  const copy = () => { const id = newId(); if (trySave("bingo", id, { ...resetCard(d), title: `${d.title} (${t("Kopie")})`.slice(0, 80), createdAt: new Date().toISOString(), favorite: false, rating: null, notes: "" })) { toast(t("Kopie angelegt"), "success"); onOpen(id); } };
  const del = async () => {
    const msg = status(d) === "running" ? t("Dieses Bingo läuft noch ({n} von {m} erledigt). Es wird auf allen Geräten gelöscht.", { n: p.done, m: p.total }) : t("Es wird auf allen Geräten gelöscht.");
    if (await confirmDialog(t("Bingo löschen?"), msg, { danger: true, ok: t("Löschen") })) { removeEntry(e.id); onBack(); }
  };
  const share = () => { try { const l = shareLink(d); void navigator.clipboard?.writeText(l).then(() => toast(t("Link kopiert – er enthält die Karte selbst, nichts liegt online"), "success"), () => toast(l, "info")); } catch (err) { toast(t((err as Error).message), "error"); } };

  return (
    <div className="bingo-layout">
      <UiCard title={d.title} icon={<Grid3x3 size={18} />} actions={<Button size="sm" onClick={onBack}>{t("Zurück")}</Button>}>
        <div className="stack">
          <div className="chips">
            <span className="badge">{d.size}×{d.size}</span>
            {d.difficulty && <span className="badge accent">{t(DIFFICULTY_LABEL[d.difficulty])}</span>}
            {d.mode && d.mode !== "classic" && <span className="badge">{t(MODE_LABEL[d.mode])}</span>}
            <span className="badge">{(d.players?.length ?? 1) > 1 ? (d.multi === "versus" ? t("Wettbewerb · {n} Spieler", { n: d.players!.length }) : t("Team · {n} Spieler", { n: d.players!.length })) : t("Einzelspieler")}</span>
            {d.provider && <span className="badge" title={t("Woher die Aufgaben kommen")}>{t("Aufgaben: {p}", { p: t(d.provider) })}</span>}
          </div>
          {d.rules && <span className="small">{t("Regeln")}: {d.rules}</span>}
          {d.notesFromMaker?.map((n, i) => <span key={i} className="tiny muted"><Info size={12} /> {t(n)}</span>)}
          <BingoBoard e={e} />
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Button size="sm" icon={<Replace size={14} />} aria-pressed={editing != null} onClick={() => setEditing(editing == null ? -1 : null)}>{editing == null ? t("Aufgabe ersetzen …") : t("Fertig")}</Button>
            <Button size="sm" icon={<Shuffle size={14} />} onClick={() => void reshuffle()}>{t("Neu mischen")}</Button>
            <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void reset()}>{t("Zurücksetzen")}</Button>
            <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => onTemplate({ ...optionsOf(), exclude: [...d.cells.map((c) => c.text), ...(d.history ?? [])] })}>{t("Neues Bingo (ohne Wiederholung)")}</Button>
          </div>
          {editing != null && (
            <div className="stack-sm">
              <span className="small muted">{t("Tippe auf die Aufgabe, die du tauschen willst:")}</span>
              <div className="bingo-pick">{d.cells.map((c, i) => c.free ? null : <button key={i} type="button" className={`chip ${editing === i ? "on" : ""}`} onClick={() => setEditing(i)}>{c.text}</button>)}</div>
              {cur && editing >= 0 && (
                <div className="bingo-cell-info">
                  <b>{cur.text}</b>
                  <span className="small muted">{[cur.level && t(LEVEL_LABEL[cur.level]), cur.category && t(CATEGORY_LABEL[cur.category])].filter(Boolean).join(" · ")}</span>
                  {cur.why && <span className="small">{t("Warum diese Schwierigkeit")}: {t(cur.why)}</span>}
                  {cur.doneBy?.length ? <span className="small">{t("Erledigt von {w}", { w: cur.doneBy.join(", ") })}</span> : null}
                  <Button size="sm" icon={<Replace size={14} />} onClick={() => { const n = replaceCell(d, editing, pool); if (n) { save(n); toast(t("Aufgabe ersetzt"), "success"); } else toast(t("Keine weitere passende Aufgabe vorhanden – eigene Aufgaben ergänzen."), "error"); }}>{t("Durch andere Aufgabe ersetzen")}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </UiCard>
      <div className="stack">
        <UiCard title={t("Deine Erfolge")} icon={<Star size={18} />} meta={`${doneList.length}/${p.total}`}>
          {doneList.length === 0 ? <span className="small muted">{t("Noch nichts abgehakt.")}</span> : <ul className="bingo-done">{doneList.map((c, i) => <li key={i}>{c.text}{c.doneBy?.length && (d.players?.length ?? 1) > 1 ? <span className="tiny muted"> – {c.doneBy.join(", ")}</span> : null}</li>)}</ul>}
        </UiCard>
        <UiCard title={t("Bingo-Details")} icon={<Info size={18} />}>
          <dl className="j-dl">
            {d.gameName && <div><dt>{t("Spiel")}</dt><dd>{d.gameName}</dd></div>}
            <div><dt>{t("Status")}</dt><dd>{t(STATUS_LABEL[status(d)])}</dd></div>
            {d.createdAt && <div><dt>{t("Erstellt am")}</dt><dd>{dateTime(d.createdAt)}</dd></div>}
            {d.finishedAt && <div><dt>{t("Abgeschlossen")}</dt><dd>{dateTime(d.finishedAt)}</dd></div>}
          </dl>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <Stars value={d.rating} onChange={(v) => save({ ...d, rating: v })} size={20} />
            <textarea className="input" rows={2} maxLength={1000} placeholder={t("Notiz (optional) – wie war dein Bingo?")} value={notes} onChange={(ev) => setNotes(ev.target.value)} onBlur={() => notes !== (d.notes ?? "") && save({ ...d, notes })} />
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" icon={<Heart size={14} fill={d.favorite ? "currentColor" : "none"} />} aria-pressed={!!d.favorite} onClick={() => save({ ...d, favorite: !d.favorite })}>{t("Favorit")}</Button>
              <Button size="sm" icon={<LayoutDashboard size={14} />} onClick={() => { setActiveCard(e.id); toast(t("Wird im Bingo-Widget und im Overlay gezeigt"), "success"); }}>{t("Im Widget/Overlay zeigen")}</Button>
              <label className="checkbox small"><input type="checkbox" checked={fx} onChange={(ev) => { setFx(ev.target.checked); setFxState(ev.target.checked); }} />{t("Bingo-Animation")}</label>
            </div>
          </div>
        </UiCard>
        <UiCard title={t("Teilen & mehr")} icon={<Link2 size={18} />}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Button size="sm" icon={<Link2 size={14} />} onClick={share}>{t("Link teilen")}</Button>
            <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => void bingoPng(d)}>{t("Als Bild")}</Button>
            <Button size="sm" icon={<Download size={14} />} onClick={() => void exportJournal(["bingo"], false, [e.id]).then((f) => downloadText(`bingo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(f)))}>{t("Als Datei")}</Button>
            <Button size="sm" icon={<Copy size={14} />} onClick={copy}>{t("Kopieren")}</Button>
            <Button size="sm" icon={<Wand2 size={14} />} onClick={() => onTemplate(optionsOf())}>{t("Als Vorlage")}</Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => void del()}>{t("Löschen")}</Button>
          </div>
          <span className="tiny muted" style={{ display: "block", marginTop: 8 }}>{t("Gespeichert in diesem Browser und auf deinem PC – alle mit dem PC verbundenen Geräte sehen Häkchen sofort. Ein geteilter Link ist eine Kopie ohne Live-Abgleich.")}</span>
        </UiCard>
      </div>
    </div>
  );
}

function SharedCard({ raw, onDone }: { raw: string; onDone: (id?: string) => void }) {
  const card = useMemo(() => sanitizeCard(decodeShare(raw)), [raw]);
  if (!card) return <UiCard><Empty icon={<Grid3x3 size={28} />} title={t("Link ist ungültig oder beschädigt")} action={<Button onClick={() => onDone()}>{t("Zu meinen Bingos")}</Button>} /></UiCard>;
  const save = () => { const id = newId(); if (trySave("bingo", id, { ...resetCard(card), createdAt: new Date().toISOString(), provider: "Geteilter Link" })) { toast(t("Als eigene Karte gespeichert"), "success"); onDone(id); } };
  const preview: Entry<Card> = { id: "preview", kind: "bingo", updatedAt: 0, data: card };
  return (
    <UiCard title={card.title} icon={<Grid3x3 size={18} />} meta={t("Geteilte Karte")}>
      <div className="stack">
        <span className="small muted">{t("Jemand hat dir diese Karte geschickt. Sie steckt nur im Link – gespeichert wird sie erst, wenn du sie übernimmst.")}</span>
        <BingoBoard e={preview} readOnly />
        <div className="row" style={{ gap: 6 }}><Button variant="primary" icon={<Copy size={15} />} onClick={save}>{t("Als eigene Karte speichern")}</Button><Button onClick={() => onDone()}>{t("Schließen")}</Button></div>
      </div>
    </UiCard>
  );
}

/** The card as PNG, drawn here (no server). */
export async function bingoPng(b: Card) {
  const cell = 220, pad = 24, head = 90, n = b.size;
  const c = document.createElement("canvas");
  c.width = pad * 2 + cell * n; c.height = pad * 2 + head + cell * n;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0b14"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#e5e7eb"; g.font = "bold 34px system-ui, sans-serif"; g.fillText(b.title.slice(0, 40), pad, pad + 38);
  const p = progress(b);
  g.fillStyle = "#a78bfa"; g.font = "20px system-ui, sans-serif"; g.fillText(`${p.done}/${p.total} · ${p.percent} %${p.lines.length ? ` · ${p.lines.length} × Bingo` : ""}`, pad, pad + 70);
  const lines = new Set(p.lines.flatMap((l) => l.cells));
  b.cells.forEach((cl, i) => {
    const x = pad + (i % n) * cell, y = pad + head + Math.floor(i / n) * cell;
    g.fillStyle = lines.has(i) ? "#064e3b" : cl.done ? "#2e1065" : "#14141f"; g.fillRect(x + 4, y + 4, cell - 8, cell - 8);
    g.strokeStyle = lines.has(i) ? "#34d399" : cl.done ? "#8b5cf6" : "#334155"; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
    g.fillStyle = "#f1f5f9"; g.font = "22px system-ui, sans-serif";
    const words = (cl.free ? t("Frei") : cl.text).split(/\s+/); const rows: string[] = []; let row = "";
    for (const w of words) { const tr = row ? row + " " + w : w; if (g.measureText(tr).width > cell - 32) { rows.push(row); row = w; } else row = tr; }
    rows.push(row);
    rows.slice(0, 6).forEach((r, k) => g.fillText(r, x + 16, y + 40 + k * 28));
    if (cl.done && !cl.free) { g.fillStyle = "#34d399"; g.font = "bold 30px system-ui, sans-serif"; g.fillText("✓", x + cell - 44, y + cell - 22); }
  });
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) { toast(t("Bild konnte nicht erstellt werden."), "error"); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bingo-${b.title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40)}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

