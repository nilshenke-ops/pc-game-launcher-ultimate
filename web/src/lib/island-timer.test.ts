import { beforeEach, describe, expect, it } from "vitest";
import { advanceTimer, countdownView, pauseCountdown, playTime, resetTimers, resumeCountdown, startCountdown, startPomodoro, stopCountdown, timerLive, timerState, watchMs, watchReset, watchText, watchToggle } from "./island-timer";

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
  it("Pause hält die Restzeit fest, Weiter macht genau dort weiter, Pomodoro-Phasen auch", () => {
    startCountdown(10, 0);
    pauseCountdown(4 * 60_000);
    expect(timerState().end).toBeNull();
    expect(timerLive(timerState())).toBe(true);                       // still shown in the closed island
    expect(countdownView(timerState(), 99 * 60_000)).toMatchObject({ left: 6 * 60_000, paused: true });
    expect(advanceTimer(99 * 60_000)).toBeNull();                      // a paused countdown never ends
    resumeCountdown(50 * 60_000);
    expect(countdownView(timerState(), 52 * 60_000)).toMatchObject({ left: 4 * 60_000, paused: false });
    expect(advanceTimer(56 * 60_000)).toEqual({ kind: "done" });
    startPomodoro(0); pauseCountdown(10 * 60_000); resumeCountdown(20 * 60_000);
    expect(timerState().pomo?.phase).toBe("focus");
    stopCountdown();
    expect(timerLive(timerState())).toBe(false);
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

describe("Zeit anpassen (addCountdown)", () => {
  it("verlängert den laufenden Timer und bleibt zwischen 1 min und 3 h", async () => {
    const tm = await import("./island-timer");
    tm.resetTimers(); tm.startCountdown(5, 0);
    tm.addCountdown(5, 60_000);
    expect(tm.timerState().end).toBe(60_000 + 9 * 60_000);
    tm.addCountdown(-60, 60_000);
    expect(tm.timerState().end).toBe(60_000 + 60_000);
    tm.addCountdown(999, 60_000);
    expect(tm.timerState().end).toBe(60_000 + 180 * 60_000);
  });
  it("wirkt auch im pausierten Zustand und tut ohne Timer nichts", async () => {
    const tm = await import("./island-timer");
    tm.resetTimers(); tm.addCountdown(5, 0); expect(tm.timerLive(tm.timerState())).toBe(false);
    tm.startCountdown(10, 0); tm.pauseCountdown(120_000); tm.addCountdown(1, 500_000);
    expect(tm.timerState().pausedLeft).toBe(9 * 60_000);
    tm.resetTimers();
  });
});
