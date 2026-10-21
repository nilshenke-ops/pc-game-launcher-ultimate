// Mini tournaments: create (format, participants, draw), bracket / tables, enter results (checked), history, export.
import { useMemo, useState } from "react";
import { Crown, Download, FileSpreadsheet, Plus, Printer, Shuffle, Trash2, Trophy } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { toast } from "../lib/hooks";
import { downloadText, exportJournal, newId, useJournal, type Entry } from "../lib/journal";
import { checkResult, checkSetup, compute, draw, matchesCsv, MAX_PARTICIPANTS, TournamentError, type Format, type Match, type Result, type TournamentData } from "../lib/tournament";
import { Banner, Button, Card, confirmDialog, Empty, Field, Modal } from "./ui";
import { GamePicker, gameLabel, trySave, useGames } from "./journal-ui";
import { removeWithLinks } from "./collection-view";

type T = TournamentData & { archived?: boolean; createdAt?: string; drawn?: boolean };
/** "Runde 3" → translated with the number. */
const roundLabel = (l: string) => { const m = /^(.*) (\d+)$/.exec(l); return m ? t(`${m[1]} {n}`, { n: Number(m[2]) }) : t(l); };
const FORMAT_LABEL: Record<Format, string> = { single: "K.-o.-System", double: "Doppel-K.-o.", roundrobin: "Jeder gegen jeden", groups: "Gruppenphase + Finalrunde" };

export function Tournaments({ focus }: { focus?: string | null }) {
  const list = useJournal<T>("tournament");
  const games = useGames();
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [create, setCreate] = useState(false);
  const [archive, setArchive] = useState(false);
  const cur = list.find((e) => e.id === open);
  if (cur) return <TournamentPage e={cur} games={games} onBack={() => setOpen(null)} />;
  const shown = list.filter((e) => !!e.data.archived === archive);
  return (
    <>
      <Card title={t("Mini-Turniere")} icon={<Trophy size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setCreate(true)}>{t("Neues Turnier")}</Button>}>
        <p className="small muted" style={{ marginTop: 0 }}>{t("Privat unter Freunden: K.-o., Doppel-K.-o., Gruppen + Finale oder jeder gegen jeden. Ergebnisse trägst du selbst ein – ohne Geld, ohne Wetten.")}</p>
        <div className="chips"><button type="button" className={`chip ${!archive ? "on" : ""}`} onClick={() => setArchive(false)}>{t("Aktuell")}</button><button type="button" className={`chip ${archive ? "on" : ""}`} onClick={() => setArchive(true)}>{t("Historie")} ({list.filter((e) => e.data.archived).length})</button></div>
        {shown.length === 0 ? <Empty icon={<Trophy size={26} />} title={archive ? t("Noch keine abgeschlossenen Turniere") : t("Noch kein Turnier")} /> : (
          <div className="stack-sm" style={{ marginTop: 8 }}>{shown.map((e) => {
            let champ: string | null = null; try { champ = compute(e.data).champion; } catch { /* bad data: shown in the view */ }
            return <button key={e.id} type="button" className="j-hit" onClick={() => setOpen(e.id)}><Trophy size={15} /> <b>{e.data.title}</b><span className="tiny muted">{t(FORMAT_LABEL[e.data.format])} · {t("{n} Teilnehmer", { n: e.data.participants.length })}{gameLabel(e.data, games) && ` · ${gameLabel(e.data, games)}`}{champ && ` · 🏆 ${champ}`}</span></button>;
          })}</div>
        )}
      </Card>
      {create && <CreateDialog games={games} onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); setOpen(id); }} />}
    </>
  );
}

