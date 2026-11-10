// The voice changer with REAL voices (ElevenLabs speech-to-speech). Not live like the effects: a sentence is recorded (hold the talk button,
// or automatically between pauses), sent to ElevenLabs, comes back in the chosen voice and is played to the virtual cable for Discord.
// So there is a delay of a second or two per sentence – like radio. The key stays on this device (and in the account); the sentence goes
// straight from here to ElevenLabs. Only one voice-changer engine runs at a time (this one stops the effects and the other way round).

import { useSyncExternalStore } from "react";
import { elevenDeviceReady, elevenSpeechToSpeech, elevenVoices, type ElevenVoice } from "./free-ai-local";
import { readJson, writeJson } from "./rpc";
import { readSettings, stopVoiceChanger, voiceChangerSupported, voiceState } from "./voice-changer";

export interface ElevenSettings { voiceId: string; auto: boolean }
export interface ElevenState {
  running: boolean; starting: boolean; error: string | null;
  /** Mic level 0…1 (peak with slow fall). */
  level: number;
  recording: boolean;
  /** Sentences waiting to be sent or played. */
  pending: number;
  /** Sending right now / playing the answer. */
  sending: boolean; playing: boolean;
  /** Time from the end of the sentence until the changed voice starts (ms), the last one. */
  lastDelayMs: number | null;
  sentences: number;
  /** Seconds of speech sent to ElevenLabs in this run (it counts against the plan). */
  sentSeconds: number;
  voices: ElevenVoice[]; voicesLoading: boolean;
  settings: ElevenSettings;
}

const KEY = "pgl.voiceeleven";
export const readElevenSettings = (): ElevenSettings => {
  const r = readJson<Partial<ElevenSettings>>(KEY) ?? {};
  return { voiceId: typeof r.voiceId === "string" && /^[A-Za-z0-9]{10,40}$/.test(r.voiceId) ? r.voiceId : "", auto: r.auto === true };
};

let state: ElevenState = { running: false, starting: false, error: null, level: 0, recording: false, pending: 0, sending: false, playing: false, lastDelayMs: null, sentences: 0, sentSeconds: 0, voices: [], voicesLoading: false, settings: readElevenSettings() };
const listeners = new Set<() => void>();
const publish = (patch: Partial<ElevenState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const elevenState = () => state;
export const useElevenChanger = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);

export function updateElevenSettings(patch: Partial<ElevenSettings>) {
  const next = { ...state.settings, ...patch };
  writeJson(KEY, next);
  publish({ settings: next });
}

export async function loadElevenVoices(): Promise<void> {
  if (state.voicesLoading) return;
  publish({ voicesLoading: true, error: null });
  try {
    const voices = await elevenVoices();
    const cur = state.settings.voiceId;
    publish({ voices, voicesLoading: false });
    if (!voices.some((v) => v.id === cur) && voices[0]) updateElevenSettings({ voiceId: voices[0].id });
  } catch (e) { publish({ voicesLoading: false, error: (e as Error).message }); }
}

interface Seg { blob: Blob; ms: number; endedAt: number }
interface Engine {
  ctx: AudioContext; stream: MediaStream; timer: number; monitorEl: HTMLAudioElement; outEl: HTMLAudioElement | null;
  out: GainNode; monitorGain: GainNode; rec: MediaRecorder | null; chunks: Blob[]; startedAt: number;
  queue: Seg[]; working: boolean; talkHeld: boolean; autoOn: boolean; stop(): void;
}
let engine: Engine | null = null;

const MAX_SEGMENT_MS = 25_000, MIN_SEGMENT_MS = 450;

export async function startEleven(): Promise<void> {
  if (engine || state.starting) return;
  if (!voiceChangerSupported()) { publish({ error: "Dieser Browser kann das nicht: Chrome oder Edge am PC nehmen." }); return; }
  if (!elevenDeviceReady()) { publish({ error: "Der ElevenLabs-Schlüssel ist nicht bereit – in der KI-Verwaltung eintragen oder entsperren." }); return; }
  if (!state.settings.voiceId) { publish({ error: "Bitte erst eine Stimme wählen („Stimmen laden“)." }); return; }
  if (voiceState().running) await stopVoiceChanger();                       // the effects and this one share the microphone
  publish({ starting: true, error: null, sentences: 0, sentSeconds: 0, lastDelayMs: null });
  const s = readSettings();
  let ctx: AudioContext | null = null, stream: MediaStream | null = null;
  try {
    ctx = new AudioContext({ latencyHint: "interactive" });
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(s.micId ? { deviceId: { exact: s.micId } } : {}), echoCancellation: s.clean, noiseSuppression: s.clean, autoGainControl: false, channelCount: 1 } });
    const out = ctx.createGain(); out.gain.value = s.volume;
    let outEl: HTMLAudioElement | null = null;
    const wantOut = !!s.outId && s.outId !== "default";
    if (wantOut && "setSinkId" in AudioContext.prototype) { await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(s.outId); out.connect(ctx.destination); }
    else if (wantOut && typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype) {
      const dest = ctx.createMediaStreamDestination(); out.connect(dest);
      outEl = new Audio(); outEl.srcObject = dest.stream;
      await (outEl as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(s.outId); await outEl.play();
    } else out.connect(ctx.destination);
    const monitorDest = ctx.createMediaStreamDestination(), monitorGain = ctx.createGain();
    monitorGain.gain.value = s.monitor ? 1 : 0; out.connect(monitorGain); monitorGain.connect(monitorDest);
    const monitorEl = new Audio(); monitorEl.srcObject = monitorDest.stream; if (s.monitor) await monitorEl.play().catch(() => undefined);
    const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
    if (ctx.state === "suspended") await ctx.resume();

    const e: Engine = { ctx, stream, timer: 0, monitorEl, outEl, out, monitorGain, rec: null, chunks: [], startedAt: 0, queue: [], working: false, talkHeld: false, autoOn: state.settings.auto, stop() { window.clearInterval(e.timer); try { e.rec?.stop(); } catch { /* not recording */ } stream?.getTracks().forEach((t) => t.stop()); outEl?.pause(); monitorEl.pause(); void ctx?.close().catch(() => undefined); } };
    engine = e;
    // Level meter and automatic recording between pauses.
    let hold = 0, loud = 0, quietSince = 0;
    const buf = new Float32Array(an.fftSize);
    e.timer = window.setInterval(() => {
      if (!engine) return;
      an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
      hold = Math.max(m, hold * 0.86); const lv = hold < 0.01 ? 0 : Math.min(1, hold);
      if (Math.abs(lv - state.level) > 0.02 || (lv === 0 && state.level !== 0)) publish({ level: lv });
      if (!e.autoOn || e.talkHeld || state.playing) { loud = 0; return; }
      const now = performance.now();
      if (!e.rec) { loud = m > 0.06 ? loud + 1 : 0; if (loud >= 2) { beginSegment(); quietSince = 0; } }
      else {
        if (m < 0.035) { quietSince ||= now; if (now - quietSince > 800) finishSegment(); } else quietSince = 0;
        if (now - e.startedAt > MAX_SEGMENT_MS) finishSegment();
      }
    }, 60);
    publish({ running: true, starting: false });
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop()); void ctx?.close().catch(() => undefined);
    publish({ starting: false, running: false, error: friendly(err) });
  }
}

