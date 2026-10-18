import { useState } from "react";
import { Keyboard, Pencil, Plus } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import type { Hotkey, HotkeyStatus, QuickAction } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { describeStep, StepEditor, stepsValid, useStepRefs } from "../components/StepEditor";
import { comboFromEvent } from "./hotkey-combo";

const STATE_BADGE: Record<string, [string, string]> = { active: ["ok", "Aktiv"], error: ["error", "Fehler"], disabled: ["", "Aus"], pending: ["warn", "Ausstehend"], inactive: ["", "Anderes Profil"] };

export default function Hotkeys() {
  const q = useRpc<{ supported: boolean; hotkeys: { hotkey: Hotkey; status: HotkeyStatus }[] }>("hotkeys.list", {}, ["hotkeys"]);
  const quick = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  const refs = useStepRefs();
  const conn = useConn();
  const canManage = conn.me?.permissions.includes("manage");
  const [edit, setEdit] = useState<Hotkey | null>(null);
  const describe = (h: Hotkey) => h.quickActionId ? `${t("Quick Action")}: ${quick.data?.actions.find((a) => a.id === h.quickActionId)?.name ?? "?"}` : describeStep(h.action, refs);

  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Hotkeys")} text={t("Globale Tastenkombinationen auf dem PC – funktionieren auch, während ein Spiel im Vordergrund ist.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit({ id: "", keys: "", enabled: true, action: { type: "playSound", ref: null } })}>{t("Neuer Hotkey")}</Button>} />
      {q.data && !q.data.supported && <div style={{ marginBottom: 16 }}><Banner kind="warn">{t("Globale Hotkeys werden nur vom Windows-Companion registriert. Du kannst sie trotzdem hier vorbereiten.")}</Banner></div>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {(q.data?.hotkeys.length ?? 0) === 0 ? <Card><Empty icon={<Keyboard size={28} />} title={t("Keine Hotkeys")} text={t("Beispiel: Strg+Alt+F9 spielt deinen Lieblingssound, Strg+Alt+F12 stoppt alle Sounds.")} /></Card> : (
          <Card>
            <div className="list">
              {q.data!.hotkeys.map(({ hotkey: h, status }) => {
                const [cls, label] = STATE_BADGE[status.state] ?? ["", status.state];
                return (
                  <div key={h.id} className="list-item">
                    <kbd style={{ fontSize: "0.85rem", padding: "5px 10px" }}>{h.keys.replace(/\+/g, " + ")}</kbd>
                    <div className="grow"><div className="title small ellipsis">{describe(h)}</div>{status.message && <div className="sub" style={status.state === "error" ? { color: "var(--danger)" } : undefined}>{t(status.message)}</div>}</div>
                    <span className={`badge ${cls}`}>{t(label)}</span>
                    {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(structuredClone(h))} aria-label={t("Bearbeiten")} />}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Loadable>
      {edit && <HotkeyEditor hk={edit} quick={quick.data?.actions ?? []} onClose={() => setEdit(null)} />}
    </>
  );
}

function HotkeyEditor({ hk, quick, onClose }: { hk: Hotkey; quick: QuickAction[]; onClose: () => void }) {
  const [h, setH] = useState(hk);
  const [mode, setMode] = useState<"step" | "quick">(hk.quickActionId ? "quick" : "step");
  const [recording, setRecording] = useState(false);
  const save = async () => {
    try { await client.call("hotkeys.save", { ...h, quickActionId: mode === "quick" ? h.quickActionId : null }); toast(t("Gespeichert"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Hotkey löschen?"), h.keys, { danger: true, ok: t("Löschen") }))) return;
    await client.call("hotkeys.remove", { id: h.id });
    onClose();
  };
  return (
    <Modal title={h.id ? t("Hotkey bearbeiten") : t("Neuer Hotkey")} onClose={onClose} footer={<>
      {h.id && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!h.keys || (mode === "quick" ? !h.quickActionId : !stepsValid([h.action]))} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Tastenkombination")} hint={t("Ins Feld tippen und die Kombination drücken – oder eintippen, z. B. Ctrl+Alt+F9.")}>
        <input className="input mono" value={h.keys} placeholder={recording ? t("Kombination drücken …") : "Ctrl+Alt+F9"}
          onFocus={() => setRecording(true)} onBlur={() => setRecording(false)}
          onChange={(e) => setH({ ...h, keys: e.target.value })}
          onKeyDown={(e) => {
            if (["Control", "Alt", "Shift", "Meta", "Backspace"].includes(e.key) || e.key === "Tab") return;
            const c = comboFromEvent(e);
            if (c) { e.preventDefault(); setH({ ...h, keys: c }); }
          }} />
      </Field>
      <Segmented value={mode} onChange={setMode} options={[{ value: "step", label: t("Einzelne Aktion") }, { value: "quick", label: t("Quick Action") }]} />
      {mode === "step" ? (
        <StepEditor steps={[h.action]} onChange={(s) => s[0] && setH({ ...h, action: s[0] })} max={1} />
      ) : (
        <select className="input" value={h.quickActionId ?? ""} onChange={(e) => setH({ ...h, quickActionId: e.target.value || null })}>
          <option value="">{t("Bitte wählen …")}</option>
          {quick.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <Switch checked={h.enabled} onChange={(enabled) => setH({ ...h, enabled })} label={t("Aktiv")} />
      <Banner kind="info">{t("Von Windows reservierte Kombinationen (z. B. Alt+Tab, Win+L) werden abgelehnt. Belegt ein anderes Programm die Kombination, zeigt die Liste einen Fehler.")}</Banner>
    </Modal>
  );
}
