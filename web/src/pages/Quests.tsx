import { useState } from "react";
import { Award, CheckCircle2, Flag, Lock, Pencil, Plus, Swords, Trash2, Trophy } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, duration, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { clientId, levelPercent, progressPercent } from "../lib/quest-deal";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented, Switch } from "../components/ui";

type Kind = "playtime" | "sessions" | "wins" | "matches";
type Period = "daily" | "weekly" | "once";
type Result = "win" | "loss" | "draw";

interface Goal {
  id: string; title: string; kind: Kind; period: Period; target: number; itemId?: string | null; active: boolean;
  game?: string | null; value?: number | null; done?: boolean; xp?: number; source?: "auto" | "manual"; pending?: boolean;
}
interface Match { id: string; itemId?: string | null; game: string; at: string; result: Result; score?: string | null; note?: string | null }
interface QuestData {
  xp: number; level: number; levelFrom: number; levelTo: number; offline?: boolean;
  goals: Goal[];
  achievements: { id: string; title: string; description: string; xp: number; source: "auto" | "manual" | "launcher"; value: number; target: number; unlocked: boolean; unlockedAt?: string | null }[];
  launcherAchievements?: boolean;
  matchStats: { game: string; wins: number; losses: number; draws: number; winRate: number }[];
  matches: Match[];
  ledger: { key: string; title: string; xp: number; at: string }[];
  totals: { minutes: number; sessions: number; games: number; longestStreakDays: number; wins: number; matches: number };
  historySessions: number;
}

const kindLabel = (k: Kind) => ({ playtime: t("Spielzeit"), sessions: t("Sitzungen"), wins: t("Siege"), matches: t("Matches") })[k];
const periodLabel = (p: Period) => ({ daily: t("täglich"), weekly: t("wöchentlich"), once: t("einmalig") })[p];
const resultLabel = (r: Result) => ({ win: t("Sieg"), loss: t("Niederlage"), draw: t("Unentschieden") })[r];
const fmtValue = (k: Kind, v: number) => (k !== "playtime" ? `${Math.floor(v)}` : v <= 0 ? "0 min" : duration(v));
const saved = (online: boolean) => toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");

function Progress({ pct, done, label }: { pct: number | null; done?: boolean; label: string }) {
  return (
    <div className={`meter ${done ? "q-done" : ""}`} role="progressbar" aria-label={label} aria-valuenow={pct == null ? undefined : Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ transform: `scaleX(${(pct ?? 0) / 100})` }} />
    </div>
  );
}

function SourceBadge({ source }: { source?: "auto" | "manual" | "launcher" }) {
  if (source === "launcher") return <span className="badge" title={t("Aus deinen Einstellungen in der App gezählt, wenn du GameQuest öffnest")}>{t("Launcher")}</span>;
  return source === "auto"
    ? <span className="badge info" title={t("Aus der Spielerkennung auf dem PC (Gaming-Verlauf)")}>{t("automatisch erkannt")}</span>
    : <span className="badge" title={t("Nur was du selbst einträgst – Spielstatistiken liest die App nicht aus.")}>{t("selbst eingetragen")}</span>;
}

