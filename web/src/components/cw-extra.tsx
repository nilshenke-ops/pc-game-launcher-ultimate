// More building blocks for the widget kit (3.54): a tap counter, a note, the days until a date, the connection to the PC with its ping,
// this device's battery, and a dice / coin. All of them work without the PC; what they keep (count, note) stays on this device.
import { useEffect, useState, type CSSProperties } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { t } from "../lib/i18n";
import { readJson, writeJson } from "../lib/rpc";
import { useConn } from "../lib/hooks";
import { connView } from "../lib/conn-state";
import { client } from "../lib/rpc";
import type { CustomWidget, WidgetElement } from "../lib/custom-widgets";

type P = { e: WidgetElement; w: CustomWidget; style: CSSProperties; interactive: boolean };
const key = (w: CustomWidget, e: WidgetElement, what: string) => `pgl.cw.${what}.${w.id}.${e.id}`;
const col = (style: CSSProperties): CSSProperties => ({ ...style, flexDirection: "column", alignItems: style.justifyContent as string, justifyContent: "center", gap: "3%" });
const small: CSSProperties = { fontSize: "0.5em", opacity: 0.8, fontWeight: 400, maxWidth: "100%" };
const roundBtn: CSSProperties = { width: "1.5em", height: "1.5em", minHeight: 0, borderRadius: "50%", border: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)", color: "inherit", cursor: "pointer", flex: "none", padding: 0, fontSize: "0.62em" };

