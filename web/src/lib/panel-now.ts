// The clock of the open island panel (3.69.1). The panel redrew itself every second just to move a clock that only shows minutes. Now the panel
// asks for seconds only when something on it needs them (a running focus timer, a song that is playing, lyrics, a clock tile that shows
// seconds); otherwise it wakes once a minute, exactly when the minute changes. Nothing that can be seen is any later than before.
import { useEffect, useState } from "react";

/** Calls `set` with the time: every second when `fast`, otherwise at every full minute. Returns the function that stops it. */
export function startNowTicker(set: (ms: number) => void, fast: boolean, now: () => number = Date.now): () => void {
  set(now());
  let id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
  if (fast) {
    id = setInterval(() => set(now()), 1000);
    return () => clearInterval(id);
  }
  const arm = () => { id = setTimeout(() => { set(now()); arm(); }, 60_000 - (now() % 60_000) + 30); };   // 30 ms after the full minute
  arm();
  return () => clearTimeout(id);
}

export function usePanelNow(fast: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => startNowTicker(setNow, fast), [fast]);
  return now;
}
