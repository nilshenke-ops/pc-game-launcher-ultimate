// Remote desktop: pure logic (no React) – settings kept on this device, where the picture lies on the screen, and the
// touch gestures. The page (pages/Remote.tsx) turns gestures into Windows input and sends them to the PC.

export type RemotePreset = "auto" | "low" | "balanced" | "high";
export type TouchMode = "touch" | "touchpad";

export interface RemotePrefs {
  preset: RemotePreset;
  /** Target pictures per second (the PC never sends more; what really arrives is measured and shown). */
  fps: number;
  /** Largest picture width in pixels. */
  maxWidth: number;
  mode: TouchMode;
  /** Pointer speed in touchpad mode. */
  speed: number;
  toolbar: "auto" | "always";
  fullscreen: boolean;
  autoReconnect: boolean;
  screen: number;
}

export const REMOTE_DEFAULTS: RemotePrefs = { preset: "auto", fps: 20, maxWidth: 1600, mode: "touch", speed: 1.4, toolbar: "always", fullscreen: false, autoReconnect: true, screen: 0 };
const KEY = "pgl.remote";
const clamp = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : d);

export function sanitizeRemotePrefs(v: unknown): RemotePrefs {
  const p = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof RemotePrefs, unknown>>;
  return {
    preset: (["auto", "low", "balanced", "high"] as const).includes(p.preset as RemotePreset) ? (p.preset as RemotePreset) : REMOTE_DEFAULTS.preset,
    fps: Math.round(clamp(p.fps, 1, 30, REMOTE_DEFAULTS.fps)),
    maxWidth: Math.round(clamp(p.maxWidth, 480, 3840, REMOTE_DEFAULTS.maxWidth)),
    mode: p.mode === "touchpad" ? "touchpad" : "touch",
    speed: clamp(p.speed, 0.5, 4, REMOTE_DEFAULTS.speed),
    toolbar: p.toolbar === "auto" ? "auto" : "always",
    fullscreen: p.fullscreen === true,
    autoReconnect: p.autoReconnect !== false,
    screen: Math.round(clamp(p.screen, 0, 15, 0)),
  };
}

export function loadRemotePrefs(): RemotePrefs {
  try { return sanitizeRemotePrefs(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return { ...REMOTE_DEFAULTS }; }
}
export function saveRemotePrefs(p: RemotePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizeRemotePrefs(p))); } catch { /* storage blocked: settings last for this visit */ }
}

