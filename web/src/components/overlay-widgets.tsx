import { useState } from "react";
import { Circle, Clapperboard, Mic, MicOff, Square, Timer, Volume2, VolumeX } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { CAPTURE_PROVIDERS, type CaptureStatus } from "../lib/capture";
import type { Sound, SoundsFile } from "../lib/types";

/** Everything the recording widget and the bar's record chip need: which program does what, whether it can right now, and the action runner. */
export function useCapture() {
  const cap = useRpc<CaptureStatus>("capture.status", {}, ["capture", "obs", "settings"]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const c = cap.data;
  const fp = c ? (c.effectiveProviders ?? { record: c.provider, replay: c.provider, buffer: c.provider }) : null;
  const obs = c?.obs;
  const can = (a: "record" | "replay" | "buffer") => {
    if (!c || !fp) return false;
    const p = c.providers.find((x) => x.id === fp[a]);
    return !!p && p.actions.includes(a) && (fp[a] === "obs" ? !!obs?.connected : !!p.effective?.[a]);
  };
  const recording = !!fp && fp.record === "obs" && !!obs?.recording;
  const run = async (method: string, params?: Record<string, unknown>) => {
    setBusy(method);
    try { const r = await client.call<{ message?: string }>(method, params); setMsg({ text: t(r?.message ?? "OK") }); cap.reload(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
    setBusy(null);
  };
  return { c, fp, obs, can, recording, run, msg, busy, loading: !c };
}

/** The small record chip in the overlay bar: a red dot and the running time while recording, one tap to start or stop – visible even when the recording widget is hidden. */
export function RecChip() {
  const k = useCapture();
  if (k.loading || !k.can("record")) return null;
  const tc = k.obs?.recordTimecode?.slice(0, 8);
  return (
    <button className={`gb-rec${k.recording ? " on" : ""}`} disabled={k.busy !== null} onClick={() => void k.run("capture.recordToggle")}
      aria-label={k.recording ? t("Aufnahme stoppen") : t("Aufnahme starten")} title={k.recording ? t("Aufnahme stoppen") : t("Aufnahme starten")}>
      <i aria-hidden />{k.recording && tc ? <span>{tc}</span> : null}
    </button>
  );
}

/** Mute button for OBS's microphone in the bar – so you can mute without leaving the game. Only shown when OBS is connected and has a microphone. */
export function MicChip() {
  const k = useCapture();
  const mic = k.obs?.mic;
  if (k.loading || !k.obs?.connected || !mic) return null;
  return (
    <button className={`gb-mic${mic.muted ? " on" : ""}`} disabled={k.busy !== null} onClick={() => void k.run("obs.muteToggle", { kind: "mic" })}
      aria-label={mic.muted ? t("Mikrofon einschalten") : t("Mikrofon stummschalten")} title={mic.muted ? t("Mikrofon einschalten") : t("Mikrofon stummschalten")} aria-pressed={mic.muted}>
      {mic.muted ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}

/** Recording with the program(s) chosen under "Overlay & Aufnahme" – OBS with live state, others by their shortcuts. */
export function CaptureWidget() {
  const k = useCapture();
  if (k.loading || !k.fp || !k.c) return <div className="skeleton" style={{ height: 120 }} />;
  const { fp, obs, can, recording, run, msg, busy } = k;
  const name = (id: string) => CAPTURE_PROVIDERS.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const tc = obs?.recordTimecode?.slice(0, 8) ?? "00:00:00";
  const connected = fp.record === "obs" && !!obs?.connected;
  const bufferOn = fp.buffer === "obs" && !!obs?.replayBuffer;
  const sameRecorder = fp.record === fp.replay;
  const state = recording ? "rec" : connected ? "ready" : "idle";
  return (
    <div className="gbr">
      <div className={`gbr-status is-${state}`}>
        <span className="gbr-dot" aria-hidden />
        <div className="gbr-text">
          <b>{recording ? t("Aufnahme läuft") : connected ? t("Bereit") : t("Nicht verbunden")}</b>
          <span>{connected && obs?.error ? obs.error
            : sameRecorder ? t("Aufnahme & Replay über {p}", { p: name(fp.record) })
            : t("Aufnahme: {a} · Replay: {b}", { a: name(fp.record), b: name(fp.replay) })}</span>
        </div>
        <span className="gbr-clock">{recording ? tc : "--:--:--"}</span>
      </div>

      <div className="gbr-actions">
        <button className={`gbr-main${recording ? " stop" : ""}`} disabled={!can("record") || busy !== null} onClick={() => void run("capture.recordToggle")}
          aria-label={recording ? t("Aufnahme stoppen") : t("Aufnahme starten")}>
          {recording ? <Square size={15} fill="currentColor" /> : <Circle size={15} fill="currentColor" />}
          {recording ? t("Stoppen") : t("Aufnehmen")}
        </button>
        <button className="gbr-side" disabled={!can("replay") || busy !== null} onClick={() => void run("capture.replaySave")}>
          <Clapperboard size={15} /> {t("Replay speichern")}
        </button>
      </div>

      <button className={`gbr-buffer${bufferOn ? " on" : ""}`} disabled={!can("buffer") || busy !== null}
        aria-pressed={bufferOn} onClick={() => void run("capture.replayToggle")}>
        <Timer size={15} />
        <span className="gbr-grow">{t("Replay-Puffer")}</span>
        <span className="gbr-pill">{bufferOn ? t("An") : t("Aus")}</span>
      </button>

      {connected && (obs?.scenes ?? []).length > 0 && (
        <div className="gbr-group">
          <span className="gbr-label">{t("Szene")}</span>
          <div className="gbr-scenes" role="group" aria-label={t("Szene wechseln")}>
            {obs!.scenes!.map((n) => (
              <button key={n} className={`gbr-scene${obs!.currentScene === n ? " on" : ""}`} aria-pressed={obs!.currentScene === n} disabled={busy !== null}
                onClick={() => void run("obs.setScene", { scene: n })}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {connected && (obs?.mic || obs?.desktop) && (
        <div className="gbr-group">
          <span className="gbr-label">{t("Ton")}</span>
          <div className="gbr-toggles">
            {obs?.mic && (
              <button className={`gbr-toggle ${obs.mic.muted ? "off" : "on"}`} aria-pressed={!obs.mic.muted} disabled={busy !== null} onClick={() => void run("obs.muteToggle", { kind: "mic" })}>
                {obs.mic.muted ? <MicOff size={14} /> : <Mic size={14} />}
                <span className="gbr-grow">{t("Mikrofon")}</span>
                <span className="gbr-pill">{obs.mic.muted ? t("Stumm") : t("An")}</span>
              </button>
            )}
            {obs?.desktop && (
              <button className={`gbr-toggle ${obs.desktop.muted ? "off" : "on"}`} aria-pressed={!obs.desktop.muted} disabled={busy !== null} onClick={() => void run("obs.muteToggle", { kind: "desktop" })}>
                {obs.desktop.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span className="gbr-grow">{t("Desktop-Ton")}</span>
                <span className="gbr-pill">{obs.desktop.muted ? t("Stumm") : t("An")}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <div className={`gbr-msg${msg.error ? " error" : ""}`} role={msg.error ? "alert" : "status"}>{msg.text}</div>}
      {!connected && fp.record !== "obs" && <p className="gbr-hint">{t("Start und Stopp laufen über die Tastenkürzel von {p}.", { p: name(fp.record) })}</p>}
    </div>
  );
}

/** Sound buttons like on the soundboard page: favourites first. Played on the PC. */
export function SoundboardWidget() {
  const q = useRpc<{ data: SoundsFile; supported: boolean; reason?: string }>("sounds.list", {}, ["sounds"]);
  const [err, setErr] = useState<string | null>(null);
  const sounds = q.data?.data.sounds ?? [];
  const pick: Sound[] = [...sounds.filter((s) => s.favorite), ...sounds.filter((s) => !s.favorite)].slice(0, 12);
  const play = (s: Sound) => client.call("sounds.play", { id: s.id }).then(() => setErr(null), (e: Error) => setErr(e.message));
  if (q.data && !pick.length) return <p className="gb-muted">{t("Noch keine Sounds – im Soundboard hinzufügen.")}</p>;
  return (
    <div className="gb-stack">
      <div className="gb-pad">
        {pick.map((s) => <button key={s.id} className="gb-btn" style={s.color ? { borderLeftColor: s.color } : undefined} onClick={() => play(s)} title={s.name}>{s.name}</button>)}
      </div>
      <button className="gb-btn danger" onClick={() => client.call("sounds.stopAll").catch((e: Error) => setErr(e.message))}><Square size={13} /> {t("Alle stoppen")}</button>
      {(err || (q.data && !q.data.supported)) && <div className="gb-msg error">{err ?? q.data?.reason}</div>}
    </div>
  );
}
