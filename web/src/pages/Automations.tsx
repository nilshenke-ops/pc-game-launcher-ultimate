import { useState } from "react";
import { Bot, Copy, FlaskConical, Pencil, Plus, Sparkles } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { dateTime } from "../lib/format";
import type { AutomationRule, TriggerType } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";
import { DayPicker, describeDays, describeStep, StepEditor, stepsValid, useStepRefs } from "../components/StepEditor";

export function triggerLabels(): Record<TriggerType, string> {
  return {
    gameStarted: t("Wenn ein Spiel startet"),
    gameStopped: t("Wenn ein Spiel beendet wird"),
    programStarted: t("Wenn ein Programm startet"),
    programStopped: t("Wenn ein Programm beendet wird"),
    schedule: t("Zu einer Uhrzeit"),
    companionStarted: t("Wenn der PC startet (Begleiter startet mit Windows)"),
    audioDeviceMissing: t("Wenn ein Audiogerät fehlt"),
    relayDisconnected: t("Wenn die Relay-Verbindung abbricht"),
    updateFailed: t("Wenn ein Update fehlschlägt"),
    profileActivated: t("Wenn ein Profil aktiviert wird"),
  };
}

const blank: AutomationRule = { id: "", name: "", enabled: true, trigger: "gameStarted", triggerRef: null, actions: [{ type: "activateProfile", ref: null }], runCount: 0 };

/** Ready-made starting points – everything stays editable before saving. */
function templates(): { label: string; rule: Partial<AutomationRule> }[] {
  return [
    { label: t("Spiel startet → Minecraft schließen"), rule: { name: t("Minecraft beim Spielstart schließen"), trigger: "gameStarted", actions: [{ type: "ifRunning", ref: null }, { type: "closeItem", ref: null }] } },
    { label: t("Spiel startet → alle anderen Spiele schließen"), rule: { name: t("Nur ein Spiel gleichzeitig"), trigger: "gameStarted", actions: [{ type: "closeOtherGames", ref: null }] } },
    { label: t("Spiel startet → Discord öffnen"), rule: { name: t("Discord zum Zocken"), trigger: "gameStarted", actions: [{ type: "ifNotRunning", ref: null }, { type: "launchItem", ref: null }] } },
    { label: t("Programm öffnet → anderes Programm öffnen"), rule: { name: t("Zusammen öffnen"), trigger: "programStarted", actions: [{ type: "launchItem", ref: null }] } },
    { label: t("PC startet → Apps öffnen"), rule: { name: t("Apps beim PC-Start"), trigger: "companionStarted", actions: [{ type: "launchItem", ref: null }, { type: "wait", ref: "5" }, { type: "launchItem", ref: null }] } },
    { label: t("Spiel beendet → Programm schließen"), rule: { name: t("Nach dem Spiel aufräumen"), trigger: "gameStopped", actions: [{ type: "closeItem", ref: null }] } },
    { label: t("Abends um 22 Uhr → Hinweis Pause"), rule: { name: t("Bildschirmpause"), trigger: "schedule", triggerRef: "22:00|1,2,3,4,5,6,7", actions: [{ type: "ifGameRunning", ref: null }, { type: "notify", ref: t("Es ist 22 Uhr – Zeit für eine Pause?") }] } },
    { label: t("Wochenende → Profil beim Spielstart"), rule: { name: t("Wochenend-Profil"), trigger: "gameStarted", actions: [{ type: "ifWeekday", ref: "6,7" }, { type: "activateProfile", ref: null }] } },
  ];
}

