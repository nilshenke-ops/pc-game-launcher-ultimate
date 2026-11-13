// "Audio" area of the island (3.57), like a call check: which speaker and which microphone the PC uses (switch the Windows default, play a
// test tone, measure the microphone), mute the microphone, and look into this device's camera before a call. Only real devices and values.
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Headphones, Mic, MicOff, Monitor, Play, Volume2 } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useEvent, useRpc } from "../lib/hooks";
import type { AudioDevice } from "../lib/types";
import type { usePcControls, usePcSensors } from "./island-extra";

interface AudioState { supported: boolean; unsupportedReason?: string; devices: AudioDevice[] }
interface MicTestResult { peak: number; verdict: "silent" | "quiet" | "ok" | "clipping" }
const VERDICT: Record<MicTestResult["verdict"], string> = {
  silent: "Nichts zu hören – ist das Mikrofon stumm oder ein anderes gewählt?",
  quiet: "Sehr leise – näher ran oder lauter stellen.",
  ok: "Klingt gut.",
  clipping: "Übersteuert – leiser stellen.",
};

export function IslandAudio({ online, canUse, canManage, controls, sensors }: {
  online: boolean; canUse: boolean; canManage: boolean;
  controls: ReturnType<typeof usePcControls>; sensors: ReturnType<typeof usePcSensors>;
}) {
  const st = useRpc<AudioState>("audio.state", {}, ["audio"], online);
  const [level, setLevel] = useState<number | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; r: MicTestResult } | null>(null);
  useEvent<{ level: number }>("audio.micTest", (d) => setLevel(d.level));
  const [volLocal, setVolLocal] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const c = controls.data;
  useEffect(() => setVolLocal(null), [c?.volume]);

  if (!online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  const devices = st.data?.devices ?? [];
  const outs = devices.filter((d) => d.flow === "render"), mics = devices.filter((d) => d.flow === "capture");
  const micMuted = sensors.data?.micMuted ?? null;

  const setDefault = async (d: AudioDevice) => {
    try { await client.call("controls.setDefaultDevice", { id: d.id, flow: d.flow }); toast(t("{n} ist jetzt Standard", { n: d.name }), "success"); st.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const tone = async (d: AudioDevice) => {
    try { await client.call("audio.testTone", { target: "output", deviceId: d.id, volume: 60 }); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const micTest = async (d: AudioDevice) => {
    setTesting(d.id); setLevel(0); setResult(null);
    try { setResult({ id: d.id, r: await client.call<MicTestResult>("audio.micTest", { deviceId: d.id }) }); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setTesting(null); setLevel(null); }
  };
  const vol = volLocal ?? c?.volume ?? null;
  const sendVol = (v: number) => {
    setVolLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => client.call("controls.set", { volume: v, ...(c?.muted ? { muted: false } : {}) }).catch((e: Error) => { toast(e.message, "error"); setVolLocal(null); }), 110);
  };

  const defOut = outs.find((d) => d.isDefault) ?? outs[0];
  const defMic = mics.find((d) => d.isDefault) ?? mics[0];
  const noDevices = st.data && !st.data.supported ? t("Geräte zeigt nur der Windows-Begleiter.") : st.loading ? t("Geräte werden gelesen …") : null;
  const toggleMute = () => client.call("controls.micMute", { muted: !micMuted }).then(() => sensors.reload(), (e: Error) => toast(e.message, "error"));
  return (
    <div className="isl3-call">
      <div className={`isl3-callmute${micMuted ? " on" : ""}`}>
        <button type="button" className="isl3-bigmute" disabled={!canUse || micMuted == null} aria-pressed={!!micMuted} onClick={() => void toggleMute()}
          aria-label={micMuted ? t("Mikrofon einschalten") : t("Mikrofon stummschalten")}>{micMuted ? <MicOff size={34} /> : <Mic size={34} />}</button>
        <b>{micMuted == null ? t("Mikrofon") : micMuted ? t("Stumm") : t("Mikrofon an")}</b>
        <span className="isl2-sub">{micMuted == null ? t("Nur mit dem Windows-Begleiter.") : micMuted ? t("Tippen zum Sprechen") : sensors.data?.micInUse ? t("benutzt: {n}", { n: sensors.data.micApp ?? "?" }) : t("Tippen zum Stummschalten")}</span>
      </div>
      <div className="isl3-callrows">
        <DeviceRow label={t("Lautsprecher")} icon={<Headphones size={15} />} list={outs} current={defOut} fill={c?.muted ? 0 : vol ?? 0} canSet={canUse} onSet={setDefault} empty={noDevices}
          action={defOut && <button type="button" className="isl3-chipbtn" disabled={!canUse} onClick={() => void tone(defOut)}><Play size={12} /> {t("Testen")}</button>} />
        <DeviceRow label={t("Mikrofon")} icon={micMuted ? <MicOff size={15} /> : <Mic size={15} />} list={mics} current={defMic} fill={testing ? Math.min(100, (level ?? 0) * 400) : 0} canSet={canUse} onSet={setDefault} empty={noDevices}
          action={defMic && <button type="button" className="isl3-chipbtn" disabled={!canManage || !!testing} onClick={() => void micTest(defMic)}>{testing ? t("Hört zu …") : t("Testen")}</button>} />
        {result && <span className={`isl3-verdict ${result.r.verdict}`} role="status">{t(VERDICT[result.r.verdict])}</span>}
        {vol != null && <span className="isl3-callvol"><Volume2 size={13} aria-hidden /><span className="isl3-hbar sm" style={{ ["--v" as string]: c?.muted ? 0 : vol } as React.CSSProperties}><span className="isl3-hfill" aria-hidden /><input type="range" min={0} max={100} value={vol} disabled={!canUse} aria-label={t("Lautstärke am PC")} onChange={(e) => sendVol(Number(e.target.value))} /></span><i>{c?.muted ? t("Stumm") : `${vol} %`}</i></span>}
        <CameraCheck />
      </div>
    </div>
  );
}

/** One device kind as a row: its icon, the device in use (a list to switch the Windows default), a fill (volume or level) and a test. */
function DeviceRow({ label, icon, list, current, fill, canSet, onSet, empty, action }: {
  label: string; icon: React.ReactNode; list: AudioDevice[]; current?: AudioDevice; fill: number; canSet: boolean;
  onSet: (d: AudioDevice) => void; empty: string | null; action: React.ReactNode;
}) {
  return (
    <div className="isl3-drow" style={{ ["--v" as string]: fill } as React.CSSProperties}>
      <span className="isl3-dfill" aria-hidden />
      <span className="isl3-dic" aria-hidden>{icon}</span>
      {list.length
        ? <select className="isl3-dsel" value={current?.id ?? ""} disabled={!canSet || list.length < 2} aria-label={label}
            onChange={(e) => { const d = list.find((x) => x.id === e.target.value); if (d) onSet(d); }}>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        : <span className="isl3-dsel none"><b>{label}</b><i>{empty ?? t("Kein Gerät gefunden.")}</i></span>}
      {action}
    </div>
  );
}

/** This device's camera, shown only here and only while the check runs – nothing is recorded or sent anywhere. */
function CameraCheck() {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stop = () => { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; setOn(false); };
  useEffect(() => stop, []);
  const start = async () => {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) { setErr(t("Dieses Fenster darf die Kamera nicht benutzen (nur über https oder am PC selbst).")); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: false });
      stream.current = s; setOn(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined); } });
    } catch (e) {
      const name = (e as DOMException).name;
      setErr(name === "NotAllowedError" ? t("Kamera nicht erlaubt – in den Einstellungen des Browsers freigeben.") : name === "NotFoundError" ? t("Keine Kamera an diesem Gerät gefunden.") : t("Kamera nicht verfügbar: {e}", { e: (e as Error).message }));
    }
  };
  return (
    <>
      <button type="button" className={`isl3-cambtn${on ? " on" : ""}`} aria-pressed={on} onClick={() => (on ? stop() : void start())}>
        {on ? <CameraOff size={14} aria-hidden /> : <Camera size={14} aria-hidden />} {on ? t("Kamera beenden") : t("Kamera prüfen")}
      </button>
      {err && !on && <span className="isl2-sub isl3-camerr" role="status">{err}</span>}
      {on && (
        <div className="isl3-campop">
          <video ref={video} muted playsInline aria-label={t("Bild der Kamera")} />
          <span className="isl3-camnote">{t("Nur auf diesem Gerät – nichts wird gespeichert oder gesendet.")}</span>
        </div>
      )}
    </>
  );
}
