// Small parts of the JARVIS island that both the closed island and the open panel use: the eyes, the equalizer, the timer ring.
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { t } from "../lib/i18n";
import { POMO_LABEL } from "../lib/pomodoro";
import { countdownView, startCountdown, startPomodoro, stopCountdown, timerLive, useTimer } from "../lib/island-timer";
import { clock, MOOD_LABEL, type Mood } from "../lib/island";

/** JARVIS' eyes – shape and colour per mood (CSS, see .isl-eyes). Tapping too often makes him dizzy. */
export function IslandEyes({ mood, big, onPoke }: { mood: Mood; big?: boolean; onPoke?: () => void }) {
  return (
    <span className={`isl-eyes m-${mood}${big ? " big" : ""}`} role="img" aria-label={t("JARVIS: {m}", { m: t(MOOD_LABEL[mood]) })}
      onClick={onPoke ? (e) => { e.stopPropagation(); onPoke(); } : undefined}>
      <i /><i />
    </span>
  );
}

/** The robot of the panel: white head, black display with JARVIS' eyes, antenna – the mood moves the whole head. */
export function RobotHead({ mood }: { mood: Mood }) {
  return (
    <span className={`isl-robot m-${mood}`} role="img" aria-label={t("JARVIS: {m}", { m: t(MOOD_LABEL[mood]) })}>
      <span className="isl-antenna"><i /></span>
      <span className="isl-head">
        <span className="isl-ear l" /><span className="isl-ear r" />
        <span className="isl-display"><IslandEyes mood={mood} big /></span>
      </span>
      {mood === "sleeping" && <span className="isl-zzz" aria-hidden>z z z</span>}
    </span>
  );
}

/** Equalizer next to the eyes while music plays – the bars follow the level the PC reports. */
export function Bars({ level }: { level: number }) {
  const h = [0.5, 1, 0.7, 0.9, 0.6].map((k, i) => Math.max(0.18, Math.min(1, level * 1.6 * k + (i % 2 ? 0.05 : 0))));
  return <span className="isl-bars" aria-hidden>{h.map((v, i) => <i key={i} style={{ transform: `scaleY(${v})` }} />)}</span>;
}

/** The focus timer card: the clock itself lives in island-timer, so it keeps running (and shows in the closed island) when the panel is shut. */
export function FocusTimer() {
  const tm = useTimer();
  const [now, setNow] = useState(Date.now());
  const view = countdownView(tm, now);
  useEffect(() => { if (!timerLive(tm)) return; const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id); }, [tm.end]);
  return (
    <div className="isl-card">
      <span className="isl-ic"><Timer size={18} /></span>
      <div className="isl-main">
        <b className="isl-big">{view ? clock(view.left) : t("Fokus")}{tm.pomo && <span className="tiny muted"> {t(POMO_LABEL[tm.pomo.phase])} · {tm.pomo.done} ✓</span>}</b>
        <div className="row isl-mini">
          {view ? <button type="button" className="chip" onClick={stopCountdown}>{t("Stopp")}</button>
            : <>
              {[5, 15, 25].map((m) => <button key={m} type="button" className="chip" onClick={() => { setNow(Date.now()); startCountdown(m); }}>{m} min</button>)}
              <button type="button" className="chip" title={t("25 min Fokus, 5 min Pause, nach vier Runden 15 min")} onClick={() => { setNow(Date.now()); startPomodoro(); }}>{t("Pomodoro")}</button>
            </>}
        </div>
      </div>
    </div>
  );
}

/** Round progress of the running timer, shown in the closed island. */
export function TimerRing({ progress }: { progress: number }) {
  const r = 8, c = 2 * Math.PI * r;
  return (
    <svg className="isl-ring" viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <circle cx="10" cy="10" r={r} className="bg" />
      <circle cx="10" cy="10" r={r} className="fg" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - progress) }} />
    </svg>
  );
}


