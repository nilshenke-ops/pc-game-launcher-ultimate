import { describe, expect, it } from "vitest";
import { isLan } from "../pages/Remote";
import { GestureRecognizer, imageRect, keysFor, sanitizeRemotePrefs, toScreen, withModifiers, type Gesture } from "./remote";

function rec(mode: "touch" | "touchpad") {
  const out: Gesture[] = [];
  const timers: (() => void)[] = [];
  const g = new GestureRecognizer(mode, (x) => out.push(x), (fn) => { timers.push(fn); return () => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); }; });
  const fireHold = () => timers.splice(0).forEach((f) => f());
  return { g, out, fireHold };
}

describe("picture position", () => {
  it("maps page points to the PC screen with black bars, zoom and offsets", () => {
    const r = imageRect(1000, 1000, 1920, 1080);
    expect([r.x, r.y, r.w, r.h].map((v) => Math.round(v * 100) / 100 + 0)).toEqual([0, 218.75, 1000, 562.5]);
    const box = { left: 100, top: 50, width: 1000, height: 1000 };
    expect(toScreen(100 + 250, 50 + 218.75 + 281.25, box, 1920, 1080)).toEqual({ x: 0.25, y: 0.5 });
    expect(toScreen(600, 60, box, 1920, 1080)).toBeNull(); // in the black bar above the picture
    // Zoomed 2× (the bounding box of the transformed canvas is twice as big and shifted).
    expect(toScreen(-400 + 1000, -500 + 562.5, { left: -400, top: -500, width: 2000, height: 1125 }, 1920, 1080)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("touch gestures", () => {
  it("tap clicks, a quick second tap lands on the same spot (double click), hold = right click", () => {
    const { g, out, fireHold } = rec("touch");
    g.down(1, 100, 100, 0); g.up(1, 80);
    g.down(1, 110, 108, 200); g.up(1, 260);
    expect(out).toEqual([{ k: "tap", x: 100, y: 100, button: "left" }, { k: "tap", x: 100, y: 100, button: "left" }]);
    out.length = 0;
    g.down(1, 300, 300, 2000); fireHold(); g.up(1, 2700);
    expect(out).toEqual([{ k: "tap", x: 300, y: 300, button: "right" }]);
  });

  it("swipe scrolls, hold and move drags, two-finger tap is a right click, cancel ends a drag", () => {
    const { g, out, fireHold } = rec("touch");
    g.down(1, 100, 100, 0); g.move(1, 100, 130); g.move(1, 100, 160); g.up(1, 300);
    expect(out.every((x) => x.k === "scroll")).toBe(true);
    expect(out.reduce((s, x) => s + (x.k === "scroll" ? x.dy : 0), 0)).toBe(60); // the whole finger path scrolls
    out.length = 0;
    g.down(1, 50, 50, 1000); fireHold(); g.move(1, 90, 50); g.move(1, 120, 60); g.up(1, 2000);
    expect(out).toEqual([{ k: "dragStart", x: 50, y: 50 }, { k: "dragMove", x: 90, y: 50 }, { k: "dragMove", x: 120, y: 60 }, { k: "dragEnd" }]);
    out.length = 0;
    g.down(1, 10, 10, 3000); g.down(2, 60, 10, 3010); g.up(1, 3100); g.up(2, 3110);
    expect(out).toEqual([{ k: "tap", x: 60, y: 10, button: "right" }]);
    out.length = 0;
    g.down(1, 0, 0, 4000); fireHold(); g.move(1, 50, 0); g.cancel();
    expect(out.at(-1)).toEqual({ k: "dragEnd" });
  });

  it("touchpad: finger moves the pointer, tap clicks at it, tap-and-hold drags", () => {
    const { g, out } = rec("touchpad");
    g.down(1, 100, 100, 0); g.move(1, 120, 100); g.move(1, 130, 105); g.up(1, 200);
    expect(out).toEqual([{ k: "move", dx: 20, dy: 0 }, { k: "move", dx: 10, dy: 5 }]);
    out.length = 0;
    g.down(1, 10, 10, 1000); g.up(1, 1050);
    g.down(1, 10, 10, 1200); g.move(1, 40, 10); g.up(1, 1500);
    expect(out.map((x) => x.k)).toEqual(["tap", "dragStart", "move", "dragEnd"]);
  });
});

describe("keys and settings", () => {
  it("special keys and shortcuts become key presses, letters are text", () => {
    const base = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };
    expect(keysFor({ ...base, key: "Enter" })).toEqual(["Enter"]);
    expect(keysFor({ ...base, key: "c", ctrlKey: true })).toEqual(["Ctrl", "C"]);
    expect(keysFor({ ...base, key: "z", metaKey: true, shiftKey: true })).toEqual(["Ctrl", "Shift", "Z"]); // Cmd on the iPad keyboard = Ctrl
    expect(keysFor({ ...base, key: "ä" })).toBeNull();
    expect(withModifiers(["Ctrl"], "v")).toEqual({ keys: ["Ctrl", "V"] });
    expect(withModifiers([], "ü")).toEqual({ text: "ü" });
  });

  it("settings from storage are checked", () => {
    expect(sanitizeRemotePrefs({ preset: "ultra", fps: 500, maxWidth: 10, mode: "x", speed: "fast" })).toMatchObject({ preset: "auto", fps: 30, maxWidth: 480, mode: "touch", speed: 1.4 });
    expect(sanitizeRemotePrefs(null).autoReconnect).toBe(true);
  });
});

describe("connection type", () => {
  it("knows direct home-network addresses from tunnels", () => {
    expect(isLan("ws://127.0.0.1:8791/ws")).toBe(true);
    expect(isLan("ws://192.168.178.20:8787/ws")).toBe(true);
    expect(isLan("wss://mein-pc.tail1234.ts.net/ws")).toBe(false);
    expect(isLan("wss://172.40.0.1/ws")).toBe(false);
  });
});