function CreateDialog({ games, onClose, onCreated }: { games: { id: string; name: string }[]; onClose: () => void; onCreated: (id: string) => void }) {
  const players = useJournal<{ title: string }>("player");
  const [title, setTitle] = useState(t("Turnier"));
  const [format, setFormat] = useState<Format>("single");
  const [names, setNames] = useState("");
  const [groups, setGroups] = useState(2), [advance, setAdvance] = useState(2);
  const [game, setGame] = useState<{ gameId?: string | null; gameName?: string | null }>({});
  const list = names.split("\n").map((x) => x.trim()).filter(Boolean);
  let err: string | null = null;
  try { checkSetup({ title, format, participants: list, results: {}, groups, advance }); } catch (e) { err = e instanceof TournamentError ? t(e.message) : String(e); }
  const make = () => {
    if (err) return;
    const id = newId();
    const data: T = { title: title.trim() || t("Turnier"), format, participants: list, results: {}, groups, advance, points: { win: 3, draw: 1, loss: 0 }, ...game, createdAt: new Date().toISOString(), drawn: false };
    if (trySave("tournament", id, data)) onCreated(id);
  };
  return (
    <Modal title={t("Neues Turnier")} onClose={onClose} wide footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!!err} onClick={make}>{t("Anlegen")}</Button></>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <GamePicker value={game} onChange={setGame} games={games} />
        <Field label={t("Format")}><select className="input" value={format} onChange={(e) => setFormat(e.target.value as Format)}>{(Object.keys(FORMAT_LABEL) as Format[]).map((f) => <option key={f} value={f}>{t(FORMAT_LABEL[f])}</option>)}</select></Field>
        {format === "groups" && <div className="row" style={{ gap: 8 }}>
          <Field label={t("Gruppen")}><input className="input" type="number" min={2} max={16} value={groups} onChange={(e) => setGroups(Number(e.target.value))} /></Field>
          <Field label={t("Weiter je Gruppe")}><input className="input" type="number" min={1} max={8} value={advance} onChange={(e) => setAdvance(Number(e.target.value))} /></Field>
        </div>}
        <Field label={t("Teilnehmer (einer pro Zeile)")} hint={t("{n} von höchstens {m}", { n: list.length, m: MAX_PARTICIPANTS })}><textarea className="input" rows={6} value={names} onChange={(e) => setNames(e.target.value)} /></Field>
        {players.length > 0 && <div className="row" style={{ gap: 6 }}><span className="tiny muted">{t("Aus Spieler-Karten")}:</span>{players.map((p) => <button key={p.id} type="button" className="chip" onClick={() => setNames((n) => (n.split("\n").some((x) => x.trim().toLowerCase() === p.data.title.toLowerCase()) ? n : (n.trim() ? n.trim() + "\n" : "") + p.data.title))}>+ {p.data.title}</button>)}</div>}
        {err && <Banner kind="warn">{err}</Banner>}
      </div>
    </Modal>
  );
}

