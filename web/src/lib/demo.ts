// Demo mode: the web app runs without a PC and answers every request from in-memory example data.
// Used for the public preview link and for the "Demo ansehen" button on the connect screen.
// Everything is clearly marked as an example in the UI; no action ever reaches a real PC.

import { RpcError } from "./rpc";
import type { AppState, AudioDevice, AutomationRule, Hotkey, LibraryItem, MetricsSample, Notification, Profile, ProfilesFile, QuickAction, Sound, SoundsFile } from "./types";

export const DEMO_BUILD = import.meta.env.VITE_DEMO === "1";
const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();

const steam = (id: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
const item = (id: string, kind: "game" | "program", name: string, source: LibraryItem["source"], cats: string[], fav = false, cover?: string): LibraryItem =>
  ({ id, kind, name, source, target: "demo", args: "", processNames: [], categories: cats, favorite: fav, coverUrl: cover, addedAt: ago(5000) });

interface DemoDb {
  items: LibraryItem[];
  profiles: ProfilesFile;
  quick: QuickAction[];
  sounds: SoundsFile;
  rules: AutomationRule[];
  hotkeys: Hotkey[];
  notifications: Notification[];
  settings: Record<string, unknown>;
  audio: Record<string, unknown>;
  devices: AudioDevice[];
  playing: { playbackId: string; soundId: string; name: string; startedAt: string; durationMs: number; paused: boolean }[];
}

function seed(): DemoDb {
  const profile = (id: string, name: string, icon: string, color: string, extra: Partial<Profile> = {}): Profile =>
    ({ id, name, icon, color, gameIds: [], launchProgramIds: [], quickActionIds: [], hotkeyIds: [], quietNotifications: false, ...extra });
  const sound = (id: string, name: string, cats: string[], color?: string, fav = false): Sound =>
    ({ id, name, fileName: id + ".mp3", format: "mp3", size: 48000, sha256: id, categories: cats, favorite: fav, volume: 100, color, addedAt: ago(900) });
  return {
    items: [
      item("g1", "game", "Counter-Strike 2", "steam", ["Shooter"], true, steam("730")),
      item("g2", "game", "Rocket League", "epic", ["Sport", "Koop"], true),
      item("g3", "game", "Forza Horizon 5", "appsFolder", ["Racing"], false, steam("1551360")),
      item("g4", "game", "Elden Ring", "steam", ["RPG"], false, steam("1245620")),
      item("g5", "game", "Minecraft", "appsFolder", ["Koop"], true),
      item("g6", "game", "Valorant", "exe", ["Shooter"]),
      item("p1", "program", "Discord", "exe", ["Chat"], true),
      item("p2", "program", "OBS Studio", "exe", ["Streaming"]),
      item("p3", "program", "Spotify", "appsFolder", ["Musik"]),
      item("p4", "program", "Opera GX", "exe", ["Browser"]),
    ],
    profiles: {
      profiles: [
        profile("prof_general", "Allgemein", "monitor", "#22d3ee"),
        profile("prof_competitive", "Competitive", "crosshair", "#f43f5e", { gameIds: ["g1", "g6"], quietNotifications: true, launchProgramIds: ["p1"] }),
        profile("prof_streaming", "Streaming", "radio", "#a78bfa", { launchProgramIds: ["p2", "p1"] }),
        profile("prof_quiet", "Ruhemodus", "moon", "#34d399", { soundboardVolume: 30, quietNotifications: true }),
      ],
      activeProfileId: "prof_general",
      activeReason: "Standard",
      activeSince: ago(42),
      autoSwitch: true,
    },
    quick: [
      { id: "qa1", name: "Abendrunde", icon: "gamepad-2", category: "Gaming", favorite: true, showOnDashboard: true, requireConfirm: false, steps: [{ type: "launchItem", ref: "p1" }, { type: "activateProfile", ref: "prof_competitive" }, { type: "launchItem", ref: "g1" }] },
      { id: "qa2", name: "Stream starten", icon: "radio", category: "Streaming", favorite: false, showOnDashboard: true, requireConfirm: true, steps: [{ type: "activateProfile", ref: "prof_streaming" }, { type: "launchItem", ref: "p2" }] },
      { id: "qa3", name: "Alles leise", icon: "moon", category: null, favorite: false, showOnDashboard: true, requireConfirm: false, steps: [{ type: "stopAllSounds" }, { type: "activateProfile", ref: "prof_quiet" }] },
      { id: "qa4", name: "Musik an", icon: "music", category: null, favorite: false, showOnDashboard: true, requireConfirm: false, steps: [{ type: "launchItem", ref: "p3" }] },
    ],
    sounds: {
      sounds: [
        sound("s1", "Airhorn", ["Meme"], "#f43f5e", true),
        sound("s2", "Applaus", ["Reaktion"], "#34d399"),
        sound("s3", "Trommelwirbel", ["Spannung"], "#fbbf24"),
        sound("s4", "Sad Trombone", ["Meme"], "#a78bfa", true),
        sound("s5", "Sieg!", ["Reaktion"], "#22d3ee"),
        sound("s6", "Wow", ["Reaktion"], "#60a5fa"),
        sound("s7", "Bruh", ["Meme"], "#fb923c"),
        sound("s8", "Countdown", ["Spannung"], "#f472b6"),
      ],
      collections: [{ id: "col1", name: "Memes", soundIds: ["s1", "s4", "s7"] }],
    },
    rules: [
      { id: "r1", name: "Competitive bei Counter-Strike", enabled: true, trigger: "gameStarted", triggerRef: "g1", actions: [{ type: "activateProfile", ref: "prof_competitive" }], lastRunAt: ago(180), lastResult: "Profil aktiv: Competitive", runCount: 12 },
      { id: "r2", name: "Warnung bei fehlendem Audiogerät", enabled: true, trigger: "audioDeviceMissing", actions: [{ type: "notify", ref: "Ein im Profil gewähltes Audiogerät fehlt." }], runCount: 0 },
    ],
    hotkeys: [
      { id: "h1", keys: "Ctrl+Alt+F9", enabled: true, action: { type: "playSound", ref: "s1" } },
      { id: "h2", keys: "Ctrl+Alt+F12", enabled: true, action: { type: "stopAllSounds" } },
    ],
    notifications: [
      { id: "n1", key: "demo", severity: "info", title: "Willkommen in der Demo", message: "Alle Inhalte sind Beispiele. Mit dem Companion auf deinem PC werden daraus echte Daten.", at: now(), count: 1 },
    ],
    settings: { pcName: "Demo-PC", language: "de", lanAccess: true, port: 8787, relayEnabled: false, historyEnabled: true, startMinimized: true, keepRunningInTray: true, processScanSeconds: 5, notifyInfo: true, quietWhileGaming: true, mutedNotificationKeys: [], steamCoversFromCdn: true },
    audio: { outputDeviceId: "d3", soundboardVolume: 80, monitorEnabled: true, monitorDeviceId: "d2", monitorVolume: 60, micPassthrough: true, micDeviceId: "m1", micVolume: 100, playMode: "overlap", maxConcurrent: 8 },
    devices: [
      { id: "d1", name: "Lautsprecher (Realtek Audio)", flow: "render", isDefault: true, isVirtualCable: false },
      { id: "d2", name: "Headset (HyperX Cloud II)", flow: "render", isDefault: false, isVirtualCable: false },
      { id: "d3", name: "CABLE Input (VB-Audio Virtual Cable)", flow: "render", isDefault: false, isVirtualCable: true },
      { id: "m1", name: "Mikrofon (HyperX Cloud II)", flow: "capture", isDefault: true, isVirtualCable: false },
    ],
    playing: [],
  };
}

let db = seed();
let emit: (event: string, data: unknown) => void = () => {};
let monitorTimer: number | null = null;
let monitorTick = 0;

export function attachDemo(emitter: (event: string, data: unknown) => void) { emit = emitter; db = seed(); }

function changed(topic: string) { emit("changed", { topic }); }
const name = (id?: string | null) => db.items.find((i) => i.id === id)?.name ?? db.profiles.profiles.find((p) => p.id === id)?.name ?? "?";

function sample(): MetricsSample {
  monitorTick++;
  const wave = (base: number, amp: number, off: number) => Math.round((base + amp * Math.sin(monitorTick / 3 + off) + Math.random() * 4) * 10) / 10;
  return {
    at: now(), cpuPercent: wave(34, 14, 0), cpuName: "Beispiel-CPU (8 Kerne)", cpuCores: 16, cpuTempSource: "Demo – im echten Companion nur, wenn eine Datenquelle vorhanden ist",
    memTotalBytes: 32 * 2 ** 30, memUsedBytes: Math.round((14 + Math.sin(monitorTick / 5)) * 2 ** 30),
    gpus: [{ name: "Beispiel-Grafikkarte", utilPercent: wave(62, 20, 1), tempC: Math.round(wave(64, 5, 2)), memUsedBytes: 6.5 * 2 ** 30, memTotalBytes: 12 * 2 ** 30, source: "Demo-Beispielwerte" }],
    disks: [{ name: "C:\\", label: "System", totalBytes: 1000 * 2 ** 30, freeBytes: 412 * 2 ** 30 }, { name: "D:\\", label: "Games", totalBytes: 2000 * 2 ** 30, freeBytes: 655 * 2 ** 30 }],
    uptimeHours: 5.4, fpsStatus: "Nicht verfügbar – auch im echten Companion (benötigt einen Frame-Capture-Dienst).", sources: { cpu: "Demo-Beispielwerte", ram: "Demo-Beispielwerte" },
  };
}

function playingState() { return { playing: db.playing, queued: 0 }; }

function state(): AppState {
  const active = db.profiles.profiles.find((p) => p.id === db.profiles.activeProfileId)!;
  return {
    pcName: "Demo-PC", version: "1.0.0", platform: "Demo (kein PC verbunden)", startedAt: ago(320),
    features: { audio: true, hotkeys: true, autostart: true, pickFile: false, installUpdates: true },
    activeProfile: { id: active.id, name: active.name, color: active.color, icon: active.icon, reason: db.profiles.activeReason, since: db.profiles.activeSince },
    autoSwitch: db.profiles.autoSwitch,
    running: [{ itemId: "g2", name: "Rocket League", since: ago(27) }],
    playing: playingState(),
    relay: { state: "disabled", clients: 0 },
    lanUrls: ["http://192.168.178.20:8787"], lanAccess: true,
    audio: { supported: true, output: "CABLE Input (VB-Audio Virtual Cable)", mic: "Durchleitung aktiv", volume: Number(db.audio.soundboardVolume), missing: [] },
    counts: { games: db.items.filter((i) => i.kind === "game").length, programs: db.items.filter((i) => i.kind === "program").length, sounds: db.sounds.sounds.length, devices: 2, notifications: db.notifications.length },
    me: { isLocal: false, name: "Dieses Gerät", permissions: ["view", "launch", "soundboard", "manage", "admin"], transport: "local" },
    updates: { current: "1.0.0", state: "up-to-date", downloaded: false, canInstall: true, checkedAt: ago(60) },
  };
}

function demoNotice(text: string): never { throw new RpcError("demo", "Demo: " + text); }

export async function demoCall(method: string, p: Record<string, any> = {}): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 120));
  switch (method) {
    case "ping": return { t: now() };
    case "state.get": return state();
    case "devices.me": return { isLocal: false, device: { id: "demo", name: "Dieses Gerät" }, permissions: state().me.permissions, transport: "local" };
    case "ui.getPrefs": return {};
    case "ui.savePrefs": return true;

    case "library.list": return { items: db.items, installed: Object.fromEntries(db.items.map((i) => [i.id, true])), running: ["g2"], coversFromCdn: true };
    case "library.update": {
      const i = db.items.find((x) => x.id === p.id);
      if (i) Object.assign(i, Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== "id" && v !== undefined)));
      changed("library"); return i;
    }
    case "library.launch": demoNotice(`Auf deinem PC würde jetzt „${name(p.id)}“ starten.`);
    case "library.detect": return { items: [{ key: "demo:1", kind: "game", name: "Beispielspiel (Steam)", source: "steam", target: "1", processNames: [], origin: "Steam", alreadyAdded: false }], detectors: ["Steam", "Epic Games", "Startmenü / Microsoft Store / Xbox"] };
    case "library.addDetected": case "library.addPath": case "library.remove": case "library.updateTarget": case "library.pickFile":
      demoNotice("Die Bibliothek kann erst mit dem Companion auf deinem PC bearbeitet werden.");

    case "quick.list": return { actions: db.quick };
    case "quick.run": demoNotice(`„${db.quick.find((q) => q.id === p.id)?.name}“ würde auf deinem PC ausgeführt.`);
    case "quick.save": {
      const a = { ...p, id: p.id || "qa" + Date.now() } as QuickAction;
      db.quick = [...db.quick.filter((q) => q.id !== a.id), a]; changed("quick"); return a;
    }
    case "quick.remove": db.quick = db.quick.filter((q) => q.id !== p.id); changed("quick"); return true;
    case "quick.reorder": db.quick.sort((a, b) => p.ids.indexOf(a.id) - p.ids.indexOf(b.id)); changed("quick"); return true;

    case "profiles.list": return db.profiles;
    case "profiles.activate": {
      db.profiles.previousProfileId = db.profiles.activeProfileId;
      db.profiles.activeProfileId = p.id; db.profiles.activeReason = "Manuell (Demo)"; db.profiles.activeSince = now();
      emit("profile.active", { id: p.id }); changed("profiles"); return db.profiles.profiles.find((x) => x.id === p.id);
    }
    case "profiles.revert": {
      if (!db.profiles.previousProfileId) throw new RpcError("none", "Kein vorheriges Profil gespeichert.");
      return demoCall("profiles.activate", { id: db.profiles.previousProfileId });
    }
    case "profiles.save": {
      if (p.autoSwitch !== undefined && !p.profile) { db.profiles.autoSwitch = p.autoSwitch; changed("profiles"); return true; }
      const prof = { ...p.profile, id: p.profile.id || "prof" + Date.now() };
      db.profiles.profiles = [...db.profiles.profiles.filter((x) => x.id !== prof.id), prof]; changed("profiles"); return prof;
    }
    case "profiles.copy": case "profiles.remove": demoNotice("Profile werden auf deinem PC gespeichert.");

    case "automations.list": return { rules: db.rules };
    case "automations.save": {
      const r = { runCount: 0, ...p, id: p.id || "r" + Date.now() } as AutomationRule;
      db.rules = [...db.rules.filter((x) => x.id !== r.id), r]; changed("automations"); return r;
    }
    case "automations.test": demoNotice("Die Regel würde jetzt auf deinem PC ausgeführt.");
    case "automations.copy": case "automations.remove": changed("automations"); return true;

    case "hotkeys.list": return { supported: true, hotkeys: db.hotkeys.map((h) => ({ hotkey: h, status: { id: h.id, state: h.enabled ? "active" : "disabled" } })) };
    case "hotkeys.save": demoNotice("Hotkeys werden vom Companion auf deinem PC registriert.");

    case "history.get": return {
      enabled: true,
      sessions: [{ itemId: "g2", name: "Rocket League", startedAt: ago(27), minutes: 27 }, { itemId: "g1", name: "Counter-Strike 2", startedAt: ago(1440), endedAt: ago(1340), minutes: 100 }, { itemId: "g4", name: "Elden Ring", startedAt: ago(2900), endedAt: ago(2760), minutes: 140 }],
      launches: [{ itemId: "g2", name: "Rocket League", at: ago(28), ok: true }, { itemId: "p1", name: "Discord", at: ago(30), ok: true }, { itemId: "g1", name: "Counter-Strike 2", at: ago(1441), ok: true }],
      stats: [{ itemId: "g4", name: "Elden Ring", sessions: 6, totalMinutes: 812, lastPlayed: ago(2900) }, { itemId: "g1", name: "Counter-Strike 2", sessions: 14, totalMinutes: 640, lastPlayed: ago(1440) }, { itemId: "g2", name: "Rocket League", sessions: 9, totalMinutes: 305, lastPlayed: ago(27) }],
      launchStats: [{ itemId: "g1", name: "Counter-Strike 2", launches: 14, failures: 0 }, { itemId: "p1", name: "Discord", launches: 11, failures: 0 }, { itemId: "g4", name: "Elden Ring", launches: 6, failures: 1 }],
      failures: [],
    };
    case "history.clear": changed("history"); return true;

    case "sounds.list": return { data: db.sounds, playing: playingState(), supported: true };
    case "sounds.play": {
      const s = db.sounds.sounds.find((x) => x.id === p.id)!;
      const pb = { playbackId: "pb" + Date.now(), soundId: s.id, name: s.name, startedAt: now(), durationMs: 1800, paused: false };
      db.playing = [...db.playing, pb]; emit("sounds.playing", playingState());
      window.setTimeout(() => { db.playing = db.playing.filter((x) => x.playbackId !== pb.playbackId); emit("sounds.playing", playingState()); }, 1800);
      return true;
    }
    case "sounds.stop": case "sounds.stopAll": db.playing = method === "sounds.stopAll" ? [] : db.playing.filter((x) => x.playbackId !== p.playbackId); emit("sounds.playing", playingState()); return true;
    case "sounds.pause": case "sounds.resume": return true;
    case "sounds.update": { const s = db.sounds.sounds.find((x) => x.id === p.id); if (s) Object.assign(s, p); changed("sounds"); return s; }
    case "sounds.setActiveCollection": db.sounds.activeCollectionId = p.id ?? undefined; changed("sounds"); return true;
    case "sounds.saveCollection": { const c = { ...p, id: p.id || "col" + Date.now() }; db.sounds.collections = [...db.sounds.collections.filter((x) => x.id !== c.id), c as never]; changed("sounds"); return c; }
    case "sounds.exportConfig": return { format: "pgl-soundboard", version: 1, sounds: db.sounds.sounds, collections: db.sounds.collections };
    case "sounds.uploadBegin": case "sounds.importUrl": case "sounds.importConfig": case "sounds.remove": case "sounds.removeCollection":
      demoNotice("Sounds werden auf deinem PC gespeichert – das geht erst mit dem Companion.");

    case "audio.state": return { supported: true, settings: db.audio, devices: db.devices, virtualCable: db.devices[2], micPassthroughActive: true, missing: [] };
    case "audio.save": db.audio = { ...p }; changed("audio"); return db.audio;
    case "audio.testTone": demoNotice("Der Testton würde auf deinem PC erklingen.");
    case "audio.diagnose": return { at: now(), checks: [
      { label: "Ausgabegeräte", status: "ok", detail: "Beispiel: 3 gefunden" },
      { label: "Virtuelles Audiokabel", status: "ok", detail: "Beispiel: CABLE Input" },
      { label: "Hören andere Teilnehmer den Sound?", status: "untested", detail: "Kann auch der echte Companion nicht prüfen – bitte mit einer zweiten Person testen." },
    ] };

    case "monitor.subscribe":
      if (!monitorTimer) monitorTimer = window.setInterval(() => emit("monitor.sample", sample()), 2000);
      return sample();
    case "monitor.unsubscribe": if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; } return true;

    case "network.diagnose": case "diagnostics.run": return { at: now(), checks: [{ label: "Demo-Modus", status: "info", detail: "Keine Verbindung zu einem PC. Mit dem Companion zeigt die Diagnose hier echte Prüfungen." }] };
    case "diagnostics.logs": return { entries: [] };

    case "notifications.list": return { items: db.notifications };
    case "notifications.dismiss": db.notifications = db.notifications.filter((n) => n.id !== p.id); changed("notifications"); return true;
    case "notifications.dismissAll": db.notifications = []; changed("notifications"); return true;

    case "settings.get": return { settings: db.settings, relaySecretSet: false, restartRequired: false };
    case "settings.save": db.settings = { ...db.settings, ...p }; changed("settings"); return db.settings;
    case "settings.saveSecurity": demoNotice("Verbindungseinstellungen gibt es nur am PC.");
    case "autostart.get": return { supported: true, enabled: true };
    case "autostart.set": demoNotice("Autostart wird am PC eingestellt.");
    case "updates.status": return state().updates;
    case "updates.check": case "updates.download": case "updates.install": demoNotice("Updates prüft der Companion auf deinem PC.");
    case "devices.list": return { devices: [
      { id: "demo", name: "Dieses Gerät", platform: "Demo", permissions: ["view", "launch", "soundboard", "manage", "admin"], pairedAt: ago(3000), lastSeenAt: now(), online: true, transport: "local" },
      { id: "dev2", name: "iPad · Opera", platform: "iPad", permissions: ["view", "launch", "soundboard"], pairedAt: ago(9000), lastSeenAt: ago(600), online: false },
    ], protection: "Demo" };
    case "backup.export": case "backup.validate": case "backup.restore": demoNotice("Backups werden auf deinem PC erstellt.");
    default: demoNotice("Diese Funktion braucht den Companion auf deinem PC.");
  }
}
