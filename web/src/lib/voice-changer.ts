// The Discord voice changer. The microphone goes through the chain of voice stages and out to a virtual audio cable ("CABLE Input");
// in Discord the input device is then "CABLE Output" – so the friends hear the changed voice. It is one engine for the whole app:
// it keeps running while other pages are open (only closing the tab/window stops it).
//
//   mic → trim → [dry]──────────────────────────────┐
//              └ pitch → ring → vibrato → band → drive → bass/treble → echo → reverb ─┴→ volume → limiter → output (cable) [+ monitor]

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { effectivePitch, scaleVoice, voiceById, type VoicePreset } from "./voice-presets";

export interface VoiceSettings {
  voice: string;
  /** Fine tuning on top of the voice, in semitones (−6 … +6). */
  trim: number;
  /** How strong the voice is, 0.2 … 1 (less = easier to understand). */
  strength: number;
  micId: string;
  outId: string;
  /** Microphone gain 0 … 2. */
  micGain: number;
  /** Output volume 0 … 1.5. */
  volume: number;
  /** Hear yourself on the default speakers/headphones. */
  monitor: boolean;
  /** The browser's own noise suppression and echo cancelling. */
  clean: boolean;
}
export interface VoiceState {
  running: boolean;
  starting: boolean;
  /** Test mode: you hear yourself on the default headphones/speakers; nothing goes to Discord. */
  testing: boolean;
  error: string | null;
  /** Level at the microphone and at the output, 0 … 1. */
  inLevel: number;
  /** Running for a while but the microphone delivers nothing at all (wrong or muted microphone). */
  micSilent: boolean;
  outLevel: number;
  /** Which output the voice really goes to ("cable", "default" or "other") – only while running. */
  route: "cable" | "default" | "other" | null;
  settings: VoiceSettings;
}
export interface DeviceInfo { id: string; label: string; cable: boolean }

const KEY = "pgl.voicechanger";
export const DEFAULTS: VoiceSettings = { voice: "original", trim: 0, strength: 0.7, micId: "", outId: "", micGain: 1, volume: 1, monitor: false, clean: true };
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function readSettings(): VoiceSettings {
  const r = readJson<Partial<VoiceSettings>>(KEY) ?? {};
  return {
    voice: voiceById(typeof r.voice === "string" ? r.voice : "").id,
    trim: clamp(r.trim, -6, 6, 0), strength: clamp(r.strength, 0.2, 1, 0.7), micId: typeof r.micId === "string" ? r.micId : "", outId: typeof r.outId === "string" ? r.outId : "",
    micGain: clamp(r.micGain, 0, 2, 1), volume: clamp(r.volume, 0, 1.5, 1), monitor: r.monitor === true, clean: r.clean !== false,
  };
}

/** A virtual audio cable by its name (VB-Audio "CABLE", Voicemeeter, other virtual devices). */
export const isCableName = (label: string) => /cable|vb-audio|voicemeeter|virtual/i.test(label);
/** The cable's two ends: Discord must listen to the "Output", the voice changer writes to the "Input". */
export const isCableInput = (label: string) => /cable.?input|vb-audio.*input|voicemeeter.*input/i.test(label);
export const isCableOutput = (label: string) => /cable.?output|vb-audio.*output|voicemeeter.*output/i.test(label);

export const voiceChangerSupported = () =>
  typeof window !== "undefined" && typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const canSinkContext = () => typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
const canSinkElement = () => typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
/** Can this browser send audio to a chosen device (needed for the cable)? Chrome and Edge can, Firefox and Safari cannot. */
export const canChooseOutput = () => canSinkContext() || canSinkElement();

/** Microphones and outputs; labels only show once the microphone was allowed (asked here once). */
export async function listDevices(ask = true): Promise<{ inputs: DeviceInfo[]; outputs: DeviceInfo[]; labelsKnown: boolean }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [], labelsKnown: false };
  let all = await navigator.mediaDevices.enumerateDevices();
  if (ask && all.some((d) => d.kind === "audioinput" && !d.label)) {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); all = await navigator.mediaDevices.enumerateDevices(); } catch { /* not allowed: the list stays unnamed */ }
  }
  const map = (d: MediaDeviceInfo, fallback: string): DeviceInfo => ({ id: d.deviceId, label: d.label || fallback, cable: isCableName(d.label) });
  return {
    inputs: all.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications").map((d, i) => map(d, `Mikrofon ${i + 1}`)),
    outputs: all.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications").map((d, i) => map(d, `Ausgabe ${i + 1}`)),
    labelsKnown: all.some((d) => !!d.label),
  };
}

