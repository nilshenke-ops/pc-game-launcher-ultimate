import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import type { ActionStep, AudioDevice, LibraryItem, ProfilesFile, QuickAction, Sound, SoundsFile, StepType } from "../lib/types";
import { pendingRef, usePendingSounds } from "../lib/pending-sounds";
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
    toggleOverlay: t("Overlay ein/aus"),
    obsRecordToggle: t("Aufnahme starten/stoppen"),
    obsReplaySave: t("Replay speichern"),
    obsReplayBufferToggle: t("Replay-Puffer an/aus"),
    wait: t("Warten"),
    ifRunning: t("Nur weiter, wenn … läuft"),
    ifNotRunning: t("Nur weiter, wenn … nicht läuft"),
    mediaKey: t("Medientaste drücken"),
    applyLayout: t("Fenster-Layout anwenden"),
    rgbColor: t("RGB-Farbe setzen (OpenRGB)"),
    rgbProfile: t("RGB-Profil laden (OpenRGB)"),
    closeItem: t("Spiel/Programm schließen"),
    closeOtherGames: t("Alle anderen Spiele schließen"),
    closeAllGames: t("Alle Spiele schließen"),
    runQuickAction: t("Quick Action ausführen"),
    ifTime: t("Nur weiter zur Uhrzeit …"),
    ifWeekday: t("Nur weiter an Wochentagen …"),
    ifGameRunning: t("Nur weiter, wenn ein Spiel läuft"),
    ifNoGameRunning: t("Nur weiter, wenn kein Spiel läuft"),
  };
}

export const mediaKeyLabels = (): Record<string, string> => ({
  playpause: t("Play/Pause"), next: t("Nächster Titel"), prev: t("Vorheriger Titel"), stop: t("Stopp"), mute: t("Ton aus/an"), volup: t("Lauter"), voldown: t("Leiser"),
});

/** Building blocks that control the flow – not available for a single hotkey action. */
export const CONTROL_STEPS: StepType[] = ["wait", "ifRunning", "ifNotRunning", "ifTime", "ifWeekday", "ifGameRunning", "ifNoGameRunning"];

/** Order and groups in the step picker – the list got long. */
const GROUPS: [string, StepType[]][] = [
  ["Spiele & Programme", ["launchItem", "closeItem", "closeOtherGames", "closeAllGames", "runQuickAction", "applyLayout"]],
  ["Bedingungen & Ablauf", ["wait", "ifRunning", "ifNotRunning", "ifGameRunning", "ifNoGameRunning", "ifTime", "ifWeekday"]],
  ["Profile & Hinweise", ["activateProfile", "revertProfile", "notify", "toggleOverlay", "runDiagnostics"]],
  ["Ton", ["playSound", "stopAllSounds", "setCollection", "setAudioOutput", "mediaKey"]],
  ["Aufnahme & Licht", ["obsRecordToggle", "obsReplaySave", "obsReplayBufferToggle", "rgbColor", "rgbProfile"]],
];

export const weekdayLabels = () => [t("Mo"), t("Di"), t("Mi"), t("Do"), t("Fr"), t("Sa"), t("So")];
/** "1,2,3,4,5" → "Mo–Fr"-like short text. */
export const describeDays = (ref: string | null | undefined) => {
  const d = (ref ?? "").split(",").filter(Boolean).map(Number);
  if (d.length === 7) return t("täglich");
  if (d.join(",") === "1,2,3,4,5") return t("Mo–Fr");
  if (d.join(",") === "6,7") return t("Wochenende");
  return d.map((x) => weekdayLabels()[x - 1]).join(", ");
};