function TournamentPage({ e, games, onBack }: { e: Entry<T>; games: { id: string; name: string }[]; onBack: () => void }) {
  const d = e.data;
  const [entry, setEntry] = useState<Match | null>(null);
  const c = useMemo(() => { try { return compute(d); } catch (err) { return err as Error; } }, [d]);
  if (c instanceof Error) return <Card title={d.title}><Banner kind="error">{t(c.message)}</Banner><Button onClick={onBack}>{t("Zurück")}</Button></Card>;
  const save = (p: Partial<T>) => trySave("tournament", e.id, { ...d, ...p });
  const started = Object.keys(d.results).length > 0;
  const rounds = (b: Match["bracket"], group?: number) => {
    const ms = c.matches.filter((m) => m.bracket === b && (group == null || m.group === group) && m.status !== "empty");
    return [...new Set(ms.map((m) => m.round))].map((r) => ({ r, label: ms.find((m) => m.round === r)!.label, ms: ms.filter((m) => m.round === r) }));
  };
  return (
    <div className="stack tournament-print">
      <Card title={d.title} icon={<Trophy size={18} />} meta={t(FORMAT_LABEL[d.format])} actions={<Button size="sm" onClick={onBack}>{t("Zurück")}</Button>}>
        <div className="stack-sm">
          {gameLabel(d, games) && <span className="tiny muted">{gameLabel(d, games)}</span>}
          {c.champion ? <Banner kind="ok" title={t("Sieger")}><Crown size={15} /> {c.champion}</Banner> : <span className="small muted">{t("Noch offen – {n} Spiele bereit", { n: c.matches.filter((m) => m.status === "ready").length })}</span>}
          {c.invalid.length > 0 && <Banner kind="warn" title={t("Ergebnisse prüfen")}>{c.invalid.map((m) => <div key={m.id}>{roundLabel(m.label)} ({m.id}): {t(m.invalid!)}</div>)}</Banner>}
          <div className="row no-print" style={{ gap: 6 }}>
            {!started && <Button size="sm" icon={<Shuffle size={14} />} onClick={() => { save({ participants: draw(d.participants), drawn: true }); toast(t("Ausgelost")); }}>{d.drawn ? t("Neu auslosen") : t("Auslosen")}</Button>}
            <Button size="sm" variant="ghost" icon={<FileSpreadsheet size={14} />} onClick={() => downloadText(`turnier-${d.title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40)}.csv`, matchesCsv(c), "text/csv")}>{t("Spiele (CSV)")}</Button>
            <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => void exportJournal(["tournament"], false, [e.id]).then((f) => downloadText(`turnier-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(f)))}>{t("Als Datei")}</Button>
            <Button size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>{t("Drucken / PDF")}</Button>
            <Button size="sm" variant="ghost" onClick={() => save({ archived: !d.archived })}>{d.archived ? t("Aus der Historie holen") : t("In die Historie")}</Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={async () => { if (await confirmDialog(t("Turnier löschen?"), t("Es wird auf allen Geräten gelöscht."), { danger: true, ok: t("Löschen") })) { removeWithLinks(e.id); onBack(); } }}>{t("Löschen")}</Button>
          </div>
          {started && <span className="tiny muted">{t("Auslosen geht nur, solange noch kein Ergebnis eingetragen ist.")}</span>}
        </div>
      </Card>
      {(d.format === "single" || d.format === "double") && <Bracket title={d.format === "double" ? t("Gewinnerrunde") : t("Turnierbaum")} rounds={rounds("W")} onPick={setEntry} />}
      {d.format === "double" && <><Bracket title={t("Verliererrunde")} rounds={rounds("L")} onPick={setEntry} /><Bracket title={t("Großes Finale")} rounds={rounds("F")} onPick={setEntry} /></>}
      {d.format === "roundrobin" && <><Table rows={c.table!} /><Bracket title={t("Spieltage")} rounds={rounds("R")} onPick={setEntry} /></>}
      {d.format === "groups" && c.groups!.map((g, gi) => (
        <div key={gi} className="stack-sm"><Table title={t("Gruppe {g}", { g: String.fromCharCode(65 + gi) })} rows={g.table} /><Bracket title={t("Spiele Gruppe {g}", { g: String.fromCharCode(65 + gi) })} rounds={rounds("R", gi + 1)} onPick={setEntry} /></div>
      ))}
      {d.format === "groups" && <Bracket title={t("Finalrunde")} rounds={[...new Set(c.matches.filter((m) => m.id.startsWith("K")).map((m) => m.round))].map((r) => ({ r, label: c.matches.find((m) => m.id.startsWith("K") && m.round === r)!.label, ms: c.matches.filter((m) => m.id.startsWith("K") && m.round === r && m.status !== "empty") }))} onPick={setEntry} />}
      {entry && <ResultDialog m={entry} allowDraw={entry.bracket === "R"} current={d.results[entry.id]} onClose={() => setEntry(null)} onSave={(r) => {
        const results = { ...d.results };
        if (r) results[entry.id] = r; else delete results[entry.id];
        if (save({ results })) setEntry(null);
      }} />}
      <span className="tiny muted">{t("Angelegt {d}", { d: dateTime(d.createdAt ?? new Date(e.updatedAt).toISOString()) })}</span>
    </div>
  );
}

function Bracket({ title, rounds, onPick }: { title: string; rounds: { r: number; label: string; ms: Match[] }[]; onPick: (m: Match) => void }) {
  if (!rounds.length) return null;
  return (
    <Card title={title}>
      <div className="bracket">
        {rounds.map((rd) => (
          <div key={rd.r} className="bracket-round">
            <span className="tiny muted">{roundLabel(rd.label)}</span>
            {rd.ms.map((m) => (
              <button key={m.id} type="button" className={`bracket-match ${m.status}`} disabled={m.status !== "ready" && m.status !== "done"} onClick={() => onPick(m)} aria-label={t("Spiel {id}", { id: m.id })}>
                <Side name={m.a} win={m.winner != null && m.winner === m.a} score={m.result?.scoreA} />
                <Side name={m.b} win={m.winner != null && m.winner === m.b} score={m.result?.scoreB} bye={m.status === "bye"} />
                {m.invalid && <span className="tiny" style={{ color: "var(--warning)" }}>⚠</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Side({ name, win, score, bye }: { name: string | null; win: boolean; score?: number | null; bye?: boolean }) {
  return <span className={`bracket-side ${win ? "win" : ""}`}><span className="ellipsis">{name ?? (bye ? t("Freilos") : "…")}</span>{score != null && <b>{score}</b>}</span>;
}

function Table({ title, rows }: { title?: string; rows: ReturnType<typeof compute>["table"] & object }) {
  return (
    <Card title={title ?? t("Tabelle")}>
      <div className="table-wrap"><table className="table"><thead><tr><th>#</th><th>{t("Name")}</th><th>{t("Sp.")}</th><th>{t("S")}</th><th>{t("U")}</th><th>{t("N")}</th><th>{t("Tore / Punkte")}</th><th>{t("Pkt.")}</th></tr></thead>
        <tbody>{rows.map((s, i) => <tr key={s.name}><td>{i + 1}</td><td>{s.name}</td><td>{s.played}</td><td>{s.won}</td><td>{s.drawn}</td><td>{s.lost}</td><td>{s.for}:{s.against}</td><td><b>{s.points}</b></td></tr>)}</tbody></table></div>
      <span className="tiny muted">{t("Sieg 3, Unentschieden 1, Niederlage 0 · bei Gleichstand zählt die Differenz, dann die erzielten Punkte.")}</span>
    </Card>
  );
}

function ResultDialog({ m, allowDraw, current, onClose, onSave }: { m: Match; allowDraw: boolean; current?: Result; onClose: () => void; onSave: (r: Result | null) => void }) {
  const [a, setA] = useState(current?.scoreA != null ? String(current.scoreA) : "");
  const [b, setB] = useState(current?.scoreB != null ? String(current.scoreB) : "");
  const [winner, setWinner] = useState<"a" | "b" | "draw" | "">(current?.draw ? "draw" : current?.winner ?? "");
  const r: Result = { players: [m.a!, m.b!], ...(a !== "" || b !== "" ? { scoreA: a === "" ? null : Number(a), scoreB: b === "" ? null : Number(b) } : {}), ...(winner === "draw" ? { draw: true } : winner ? { winner } : {}) };
  const err = checkResult(r, allowDraw);
  return (
    <Modal title={`${m.a} – ${m.b}`} onClose={onClose} footer={<>
      {current && <Button variant="ghost" onClick={() => onSave(null)}>{t("Ergebnis entfernen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!!err} onClick={() => onSave(r)}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <span className="tiny muted">{roundLabel(m.label)} · {m.id}</span>
        <div className="row nowrap" style={{ gap: 8 }}>
          <Field label={m.a!}><input className="input" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} /></Field>
          <span>:</span>
          <Field label={m.b!}><input className="input" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <div className="chips" role="radiogroup" aria-label={t("Sieger")}>
          <button type="button" role="radio" aria-checked={winner === "a"} className={`chip ${winner === "a" ? "on" : ""}`} onClick={() => setWinner(winner === "a" ? "" : "a")}>{t("Sieger")}: {m.a}</button>
          <button type="button" role="radio" aria-checked={winner === "b"} className={`chip ${winner === "b" ? "on" : ""}`} onClick={() => setWinner(winner === "b" ? "" : "b")}>{t("Sieger")}: {m.b}</button>
          {allowDraw && <button type="button" role="radio" aria-checked={winner === "draw"} className={`chip ${winner === "draw" ? "on" : ""}`} onClick={() => setWinner(winner === "draw" ? "" : "draw")}>{t("Unentschieden")}</button>}
        </div>
        <span className="tiny muted">{t("Ergebnis eintragen genügt – den Sieger musst du nur wählen, wenn es keins gibt oder es unentschieden stand (z. B. nach Verlängerung).")}</span>
        {err && <span className="tiny" style={{ color: "var(--warning)" }}>{t(err)}</span>}
      </div>
    </Modal>
  );
}