/** What to pick without being asked: the cable's input for the output, and a real microphone (never the cable's output) for the input. */
export function suggestDevices(inputs: DeviceInfo[], outputs: DeviceInfo[]): { micId: string; outId: string } {
  const out = outputs.find((d) => isCableInput(d.label)) ?? outputs.find((d) => d.cable);
  const mic = inputs.find((d) => d.id === "default" && !d.cable) ?? inputs.find((d) => !d.cable);
  return { micId: mic?.id ?? "", outId: out?.id ?? "" };
}

// ------------------------------------------------------------------ the engine

let state: VoiceState = { running: false, starting: false, testing: false, error: null, inLevel: 0, outLevel: 0, micSilent: false, route: null, settings: readSettings() };
const listeners = new Set<() => void>();
const publish = (patch: Partial<VoiceState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const voiceState = () => state;
export const useVoiceChanger = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);

interface Engine {
  ctx: AudioContext; stream: MediaStream; apply(v: VoicePreset, trim: number, strength: number): void;
  micGain: GainNode; volume: GainNode; monitorGain: GainNode; monitorEl: HTMLAudioElement | null; monitorDest: MediaStreamAudioDestinationNode;
  outEl: HTMLAudioElement | null; timer: number; stop(): void;
}
let engine: Engine | null = null;

const workletUrl = () => new URL("./voice-pitch-worklet.js", import.meta.url).href;

function driveCurve(k: number) {
  if (k <= 0) return new Float32Array([-1, 1]);                         // straight line: no change
  const n = 1024, c = new Float32Array(n), deg = Math.PI / 180;
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x)); }
  return c;
}
function roomImpulse(ctx: BaseAudioContext, seconds = 2.2) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  return buf;
}

/** Builds the chain of stages once; the returned function moves all numbers to a voice (smoothly, so switching never clicks). */
export function buildChain(ctx: AudioContext, pitch: AudioWorkletNode) {
  const input = ctx.createGain(), output = ctx.createGain();
  const dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry); dry.connect(output);
  input.connect(pitch);
  // ring modulation: the signal times a sine; mixed with itself
  const ringDry = ctx.createGain(), ringWet = ctx.createGain(), ringMul = ctx.createGain(), ringOsc = ctx.createOscillator(), ringOut = ctx.createGain();
  ringMul.gain.value = 0; ringOsc.frequency.value = 50; ringOsc.connect(ringMul.gain); ringOsc.start();
  pitch.connect(ringDry); pitch.connect(ringMul); ringMul.connect(ringWet); ringDry.connect(ringOut); ringWet.connect(ringOut);
  // vibrato: a delay whose time wobbles
  const vib = ctx.createDelay(0.1), lfo = ctx.createOscillator(), lfoDepth = ctx.createGain();
  vib.delayTime.value = 0.004; lfo.frequency.value = 5; lfoDepth.gain.value = 0; lfo.connect(lfoDepth); lfoDepth.connect(vib.delayTime); lfo.start();
  ringOut.connect(vib);
  // band filter
  const hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 20; hp.Q.value = 0.7; lp.type = "lowpass"; lp.frequency.value = 20000; lp.Q.value = 0.7;
  vib.connect(hp); hp.connect(lp);
  // distortion
  const shaper = ctx.createWaveShaper(); shaper.curve = driveCurve(0); shaper.oversample = "2x";
  lp.connect(shaper);
  // bass / treble
  const low = ctx.createBiquadFilter(), high = ctx.createBiquadFilter();
  low.type = "lowshelf"; low.frequency.value = 220; low.gain.value = 0; high.type = "highshelf"; high.frequency.value = 3500; high.gain.value = 0;
  shaper.connect(low); low.connect(high);
  // echo
  const echoDelay = ctx.createDelay(1), echoFb = ctx.createGain(), echoWet = ctx.createGain(), echoOut = ctx.createGain();
  echoDelay.delayTime.value = 0.2; echoFb.gain.value = 0; echoWet.gain.value = 0;
  high.connect(echoOut); high.connect(echoDelay); echoDelay.connect(echoFb); echoFb.connect(echoDelay); echoDelay.connect(echoWet); echoWet.connect(echoOut);
  // reverb
  const conv = ctx.createConvolver(), reverbWet = ctx.createGain();
  conv.buffer = roomImpulse(ctx); reverbWet.gain.value = 0;
  echoOut.connect(wet); echoOut.connect(conv); conv.connect(reverbWet); reverbWet.connect(wet);
  wet.connect(output);

  const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, ctx.currentTime, 0.03);
  const apply = (preset: VoicePreset, trim: number, strength: number) => {
    const v = scaleVoice(preset, strength);
    const plain = preset.id === "original" && trim === 0;
    set(dry.gain, plain ? 1 : 0); set(wet.gain, plain ? 0 : 1);
    (pitch.parameters.get("ratio") as AudioParam).setTargetAtTime(effectivePitch(v, trim), ctx.currentTime, 0.02);
    const ring = v.ring; set(ringWet.gain, ring?.mix ?? 0); set(ringDry.gain, 1 - (ring?.mix ?? 0)); if (ring) ringOsc.frequency.setTargetAtTime(ring.hz, ctx.currentTime, 0.03);
    set(lfoDepth.gain, (v.vibrato?.ms ?? 0) / 1000); if (v.vibrato) lfo.frequency.setTargetAtTime(v.vibrato.hz, ctx.currentTime, 0.03);
    set(hp.frequency, v.band?.low ?? 20); set(lp.frequency, v.band?.high ?? 20000);
    shaper.curve = driveCurve(v.drive ?? 0);
    set(low.gain, v.lowShelf ?? 0); set(high.gain, v.highShelf ?? 0);
    set(echoWet.gain, v.echo?.mix ?? 0); set(echoFb.gain, v.echo?.feedback ?? 0); if (v.echo) set(echoDelay.delayTime, v.echo.time);
    set(reverbWet.gain, v.reverb ?? 0);
  };
  return { input, output, apply, stop() { try { ringOsc.stop(); lfo.stop(); } catch { /* already stopped */ } } };
}