export default function Automations() {
  const q = useRpc<{ rules: AutomationRule[] }>("automations.list", {}, ["automations"]);
  const refs = useStepRefs();
  const canManage = useCan("manage");
  const [edit, setEdit] = useState<AutomationRule | null>(null);
  const labels = triggerLabels();
  const refName = (r: AutomationRule) => r.trigger.startsWith("game") || r.trigger.startsWith("program") ? refs.items.find((i) => i.id === r.triggerRef)?.name ?? t("beliebig")
    : r.trigger === "profileActivated" ? refs.profiles.find((p) => p.id === r.triggerRef)?.name ?? t("beliebig")
    : r.trigger === "schedule" && r.triggerRef ? `${r.triggerRef.split("|")[0]} ${r.triggerRef.includes("|") ? describeDays(r.triggerRef.split("|")[1]) : t("täglich")}` : null;
  const [picking, setPicking] = useState(false);

  const toggle = (r: AutomationRule) => client.call("automations.save", { ...r, enabled: !r.enabled }).catch((e) => toast(e.message, "error"));
  const test = async (r: AutomationRule) => {
    if (!(await confirmDialog(t("Regel jetzt testen?"), t("Die Aktionen von „{n}“ werden sofort tatsächlich ausgeführt.", { n: r.name })))) return;
    try { const res = await client.call<{ results: string[] }>("automations.test", { id: r.id }); toast(res.results.join(" · "), "info"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead eyebrow={t("Steuerung")} title={t("Automatisierungen")} text={t("Wenn-Dann-Regeln, die der Companion selbstständig ausführt. Schutz vor Endlosschleifen ist eingebaut.")}
        actions={canManage && <>
          <Button icon={<Sparkles size={17} />} onClick={() => setPicking(true)}>{t("Vorlagen")}</Button>
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit(structuredClone(blank))}>{t("Neue Regel")}</Button>
        </>} />
      {picking && (
        <Modal title={t("Vorlage wählen")} onClose={() => setPicking(false)}>
          <p className="small muted">{t("Alles bleibt danach frei einstellbar: Auslöser, welches Spiel/Programm, Bedingungen (Uhrzeit, Wochentage, läuft/läuft nicht) und beliebig viele Schritte.")}</p>
          <div className="stack-sm">
            {templates().map((tp) => <Button key={tp.label} onClick={() => { setPicking(false); setEdit({ ...structuredClone(blank), ...structuredClone(tp.rule) } as AutomationRule); }}>{tp.label}</Button>)}
          </div>
        </Modal>
      )}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {(q.data?.rules.length ?? 0) === 0 ? <Card><Empty icon={<Bot size={28} />} title={t("Keine Regeln")} /></Card> : (
          <div className="stack">
            {q.data!.rules.map((r) => (
              <Card key={r.id}>
                <div className="row nowrap" style={{ alignItems: "flex-start" }}>
                  <div className="grow stack-sm">
                    <div className="row"><h3>{r.name}</h3>{!r.enabled && <span className="badge">{t("Aus")}</span>}</div>
                    <div className="small"><span className="badge accent">{labels[r.trigger]}{refName(r) ? `: ${refName(r)}` : ""}</span></div>
                    <div className="small muted">→ {r.actions.map((a) => describeStep(a, refs)).join(" → ")}</div>
                    <div className="tiny muted">{r.lastRunAt ? t("Zuletzt ausgeführt {d} · {n}× insgesamt", { d: dateTime(r.lastRunAt), n: r.runCount }) : t("Noch nie ausgeführt")}{r.lastResult ? ` · ${r.lastResult}` : ""}</div>
                    {(r.runs?.length ?? 0) > 0 && (
                      <details className="tiny">
                        <summary className="muted">{t("Verlauf der letzten {n} Ausführungen", { n: r.runs!.length })}</summary>
                        <ul className="run-log">
                          {r.runs!.map((x, i) => (
                            <li key={i} className={x.ok ? "" : "fail"}>
                              <b>{x.ok ? "✓" : "✕"} {dateTime(x.at)}</b> <span className="muted">· {x.by}</span>
                              <div className="muted">{x.results.join(" → ")}</div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {canManage && <Switch checked={r.enabled} onChange={() => toggle(r)} label={<span className="sr-only">{t("Aktiv")}</span>} />}
                </div>
                {canManage && (
                  <div className="card-foot">
                    <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(structuredClone(r))}>{t("Bearbeiten")}</Button>
                    <Button size="sm" icon={<FlaskConical size={14} />} onClick={() => test(r)}>{t("Testen")}</Button>
                    <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => client.call("automations.copy", { id: r.id })}>{t("Kopieren")}</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Loadable>
      {edit && <RuleEditor rule={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RuleEditor({ rule, onClose }: { rule: AutomationRule; onClose: () => void }) {
  const [r, setR] = useState(rule);
  const refs = useStepRefs();
  const set = (p: Partial<AutomationRule>) => setR((x) => ({ ...x, ...p }));
  const save = async () => {
    try { await client.call("automations.save", r); toast(t("Gespeichert"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Regel löschen?"), r.name, { danger: true, ok: t("Löschen") }))) return;
    await client.call("automations.remove", { id: r.id });
    onClose();
  };
  const refOptions = r.trigger === "gameStarted" || r.trigger === "gameStopped" ? refs.items.filter((i) => i.kind === "game")
    : r.trigger === "programStarted" || r.trigger === "programStopped" ? refs.items.filter((i) => i.kind === "program")
    : r.trigger === "profileActivated" ? refs.profiles : null;
  const [time, days] = r.trigger === "schedule" ? (r.triggerRef ?? "18:00|1,2,3,4,5,6,7").split("|") : ["", ""];
  const setSchedule = (tm: string, d: string | null) => set({ triggerRef: d && d.split(",").length < 7 ? `${tm}|${d}` : tm });
  const valid = r.trigger !== "schedule" || /^\d\d:\d\d/.test(r.triggerRef ?? "");
  return (
    <Modal title={r.id ? t("Regel bearbeiten") : t("Neue Regel")} onClose={onClose} wide footer={<>
      {r.id && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!r.name.trim() || !stepsValid(r.actions) || !valid} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Name")}><input className="input" value={r.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder={t("z. B. Competitive bei Valorant")} /></Field>
      <div className="grid-2">
        <Field label={t("Auslöser")}>
          <select className="input" value={r.trigger} onChange={(e) => set({ trigger: e.target.value as TriggerType, triggerRef: e.target.value === "schedule" ? "18:00" : null })}>
            {Object.entries(triggerLabels()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {refOptions && (
          <Field label={t("Nur für")}>
            <select className="input" value={r.triggerRef ?? ""} onChange={(e) => set({ triggerRef: e.target.value || null })}>
              <option value="">{t("beliebig")}</option>
              {refOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      {r.trigger === "schedule" && (
        <div className="grid-2">
          <Field label={t("Uhrzeit")}><input className="input" type="time" value={time} onChange={(e) => e.target.value && setSchedule(e.target.value, days ?? "1,2,3,4,5,6,7")} /></Field>
          <Field label={t("An diesen Tagen")}><DayPicker value={days ?? "1,2,3,4,5,6,7"} onChange={(d) => setSchedule(time, d ?? "1,2,3,4,5,6,7")} /></Field>
        </div>
      )}
      {r.trigger === "companionStarted" && <p className="small muted">{t("Der Begleiter startet mit Windows, wenn „Mit Windows starten“ an ist – so laufen diese Schritte bei jedem PC-Start.")}</p>}
      <Field label={t("Dann …")}><StepEditor steps={r.actions} onChange={(actions) => set({ actions })} max={10} /></Field>
      <Switch checked={r.enabled} onChange={(enabled) => set({ enabled })} label={t("Regel aktiv")} />
      <Banner kind="info">{t("Aktionen einer Regel lösen keine weiteren Regeln aus. Jede Regel läuft höchstens einmal pro 3 Sekunden und 20-mal pro Minute.")}</Banner>
    </Modal>
  );
}