function GoalEditor({ goal, games, onClose }: { goal: Goal; games: LibraryItem[]; onClose: () => void }) {
  const [g, setG] = useState(goal);
  const [busy, setBusy] = useState(false);
  const conn = useConn();
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }));
  const isTime = g.kind === "playtime";
  const save = async () => {
    setBusy(true);
    try {
      const { id, title, kind, period, target, itemId, active } = g;
      await client.call("quests.saveGoal", { id, title: title.trim(), kind, period, target, itemId: itemId || null, active });
      saved(conn.auth === "ok"); onClose();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Ziel löschen?"), g.title, { danger: true, ok: t("Löschen") }))) return;
    client.call("quests.removeGoal", { id: g.id }).then(onClose, (e: Error) => toast(e.message, "error"));
  };
  return (
    <Modal title={goal.title ? t("Ziel bearbeiten") : t("Neues Ziel")} onClose={onClose} footer={<>
      {goal.title && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" busy={busy} disabled={!g.title.trim() || g.target < 1} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Name")}><input className="input" value={g.title} maxLength={60} placeholder={t("z. B. 2 Stunden Rocket League")} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label={t("Was zählt?")} hint={g.kind === "playtime" || g.kind === "sessions" ? t("Erkennt der PC automatisch, wenn das Spiel läuft (Gaming-Verlauf muss an sein).") : t("Zählt nur Matches, die du unten selbst einträgst.")}>
        <Segmented value={g.kind} onChange={(kind) => set({ kind, target: kind === "playtime" ? 60 : 3 })} label={t("Was zählt?")}
          options={(["playtime", "sessions", "wins", "matches"] as Kind[]).map((k) => ({ value: k, label: kindLabel(k) }))} />
      </Field>
      <Field label={t("Zeitraum")} hint={g.period === "weekly" ? t("Woche beginnt am Montag (Zeitzone des PCs).") : g.period === "once" ? t("Zählt ab dem Anlegen des Ziels.") : undefined}>
        <Segmented value={g.period} onChange={(period) => set({ period })} label={t("Zeitraum")}
          options={(["daily", "weekly", "once"] as Period[]).map((p) => ({ value: p, label: periodLabel(p) }))} />
      </Field>
      <div className="grid-2">
        <Field label={isTime ? t("Ziel in Minuten") : t("Ziel (Anzahl)")} hint={isTime ? duration(g.target) : undefined}>
          <input className="input" type="number" min={1} max={isTime ? 100000 : 10000} value={g.target} onChange={(e) => set({ target: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </Field>
        <Field label={t("Spiel")}>
          <select className="input" value={g.itemId ?? ""} onChange={(e) => set({ itemId: e.target.value || null })}>
            <option value="">{t("Alle Spiele")}</option>
            {games.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
      </div>
      <Switch checked={g.active} onChange={(active) => set({ active })} label={t("Aktiv")} hint={t("Inaktive Ziele zeigen den Fortschritt, geben aber keine XP.")} />
    </Modal>
  );
}

function MatchForm({ games, disabled }: { games: LibraryItem[]; disabled: boolean }) {
  const conn = useConn();
  const [itemId, setItemId] = useState("");
  const [game, setGame] = useState("");
  const [result, setResult] = useState<Result>("win");
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const name = itemId ? games.find((g) => g.id === itemId)?.name ?? "" : game.trim();
  const add = async () => {
    setBusy(true);
    try {
      await client.call("quests.addMatch", { id: clientId("match"), itemId: itemId || null, game: name, result, score: score.trim() || null, at: new Date().toISOString() });
      setScore(""); saved(conn.auth === "ok");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); if (name) add(); }}>
      <div className="grid-2">
        <Field label={t("Spiel")}>
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t("Anderes Spiel (Name eingeben)")}</option>
            {games.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        {!itemId && <Field label={t("Name des Spiels")}><input className="input" value={game} maxLength={60} onChange={(e) => setGame(e.target.value)} /></Field>}
        <Field label={t("Spielstand (optional)")}><input className="input" value={score} maxLength={20} placeholder={t("z. B. 3:2 oder Platz 4")} onChange={(e) => setScore(e.target.value)} /></Field>
      </div>
      <Segmented value={result} onChange={setResult} label={t("Ergebnis")} options={(["win", "loss", "draw"] as Result[]).map((r) => ({ value: r, label: resultLabel(r) }))} />
      <div><Button type="submit" variant="primary" icon={<Plus size={16} />} busy={busy} disabled={disabled || !name}>{t("Match eintragen")}</Button></div>
    </form>
  );
}

/** GameQuest: own goals, XP and level, achievements and a match log. Values from the game detection and values entered by hand are always labelled. */
export default function Quests() {
  const q = useRpc<QuestData>("quests.get", {}, ["quests", "history"]);
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const canManage = useCan("manage");
  const [edit, setEdit] = useState<Goal | null>(null);
  const games = (lib.data?.items ?? []).filter((i) => i.kind === "game").sort((a, b) => a.name.localeCompare(b.name));
  const d = q.data;
  const newGoal = (): Goal => ({ id: clientId("goal"), title: "", kind: "playtime", period: "weekly", target: 120, itemId: null, active: true });
  const removeMatch = (m: Match) => client.call("quests.removeMatch", { id: m.id }).catch((e: Error) => toast(e.message, "error"));
  return (
    <>
      <PageHead eyebrow={t("Erweiterungen")} title={t("GameQuest")}
        text={t("Eigene Ziele, Erfolge und Level. Spielzeit und Sitzungen erkennt der PC automatisch; Siege und Matches trägst du selbst ein – Statistiken aus Spielen liest die App nicht aus.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit(newGoal())}>{t("Neues Ziel")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            {d.offline && <Banner kind="info">{t("Fortschritt, XP und Erfolge berechnet der PC aus dem Gaming-Verlauf. Ziele und Matches kannst du schon eintragen – sie werden beim Verbinden übertragen.")}</Banner>}
            {!d.offline && d.historySessions === 0 && <Banner kind="info">{t("Noch keine erkannten Spielsitzungen. Spielzeit-Ziele füllen sich, sobald der PC ein Spiel aus der Bibliothek laufen sieht (Gaming-Verlauf muss an sein).")}</Banner>}

            <Card className="q-level">
              <div className="row between wrap">
                <div className="row"><span className="q-lvl" aria-hidden>{d.level}</span><div><b>{t("Level {n}", { n: d.level })}</b><div className="tiny muted">{t("{x} XP gesamt · noch {r} XP bis Level {n}", { x: d.xp, r: d.levelTo - d.xp, n: d.level + 1 })}</div></div></div>
                <div className="tiny muted">{t("{h} gespielt · {s} Sitzungen · längste Serie {d} Tage", { h: fmtValue("playtime", d.totals.minutes), s: d.totals.sessions, d: d.totals.longestStreakDays })}</div>
              </div>
              <Progress pct={levelPercent(d.xp, d.levelFrom, d.levelTo)} label={t("Fortschritt bis zum nächsten Level")} />
              <p className="tiny muted">{t("XP gibt es nur für erreichte Ziele (täglich 20, wöchentlich 60, einmalig 100) und Erfolge.")}</p>
            </Card>

            <Card title={t("Ziele")} icon={<Flag size={18} />}>
              {d.goals.length === 0 ? (
                <Empty icon={<Flag size={26} />} title={t("Noch keine Ziele")} text={t("Zum Beispiel: 2 Stunden pro Woche, 3 Siege am Tag oder 10 Sitzungen insgesamt.")}
                  action={canManage && <Button icon={<Plus size={16} />} onClick={() => setEdit(newGoal())}>{t("Ziel anlegen")}</Button>} />
              ) : (
                <div className="stack-sm">
                  {d.goals.map((g) => {
                    const pct = progressPercent(g.value, g.target);
                    return (
                      <div key={g.id} className={`q-goal ${g.active ? "" : "muted"}`}>
                        <div className="row between wrap">
                          <span className="row">
                            {g.done ? <CheckCircle2 size={18} className="ok-text" aria-label={t("Erreicht")} /> : <Flag size={16} aria-hidden />}
                            <b>{g.title}</b>
                          </span>
                          <span className="row wrap">
                            <span className="badge">{periodLabel(g.period)}</span>
                            <SourceBadge source={g.source ?? (g.kind === "playtime" || g.kind === "sessions" ? "auto" : "manual")} />
                            {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label={t("{n} bearbeiten", { n: g.title })} onClick={() => setEdit(g)} />}
                          </span>
                        </div>
                        <Progress pct={pct} done={g.done} label={g.title} />
                        <div className="tiny muted">
                          {g.value == null ? t("Wird vom PC berechnet, sobald er verbunden ist.") : `${fmtValue(g.kind, g.value)} / ${fmtValue(g.kind, g.target)} ${kindLabel(g.kind)}`}
                          {g.game ? ` · ${g.game}` : g.itemId ? "" : ` · ${t("alle Spiele")}`}
                          {g.xp != null && ` · ${g.done ? t("+{n} XP erhalten", { n: g.xp }) : t("{n} XP", { n: g.xp })}`}
                          {!g.active && ` · ${t("inaktiv")}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title={t("Erfolge")} icon={<Award size={18} />} meta={<span className="tiny">{d.achievements.filter((a) => a.unlocked).length}/{d.achievements.length}</span>}>
              {d.achievements.length === 0 ? <p className="small muted">{t("Erfolge berechnet der PC – sie erscheinen nach dem Verbinden.")}</p> : (
                <div className="q-ach-grid">
                  {d.achievements.map((a) => (
                    <div key={a.id} className={`q-ach ${a.unlocked ? "on" : ""}`}>
                      {a.unlocked ? <Trophy size={20} aria-hidden /> : <Lock size={18} aria-hidden />}
                      <div className="stack-xs">
                        <b>{a.title}</b>
                        <span className="tiny muted">{a.description} · {a.xp} XP</span>
                        {a.unlocked ? <span className="tiny">{t("Freigeschaltet {d}", { d: relTime(a.unlockedAt) })}</span>
                          : <Progress pct={progressPercent(a.value, a.target)} label={a.title} />}
                        <SourceBadge source={a.source} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canManage && d.launcherAchievements !== undefined && (
                <div style={{ marginTop: 12 }}>
                  <Switch checked={d.launcherAchievements} onChange={(v) => client.call("quests.configure", { launcherAchievements: v }).then(q.reload, (e: Error) => toast(e.message, "error"))}
                    label={t("Launcher-Erfolge")} hint={t("Erfolge fürs Einrichten der App (Profil, gekoppeltes Gerät, Automatisierungen, Backlog …). Gezählt wird nur beim Öffnen dieser Seite aus deinen vorhandenen Einstellungen – keine Hintergrundprüfung, nichts wird gesendet.")} />
                </div>
              )}
            </Card>

            <Card title={t("Match eintragen")} icon={<Swords size={18} />}>
              <MatchForm games={games} disabled={!canManage} />
            </Card>

            {d.matchStats.length > 0 && (
              <Card title={t("Match-Statistik (selbst eingetragen)")} icon={<Trophy size={18} />}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t("Spiel")}</th><th>{t("Siege")}</th><th>{t("Niederlagen")}</th><th>{t("Unentschieden")}</th><th>{t("Siegquote")}</th></tr></thead>
                    <tbody>{d.matchStats.map((s) => <tr key={s.game}><td><b>{s.game}</b></td><td>{s.wins}</td><td>{s.losses}</td><td>{s.draws}</td><td>{s.winRate.toLocaleString()} %</td></tr>)}</tbody>
                  </table>
                </div>
              </Card>
            )}

            {d.matches.length > 0 && (
              <Card title={t("Letzte Matches")} icon={<Swords size={18} />}>
                <div className="stack-sm">
                  {d.matches.slice(0, 30).map((m) => (
                    <div key={m.id} className="row between">
                      <span className="row wrap">
                        <span className={`badge ${m.result === "win" ? "ok" : m.result === "loss" ? "error" : ""}`}>{resultLabel(m.result)}</span>
                        <b>{m.game}</b>{m.score && <span className="mono tiny">{m.score}</span>}
                        <span className="tiny muted">{dateTime(m.at)}</span>
                      </span>
                      {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={t("Match löschen")} onClick={() => removeMatch(m)} />}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {d.ledger.length > 0 && (
              <Card title={t("XP-Verlauf")} icon={<Award size={18} />}>
                <ul className="plain-list small">{d.ledger.map((e) => <li key={e.key} className="row between"><span>{e.title}</span><span className="muted">+{e.xp} XP · {relTime(e.at)}</span></li>)}</ul>
              </Card>
            )}
          </div>
        )}
      </Loadable>
      {edit && <GoalEditor goal={edit} games={games} onClose={() => setEdit(null)} />}
    </>
  );
}
