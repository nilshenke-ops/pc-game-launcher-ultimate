// Restorable game state: snapshots of what can really be read about a game (version, launch settings, linked profile,
// its configuration files from the savegame vault, mods on/off, plugin versions, system). Compare, preview, restore –
// the PC saves the current state first. Not a system image: what is not covered is listed before every restore.
import { useMemo, useState } from "react";
import { ArchiveRestore, Camera, GitCompare, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, StatusIcon } from "../components/ui";

interface SnapConfig { locationId: string; name: string; path: string; copy?: string | null; sha?: string | null; size: number; problem?: string | null }
interface SnapStep { part: string; status: "ok" | "warn" | "error" | "skip" | "info"; detail: string }
export interface Snapshot {
  id: string; itemId: string; game: string; at: string; reason: string; by: string; gameVersion?: string | null; args: string; workingDir?: string | null;
  profileId?: string | null; profileName?: string | null; configs: SnapConfig[]; mods?: { name: string; enabled: boolean }[] | null;
  plugins: { id: string; version: string; enabled: boolean }[]; system: Record<string, string>; restores: { at: string; by: string; safetySnapshot?: string | null; steps: SnapStep[] }[];
}
type KeyChange = { kind: "added" | "removed" | "changed"; key: string; old?: string | null; new?: string | null };
interface Diff { changes: { area: string; key: string; old?: string | null; new?: string | null }[]; files: { name: string; diff?: { mode: "keys"; changes: KeyChange[] } | { mode: "lines"; lines: { kind: string; text: string }[] } | null }[] }
interface Preview { diff: Diff; running: boolean; missingCopies: string[]; notRestored: string[] }

const STEP_ICON: Record<string, string> = { ok: "ok", warn: "warn", error: "error", skip: "info", info: "info" };

