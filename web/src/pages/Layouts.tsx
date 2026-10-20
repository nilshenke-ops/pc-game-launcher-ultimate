import { useState } from "react";
import { LayoutTemplate, Monitor, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import type { LibraryItem } from "../lib/types";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead } from "../components/ui";

interface LayoutWindow { process: string; titleContains?: string | null; monitorId: string; monitorName?: string | null; x: number; y: number; width: number; height: number; state: "normal" | "maximized" | "minimized"; preset?: Preset | null; monitorIndex?: number | null }
type Preset = "max" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
const PRESETS: Record<Preset, () => string> = { max: () => t("Maximiert"), left: () => t("Linke Hälfte"), right: () => t("Rechte Hälfte"), top: () => t("Obere Hälfte"), bottom: () => t("Untere Hälfte"), "top-left": () => t("Oben links (Viertel)"), "top-right": () => t("Oben rechts (Viertel)"), "bottom-left": () => t("Unten links (Viertel)"), "bottom-right": () => t("Unten rechts (Viertel)"), center: () => t("Mitte") };
const monitorLabel = (i: number) => (i === 0 ? t("Hauptmonitor") : t("Monitor {n}", { n: i + 1 }));
const where = (w: LayoutWindow) => w.preset ? `${PRESETS[w.preset]()}, ${w.monitorName ?? monitorLabel(w.monitorIndex ?? 0)}` : `${STATE[w.state]()}${w.monitorName ? ", " + w.monitorName : ""}`;
interface WindowLayout { id: string; name: string; windows: LayoutWindow[]; updatedAt?: string }
interface Monitor { id: string; name: string; x: number; y: number; width: number; height: number; primary: boolean }
interface LayoutList { layouts: WindowLayout[]; supported: boolean; monitors: Monitor[] }

const STATE: Record<LayoutWindow["state"], () => string> = { normal: () => t("Fenster"), maximized: () => t("Maximiert"), minimized: () => t("Minimiert") };