/** Where a picture of iw×ih is drawn inside a box of bw×bh with "contain" (letterboxed, centred). */
export function imageRect(bw: number, bh: number, iw: number, ih: number) {
  if (iw <= 0 || ih <= 0 || bw <= 0 || bh <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

/** A point on the page → 0..1 of the PC screen, or null when it is outside the picture (black bars). */
export function toScreen(px: number, py: number, box: { left: number; top: number; width: number; height: number }, iw: number, ih: number) {
  const r = imageRect(box.width, box.height, iw, ih);
  if (r.w === 0) return null;
  const x = (px - box.left - r.x) / r.w, y = (py - box.top - r.y) / r.h;
  if (x < -0.001 || y < -0.001 || x > 1.001 || y > 1.001) return null;
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1e5) / 1e5; // 1/100000 – finer than any screen pixel
  return { x: c(x), y: c(y) };
}

// ------------------------------------------------------------------------------------------- gestures

export type Gesture =
  | { k: "tap"; x: number; y: number; button: "left" | "right" }
  | { k: "dragStart"; x: number; y: number }
  | { k: "dragMove"; x: number; y: number }
  | { k: "dragEnd" }
  | { k: "scroll"; dx: number; dy: number }
  | { k: "move"; dx: number; dy: number };

interface Pt { x: number; y: number; t: number }

/**
 * Turns finger events (page pixels) into mouse gestures.
 * Touch mode: tap = left click there (a second tap close by = double click), hold still = right click, hold and move =
 * drag, swipe with one or two fingers = scroll, two-finger tap = right click.
 * Touchpad mode: move the finger = move the pointer, tap = click at the pointer, two-finger tap = right click,
 * two fingers = scroll, hold then move (or tap and tap-hold) = drag.
 */
export class GestureRecognizer {
  static readonly HOLD_MS = 550;
  static readonly SLOP = 10;
  mode: TouchMode;
  private emit: (g: Gesture) => void;
  private schedule: (fn: () => void, ms: number) => () => void;
  private pts = new Map<number, Pt & { sx: number; sy: number }>();
  private state: "idle" | "pending" | "scroll" | "drag" | "pad" | "two" = "idle";
  private held = false;
  private cancelHold: (() => void) | null = null;
  private maxFingers = 0;
  private twoMoved = false;
  private lastTap: Pt | null = null;
  private padTapAt = -Infinity;

  constructor(mode: TouchMode, emit: (g: Gesture) => void, schedule: (fn: () => void, ms: number) => () => void = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); }) {
    this.mode = mode; this.emit = emit; this.schedule = schedule;
  }

  private center() {
    let x = 0, y = 0;
    for (const p of this.pts.values()) { x += p.x; y += p.y; }
    return { x: x / this.pts.size, y: y / this.pts.size };
  }

  down(id: number, x: number, y: number, t: number) {
    this.pts.set(id, { x, y, t, sx: x, sy: y });
    this.maxFingers = Math.max(this.maxFingers, this.pts.size);
    if (this.pts.size === 2) {
      this.cancelHold?.(); this.cancelHold = null;
      if (this.state === "drag") this.emit({ k: "dragEnd" });
      this.state = "two"; this.twoMoved = false;
      return;
    }
    if (this.pts.size > 2) return;
    this.held = false;
    // Touchpad: a press shortly after a tap starts a drag (tap-and-hold, like on a laptop touchpad).
    if (this.mode === "touchpad" && t - this.padTapAt < 300) { this.state = "drag"; this.emit({ k: "dragStart", x, y }); return; }
    this.state = "pending";
    this.cancelHold = this.schedule(() => { this.held = true; this.cancelHold = null; }, GestureRecognizer.HOLD_MS);
  }

  move(id: number, x: number, y: number) {
    const p = this.pts.get(id);
    if (!p) return;
    const prev = this.center();
    p.x = x; p.y = y;
    const now = this.center();
    if (this.state === "two") {
      if (!this.twoMoved && Math.hypot(x - p.sx, y - p.sy) < GestureRecognizer.SLOP) return;
      this.twoMoved = true;
      this.emit({ k: "scroll", dx: now.x - prev.x, dy: now.y - prev.y });
      return;
    }
    if (this.pts.size !== 1) return;
    const far = Math.hypot(x - p.sx, y - p.sy) >= GestureRecognizer.SLOP;
    if (this.state === "pending" && far) {
      this.cancelHold?.(); this.cancelHold = null;
      if (this.held) { this.state = "drag"; this.emit({ k: "dragStart", x: p.sx, y: p.sy }); }
      else this.state = this.mode === "touchpad" ? "pad" : "scroll";
      if (this.state === "pad") { this.emit({ k: "move", dx: x - p.sx, dy: y - p.sy }); return; }
    }
    if (this.state === "scroll") this.emit({ k: "scroll", dx: now.x - prev.x, dy: now.y - prev.y });
    else if (this.state === "pad") this.emit({ k: "move", dx: now.x - prev.x, dy: now.y - prev.y });
    else if (this.state === "drag") this.mode === "touchpad" ? this.emit({ k: "move", dx: now.x - prev.x, dy: now.y - prev.y }) : this.emit({ k: "dragMove", x, y });
  }

  up(id: number, t: number) {
    const p = this.pts.get(id);
    if (!p) return;
    this.pts.delete(id);
    if (this.state === "two") {
      if (this.pts.size === 0) {
        if (!this.twoMoved && this.maxFingers === 2) this.emit({ k: "tap", x: p.sx, y: p.sy, button: "right" });
        this.reset();
      }
      return;
    }
    this.cancelHold?.(); this.cancelHold = null;
    if (this.state === "pending") {
      const button = this.held ? "right" : "left";
      // A second tap close to the first is sent at the same spot, so Windows sees a double click.
      let { sx: x, sy: y } = p;
      if (button === "left" && this.lastTap && t - this.lastTap.t < 400 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30) { x = this.lastTap.x; y = this.lastTap.y; }
      this.emit({ k: "tap", x, y, button });
      this.lastTap = button === "left" ? { x, y, t } : null;
      if (this.mode === "touchpad" && button === "left") this.padTapAt = t;
    } else if (this.state === "drag") this.emit({ k: "dragEnd" });
    this.reset();
  }

  /** The browser took the touch away (e.g. a system gesture): a drag is ended, nothing else happens. */
  cancel() {
    this.cancelHold?.(); this.cancelHold = null;
    if (this.state === "drag") this.emit({ k: "dragEnd" });
    this.pts.clear();
    this.reset();
  }

  private reset() { if (this.pts.size === 0) { this.state = "idle"; this.maxFingers = 0; this.held = false; } }
}

// ------------------------------------------------------------------------------------------- keys

/** Keys of a physical keyboard that are sent as keys (everything printable goes as text). */
const KEY_MAP: Record<string, string> = {
  Enter: "Enter", Escape: "Escape", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End",
  PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", ContextMenu: "ContextMenu",
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`])),
};

/** A keydown from a real keyboard → keys to press on the PC, or null when it is plain text (sent via the input event). */
export function keysFor(e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }): string[] | null {
  const mods = [e.ctrlKey || e.metaKey ? "Ctrl" : null, e.altKey ? "Alt" : null].filter((x): x is string => !!x);
  if (KEY_MAP[e.key]) return [...mods, ...(e.shiftKey ? ["Shift"] : []), KEY_MAP[e.key]];
  if (mods.length && /^[a-z0-9]$/i.test(e.key)) return [...mods, ...(e.shiftKey ? ["Shift"] : []), e.key.toUpperCase()];
  return null;
}

/** Text typed while sticky modifiers (Strg/Alt/Win on the bar) are on becomes a combination, e.g. Strg + c → Ctrl+C. */
export function withModifiers(mods: string[], text: string): { keys: string[] } | { text: string } {
  if (mods.length && text.length === 1 && /[a-z0-9]/i.test(text)) return { keys: [...mods, text.toUpperCase()] };
  return { text };
}
