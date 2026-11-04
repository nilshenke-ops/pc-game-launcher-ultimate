import { beforeEach, describe, expect, it } from "vitest";
import { advanceTimer, countdownView, playTime, resetTimers, startCountdown, startPomodoro, stopCountdown, timerLive, timerState, watchMs, watchReset, watchText, watchToggle } from "./island-timer";

beforeEach(() => resetTimers());
const T0 = 1_000_000;

describe("Insel-Timer", () => {
  it("Countdown läuft, zeigt Rest und Fortschritt und endet einmal", () => {
    startCountdown(5, T0);
    expect(timerLive(timerState())).toBe(true);
    const v = countdownView(timerState(), T0 + 150_000)!;
    expect(v.left).toBe(150_000);
    expect(v.progress).toBeCloseTo(0.5);
    expect(advanceTimer(T0 + 299_000)).toBeNull();
    expect(advanceTimer(T0 + 300_000)).toEqual({ kind: "done" });
    expect(timerLive(timerState())).toBe(false);
    expect(advanceTimer(T0 + 400_000)).toBeNull(); // nothing twice
  });
  it("Minuten werden begrenzt (1 bis 180)", () => {
    startCountdown(0, T0); expect(timerState().total).toBe(60_000);
    startCountdown(9999, T0); expect(timerState().total).toBe(180 * 60_000);
  });
  it("Pomodoro wechselt Phasen bis „Stopp“, nach vier Fokus-Runden lange Pause", () => {
    startPomodoro(T0);
    let now = T0, last = null as ReturnType<typeof advanceTimer>;
    const phases: string[] = [];
    for (let i = 0; i < 8; i++) {
      now = timerState().end!;
      last = advanceTimer(now);
      phases.push(last && last.kind === "phase" ? last.pomo.phase : "?");
    }
    expect(phases).toEqual(["break", "focus", "break", "focus", "break", "focus", "long", "focus"]);
    stopCountdown();
    expect(timerLive(timerState())).toBe(false);
    expect(timerState().pomo).toBeNull();
  });
  it("Stoppuhr: starten, anhalten, weiterlaufen, zurücksetzen", () => {
    watchToggle(T0);
    expect(watchMs(timerState(), T0 + 5000)).toBe(5000);
    watchToggle(T0 + 5000);
    expect(watchMs(timerState(), T0 + 60_000)).toBe(5000); // stopped
    watchToggle(T0 + 60_000);
    expect(watchMs(timerState(), T0 + 63_000)).toBe(8000);
    watchReset();
    expect(watchMs(timerState(), T0 + 99_000)).toBe(0);
  });
  it("Stoppuhr-Text", () => {
    expect(watchText(0)).toBe("0:00");
    expect(watchText(65_000)).toBe("1:05");
    expect(watchText(3_725_000)).toBe("1:02:05");
  });
  it("Spielzeit: Minuten, dann Stunden:Minuten, keine Zukunft", () => {
    expect(playTime(T0 - 42 * 60_000, T0)).toBe("42 min");
    expect(playTime(T0 - 83 * 60_000, T0)).toBe("1:23 h");
    expect(playTime(new Date(T0 - 5 * 60_000).toISOString(), T0)).toBe("5 min");
    expect(playTime(T0 + 3_600_000, T0)).toBeNull();
    expect(playTime("kaputt", T0)).toBeNull();
  });
});
