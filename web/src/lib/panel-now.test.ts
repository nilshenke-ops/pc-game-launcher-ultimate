import { afterEach, describe, expect, it, vi } from "vitest";
import { startNowTicker } from "./panel-now";

afterEach(() => vi.useRealTimers());

describe("Uhr des offenen Insel-Fensters", () => {
  it("tickt jede Sekunde, wenn Sekunden gebraucht werden", () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 24, 18, 48, 10, 400));
    const seen: number[] = []; const stop = startNowTicker((n) => seen.push(n), true);
    vi.advanceTimersByTime(3000);
    expect(seen.length).toBe(4);                        // sofort + 3 Sekunden
    stop(); vi.advanceTimersByTime(5000);
    expect(seen.length).toBe(4);                        // nach dem Stoppen nichts mehr
  });
  it("meldet sich sonst nur beim Minutenwechsel", () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 24, 18, 48, 50, 0));
    const seen: number[] = []; const stop = startNowTicker((n) => seen.push(n), false);
    expect(seen.length).toBe(1);
    vi.advanceTimersByTime(9_000); expect(seen.length).toBe(1);       // 18:48:59 – noch dieselbe Minute
    vi.advanceTimersByTime(1_100); expect(seen.length).toBe(2);       // 18:49:00 – neue Minute
    expect(new Date(seen[1]).getUTCMinutes()).toBe(49);
    vi.advanceTimersByTime(60_000); expect(seen.length).toBe(3);      // und die nächste
    stop(); vi.advanceTimersByTime(120_000); expect(seen.length).toBe(3);
  });
});