/** Window and monitor layouts: where programs sit, put back with one tap. Renaming and deleting also work without the PC. */
export default function LayoutsPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const canLaunch = useCan("launch");
  const q = useRpc<LayoutList>("layouts.list", {}, ["layouts"]);
  const [creating, setCreating] = useState(false);
  const [rename, setRename] = useState<WindowLayout | null>(null);
  const [results, setResults] = useState<{ layout: string; items: { process: string; result: string; ok: boolean }[] } | null>(null);

  const apply = async (l: WindowLayout) => {
    try {
      const r = await client.call<{ results: { process: string; result: string; ok: boolean }[] }>("layouts.apply", { id: l.id });
      setResults({ layout: l.name, items: r.results });
      const ok = r.results.filter((x) => x.ok).length;
      toast(t("{n} von {m} Fenstern an ihrem Platz", { n: ok, m: r.results.length }), ok === r.results.length ? "success" : "warning");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async (l: WindowLayout) => {
    if (!(await confirmDialog(t("Layout löschen?"), l.name, { danger: true, ok: t("Löschen") }))) return;
    client.call("layouts.remove", { id: l.id }).catch((e: Error) => toast(e.message, "error"));
  };

  return (
    <>
      <PageHead eyebrow={t("Steuerung")} title={t("Fenster-Layouts")}
        text={t("Speichere, wo deine Programme liegen – z. B. Discord und Spotify auf dem zweiten Monitor, OBS maximiert – und stell es mit einem Tipp wieder her. Auch als Baustein in Quick Actions.")}
        actions={canManage && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => setRename({ id: "lay_" + Math.random().toString(36).slice(2, 10), name: "", windows: [] })}>{t("Neues Layout")}</Button>
          <Button icon={<Monitor size={17} />} disabled={!online} onClick={() => setCreating(true)}>{t("Aus offenen Fenstern")}</Button>
        </div>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (
          <div className="stack">
            {!q.data.supported && <Banner kind="info">{t("Fenster-Layouts gehen nur mit dem Windows-Begleiter.")}</Banner>}
            {!online && <p className="small muted">{t("Ohne PC: Layouts mit „Neues Layout“ anlegen, bearbeiten und löschen geht (wird übertragen); anwenden braucht den PC.")}</p>}
            {q.data.monitors.length > 0 && <p className="small muted"><Monitor size={14} /> {q.data.monitors.map((m) => `${m.name}${m.primary ? " · " + t("Hauptmonitor") : ""}`).join(" · ")}</p>}
            {q.data.layouts.length === 0 ? <Card><Empty icon={<LayoutTemplate size={26} />} title={t("Noch keine Layouts")} text={t("Tippe auf „Neues Layout“ und wähle für jedes Programm einen Platz – z. B. Discord links auf dem zweiten Monitor. Oder ordne die Fenster am PC an und nimm „Aus offenen Fenstern“.")} /></Card> : (
              <div className="list">
                {q.data.layouts.map((l) => (
                  <div key={l.id} className="list-item">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{l.name}</div>
                      <div className="sub small ellipsis">{l.windows.map((w) => `${w.process} (${where(w)})`).join(" · ")}</div>
                      {l.updatedAt && <div className="tiny muted">{t("Gespeichert {d}", { d: dateTime(l.updatedAt) })}</div>}
                    </div>
                    {canLaunch && <Button size="sm" variant="primary" icon={<Play size={14} />} disabled={!online || !q.data!.supported} onClick={() => void apply(l)}>{t("Anwenden")}</Button>}
                    {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Bearbeiten")} onClick={() => setRename(l)} />}
                    {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Löschen")} onClick={() => void remove(l)} />}
                  </div>
                ))}
              </div>
            )}
            {results && (
              <Card title={t("Ergebnis: {n}", { n: results.layout })}>
                <ul className="compat-lines">{results.items.map((r, i) => <li key={i}><b>{r.process}</b>: {r.result}</li>)}</ul>
              </Card>
            )}
            <p className="tiny muted">{t("Verschoben werden nur Fenster, die gerade offen sind – Programme werden nicht gestartet. Fehlt ein Monitor, landet das Fenster auf dem Hauptmonitor. Programme mit Administratorrechten lassen sich von Windows aus nicht verschieben.")}</p>
          </div>
        )}
      </Loadable>
      {creating && <CreateLayout onClose={() => setCreating(false)} />}
      {rename && <LayoutEditor layout={rename} monitors={q.data?.monitors ?? []} onClose={() => setRename(null)} />}
    </>
  );
}

function CreateLayout({ onClose }: { onClose: () => void }) {
  const q = useRpc<{ windows: { process: string; title: string; state: string; monitorId: string }[]; monitors: Monitor[] }>("layouts.current", {}, []);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const procs = [...new Map((q.data?.windows ?? []).map((w) => [w.process, w])).values()];
  const chosen = picked ?? procs.map((w) => w.process);
  const save = async () => {
    if (!name.trim()) { toast(t("Bitte einen Namen eingeben."), "error"); return; }
    try {
      await client.call("layouts.capture", { id: "lay_" + Math.random().toString(36).slice(2, 10), name: name.trim(), processes: chosen });
      toast(t("Layout gespeichert"), "success"); onClose();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal title={t("Neues Fenster-Layout")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!chosen.length} onClick={save}>{t("Speichern")}</Button></>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" value={name} maxLength={40} autoFocus placeholder={t("z. B. Streamen")} onChange={(e) => setName(e.target.value)} /></Field>
        <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
          <div className="stack-sm">
            <b className="small">{t("Diese Fenster merken (Position wie gerade am PC):")}</b>
            {procs.length === 0 ? <p className="small muted">{t("Keine offenen Programmfenster gefunden.")}</p> : procs.map((w) => (
              <label key={w.process} className="row nowrap small" style={{ gap: 8 }}>
                <input type="checkbox" checked={chosen.includes(w.process)} onChange={(e) => setPicked(e.target.checked ? [...chosen, w.process] : chosen.filter((p) => p !== w.process))} />
                <span className="grow ellipsis"><b>{w.process}</b> – {w.title}</span>
              </label>
            ))}
          </div>
        </Loadable>
      </div>
    </Modal>
  );
}

/** Edit a layout – also without the PC: each program gets a place (half, quarter, maximized …) on a monitor. */
function LayoutEditor({ layout, monitors, onClose }: { layout: WindowLayout; monitors: Monitor[]; onClose: () => void }) {
  const conn = useConn();
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, []);
  const [name, setName] = useState(layout.name);
  const [wins, setWins] = useState<LayoutWindow[]>(layout.windows);
  const [proc, setProc] = useState("");
  const procNames = [...new Set((lib.data?.items ?? []).flatMap((i) => i.processNames.length ? i.processNames : i.source === "exe" ? [i.target.split(/[\\/]/).pop() ?? ""] : []).map((p) => p.replace(/\.exe$/i, "")).filter((p) => /^[A-Za-z0-9 ._()-]{1,80}$/.test(p)))].sort();
  const monCount = Math.max(3, monitors.length);
  const add = (p: string) => {
    const v = p.trim().replace(/\.exe$/i, "");
    if (!v || wins.some((w) => w.process.toLowerCase() === v.toLowerCase())) return;
    setWins([...wins, { process: v, monitorId: "", x: 0, y: 0, width: 800, height: 600, state: "normal", preset: wins.length % 2 ? "right" : "left", monitorIndex: 0 }]);
    setProc("");
  };
  const set = (i: number, patch: Partial<LayoutWindow>) => setWins(wins.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const save = () => {
    if (!name.trim()) { toast(t("Bitte einen Namen eingeben."), "error"); return; }
    if (!wins.length) { toast(t("Bitte mindestens ein Programm hinzufügen."), "error"); return; }
    client.call("layouts.save", { ...layout, name: name.trim(), windows: wins }).then(() => { toast(conn.auth === "ok" && conn.phase === "online" ? t("Layout gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"); onClose(); }, (e: Error) => toast(e.message, "error"));
  };
  return (
    <Modal title={layout.name ? t("Layout bearbeiten") : t("Neues Fenster-Layout")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" onClick={save}>{t("Speichern")}</Button></>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" value={name} maxLength={40} autoFocus placeholder={t("z. B. Streamen")} onChange={(e) => setName(e.target.value)} /></Field>
        {wins.map((w, i) => (
          <div key={w.process} className="layout-row">
            <div className="row between"><b className="ellipsis">{w.process}</b><Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("{n} entfernen", { n: w.process })} onClick={() => setWins(wins.filter((_, j) => j !== i))} /></div>
            {w.preset || !w.monitorId ? (
              <div className="grid-2">
                <Field label={t("Platz")}>
                  <select className="input" value={w.preset ?? "max"} onChange={(e) => set(i, { preset: e.target.value as Preset, monitorId: "", state: e.target.value === "max" ? "maximized" : "normal" })}>
                    {(Object.keys(PRESETS) as Preset[]).map((p) => <option key={p} value={p}>{PRESETS[p]()}</option>)}
                  </select>
                </Field>
                <Field label={t("Monitor")}>
                  <select className="input" value={w.monitorIndex ?? 0} onChange={(e) => set(i, { monitorIndex: Number(e.target.value), monitorName: null, monitorId: "" })}>
                    {Array.from({ length: monCount }, (_, m) => <option key={m} value={m}>{monitors[m] ? `${monitorLabel(m)} – ${monitors[m].name}` : monitorLabel(m)}</option>)}
                  </select>
                </Field>
                <PresetPreview preset={w.preset ?? "max"} />
              </div>
            ) : (
              <div className="row between small"><span className="muted">{t("Genaue Position vom PC")} ({where(w)})</span><Button size="sm" variant="ghost" onClick={() => set(i, { preset: "max", monitorIndex: 0, monitorId: "", monitorName: null })}>{t("Platz wählen")}</Button></div>
            )}
          </div>
        ))}
        <div className="stack-xs">
          <b className="small">{t("Programm hinzufügen")}</b>
          <form className="row nowrap" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); add(proc); }}>
            <input className="input mono" list="layout-procs" value={proc} maxLength={80} placeholder={t("Programmname, z. B. Discord")} aria-label={t("Programmname")} onChange={(e) => setProc(e.target.value)} />
            <datalist id="layout-procs">{procNames.map((p) => <option key={p} value={p} />)}</datalist>
            <Button type="submit" disabled={!proc.trim() || wins.length >= 30}>{t("Hinzufügen")}</Button>
          </form>
          <span className="tiny muted">{t("Der Name des Programms ohne „.exe“ – so wie im Task-Manager unter „Details“ (z. B. Discord, Spotify, obs64, chrome).")}</span>
        </div>
      </div>
    </Modal>
  );
}

/** Small picture of where the window goes. */
function PresetPreview({ preset }: { preset: Preset }) {
  const r: Record<Preset, [number, number, number, number]> = { max: [0, 0, 100, 100], left: [0, 0, 50, 100], right: [50, 0, 50, 100], top: [0, 0, 100, 50], bottom: [0, 50, 100, 50], "top-left": [0, 0, 50, 50], "top-right": [50, 0, 50, 50], "bottom-left": [0, 50, 50, 50], "bottom-right": [50, 50, 50, 50], center: [17, 17, 66, 66] };
  const [x, y, w, h] = r[preset];
  return <div className="preset-preview" aria-hidden><span style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} /></div>;
}
