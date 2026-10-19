import { useState } from "react";
import { Circle, Clapperboard, Square, Timer } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { CAPTURE_PROVIDERS, type CaptureStatus } from "../lib/capture";
import type { Sound, SoundsFile } from "../lib/types";

/** Recording with the program(s) chosen under "Overlay & Aufnahme" – OBS with live state, others by their shortcuts. */
export function CaptureWidget() {
  const cap = useRpc<CaptureStatus>("capture.status", {}, ["capture", "obs", "settings"]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const c = cap.data;
  if (!c) return <div className="skeleton" style={{ height: 90 }} />;
  const fp = c.effectiveProviders ?? { record: c.provider, replay: c.provider, buffer: c.provider };
  const name = (id: string) => CAPTURE_PROVIDERS.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const obs = c.obs;
  const can = (a: "record" | "replay" | "buffer") => {
    const p = c.providers.find((x) => x.id === fp[a]);
    return !!p && p.actions.includes(a) && (fp[a] === "obs" ? !!obs?.connected : !!p.effective?.[a]);
  };
  const recording = fp.record === "obs" && !!obs?.recording;
  const run = async (method: string) => {
    try { const r = await client.call<{ message?: string }>(method); setMsg({ text: t(r?.message ?? "OK") }); cap.reload(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  };
  return (
    <div className="gb-stack">
      <div className="gb-state">
        <span className={`gb-dot ${recording ? "rec" : fp.record === "obs" && obs?.connected ? "ok" : ""}`} />
        <span>{recording ? t("Aufnahme läuft") + (obs?.recordTimecode ? ` · ${obs.recordTimecode.slice(0, 8)}` : "")
          : fp.record === "obs" && !obs?.connected ? (obs?.error ?? t("OBS nicht verbunden"))
          : t("Aufnahme: {a} · Replay: {b}", { a: name(fp.record), b: name(fp.replay) })}</span>
      </div>
      <div className="gb-buttons">
        <button className={`gb-btn ${recording ? "danger" : "accent"}`} disabled={!can("record")} onClick={() => run("capture.recordToggle")}>
          {recording ? <Square size={14} /> : <Circle size={14} fill="currentColor" />} {recording ? t("Stoppen") : t("Aufnehmen")}
        </button>
        <button className="gb-btn" disabled={!can("replay")} onClick={() => run("capture.replaySave")}><Clapperboard size={14} /> {t("Replay")}</button>
        <button className="gb-btn wide" disabled={!can("buffer")} onClick={() => run("capture.replayToggle")}><Timer size={14} /> {fp.buffer === "obs" && obs?.replayBuffer ? t("Replay-Puffer stoppen") : t("Replay-Puffer an/aus")}</button>
      </div>
      {msg && <div className={`gb-msg ${msg.error ? "error" : ""}`}>{msg.text}</div>}
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
