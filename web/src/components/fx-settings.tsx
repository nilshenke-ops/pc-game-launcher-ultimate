// Settings → Design: start animation (loading-screen designer), moving background and page transitions.
// All stored in the design (prefs.fx) – works without the PC and moves with the design code / account.
import { Clapperboard, Play, Sparkles, Wand2 } from "lucide-react";
import { t } from "../lib/i18n";
import { BG_ANIMS, DEFAULT_FX, LAUNCH_STYLES, setPrefs, TRANSITIONS, usePrefs, type Fx } from "../lib/prefs";
import { Banner, Button, Card, Field, Segmented, Switch } from "./ui";
import { cinemaMs, previewLaunch, reducedMotion } from "./launch-cinema";

const setFx = <K extends keyof Fx>(k: K, patch: Partial<Fx[K]>) => setPrefs((p) => ({ ...p, fx: { ...p.fx, [k]: { ...p.fx[k], ...patch } } }));

export function FxSettings() {
  const { fx, theme } = usePrefs();
  const l = fx.launch, b = fx.bg, tr = fx.transition;
  const reduced = reducedMotion();
  return (
    <>
      <Card title={t("Spielstart-Animation")} icon={<Clapperboard size={18} />}>
        <div className="stack">
          <Switch checked={l.enabled} onChange={(enabled) => setFx("launch", { enabled })} label={t("Ladebildschirm beim Spielstart zeigen")}
            hint={t("Der Startbefehl geht sofort an den PC – die Animation wartet nie dazwischen. Antippen oder Esc überspringt sie. „Läuft“ steht erst da, wenn der PC das Spiel meldet.")} />
          <div className="lc-picker" role="radiogroup" aria-label={t("Vorlage")}>
            {LAUNCH_STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={l.style === s.id} className={`lc-mini lc-${s.id} ${l.style === s.id ? "on" : ""}`} onClick={() => setFx("launch", { style: s.id })}>
                <span className="lc-fx" aria-hidden><i className="lc-a" /><i className="lc-b" /><i className="lc-c" /></span>
                <span className="lc-mini-name">{t(s.name)}</span>
              </button>
            ))}
          </div>
          <div className="grid-2">
            <Field label={t("Dauer: {v} s", { v: l.seconds })}><input type="range" min={1} max={8} step={0.5} value={l.seconds} disabled={l.fast} onChange={(e) => setFx("launch", { seconds: +e.target.value })} /></Field>
            <Field label={t("Eigener Text (optional)")}><input className="input" value={l.tagline} maxLength={60} placeholder={t("z. B. Bereit machen …")} onChange={(e) => setFx("launch", { tagline: e.target.value })} /></Field>
            <Switch checked={l.fast} onChange={(fast) => setFx("launch", { fast })} label={t("Schnellmodus (1,2 s)")} />
            <Switch checked={l.cover} onChange={(cover) => setFx("launch", { cover })} label={t("Bild des Spiels zeigen")} />
          </div>
          {reduced && <Banner kind="info">{t("Animationen sind reduziert – der Ladebildschirm erscheint dann kurz als Standbild.")}</Banner>}
          <div className="row">
            <Button icon={<Play size={15} />} onClick={() => previewLaunch(l)}>{t("Vorschau")}</Button>
            <span className="tiny muted">{t("Zeigt den Ladebildschirm {s} s lang – es wird nichts gestartet.", { s: (cinemaMs(l, reduced) / 1000).toLocaleString() })}</span>
          </div>
        </div>
      </Card>
      <Card title={t("Bewegter Hintergrund")} icon={<Sparkles size={18} />}>
        <div className="stack">
          <Segmented value={b.kind} onChange={(kind) => setFx("bg", { kind })} label={t("Bewegter Hintergrund")} options={BG_ANIMS.map((a) => ({ value: a.id, label: t(a.name) }))} />
          {b.kind !== "none" && (
            <div className="grid-3">
              <Field label={t("Tempo: {v} %", { v: Math.round(b.speed * 100) })}><input type="range" min={0.25} max={2} step={0.05} value={b.speed} onChange={(e) => setFx("bg", { speed: +e.target.value })} /></Field>
              <Field label={t("Menge: {v} %", { v: Math.round(b.amount * 100) })}><input type="range" min={0.2} max={1} step={0.05} value={b.amount} onChange={(e) => setFx("bg", { amount: +e.target.value })} /></Field>
              <Field label={t("Deckkraft: {v} %", { v: Math.round(b.opacity * 100) })}><input type="range" min={0.1} max={1} step={0.05} value={b.opacity} onChange={(e) => setFx("bg", { opacity: +e.target.value })} /></Field>
            </div>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>{t("Läuft mit höchstens 30 Bildern pro Sekunde und hält an, sobald die Seite nicht sichtbar ist. Bei „Animationen reduzieren“ oder leichter Darstellung bleibt es ein Standbild.")}</p>
          {(theme.lite || reduced) && b.kind !== "none" && <Banner kind="info">{t("Gerade als Standbild (Animationen reduziert oder leichte Darstellung).")}</Banner>}
        </div>
      </Card>
      <Card title={t("Seitenübergänge")} icon={<Wand2 size={18} />}>
        <div className="stack">
          <Segmented value={tr.kind} onChange={(kind) => setFx("transition", { kind })} label={t("Seitenübergänge")} options={TRANSITIONS.map((x) => ({ value: x.id, label: t(x.name) }))} />
          {tr.kind !== "none" && <Field label={t("Dauer: {v} ms", { v: tr.ms })}><input type="range" min={100} max={700} step={20} value={tr.ms} onChange={(e) => setFx("transition", { ms: +e.target.value })} /></Field>}
          <Button size="sm" variant="ghost" onClick={() => setPrefs((p) => ({ ...p, fx: structuredClone(DEFAULT_FX) }))}>{t("Effekte zurücksetzen")}</Button>
        </div>
      </Card>
    </>
  );
}