function pickMime(): string | undefined {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return undefined;
}

function beginSegment() {
  const e = engine; if (!e || e.rec) return;
  try {
    const rec = new MediaRecorder(e.stream, { mimeType: pickMime() });
    e.chunks = []; e.rec = rec; e.startedAt = performance.now();
    rec.ondataavailable = (ev) => { if (ev.data.size) e.chunks.push(ev.data); };
    rec.onstop = () => {
      const ms = performance.now() - e.startedAt, blob = new Blob(e.chunks, { type: rec.mimeType || "audio/webm" });
      e.rec = null; e.chunks = [];
      publish({ recording: false });
      if (ms < MIN_SEGMENT_MS) return;                                        // a cough or a click is not a sentence
      e.queue.push({ blob, ms, endedAt: performance.now() });
      publish({ pending: e.queue.length });
      void work();
    };
    rec.start();
    publish({ recording: true });
  } catch (err) { publish({ error: friendly(err) }); }
}
function finishSegment() { try { engine?.rec?.stop(); } catch { /* already stopped */ } }

/** Hold the talk button: record while held. */
export function talkStart() { const e = engine; if (!e) return; e.talkHeld = true; beginSegment(); }
export function talkEnd() { const e = engine; if (!e) return; e.talkHeld = false; finishSegment(); }
export function setElevenAuto(on: boolean) { updateElevenSettings({ auto: on }); if (engine) engine.autoOn = on; }
export function setElevenMonitor(on: boolean) { const e = engine; if (!e) return; e.monitorGain.gain.setTargetAtTime(on ? 1 : 0, e.ctx.currentTime, 0.03); if (on) void e.monitorEl.play().catch(() => undefined); else e.monitorEl.pause(); }

/** The sentences one after the other: send, wait, play – so answers never talk over each other. */
async function work() {
  const e = engine; if (!e || e.working) return;
  e.working = true;
  try {
    while (engine === e && e.queue.length) {
      const seg = e.queue.shift()!;
      publish({ pending: e.queue.length, sending: true });
      try {
        const mp3 = await elevenSpeechToSpeech(seg.blob, state.settings.voiceId);
        const audio = await e.ctx.decodeAudioData(await mp3.arrayBuffer());
        publish({ sending: false, playing: true, lastDelayMs: Math.round(performance.now() - seg.endedAt), sentences: state.sentences + 1, sentSeconds: state.sentSeconds + seg.ms / 1000, error: null });
        await new Promise<void>((done) => { const n = e.ctx.createBufferSource(); n.buffer = audio; n.connect(e.out); n.onended = () => done(); n.start(); });
      } catch (err) { publish({ error: friendly(err) }); }
      finally { publish({ sending: false, playing: false }); }
    }
  } finally { e.working = false; }
}

export function stopEleven(error: string | null = null) {
  const e = engine; engine = null; e?.stop();
  publish({ running: false, starting: false, recording: false, sending: false, playing: false, pending: 0, level: 0, error });
}

function friendly(e: unknown): string {
  const name = (e as { name?: string })?.name, msg = (e as Error)?.message ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Der Zugriff auf das Mikrofon ist gesperrt – in der Adresszeile des Browsers erlauben.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Das gewählte Mikrofon wurde nicht gefunden – ein anderes wählen oder „Geräte laden“ tippen.";
  if (name === "NotReadableError") return "Das Mikrofon wird gerade von einem anderen Programm benutzt.";
  if (name === "EncodingError") return "Die Antwort von ElevenLabs ließ sich nicht abspielen.";
  return msg || "Das hat nicht geklappt.";
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => { engine?.stop(); engine = null; });
