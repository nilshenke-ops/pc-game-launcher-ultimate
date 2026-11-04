import { describe, expect, it } from "vitest";
import { NOTICE_MS, islandNotice, noticeFresh, ISLAND_STYLES, eyeColor, isIslandEye, isIslandEyeSize, isIslandStyle, ASK_TTL, clock, DANCE_MS, HAPPY_MS, islandPet, petCommand, islandAnswer, islandClearAsk, islandGaming, islandMusic, islandSize, islandState, islandTouch, MUSIC_FRESH, moodOf, SLEEP_AFTER, SURPRISE_MS } from "./island";

const base = { busy: false, listening: false, last: null, ask: null, pokes: [] as number[], music: null as { level: number; beatAt: number; at: number } | null, gaming: false, gamingSince: 0, lastActive: 1_000_000 };
const now = 1_000_000;

describe("JARVIS-Insel: Gesicht folgt dem echten Zustand", () => {
  it("Stimmungen in fester Reihenfolge", () => {
    expect(moodOf(base, now)).toBe("idle");
    expect(moodOf({ ...base, busy: true }, now)).toBe("thinking");
    expect(moodOf({ ...base, busy: true, listening: true }, now)).toBe("listening");
    expect(moodOf({ ...base, last: { text: "ok", ok: true, at: now - 1000 } }, now)).toBe("happy");
    expect(moodOf({ ...base, last: { text: "Fehler", ok: false, at: now - 1000 } }, now)).toBe("error");
    expect(moodOf({ ...base, last: { text: "ok", ok: true, at: now - HAPPY_MS - 1 } }, now)).toBe("idle");
    // Eine Rückfrage geht vor, läuft aber nach 2 Minuten ab
    const ask = { action: { kind: "power", label: "PC herunterfahren", method: "power.shutdown", confirm: true }, at: now - 1000 };
    expect(moodOf({ ...base, busy: true, ask }, now)).toBe("asking");
    expect(moodOf({ ...base, ask: { ...ask, at: now - ASK_TTL - 1 } }, now)).toBe("idle");
    // Zu oft angetippt → schwindelig
    expect(moodOf({ ...base, pokes: [now - 3000, now - 2000, now - 1500, now - 800, now - 100] }, now)).toBe("dizzy");
    expect(moodOf({ ...base, pokes: [now - 9000, now - 8000, now - 7000, now - 6000, now - 100] }, now)).toBe("idle");
  });
  it("nur Aktionen mit Bestätigung und Befehl werden zur Rückfrage – nie automatische oder Navigation", () => {
    islandAnswer("Soll ich?", true, [{ kind: "navigate", label: "Öffnen", path: "/x" }, { kind: "launch", label: "Starten", method: "library.launch", auto: true, confirm: true }]);
    expect(islandState().ask).toBeNull();
    islandAnswer("Soll ich den PC herunterfahren?", true, [{ kind: "power", label: "PC herunterfahren", method: "power.shutdown", confirm: true }]);
    expect(islandState().ask?.action.method).toBe("power.shutdown");
    islandClearAsk();
    expect(islandState().ask).toBeNull();
    expect(islandState().last?.text).toBe("Soll ich den PC herunterfahren?");
  });
  it("Pet-Stimmungen: tanzt nur zu echter Musik, zockt mit laufendem Spiel, schläft nach Ruhe, wacht bei Berührung auf", () => {
    const music = (at: number) => ({ level: 0.5, beatAt: at, at });
    // Music: dancing while the PC keeps reporting it, back to normal when the report is old or gone.
    expect(moodOf({ ...base, music: music(now - 500) }, now)).toBe("dancing");
    expect(moodOf({ ...base, music: music(now - MUSIC_FRESH - 1) }, now)).toBe("idle");
    expect(moodOf({ ...base, music: null }, now)).toBe("idle");
    // A started game surprises first, then the gaming look; dancing wins over gaming while music plays.
    expect(moodOf({ ...base, gaming: true, gamingSince: now - 500 }, now)).toBe("surprised");
    expect(moodOf({ ...base, gaming: true, gamingSince: now - SURPRISE_MS - 1 }, now)).toBe("gaming");
    expect(moodOf({ ...base, gaming: true, gamingSince: now - 60_000, music: music(now - 200) }, now)).toBe("dancing");
    // Sleep after long quiet – but never while a game runs or music plays; answers and questions still win.
    expect(moodOf({ ...base, lastActive: now - SLEEP_AFTER - 1 }, now)).toBe("sleeping");
    expect(moodOf({ ...base, lastActive: now - SLEEP_AFTER + 5000 }, now)).toBe("idle");
    expect(moodOf({ ...base, lastActive: now - SLEEP_AFTER - 1, gaming: true, gamingSince: now - 99_999 }, now)).toBe("gaming");
    expect(moodOf({ ...base, lastActive: now - SLEEP_AFTER - 1, busy: true }, now)).toBe("thinking");
  });
  it("Musik-, Spiel- und Berührungsmeldungen verändern den Zustand wie beschrieben", () => {
    islandMusic({ playing: true, level: 0.4, beat: true }, 5000);
    expect(islandState().music).toMatchObject({ level: 0.4, beatAt: 5000, at: 5000 });
    islandMusic({ playing: true, level: 9, beat: false }, 5100); // level is clamped, the last beat stays
    expect(islandState().music).toMatchObject({ level: 1, beatAt: 5000, at: 5100 });
    islandMusic({ playing: false });
    expect(islandState().music).toBeNull();
    islandGaming(true, 7000);
    expect(islandState()).toMatchObject({ gaming: true, gamingSince: 7000 });
    islandGaming(true, 9000); // already gaming: the start time stays
    expect(islandState().gamingSince).toBe(7000);
    islandGaming(false);
    expect(islandState().gaming).toBe(false);
    const later = Date.now() + 60_000;
    islandTouch(later);
    expect(islandState().lastActive).toBe(later);
  });
  it("zu sind nur die Augen zu sehen – Leiste bei Maus oder Aktivität, Rückfrage mit Knöpfen, Widgets beim Antippen", () => {
    expect(islandSize({ open: false, ask: false, hover: false, mood: "idle" })).toBe("notch");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "dizzy" })).toBe("notch");
    expect(islandSize({ open: false, ask: false, hover: true, mood: "idle" })).toBe("bar");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "thinking" })).toBe("bar");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "happy" })).toBe("bar");
    expect(islandSize({ open: false, ask: true, hover: false, mood: "asking" })).toBe("ask");
    expect(islandSize({ open: true, ask: true, hover: true, mood: "asking" })).toBe("panel");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "idle", notice: true })).toBe("bar");
    islandClearAsk(true);
    expect(islandState().last?.at).toBe(0); // declined: no "done" face
  });
  it("Fokus-Timer-Anzeige", () => {
    expect(clock(5 * 60_000)).toBe("5:00");
    expect(clock(61_500)).toBe("1:02");
    expect(clock(-5)).toBe("0:00");
  });
});

