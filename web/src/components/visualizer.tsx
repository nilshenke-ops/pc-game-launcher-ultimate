// Music visualizer – only from real sound: the PC sound shared with the browser (on the PC: "Systemaudio teilen"),
// the microphone, or an own audio file. The browser analyses it itself (Web Audio); nothing is recorded or sent.
// Without a source nothing moves – there are no made-up bars.
import { useEffect, useRef, useState } from "react";
import { FileAudio, Mic, MonitorSpeaker, Square } from "lucide-react";
import { t } from "../lib/i18n";
import { readJson, writeJson } from "../lib/rpc";
import { Button, Segmented } from "./ui";
import { reducedMotion } from "./launch-cinema";
import { bands } from "../lib/audio-bands";

type Style = "bars" | "wave" | "ring";
type Source = "system" | "mic" | "file";
const KEY = "pgl.viz";

const canShareTab = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
const canMic = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function Visualizer({ compact }: { compact?: boolean }) {
  const [style, setStyleState] = useState<Style>(() => (["bars", "wave", "ring"].includes(readJson<string>(KEY) ?? "") ? (readJson<string>(KEY) as Style) : "bars"));
  const [source, setSource] = useState<Source | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);
  const styleRef = useRef(style); styleRef.current = style;
  const setStyle = (s: Style) => { setStyleState(s); writeJson(KEY, s); };

  const stop = () => { run.current?.stop(); run.current = null; setSource(null); };
  useEffect(() => stop, []);

  const start = async (src: Source, file?: File) => {
    stop(); setError(null);
    let stream: MediaStream | null = null;
    let audioEl: HTMLAudioElement | null = null;
    try {
      if (src === "system") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((tr) => tr.stop()); // only the sound is used
        if (!stream.getAudioTracks().length) throw new Error(t("Es wurde kein Ton geteilt. Beim Teilen „Systemaudio teilen“ (bzw. „Tab-Audio teilen“) ankreuzen."));
        setLabel(t("PC-Ton (geteilt)"));
      } else if (src === "mic") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        setLabel(t("Mikrofon"));
      } else if (file) {
        if (!file.type.startsWith("audio/")) throw new Error(t("Das ist keine Audiodatei."));
        audioEl = new Audio(URL.createObjectURL(file));
        audioEl.loop = true;
        setLabel(file.name.slice(0, 40));
      }
    } catch (e) {
      stream?.getTracks().forEach((tr) => tr.stop());
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? t("Zugriff nicht erlaubt.") : err.message || t("Quelle nicht verfügbar."));
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.78;
    let node: AudioNode;
    if (audioEl) { node = ctx.createMediaElementSource(audioEl); node.connect(ctx.destination); await audioEl.play().catch(() => {}); }
    else node = ctx.createMediaStreamSource(stream!);
    node.connect(analyser);
    const freq = new Uint8Array(analyser.frequencyBinCount), wave = new Uint8Array(analyser.fftSize);
    const still = reducedMotion();
    let raf = 0, last = 0, stopped = false;
    const draw = (now: number) => {
      raf = 0;
      if (stopped) return;
      raf = requestAnimationFrame(draw);
      if (document.visibilityState === "hidden" || now - last < (still ? 150 : 33)) return;
      last = now;
      const c = canvas.current; const g = c?.getContext("2d");
      if (!c || !g) return;
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(1.5, devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const css = getComputedStyle(document.documentElement);
      const p = css.getPropertyValue("--primary").trim() || "#22d3ee", a = css.getPropertyValue("--accent").trim() || "#a78bfa";
      const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, p); grad.addColorStop(1, a);
      const s = styleRef.current;
      if (s === "wave") {
        analyser.getByteTimeDomainData(wave);
        g.strokeStyle = grad; g.lineWidth = 2.5; g.beginPath();
        for (let i = 0; i < wave.length; i++) { const x = (i / (wave.length - 1)) * w, y = (wave[i] / 255) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      } else {
        analyser.getByteFrequencyData(freq);
        const n = s === "ring" ? 48 : compact ? 24 : 40;
        const v = bands(freq, n);
        if (s === "bars") {
          const bw = w / n;
          v.forEach((x, i) => { const bh = Math.max(2, x * h * 0.95); g.fillStyle = grad; g.fillRect(i * bw + 1, h - bh, bw - 2, bh); });
        } else {
          const cx = w / 2, cy = h / 2, r0 = Math.min(w, h) * 0.22, r1 = Math.min(w, h) * 0.48;
          g.strokeStyle = grad; g.lineWidth = Math.max(2, (Math.PI * 2 * r0) / n - 2); g.lineCap = "round";
          v.forEach((x, i) => { const ang = (i / n) * Math.PI * 2 - Math.PI / 2, r = r0 + x * (r1 - r0); g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); g.stroke(); });
        }
      }
    };
    raf = requestAnimationFrame(draw);
    // The user ends sharing in the browser bar → stop here too.
    stream?.getAudioTracks().forEach((tr) => tr.addEventListener("ended", () => stop()));
    run.current = {
      ctx,
      stop: () => {
        stopped = true; cancelAnimationFrame(raf);
        stream?.getTracks().forEach((tr) => tr.stop());
        if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); }
        void ctx.close();
      },
    };
    setSource(src);
  };

  return (
    <div className="viz stack-sm">
      {source ? (
        <>
          <canvas ref={canvas} className={`viz-canvas ${compact ? "compact" : ""}`} role="img" aria-label={t("Musik-Visualizer: {s}", { s: label })} />
          <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="tiny muted">{t("Echte Audiodaten: {s}", { s: label })}</span>
            <div className="row" style={{ gap: 6 }}>
              <Segmented value={style} onChange={setStyle} label={t("Darstellung")} options={[{ value: "bars", label: t("Balken") }, { value: "wave", label: t("Welle") }, { value: "ring", label: t("Kreis") }]} />
              <Button size="sm" icon={<Square size={13} />} onClick={stop}>{t("Stopp")}</Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>{t("Bewegt sich nur zu echtem Ton – wähle eine Quelle. Der Ton wird nur hier im Browser ausgewertet, nichts wird aufgenommen oder gesendet.")}</p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {canShareTab() && <Button size="sm" icon={<MonitorSpeaker size={14} />} onClick={() => void start("system")}>{t("PC-Ton teilen")}</Button>}
            {canMic() && <Button size="sm" icon={<Mic size={14} />} onClick={() => void start("mic")}>{t("Mikrofon")}</Button>}
            <label className="btn sm"><FileAudio size={14} />{t("Audiodatei")}<input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void start("file", f); }} /></label>
          </div>
          {canShareTab() && <p className="tiny muted" style={{ margin: 0 }}>{t("„PC-Ton teilen“: im Fenster „Gesamter Bildschirm“ wählen und „Systemaudio teilen“ ankreuzen (Chrome/Edge unter Windows).")}</p>}
          {error && <p className="tiny" style={{ margin: 0, color: "var(--danger, #f87171)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}