/** A number that goes up (and down) with a tap – deaths, wins, rounds. Kept on this device. */
export function CounterView({ e, w, style, interactive }: P) {
  const k = key(w, e, "count");
  const [n, setN] = useState(() => Number(readJson<number>(k) ?? 0) || 0);
  const [bump, setBump] = useState(0);
  const set = (v: number) => { const x = Math.max(-9999, Math.min(99999, v)); setN(x); writeJson(k, x); setBump((b) => b + 1); navigator.vibrate?.(8); };
  return (
    <div style={col(style)}>
      {e.text && <span className="ellipsis" style={small}>{e.text}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35em", maxWidth: "100%" }}>
        {interactive && e.kind !== "up" && <button type="button" className="cw-tap" style={roundBtn} onClick={() => set(n - 1)} aria-label={t("Eins weniger")}><Minus size={14} /></button>}
        <b key={bump} className="cw-pop" style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{n}</b>
        {interactive && <button type="button" className="cw-tap" style={{ ...roundBtn, background: e.fill ?? "rgba(255,255,255,.28)" }} onClick={() => set(n + 1)} aria-label={t("Eins mehr")}><Plus size={14} /></button>}
        {interactive && n !== 0 && <button type="button" className="cw-tap" style={{ ...roundBtn, opacity: 0.7 }} onClick={() => set(0)} aria-label={t("Zähler auf null")}><RotateCcw size={12} /></button>}
      </div>
    </div>
  );
}

/** A note typed right in the widget. Kept on this device. */
export function NoteView({ e, w, style, interactive }: P) {
  const k = key(w, e, "note");
  const [v, setV] = useState(() => String(readJson<string>(k) ?? ""));
  if (!interactive) return <div style={{ ...style, alignItems: "flex-start" }}><span style={{ whiteSpace: "pre-wrap", opacity: v ? 1 : 0.55 }}>{v || e.text || t("Notiz …")}</span></div>;
  return (
    <textarea className="cw-note" style={{ ...style, display: "block", background: e.fill ? e.fill : "rgba(255,255,255,.08)", border: 0, borderRadius: 12, padding: "0.5em 0.6em", resize: "none", font: "inherit", color: "inherit", outline: "none", boxSizing: "border-box" }}
      value={v} maxLength={600} placeholder={e.text || t("Notiz …")} aria-label={e.text || t("Notiz")} onChange={(x) => { setV(x.target.value); writeJson(k, x.target.value); }} />
  );
}

/** How long until a day (a release, a holiday): days, and on the last day hours and minutes. */
export function untilText(target: string | null | undefined, now: Date): { big: string; done: boolean } {
  const d = target ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(target) ? target + "T00:00:00" : target) : null;
  if (!d || Number.isNaN(d.getTime())) return { big: "–", done: false };
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return { big: ms > -86_400_000 ? t("Heute!") : t("Vorbei"), done: true };
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return { big: days === 1 ? t("1 Tag") : t("{n} Tage", { n: days }), done: false };
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return { big: h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`, done: false };
}
export function UntilView({ e, style, now }: P & { now: Date }) {
  const u = untilText(e.ref, now);
  return (
    <div style={col(style)}>
      {e.text && <span className="ellipsis" style={small}>{e.text}</span>}
      <b className={u.done ? "cw-pop" : undefined} style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{u.big}</b>
    </div>
  );
}

/** The real state of the connection to the PC, or its answer time. */
export function ConnView({ e, style }: P) {
  const conn = useConn();
  const v = connView(conn, { demo: client.demo, hasCredentials: !!client.credentials });
  const dot = v.tone === "ok" ? "#34d399" : v.tone === "warn" ? "#fbbf24" : "#f87171";
  const ping = v.key === "connected" && conn.latencyMs != null ? `${conn.latencyMs} ms` : "–";
  return (
    <div style={col(style)}>
      {e.text && <span className="ellipsis" style={small}>{e.text}</span>}
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4em", maxWidth: "100%" }}>
        <i className={v.tone === "ok" ? undefined : "cw-blink"} style={{ width: "0.5em", height: "0.5em", borderRadius: "50%", background: dot, flex: "none", boxShadow: `0 0 0.5em ${dot}` }} aria-hidden />
        <b className="ellipsis" style={{ fontVariantNumeric: "tabular-nums" }}>{e.kind === "ping" ? ping : v.short}</b>
      </span>
      {e.kind !== "ping" && v.key === "connected" && <span style={small}>{conn.via === "cloud" ? t("über die Cloud") : conn.hello?.transport === "relay" ? t("Über Relay") : t("Lokal")}{conn.latencyMs != null ? ` · ${conn.latencyMs} ms` : ""}</span>}
    </div>
  );
}

interface BatteryLike { level: number; charging: boolean; addEventListener(ev: string, fn: () => void): void; removeEventListener(ev: string, fn: () => void): void }
/** This device's battery – where the browser tells it (not on iPhone and iPad: said so instead of a made-up number). */
export function BatteryView({ e, style }: P) {
  const [b, setB] = useState<{ level: number; charging: boolean } | null | undefined>(undefined);
  useEffect(() => {
    const get = (navigator as unknown as { getBattery?: () => Promise<BatteryLike> }).getBattery;
    if (!get) { setB(null); return; }
    let bat: BatteryLike | null = null, gone = false;
    const read = () => { if (bat && !gone) setB({ level: bat.level, charging: bat.charging }); };
    void get.call(navigator).then((x) => { if (gone) return; bat = x; read(); x.addEventListener("levelchange", read); x.addEventListener("chargingchange", read); }, () => setB(null));
    return () => { gone = true; bat?.removeEventListener("levelchange", read); bat?.removeEventListener("chargingchange", read); };
  }, []);
  const pct = b ? Math.round(b.level * 100) : null;
  const fill = e.fill ?? (pct != null && pct <= 20 && !b?.charging ? "#f87171" : "#34d399");
  return (
    <div style={{ ...col(style), alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5em" }}>
        <span className="ellipsis" style={{ fontWeight: 400 }}>{e.text || t("Akku")}{b?.charging ? " ⚡" : ""}</span>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{b === undefined ? "…" : pct == null ? "–" : `${pct} %`}</b>
      </div>
      {b === null
        ? <span style={{ ...small, fontSize: "0.62em" }}>{t("Dieses Gerät verrät seinen Akkustand nicht.")}</span>
        : <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.15)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", transformOrigin: "left", transform: `scaleX(${(pct ?? 0) / 100})`, background: fill, transition: "transform .6s" }} /></div>}
    </div>
  );
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** A dice (1–6) or a coin: tap to throw. Chance from the browser's random numbers. */
export function DiceView({ e, style, interactive }: P) {
  const coin = e.kind === "coin";
  const roll = () => (coin ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 6));
  const [v, setV] = useState<number | null>(null);
  const [n, setN] = useState(0);
  const go = () => { setV(roll()); setN((x) => x + 1); navigator.vibrate?.(12); };
  const face = v == null ? null : coin ? (v ? t("Kopf") : t("Zahl")) : String(v);
  return (
    <button type="button" className="cw-button cw-dice" style={{ ...col(style), background: "none", border: 0, padding: 0, font: "inherit", cursor: interactive ? "pointer" : "default" }}
      onClick={interactive ? go : undefined} tabIndex={interactive ? 0 : -1} aria-label={coin ? t("Münze werfen") : t("Würfeln")}>
      {e.text && <span className="ellipsis" style={small}>{e.text}</span>}
      {coin
        ? <span key={n} className="cw-flip" style={{ display: "grid", placeItems: "center", height: "1.9em", aspectRatio: "1", borderRadius: "50%", background: e.fill ?? "#fbbf24", color: "#1c1917", fontSize: "0.7em", fontWeight: 700 }}>{face ?? "?"}</span>
        : <span key={n} className="cw-roll" aria-hidden style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8%", padding: "14%", height: "1.7em", aspectRatio: "1", borderRadius: "22%", background: e.fill ?? "#f8fafc", boxSizing: "border-box" }}>
            {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ borderRadius: "50%", background: v != null && PIPS[v].includes(i) ? "#0f172a" : "transparent" }} />)}
          </span>}
      <span style={small}>{v == null ? t("Antippen") : coin ? "" : t("Gewürfelt: {n}", { n: v })}</span>
    </button>
  );
}