export default function GameStatePage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<{ snapshots: Snapshot[] }>("gamestate.list", {}, ["gamestate"]);
  const [creating, setCreating] = useState(false);
  const [diff, setDiff] = useState<{ a: Snapshot; b: Snapshot | null } | null>(null);
  const [restore, setRestore] = useState<Snapshot | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const snaps = q.data?.snapshots ?? [];
  const byGame = useMemo(() => {
    const m = new Map<string, Snapshot[]>();
    for (const s of snaps) m.set(s.game, [...(m.get(s.game) ?? []), s]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [snaps]);
  const picked = pick.map((id) => snaps.find((s) => s.id === id)).filter((s): s is Snapshot => !!s);
  const sameGame = picked.length === 2 && picked[0].itemId === picked[1].itemId;

  const remove = async (s: Snapshot) => {
    if (!(await confirmDialog(t("Momentaufnahme löschen?"), t("„{r}“ vom {d} wird mit ihren Dateikopien gelöscht.", { r: s.reason, d: dateTime(s.at) }), { danger: true, ok: t("Löschen") }))) return;
    try { await client.call("gamestate.remove", { id: s.id }); setPick(pick.filter((x) => x !== s.id)); q.reload(); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Spielzustand")}
        text={t("Momentaufnahmen vor größeren Änderungen: Spielversion, Startargumente, verknüpftes Gaming-Profil, Konfigurationsdateien aus dem Savegame-Tresor, Mods an/aus, Plugin-Versionen und System. Vergleichen und zurückholen – kein Windows-Abbild.")}
        actions={canManage && <Button variant="primary" icon={<Camera size={16} />} disabled={!online} onClick={() => setCreating(true)}>{t("Momentaufnahme")}</Button>} />
      {!online && <div style={{ marginBottom: 14 }}><Banner kind="info">{q.stale ? t("Ohne PC: Liste vom {d}. Erstellen, Vergleichen und Zurückholen gehen nur mit dem PC.", { d: dateTime(q.updatedAt ? new Date(q.updatedAt).toISOString() : null) }) : t("Momentaufnahmen liegen auf dem PC – sie erscheinen, sobald er verbunden ist.")}</Banner></div>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {snaps.length === 0 ? (
          <Card><Empty icon={<ArchiveRestore size={28} />} title={t("Noch keine Momentaufnahmen")}
            text={t("Der PC macht automatisch eine vor Mod-Installationen und vor dem Zurückholen von Konfigurationsdateien (höchstens alle 10 Minuten). Konfigurationsdateien kommen nur hinein, wenn sie im Savegame-Tresor eingetragen sind.")}
            action={<Link className="btn" to="/vault">{t("Zum Savegame-Tresor")}</Link>} /></Card>
        ) : (
          <div className="stack">
            <div className="row">
              <Button icon={<GitCompare size={16} />} disabled={!online || !sameGame} onClick={() => setDiff({ a: picked[1].at < picked[0].at ? picked[1] : picked[0], b: picked[1].at < picked[0].at ? picked[0] : picked[1] })}>
                {t("Vergleichen ({n}/2)", { n: pick.length })}
              </Button>
              {picked.length === 2 && !sameGame && <span className="small muted">{t("Nur Momentaufnahmen desselben Spiels lassen sich vergleichen.")}</span>}
            </div>
            {byGame.map(([game, list]) => (
              <div key={game} className="stack-sm">
                <h2 className="section-title">{game}</h2>
                {list.map((s) => {
                  const sel = pick.includes(s.id);
                  const last = s.restores[s.restores.length - 1];
                  return (
                    <Card key={s.id} title={s.reason} icon={<Camera size={18} />} meta={relTime(s.at)}
                      actions={<label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={sel} disabled={!sel && pick.length >= 2} onChange={() => setPick(sel ? pick.filter((x) => x !== s.id) : [...pick, s.id])} />{t("Vergleichen")}</label>}>
                      <div className="stack-sm">
                        <div className="row small" style={{ gap: 6 }}>
                          <span className="badge">{dateTime(s.at)}</span>
                          <span className="badge">{t("von {b}", { b: s.by })}</span>
                          {s.gameVersion && <span className="badge">{s.gameVersion}</span>}
                          <span className="badge">{t("{n} Konfigurationsdateien", { n: s.configs.filter((c) => c.copy).length })}</span>
                          {s.mods && <span className="badge">{t("{n} Mods", { n: s.mods.length })}</span>}
                          {s.profileName && <span className="badge">{s.profileName}</span>}
                        </div>
                        {s.configs.some((c) => c.problem) && <p className="tiny muted" style={{ margin: 0 }}>{s.configs.filter((c) => c.problem).map((c) => `${c.name}: ${c.problem}`).join(" · ")}</p>}
                        {last && <p className="tiny muted" style={{ margin: 0 }}>{t("Zuletzt zurückgeholt {d} von {b}: {e}", { d: dateTime(last.at), b: last.by, e: last.steps.some((x) => x.status === "error") ? t("mit Fehlern") : t("ohne Fehler") })}</p>}
                        <div className="row" style={{ gap: 6 }}>
                          <Button size="sm" icon={<GitCompare size={14} />} disabled={!online} onClick={() => setDiff({ a: s, b: null })}>{t("Mit jetzt vergleichen")}</Button>
                          {canManage && <Button size="sm" icon={<RotateCcw size={14} />} disabled={!online} onClick={() => setRestore(s)}>{t("Zurückholen …")}</Button>}
                          {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={!online} onClick={() => void remove(s)}>{t("Löschen")}</Button>}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Loadable>
      {creating && <CreateSnapshot onClose={() => { setCreating(false); q.reload(); }} />}
      {diff && <DiffModal a={diff.a} b={diff.b} onClose={() => setDiff(null)} />}
      {restore && <RestoreModal s={restore} onClose={() => { setRestore(null); q.reload(); }} />}
    </>
  );
}

function ChangeTable({ d }: { d: Diff }) {
  if (d.changes.length === 0) return <p className="small muted">{t("Keine Unterschiede.")}</p>;
  return (
    <div className="stack-sm">
      <div className="table-wrap">
        <table className="table small">
          <thead><tr><th>{t("Bereich")}</th><th>{t("Was")}</th><th>{t("Vorher")}</th><th>{t("Nachher")}</th></tr></thead>
          <tbody>{d.changes.map((c, i) => <tr key={i}><td>{t(c.area)}</td><td style={{ wordBreak: "break-word" }}>{c.key}</td>
            {c.area === "Konfiguration" && (c.old === "geändert" || c.new === "geändert") ? <td colSpan={2}>{t("geändert – Einzelheiten unten")}</td> : <><td>{c.old ?? "–"}</td><td>{c.new ?? "–"}</td></>}</tr>)}</tbody>
        </table>
      </div>
      {d.files.map((f) => f.diff?.mode === "keys" && f.diff.changes.length > 0 && (
        <div key={f.name} className="small">
          <b>{f.name}</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {f.diff.changes.map((c, i) => <li key={i}><code>{c.key}</code>: {c.kind === "added" ? t("neu „{v}“", { v: c.new ?? "" }) : c.kind === "removed" ? t("entfernt (war „{v}“)", { v: c.old ?? "" }) : `${c.old} → ${c.new}`}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The preview shows "now → snapshot", the diff is "snapshot → now": swap every value and added/removed. */
export function reverse(d: Diff): Diff {
  return {
    changes: d.changes.map((c) => ({ ...c, old: c.new, new: c.old })),
    files: d.files.map((f) => ({ ...f, diff: f.diff?.mode === "keys" ? { mode: "keys", changes: f.diff.changes.map((c) => ({ ...c, kind: c.kind === "added" ? "removed" : c.kind === "removed" ? "added" : "changed", old: c.new, new: c.old })) } : f.diff })),
  };
}

function DiffModal({ a, b, onClose }: { a: Snapshot; b: Snapshot | null; onClose: () => void }) {
  const q = useRpc<Diff>("gamestate.diff", { a: a.id, b: b?.id ?? "current" });
  return (
    <Modal wide title={b ? t("{a} → {b}", { a: dateTime(a.at), b: dateTime(b.at) }) : t("{a} → jetzt", { a: dateTime(a.at) })} onClose={onClose} footer={<Button onClick={onClose}>{t("Schließen")}</Button>}>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <ChangeTable d={q.data} />}</Loadable>
    </Modal>
  );
}

function RestoreModal({ s, onClose }: { s: Snapshot; onClose: () => void }) {
  const q = useRpc<Preview>("gamestate.preview", { id: s.id });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: SnapStep[] } | null>(null);
  const run = async () => {
    setBusy(true);
    try { setResult(await client.call<{ ok: boolean; steps: SnapStep[] }>("gamestate.restore", { id: s.id })); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const p = q.data;
  return (
    <Modal wide title={t("Zurückholen: {r}", { r: s.reason })} onClose={onClose}
      footer={result ? <Button variant="primary" onClick={onClose}>{t("Fertig")}</Button> : <>
        <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
        <Button variant="primary" icon={<RotateCcw size={16} />} busy={busy} disabled={!p || p.running} onClick={() => void run()}>{t("Jetzt zurückholen")}</Button>
      </>}>
      {result ? (
        <div className="stack">
          <Banner kind={result.ok ? "ok" : "warn"} title={result.ok ? t("Zurückgeholt") : t("Teilweise zurückgeholt")}>{t("Der Zustand davor ist als eigene Momentaufnahme gespeichert.")}</Banner>
          <div>{result.steps.map((x, i) => (
            <div key={i} className="check-row"><StatusIcon status={STEP_ICON[x.status]} /><div className="grow"><b>{t(x.part)}</b><div className="small muted">{x.detail}</div></div></div>
          ))}</div>
        </div>
      ) : (
        <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
          {p && (
            <div className="stack">
              {p.running && <Banner kind="error">{t("{g} läuft gerade – bitte erst beenden. Es wird nichts geändert.", { g: s.game })}</Banner>}
              {p.missingCopies.length > 0 && <Banner kind="warn">{t("Kopien fehlen: {l} – diese Dateien bleiben unverändert.", { l: p.missingCopies.join(", ") })}</Banner>}
              <b className="small">{t("Was sich ändert (jetzt → Momentaufnahme):")}</b>
              <ChangeTable d={reverse(p.diff)} />
              <p className="small muted" style={{ margin: 0 }}>{t("Zurückgestellt werden Startargumente, Arbeitsordner, verknüpftes Gaming-Profil, Konfigurationsdateien und Mods an/aus. Vorher speichert der PC den jetzigen Zustand.")}</p>
              <div className="small"><b>{t("Nicht enthalten:")}</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{p.notRestored.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
          )}
        </Loadable>
      )}
    </Modal>
  );
}

function CreateSnapshot({ onClose }: { onClose: () => void }) {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const games = (lib.data?.items ?? []).filter((i) => i.kind === "game").sort((a, b) => a.name.localeCompare(b.name));
  const [game, setGame] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try { await client.call("gamestate.create", { itemId: game, note: note.trim() || undefined }); toast(t("Momentaufnahme gespeichert"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  };
  return (
    <Modal title={t("Momentaufnahme erstellen")} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" busy={busy} disabled={!game} onClick={() => void make()}>{t("Speichern")}</Button></>}>
      <div className="stack-sm">
        <Field label={t("Spiel")}>
          <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">{t("Spiel wählen …")}</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label={t("Anlass (optional)")}><input className="input" maxLength={80} value={note} placeholder={t("z. B. Vor Grafik-Tuning")} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="small muted" style={{ margin: 0 }}>{t("Konfigurationsdateien kommen nur hinein, wenn sie im Savegame-Tresor für dieses Spiel eingetragen sind.")}</p>
      </div>
    </Modal>
  );
}
