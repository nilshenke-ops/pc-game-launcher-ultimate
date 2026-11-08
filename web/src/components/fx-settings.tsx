// Settings → Design: start animation (loading-screen designer), moving background and page transitions.
// All stored in the design (prefs.fx) – works without the PC and moves with the design code / account.
import { useEffect, useState } from "react";
import { Clapperboard, Play, Sparkles, Wand2 } from "lucide-react";
import { t } from "../lib/i18n";
import { BG_ANIMS, DEFAULT_FX, LAUNCH_STYLES, setPrefs, TRANSITIONS, usePrefs, type Fx, type TransitionKind } from "../lib/prefs";
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
          {/* The preview sits right next to the duration and shows the length it really takes – tap it to watch the screen. */}
          <div className="fx-row">
            <div className="fx-row-main">
              <Field label={t("Dauer: {v} s", { v: l.seconds })}><input type="range" min={1} max={8} step={0.5} value={l.seconds} disabled={l.fast} onChange={(e) => setFx("launch", { seconds: +e.target.value })} /></Field>
              <p className="tiny muted" style={{ margin: 0 }}>{t("Zeigt den Ladebildschirm {s} s lang – es wird nichts gestartet.", { s: (cinemaMs(l, reduced) / 1000).toLocaleString() })}</p>
            </div>
            <button type="button" className={`lc-mini lc-${l.style} fx-mini`} onClick={() => previewLaunch(l)} aria-label={t("Vorschau")} title={t("Vorschau")}>
              <span className="lc-fx" aria-hidden><i className="lc-a" /><i className="lc-b" /><i className="lc-c" /></span>
              <span className="fx-tag"><Play size={12} />{(cinemaMs(l, reduced) / 1000).toLocaleString()} s</span>
            </button>
          </div>
          <div className="grid-2">
            <Field label={t("Eigener Text (optional)")}><input className="input" value={l.tagline} maxLength={60} placeholder={t("z. B. Bereit machen …")} onChange={(e) => setFx("launch", { tagline: e.target.value })} /></Field>
            <Switch checked={l.fast} onChange={(fast) => setFx("launch", { fast })} label={t("Schnellmodus (1,2 s)")} />
            <Switch checked={l.cover} onChange={(cover) => setFx("launch", { cover })} label={t("Bild des Spiels zeigen")} />
          </div>
          {reduced && <Banner kind="info">{t("Animationen sind reduziert – der Ladebildschirm erscheint dann kurz als Standbild.")}</Banner>}
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
          <div className="fx-row">
            <div className="fx-row-main">
              {tr.kind !== "none" && <Field label={t("Dauer: {v} ms", { v: tr.ms })}><input type="range" min={100} max={700} step={20} value={tr.ms} onChange={(e) => setFx("transition", { ms: +e.target.value })} /></Field>}
            </div>
            <TxPreview kind={tr.kind} ms={tr.ms} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPrefs((p) => ({ ...p, fx: structuredClone(DEFAULT_FX) }))}>{t("Effekte zurücksetzen")}</Button>
        </div>
      </Card>
    </>
  );
}

/** A small page that plays the chosen transition with the chosen length – tapping it plays the same again. */
function TxPreview({ kind, ms }: { kind: TransitionKind; ms: number }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN((i) => i + 1); }, [kind, ms]); // every new choice plays once by itself
  return (
    <button type="button" className="fx-prev" onClick={() => setN((i) => i + 1)} aria-label={t("Vorschau")} title={t("Vorschau")}>
      <span className={`fx-prev-page${kind === "none" ? "" : ` tx-${kind}`}`} key={n} style={{ ["--tx-ms" as string]: `${ms}ms` }}>
        <span className="fx-prev-head" /><span className="fx-prev-card" /><span className="fx-prev-line" />
      </span>
      <span className="fx-tag">{ms} ms</span>
    </button>
  );
}
