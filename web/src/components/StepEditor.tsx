import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import type { ActionStep, AudioDevice, LibraryItem, ProfilesFile, SoundsFile, StepType } from "../lib/types";
import { Button } from "./ui";

export function stepLabels(): Record<StepType, string> {
  return {
    launchItem: t("Spiel/Programm starten"),
    activateProfile: t("Profil aktivieren"),
    revertProfile: t("Zum vorherigen Profil"),
    playSound: t("Sound abspielen"),
    stopAllSounds: t("Alle Sounds stoppen"),
    setCollection: t("Soundboard-Sammlung wählen"),
    setAudioOutput: t("Soundboard-Ausgabe setzen"),
    runDiagnostics: t("Diagnose ausführen"),
    notify: t("Hinweis anzeigen"),
  };
}

/** Lists the selectable targets for steps (items, profiles, sounds …). */
export function useStepRefs() {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const prof = useRpc<ProfilesFile>("profiles.list", {}, ["profiles"]);
  const snd = useRpc<{ data: SoundsFile }>("sounds.list", {}, ["sounds"]);
  const audio = useRpc<{ devices: AudioDevice[] }>("audio.state", {}, ["audio"]);
  return {
    items: lib.data?.items ?? [],
    profiles: prof.data?.profiles ?? [],
    sounds: snd.data?.data.sounds ?? [],
    collections: snd.data?.data.collections ?? [],
    outputs: (audio.data?.devices ?? []).filter((d) => d.flow === "render"),
  };
}

export function describeStep(s: ActionStep, refs: ReturnType<typeof useStepRefs>) {
  const name = (() => {
    switch (s.type) {
      case "launchItem": return refs.items.find((i) => i.id === s.ref)?.name;
      case "activateProfile": return refs.profiles.find((p) => p.id === s.ref)?.name;
      case "playSound": return refs.sounds.find((p) => p.id === s.ref)?.name;
      case "setCollection": return refs.collections.find((p) => p.id === s.ref)?.name ?? t("keine");
      case "setAudioOutput": return refs.outputs.find((p) => p.id === s.ref)?.name ?? t("Windows-Standard");
      case "notify": return s.ref ?? "";
      default: return null;
    }
  })();
  return stepLabels()[s.type] + (name ? `: ${name}` : name === undefined ? `: ${t("(fehlt)")}` : "");
}

function RefSelect({ step, refs, onChange }: { step: ActionStep; refs: ReturnType<typeof useStepRefs>; onChange: (ref: string | null) => void }) {
  const sel = (opts: { id: string; name: string }[], allowNone?: string) => (
    <select className="input" value={step.ref ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label={t("Ziel")}>
      {allowNone !== undefined ? <option value="">{allowNone}</option> : <option value="" disabled>{t("Bitte wählen …")}</option>}
      {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
  switch (step.type) {
    case "launchItem": return sel(refs.items.map((i) => ({ id: i.id, name: `${i.kind === "game" ? "🎮" : "🗔"} ${i.name}` })));
    case "activateProfile": return sel(refs.profiles);
    case "playSound": return sel(refs.sounds);
    case "setCollection": return sel(refs.collections, t("Alle Sounds"));
    case "setAudioOutput": return sel(refs.outputs, t("Windows-Standardgerät"));
    case "notify": return <input className="input" value={step.ref ?? ""} maxLength={120} placeholder={t("Text des Hinweises")} onChange={(e) => onChange(e.target.value)} />;
    default: return <span className="small muted">{t("Keine weiteren Angaben nötig")}</span>;
  }
}

export function StepEditor({ steps, onChange, max = 20 }: { steps: ActionStep[]; onChange: (s: ActionStep[]) => void; max?: number }) {
  const refs = useStepRefs();
  const labels = stepLabels();
  const update = (i: number, patch: Partial<ActionStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const n = [...steps]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };
  return (
    <div className="stack">
      {steps.map((s, i) => (
        <div key={i} className="step-row">
          <select className="input" value={s.type} onChange={(e) => update(i, { type: e.target.value as StepType, ref: null })} aria-label={t("Aktion")}>
            {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <RefSelect step={s} refs={refs} onChange={(ref) => update(i, { ref })} />
          <div className="row nowrap">
            <Button size="sm" variant="ghost" icon={<ArrowUp size={15} />} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Nach oben")} />
            <Button size="sm" variant="ghost" icon={<ArrowDown size={15} />} disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={t("Nach unten")} />
            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => onChange(steps.filter((_, k) => k !== i))} aria-label={t("Entfernen")} />
          </div>
        </div>
      ))}
      {steps.length < max && <div><Button size="sm" icon={<Plus size={15} />} onClick={() => onChange([...steps, { type: "launchItem", ref: null }])}>{t("Schritt hinzufügen")}</Button></div>}
    </div>
  );
}

export function stepsValid(steps: ActionStep[]) {
  return steps.length > 0 && steps.every((s) => !["launchItem", "activateProfile", "playSound"].includes(s.type) || !!s.ref);
}
