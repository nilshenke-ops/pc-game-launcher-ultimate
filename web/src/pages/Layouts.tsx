import { useState } from "react";
import { LayoutTemplate, Monitor, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead } from "../components/ui";

interface LayoutWindow { process: string; titleContains?: string | null; monitorId: string; monitorName?: string | null; x: number; y: number; width: number; height: number; state: "normal" | "maximized" | "minimized" }
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
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} disabled={!online} onClick={() => setCreating(true)}>{t("Aus offenen Fenstern")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (
          <div className="stack">
            {!q.data.supported && <Banner kind="info">{t("Fenster-Layouts gehen nur mit dem Windows-Begleiter.")}</Banner>}
            {!online && <p className="small muted">{t("Ohne PC: Layouts umbenennen und löschen geht (wird übertragen); anwenden und neu erstellen braucht den PC.")}</p>}
            {q.data.monitors.length > 0 && <p className="small muted"><Monitor size={14} /> {q.data.monitors.map((m) => `${m.name}${m.primary ? " · " + t("Hauptmonitor") : ""}`).join(" · ")}</p>}
            {q.data.layouts.length === 0 ? <Card><Empty icon={<LayoutTemplate size={26} />} title={t("Noch keine Layouts")} text={t("Ordne deine Fenster am PC an und tippe auf „Aus offenen Fenstern“.")} /></Card> : (
              <div className="list">
                {q.data.layouts.map((l) => (
                  <div key={l.id} className="list-item">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{l.name}</div>
                      <div className="sub small ellipsis">{l.windows.map((w) => `${w.process} (${STATE[w.state]()}${w.monitorName ? ", " + w.monitorName : ""})`).join(" · ")}</div>
                      {l.updatedAt && <div className="tiny muted">{t("Gespeichert {d}", { d: dateTime(l.updatedAt) })}</div>}
                    </div>
                    {canLaunch && <Button size="sm" variant="primary" icon={<Play size={14} />} disabled={!online || !q.data!.supported} onClick={() => void apply(l)}>{t("Anwenden")}</Button>}
                    {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Umbenennen")} onClick={() => setRename(l)} />}
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
      {rename && <RenameLayout layout={rename} onClose={() => setRename(null)} />}
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

function RenameLayout({ layout, onClose }: { layout: WindowLayout; onClose: () => void }) {
  const [name, setName] = useState(layout.name);
  const save = () => client.call("layouts.save", { ...layout, name: name.trim() }).then(onClose, (e: Error) => toast(e.message, "error"));
  return (
    <Modal title={t("Layout umbenennen")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>{t("Speichern")}</Button></>}>
      <Field label={t("Name")}><input className="input" value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  );
}
