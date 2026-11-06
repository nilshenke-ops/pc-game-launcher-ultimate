import { useState } from "react";
import { Circle, Clapperboard, Square, Timer } from "lucide-react";
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
  const run = async (method: string) => {
    setBusy(method);
    try { const r = await client.call<{ message?: string }>(method); setMsg({ text: t(r?.message ?? "OK") }); cap.reload(); }
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

/** Recording with the program(s) chosen under "Overlay & Aufnahme" – OBS with live state, others by their shortcuts. */
export function CaptureWidget() {
  const k = useCapture();
  if (k.loading || !k.fp || !k.c) return <div className="skeleton" style={{ height: 90 }} />;
  const { fp, obs, can, recording, run, msg, busy } = k;
  const name = (id: string) => CAPTURE_PROVIDERS.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const tc = obs?.recordTimecode?.slice(0, 8);
  const connected = fp.record === "obs" && !!obs?.connected;
  return (
    <div className="gb-stack gb-cap">
      <div className="gb-cap-top">
        <button className={`gb-recbtn${recording ? " on" : ""}`} disabled={!can("record") || busy !== null} onClick={() => void run("capture.recordToggle")}
          aria-label={recording ? t("Stoppen") : t("Aufnehmen")}>
          {recording ? <Square size={20} fill="currentColor" /> : <Circle size={22} fill="currentColor" />}
        </button>
        <div className="gb-cap-info">
          <b className="gb-cap-time">{recording && tc ? tc : "00:00:00"}</b>
          <span className="gb-cap-state"><span className={`gb-dot ${recording ? "rec" : connected ? "ok" : ""}`} />{recording ? t("Aufnahme läuft") : connected ? t("Bereit") : t("Nicht verbunden")}</span>
        </div>
      </div>
      <p className="gb-cap-sub">
        {recording ? t("Aufnahme: {a} · Replay: {b}", { a: name(fp.record), b: name(fp.replay) })
          : fp.record === "obs" && !obs?.connected ? (obs?.error ?? t("OBS nicht verbunden"))
          : t("Aufnahme: {a} · Replay: {b}", { a: name(fp.record), b: name(fp.replay) })}
      </p>
      <div className="gb-buttons">
        <button className={`gb-btn ${recording ? "danger" : "accent"}`} disabled={!can("record") || busy !== null} onClick={() => void run("capture.recordToggle")}>
          {recording ? <Square size={14} /> : <Circle size={14} fill="currentColor" />} {recording ? t("Stoppen") : t("Aufnehmen")}
        </button>
        <button className="gb-btn" disabled={!can("replay") || busy !== null} onClick={() => void run("capture.replaySave")}><Clapperboard size={14} /> {t("Replay")}</button>
        <button className={`gb-btn wide gb-toggle${fp.buffer === "obs" && obs?.replayBuffer ? " on" : ""}`} disabled={!can("buffer") || busy !== null} onClick={() => void run("capture.replayToggle")}>
          <Timer size={14} /> {fp.buffer === "obs" && obs?.replayBuffer ? t("Replay-Puffer stoppen") : t("Replay-Puffer starten")}
        </button>
      </div>
      {msg && <div className={`gb-msg ${msg.error ? "error" : ""}`} role={msg.error ? "alert" : "status"}>{msg.text}</div>}
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