export function updateSettings(patch: Partial<VoiceSettings>) {
  const next = { ...state.settings, ...patch };
  writeJson(KEY, next);
  publish({ settings: next });
  if (!engine) return;
  const e = engine;
  if ("voice" in patch || "trim" in patch || "strength" in patch) e.apply(voiceById(next.voice), next.trim, next.strength);
  if ("micGain" in patch) e.micGain.gain.setTargetAtTime(next.micGain, e.ctx.currentTime, 0.03);
  if ("volume" in patch) e.volume.gain.setTargetAtTime(next.volume, e.ctx.currentTime, 0.03);
  if ("monitor" in patch) {
    e.monitorGain.gain.setTargetAtTime(next.monitor ? 1 : 0, e.ctx.currentTime, 0.03);
    if (next.monitor) void e.monitorEl?.play().catch(() => undefined); else e.monitorEl?.pause();
  }
}

export async function startVoiceChanger(opts: { test?: boolean } = {}): Promise<void> {
  if (engine || state.starting) return;
  if (!voiceChangerSupported()) { publish({ error: "Dieser Browser kann das nicht: Chrome oder Edge am PC nehmen." }); return; }
  publish({ starting: true, error: null });
  const test = !!opts.test;
  // Test: straight to the default headphones/speakers with almost no delay (no audio element in between), nothing to the cable.
  const s = test ? { ...state.settings, outId: "", monitor: false } : state.settings;
  let ctx: AudioContext | null = null, stream: MediaStream | null = null;
  try {
    ctx = new AudioContext({ latencyHint: "interactive" });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(s.micId ? { deviceId: { exact: s.micId } } : {}), echoCancellation: s.clean, noiseSuppression: s.clean, autoGainControl: s.clean, channelCount: 1 },
    });
    await ctx.audioWorklet.addModule(workletUrl());
    const pitch = new AudioWorkletNode(ctx, "pgl-pitch", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const src = ctx.createMediaStreamSource(stream);
    const micGain = ctx.createGain(); micGain.gain.value = s.micGain;
    const chain = buildChain(ctx, pitch);
    const volume = ctx.createGain(); volume.gain.value = s.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.08;
    src.connect(micGain); micGain.connect(chain.input); chain.output.connect(volume); volume.connect(limiter);
    const inAn = ctx.createAnalyser(), outAn = ctx.createAnalyser(); inAn.fftSize = outAn.fftSize = 2048;
    micGain.connect(inAn); limiter.connect(outAn);

    // The way out: straight to the chosen device when the browser allows it for the whole audio context, otherwise through an audio element.
    let outEl: HTMLAudioElement | null = null;
    let route: VoiceState["route"] = "default";
    const wantOut = s.outId && s.outId !== "default";
    if (test) {
      limiter.connect(ctx.destination);
    } else if (wantOut && canSinkContext()) {
      await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(s.outId);
      limiter.connect(ctx.destination);
    } else if (wantOut && canSinkElement()) {
      const dest = ctx.createMediaStreamDestination(); limiter.connect(dest);
      outEl = new Audio(); outEl.srcObject = dest.stream;
      await (outEl as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(s.outId);
      await outEl.play();
    } else {
      limiter.connect(ctx.destination);
    }
    if (wantOut) route = "other";
    // Monitoring ("hear yourself") always on the default device, through its own element.
    const monitorDest = ctx.createMediaStreamDestination(), monitorGain = ctx.createGain();
    monitorGain.gain.value = s.monitor ? 1 : 0; limiter.connect(monitorGain); monitorGain.connect(monitorDest);
    const monitorEl = new Audio(); monitorEl.srcObject = monitorDest.stream;
    if (s.monitor) await monitorEl.play().catch(() => undefined);
    chain.apply(voiceById(s.voice), s.trim, s.strength);
    if (ctx.state === "suspended") await ctx.resume();

    const levelOf = (an: AnalyserNode) => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return Math.min(1, m); };
    // Peak meter with a slow fall, so a short sound does not flicker past unseen.
    let inHold = 0, outHold = 0, quietSince = performance.now(), everHeard = false;
    const timer = window.setInterval(() => {
      const rawIn = levelOf(inAn);
      if (rawIn > 0.004) { everHeard = true; quietSince = performance.now(); }
      const silent = !everHeard && performance.now() - quietSince > 6000;       // 6 s with not a whisper from the microphone
      if (silent !== state.micSilent) publish({ micSilent: silent });
      inHold = Math.max(rawIn, inHold * 0.86); outHold = Math.max(levelOf(outAn), outHold * 0.86);
      const a = inHold < 0.01 ? 0 : inHold, b = outHold < 0.01 ? 0 : outHold;
      if (Math.abs(a - state.inLevel) > 0.02 || Math.abs(b - state.outLevel) > 0.02 || (a === 0 && state.inLevel !== 0) || (b === 0 && state.outLevel !== 0)) publish({ inLevel: a, outLevel: b });
    }, 90);
    const track = stream.getAudioTracks()[0];
    track?.addEventListener("ended", () => { void stopVoiceChanger("Das Mikrofon wurde getrennt – bitte neu starten."); });
    const owned = { ctx, stream };
    engine = {
      ctx, stream, apply: chain.apply, micGain, volume, monitorGain, monitorEl, monitorDest, outEl, timer,
      stop() { window.clearInterval(timer); chain.stop(); owned.stream.getTracks().forEach((t) => t.stop()); outEl?.pause(); monitorEl.pause(); void owned.ctx.close().catch(() => undefined); },
    };
    const cableOut = !!wantOut;
    publish({ running: true, starting: false, testing: test, route: cableOut ? "other" : route });
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => undefined);
    publish({ starting: false, running: false, error: friendly(e) });
  }
}

export async function stopVoiceChanger(error: string | null = null): Promise<void> {
  const e = engine; engine = null;
  e?.stop();
  publish({ running: false, starting: false, testing: false, inLevel: 0, outLevel: 0, micSilent: false, route: null, error });
}

function friendly(e: unknown): string {
  const name = (e as { name?: string })?.name, msg = (e as Error)?.message ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Der Zugriff auf das Mikrofon ist gesperrt – in der Adresszeile des Browsers erlauben.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Das gewählte Mikrofon wurde nicht gefunden – ein anderes wählen oder „Geräte laden“ tippen.";
  if (name === "NotReadableError") return "Das Mikrofon wird gerade von einem anderen Programm benutzt.";
  if (/setSinkId|sink/i.test(msg)) return "Die Ausgabe (virtuelles Kabel) ließ sich nicht wählen – anderes Gerät wählen oder „Geräte laden“ tippen.";
  return msg || "Der Stimmenwechsler konnte nicht starten.";
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => { engine?.stop(); engine = null; });