/** Lists the selectable targets for steps (items, profiles, sounds …). */
export function useStepRefs() {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const prof = useRpc<ProfilesFile>("profiles.list", {}, ["profiles"]);
  const snd = useRpc<{ data: SoundsFile }>("sounds.list", {}, ["sounds"]);
  const audio = useRpc<{ devices: AudioDevice[] }>("audio.state", {}, ["audio"]);
  const pending = usePendingSounds();
  const layouts = useRpc<{ layouts: { id: string; name: string }[] }>("layouts.list", {}, ["layouts"]);
  const rgb = useRpc<{ profiles: string[] }>("rgb.status", {}, []);
  const quick = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  return {
    quick: quick.data?.actions ?? [],
    layouts: layouts.data?.layouts ?? [],
    rgbProfiles: rgb.data?.profiles ?? [],
    items: lib.data?.items ?? [],
    profiles: prof.data?.profiles ?? [],
    // Sounds that still wait on this device can already be chosen; the PC's id is filled in after the upload.
    sounds: [...(snd.data?.data.sounds ?? []), ...pending.items.filter((p) => !p.error).map((p) => ({ id: pendingRef(p.id), name: `${p.name} (${t("wartet auf PC")})` } as unknown as Sound))],
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
      case "toggleOverlay": return s.ref === "mini" ? t("Mini (Werte in der Ecke)") : t("Groß (wie Game Bar)");
      case "wait": return t("{n} s", { n: s.ref ?? "?" });
      case "ifRunning": case "ifNotRunning": return refs.items.find((i) => i.id === s.ref)?.name;
      case "mediaKey": return mediaKeyLabels()[s.ref ?? ""];
      case "applyLayout": return refs.layouts.find((l) => l.id === s.ref)?.name;
      case "rgbColor": case "rgbProfile": return s.ref ?? undefined;
      case "closeItem": return refs.items.find((i) => i.id === s.ref)?.name;
      case "runQuickAction": return refs.quick.find((q) => q.id === s.ref)?.name;
      case "ifTime": return s.ref ? s.ref.replace("-", " – ") : undefined;
      case "ifWeekday": return s.ref ? describeDays(s.ref) : undefined;
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
    case "closeItem": return sel(refs.items.map((i) => ({ id: i.id, name: `${i.kind === "game" ? "🎮" : "🗔"} ${i.name}` })));
    case "runQuickAction": return sel(refs.quick.map((q) => ({ id: q.id, name: q.name })));
    case "ifTime": {
      const [from, to] = /^\d\d:\d\d-\d\d:\d\d$/.test(step.ref ?? "") ? step.ref!.split("-") : ["18:00", "23:00"];
      return (
        <label className="row nowrap small" style={{ gap: 8 }}>
          <input className="input" type="time" value={from} aria-label={t("Von")} onChange={(e) => e.target.value && onChange(`${e.target.value}-${to}`)} />
          {t("bis")}
          <input className="input" type="time" value={to} aria-label={t("Bis")} onChange={(e) => e.target.value && onChange(`${from}-${e.target.value}`)} />
        </label>
      );
    }
    case "ifWeekday": return <DayPicker value={step.ref ?? ""} onChange={onChange} />;
    case "closeOtherGames": return <span className="small muted">{t("Das Spiel, das die Regel ausgelöst hat, bleibt offen. Sanft wie das X – das Spiel darf noch nach Speichern fragen.")}</span>;
    case "closeAllGames": return <span className="small muted">{t("Sanft wie das X – nie erzwungen.")}</span>;
    case "launchItem": case "ifRunning": case "ifNotRunning": return sel(refs.items.map((i) => ({ id: i.id, name: `${i.kind === "game" ? "🎮" : "🗔"} ${i.name}` })));
    case "mediaKey": return sel(Object.entries(mediaKeyLabels()).map(([id, name]) => ({ id, name })));
    case "wait": return (
      <label className="row nowrap small" style={{ gap: 8 }}>
        <input className="input" type="number" min={1} max={300} value={step.ref ?? ""} placeholder="5" style={{ maxWidth: 110 }} aria-label={t("Sekunden")}
          onChange={(e) => onChange(e.target.value ? String(Math.max(1, Math.min(300, Math.round(+e.target.value)))) : null)} />
        {t("Sekunden (zusammen höchstens 5 Minuten)")}
      </label>
    );
    case "applyLayout": return sel(refs.layouts);
    case "rgbColor": return (
      <label className="row nowrap small" style={{ gap: 8 }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(step.ref ?? "") ? step.ref! : "#8b5cf6"} onChange={(e) => onChange(e.target.value)} aria-label={t("Farbe")} style={{ width: 48, height: 36, border: 0, background: "none" }} />
        <span className="mono">{step.ref ?? t("Farbe wählen")}</span>
      </label>
    );
    case "rgbProfile": return refs.rgbProfiles.length ? sel(refs.rgbProfiles.map((p) => ({ id: p, name: p })))
      : <input className="input" value={step.ref ?? ""} maxLength={60} placeholder={t("Name des OpenRGB-Profils")} onChange={(e) => onChange(e.target.value || null)} />;
    case "activateProfile": return sel(refs.profiles);
    case "playSound": return sel(refs.sounds);
    case "setCollection": return sel(refs.collections, t("Alle Sounds"));
    case "setAudioOutput": return sel(refs.outputs, t("Windows-Standardgerät"));
    case "notify": return <input className="input" value={step.ref ?? ""} maxLength={120} placeholder={t("Text des Hinweises")} onChange={(e) => onChange(e.target.value)} />;
    case "toggleOverlay": return (
      <select className="input" value={step.ref === "mini" ? "mini" : "full"} onChange={(e) => onChange(e.target.value)} aria-label={t("Overlay-Art")}>
        <option value="full">{t("Groß (wie Game Bar)")}</option>
        <option value="mini">{t("Mini (Werte in der Ecke)")}</option>
      </select>
    );
    default: return <span className="small muted">{t("Keine weiteren Angaben nötig")}</span>;
  }
}

