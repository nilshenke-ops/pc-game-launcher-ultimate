import { useState } from "react";
import { FlaskConical, Keyboard, Pencil, Plus } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan, useConn } from "../lib/hooks";
import type { Hotkey, HotkeyStatus, QuickAction } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { describeStep, StepEditor, stepsValid, useStepRefs } from "../components/StepEditor";
import { COMPACT_SUGGESTIONS, describeCombo, MEDIA_SUGGESTIONS } from "./hotkey-combo";
import { ComboInput } from "../components/ComboInput";

const STATE_BADGE: Record<string, [string, string]> = { active: ["ok", "Aktiv"], error: ["error", "Fehler"], disabled: ["", "Aus"], pending: ["warn", "Ausstehend"], inactive: ["", "Anderes Profil"] };

export default function Hotkeys() {
  const q = useRpc<{ supported: boolean; hotkeys: { hotkey: Hotkey; status: HotkeyStatus }[] }>("hotkeys.list", {}, ["hotkeys"]);
  const quick = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  const refs = useStepRefs();
  const canManage = useCan("manage");
  const canLaunch = useCan("launch");
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [edit, setEdit] = useState<Hotkey | null>(null);
  // Runs the action exactly as if the key had been pressed on the PC – never queued (an action is meant for now).
  const test = (h: Hotkey) => client.call<{ results: string[] }>("hotkeys.test", { id: h.id })
    .then((r) => toast(r.results.join(" · "), r.results.some((x) => x.startsWith("Fehler")) ? "error" : "success"), (e: Error) => toast(e.message, "error"));
  const describe = (h: Hotkey) => h.quickActionId ? `${t("Quick Action")}: ${quick.data?.actions.find((a) => a.id === h.quickActionId)?.name ?? "?"}` : describeStep(h.action, refs);

  return (
    <>
      <PageHead eyebrow={t("Steuerung")} title={t("Hotkeys & Makros")} text={t("Globale Tastenkombinationen auf dem PC – funktionieren auch, während ein Spiel im Vordergrund ist. Für Abfolgen mehrerer Schritte eine Quick Action anlegen und hier zuweisen.")}
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
                    <kbd style={{ fontSize: "0.85rem", padding: "5px 10px" }}>{describeCombo(h.keys, t)}</kbd>
                    <div className="grow"><div className="title small ellipsis">{describe(h)}</div>{status.message && <div className="sub" style={status.state === "error" ? { color: "var(--danger)" } : undefined}>{t(status.message)}</div>}</div>
                    <span className={`badge ${cls}`}>{t(label)}</span>
                    {canLaunch && online && <Button size="sm" variant="ghost" icon={<FlaskConical size={14} />} onClick={() => test(h)} aria-label={t("{k} jetzt testen", { k: h.keys })} title={t("Jetzt testen")} />}
                    {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(structuredClone(h))} aria-label={t("Bearbeiten")} />}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Loadable>
      {edit && <HotkeyEditor hk={edit} quick={quick.data?.actions ?? []} taken={(q.data?.hotkeys ?? []).filter((x) => x.hotkey.id !== edit.id && x.hotkey.enabled).map((x) => x.hotkey.keys)} onClose={() => setEdit(null)} />}
    </>
  );
}

function HotkeyEditor({ hk, quick, taken, onClose }: { hk: Hotkey; quick: QuickAction[]; taken: string[]; onClose: () => void }) {
  const [h, setH] = useState(hk);
  const [mode, setMode] = useState<"step" | "quick">(hk.quickActionId ? "quick" : "step");
  const save = async () => {
    // Checked here too, so a clash is noticed right away – also without the PC (the PC checks again when saving).
    if (h.enabled && taken.some((k) => k.toLowerCase() === h.keys.toLowerCase())) { toast(t("Diese Kombination ist schon einem anderen Hotkey zugeordnet."), "error"); return; }
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
        <ComboInput value={h.keys} onChange={(keys) => setH({ ...h, keys })} label={t("Tastenkombination")} />
      </Field>
      {h.keys && <p className="tiny muted">{describeCombo(h.keys, t)}</p>}
      <details>
        <summary className="small">{t("Vorschläge: Medientasten, 60-%-Tastatur und Gaming-Maus")}</summary>
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <div className="chips">{MEDIA_SUGGESTIONS.map((c) => <button key={c} type="button" className={`chip ${h.keys === c ? "on" : ""}`} onClick={() => setH({ ...h, keys: c })}>{describeCombo(c, t)}</button>)}</div>
          <p className="tiny muted">{t("Medientasten: Solange ein Hotkey darauf liegt, steuert die Taste nicht mehr Musik-Apps, sondern nur die Aktion.")}</p>
          <div className="chips">{COMPACT_SUGGESTIONS.map((c) => <button key={c} type="button" className={`chip ${h.keys === c ? "on" : ""}`} onClick={() => setH({ ...h, keys: c })}>{describeCombo(c, t)}</button>)}</div>
          <p className="tiny muted">{t("60-%-Tastaturen (z. B. Royal Kludge): F-Tasten über Fn + Zahl drücken – die App erkennt dann F1 … F12. Besonders gut: in der Tastatur-Software eine Taste auf F13–F24 legen; die nutzt kein Spiel.")}</p>
          <p className="tiny muted">{t("Gaming-Maus (z. B. Attack Shark): Seitentasten hier im Feld drücken oder oben wählen. Solange der Hotkey aktiv ist, löst die Taste nur die Aktion aus (nicht mehr „Zurück“ im Browser). Alternativ in der Maus-Software die Seitentaste auf F13–F24 legen.")}</p>
        </div>
      </details>
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
      <p className="tiny muted">{t("Erlaubt sind nur die Aktionen dieser Liste. Makros, die in Online-Spielen Eingaben automatisieren (z. B. Tasten spammen, automatisch bauen oder Waffen wechseln), gibt es bewusst nicht – sie verstoßen gegen die Regeln der meisten Spiele und können zu Sperren führen.")}</p>
    </Modal>
  );
}