describe("Befehle fürs Pet", () => {
  it("erkennt tanz, schlafen und aufwachen – auch mit „Jarvis“ davor", () => {
    expect(petCommand("Tanz!")).toBe("dance");
    expect(petCommand("Hey Jarvis, tanz mal")).toBe("dance");
    expect(petCommand("Jarvis, geh schlafen")).toBe("sleep");
    expect(petCommand("gute Nacht")).toBe("sleep");
    expect(petCommand("wach auf")).toBe("wake");
  });
  it("hält normale Fragen heraus", () => {
    expect(petCommand("Wie tanzt man Walzer?")).toBeNull();
    expect(petCommand("Starte Rocket League")).toBeNull();
    expect(petCommand("")).toBeNull();
  });
  it("tanzt 30 s lang, schläft bis zum Antippen, und Fragen/Denken gehen vor", () => {
    islandPet("dance", 5000);
    expect(moodOf({ ...base, pet: islandState().pet }, 6000)).toBe("dancing");
    expect(moodOf({ ...base, pet: islandState().pet }, 5000 + DANCE_MS + 1)).toBe("idle");
    expect(moodOf({ ...base, busy: true, pet: islandState().pet }, 6000)).toBe("thinking");
    islandPet("sleep", 7000);
    expect(moodOf({ ...base, pet: islandState().pet }, 7000 + 3600_000)).toBe("sleeping");
    islandTouch(8000);
    expect(islandState().pet).toBeNull();
  });
});

describe("Aussehen der Insel", () => {
  it("sieben Vorlagen, „Standard“ zuerst, nur bekannte Namen gelten", () => {
    expect(ISLAND_STYLES.map((s) => s.id)).toEqual(["default", "neon", "minimal", "glass", "blue", "purple", "mono"]);
    expect(isIslandStyle("neon")).toBe(true);
    expect(isIslandStyle("rot")).toBe(false);
    expect(isIslandStyle(undefined)).toBe(false);
  });
});

describe("Augen der Insel", () => {
  it("nur bekannte Farben und Größen; „auto“ hat keine eigene Farbe", () => {
    expect(isIslandEye("pink")).toBe(true);
    expect(isIslandEye("#ff0000")).toBe(false);
    expect(eyeColor("auto")).toBeNull();
    expect(eyeColor("white")).toBe("#ffffff");
    expect(isIslandEyeSize("l")).toBe(true);
    expect(isIslandEyeSize("xl")).toBe(false);
  });
});

describe("Insel: Benachrichtigungen des PCs", () => {
  it("zeigt den Titel kurz, ordnet die Stärke zu und vergisst ihn wieder", () => {
    islandNotice({ title: "Download fertig", severity: "info" }, 1000);
    expect(islandState().notice).toEqual({ text: "Download fertig", severity: "info", at: 1000 });
    expect(noticeFresh(islandState(), 1000 + NOTICE_MS - 1)).toBe(true);
    expect(noticeFresh(islandState(), 1000 + NOTICE_MS)).toBe(false);
    islandNotice({ title: "Speicher fast voll", severity: "warning" }, 2000);
    expect(islandState().notice?.severity).toBe("warning");
    islandNotice({ title: "Update fehlgeschlagen", severity: "error" }, 3000);
    expect(islandState().notice?.severity).toBe("error");
  });
  it("ohne Titel passiert nichts; Steuerzeichen und Länge werden bereinigt", () => {
    islandNotice({ title: "Bleibt", severity: "info" }, 4000);
    islandNotice({ title: "   ", severity: "error" }, 5000);
    islandNotice({ message: "nur Text" } as never, 5000);
    expect(islandState().notice?.text).toBe("Bleibt");
    islandNotice({ title: "A\u0007B" + "x".repeat(200), severity: "success" }, 6000);
    expect(islandState().notice?.text.length).toBeLessThanOrEqual(90);
    expect(islandState().notice?.text).not.toMatch(/\u0007/);
    expect(islandState().notice?.severity).toBe("info");
  });
});