/** Weekday chips; "1,2,3" = Monday to Wednesday. */
export function DayPicker({ value, onChange }: { value: string; onChange: (v: string | null) => void }) {
  const on = new Set(value.split(",").filter(Boolean).map(Number));
  const toggle = (d: number) => { const n = new Set(on); if (n.has(d)) n.delete(d); else n.add(d); onChange(n.size ? [...n].sort().join(",") : null); };
  return (
    <div className="chips" role="group" aria-label={t("Wochentage")}>
      {weekdayLabels().map((l, i) => <button key={l} type="button" className={`chip ${on.has(i + 1) ? "on" : ""}`} aria-pressed={on.has(i + 1)} onClick={() => toggle(i + 1)}>{l}</button>)}
    </div>
  );
}

export function StepEditor({ steps, onChange, max = 20 }: { steps: ActionStep[]; onChange: (s: ActionStep[]) => void; max?: number }) {
  const refs = useStepRefs();
  // A single hotkey action has no flow: waiting or conditions would do nothing there.
  const labels = Object.fromEntries(Object.entries(stepLabels()).filter(([k]) => max > 1 || !CONTROL_STEPS.includes(k as StepType)));
  const update = (i: number, patch: Partial<ActionStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const n = [...steps]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };
  return (
    <div className="stack">
      {steps.map((s, i) => (
        <div key={i} className="step-row">
          <select className="input" value={s.type} onChange={(e) => update(i, { type: e.target.value as StepType, ref: e.target.value === "ifTime" ? "18:00-23:00" : e.target.value === "ifWeekday" ? "1,2,3,4,5" : null })} aria-label={t("Aktion")}>
            {GROUPS.map(([g, types]) => {
              const shown = types.filter((k) => labels[k]);
              return shown.length ? <optgroup key={g} label={t(g)}>{shown.map((k) => <option key={k} value={k}>{labels[k]}</option>)}</optgroup> : null;
            })}
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
  return steps.length > 0 && steps.every((s) => !["launchItem", "activateProfile", "playSound", "wait", "ifRunning", "ifNotRunning", "mediaKey", "applyLayout", "rgbColor", "rgbProfile", "closeItem", "runQuickAction", "ifTime", "ifWeekday"].includes(s.type) || !!s.ref);
}
