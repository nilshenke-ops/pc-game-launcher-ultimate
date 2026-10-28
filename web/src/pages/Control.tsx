// PC-Steuerung: one place for the connection, live values, what runs (with gentle closing), favourites and last
// started, the programs using the most memory (measured on request) and a comparison of two play sessions.
// Everything comes from the Windows companion; without it the page says so instead of showing invented values.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Gauge, MonitorSmartphone, Play, Power, RefreshCw, Smartphone, Star, Stethoscope, X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, PageHead } from "../components/ui";
import type { LibraryItem } from "../lib/types";
import type { Now, Proc } from "../lib/perf-chat";

const gb = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;
interface SessionRow { itemId: string; name: string; startedAt: string; minutes: number; perf?: { cpuAvg?: number | null; cpuMax?: number | null; ramAvg?: number | null; gpuAvg?: number | null; gpuMax?: number | null; samples: number } | null }

export default function ControlPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canLaunch = useCan("launch");
  const canManage = useCan("manage");
  const lib = useRpc<{ items: LibraryItem[]; running: string[] }>("library.list", {}, ["library", "session"]);
  const hist = useRpc<{ launches: { itemId: string; at: string }[] }>("history.get", {}, ["history"]);
  const [now, setNow] = useState<Now | null>(null);
  const [nowError, setNowError] = useState<string | null>(null);
  const [top, setTop] = useState<{ at: string; ram: Proc[]; cpu: Proc[] } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Live values every 5 s while this page is open and visible – no background load otherwise.
  useEffect(() => {
    if (!online) { setNow(null); return; }
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try { const n = await client.call<Now>("monitor.now"); if (!stop) { setNow(n); setNowError(null); } }
      catch (e) { if (!stop) setNowError((e as Error).message); }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [online]);

  const items = lib.data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const running = (lib.data?.running ?? []).map((id) => byId.get(id)).filter((x): x is LibraryItem => !!x);
  const favorites = items.filter((i) => i.favorite).slice(0, 8);
  const recent = [...new Map((hist.data?.launches ?? []).map((l) => [l.itemId, l])).values()].slice(0, 6).map((l) => ({ item: byId.get(l.itemId), at: l.at })).filter((x) => x.item);

  const launch = async (i: LibraryItem) => {
    setBusy(i.id);
    try { await client.call("library.launch", { id: i.id }); toast(t("{n} wird gestartet", { n: i.name }), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const close = async (i: LibraryItem) => {
    if (!(await confirmDialog(t("„{n}“ schließen?", { n: i.name }), t("Der PC bittet das Programm, sich zu beenden – wie ein Klick auf das X. Nicht gespeicherter Fortschritt kann verloren gehen; manche Spiele fragen vorher nach. Nichts wird erzwungen.", { n: i.name }), { danger: true, ok: t("Schließen") }))) return;
    setBusy(i.id);
    try { const r = await client.call<{ ok: boolean; message: string }>("library.close", { id: i.id }); toast(r.message, r.ok ? "success" : "error"); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const measure = async () => {
    setMeasuring(true);
    try { setTop(await client.call("system.topProcesses")); } catch (e) { toast((e as Error).message, "error"); }
    setMeasuring(false);
  };

  const s = now?.sample;
  const ramPct = s?.memTotalBytes && s.memUsedBytes != null ? Math.round((100 * s.memUsedBytes) / s.memTotalBytes) : null;
  const gpu = s?.gpus?.[0];
  const lastPong = client.lastPong;

  return (
    <>
      <PageHead eyebrow={t("Steuerung")} title={t("PC-Steuerung")} text={t("Verbindung, Live-Werte, laufende Programme, Favoriten und Fehlerdiagnose für deinen Windows-PC – vom Handy, iPad oder am PC selbst.")} />
      <div className="grid-3">
        <Card title={t("Verbindung")} icon={<Smartphone size={18} />}>
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}><span className={`badge ${online ? "success" : "warn"}`}>{online ? t("Verbunden") : conn.phase === "connecting" ? t("Verbindet …") : t("Getrennt")}</span>
              {conn.relayCompanion && <span className="tiny muted">{t("Relay: Begleiter {s}", { s: conn.relayCompanion === "online" ? t("erreichbar") : t("nicht erreichbar") })}</span>}</div>
            {lastPong > 0 && <div className="small muted">{t("Letzter Kontakt: {d}", { d: relTime(new Date(lastPong).toISOString()) })}</div>}
            {!online && <Banner kind="info">{conn.lastError ? t("Fehler: {e}", { e: conn.lastError }) : t("Der Begleiter am PC ist nicht erreichbar. Ist der PC an und läuft der Begleiter? Ein ausgeschalteter PC lässt sich über die Website nicht steuern.")}</Banner>}
            <div className="row">
              <Link className="btn sm" to="/diagnostics"><Stethoscope size={15} /> {t("Verbindungs-Check")}</Link>
              <Link className="btn sm" to="/devices"><Smartphone size={15} /> {t("Geräte & Rechte")}</Link>
              <Link className="btn sm" to="/settings?s=connection">{t("Verbindungseinstellungen")}</Link>
            </div>
          </div>
        </Card>
        <Card title={t("Live-Status")} icon={<Activity size={18} />} meta={now ? t("alle 5 s, solange die Seite offen ist") : undefined}>
          {!online ? <p className="small muted">{t("Ohne Verbindung zeige ich keine Werte – nichts ist erfunden.")}</p> : !now ? <p className="small muted">{nowError ?? t("Messe …")}</p> : (
            <div className="stack-sm small">
              <div>CPU: <b>{s?.cpuPercent != null ? `${Math.round(s.cpuPercent)} %` : t("nicht verfügbar")}</b>{s?.cpuTempC != null && ` · ${Math.round(s.cpuTempC)} °C`}</div>
              <div>RAM: <b>{ramPct != null ? `${ramPct} %` : t("nicht verfügbar")}</b>{s?.memUsedBytes != null && s.memTotalBytes ? ` · ${gb(s.memUsedBytes)} / ${gb(s.memTotalBytes)}` : ""}</div>
              <div>GPU: <b>{gpu ? (gpu.utilPercent != null ? `${Math.round(gpu.utilPercent)} %` : t("Auslastung nicht verfügbar")) : t("nicht verfügbar")}</b>{gpu && ` · ${gpu.name}`}{gpu?.tempC != null && ` · ${Math.round(gpu.tempC)} °C`}</div>
              {(s?.disks ?? []).slice(0, 2).map((d) => <div key={d.name}>{d.name} {t("frei")}: <b>{gb(d.freeBytes)}</b> / {gb(d.totalBytes)}</div>)}
              <div className="tiny muted">FPS: {s?.fpsStatus ?? t("nicht verfügbar")}</div>
              <Link className="btn sm" to="/monitor"><Gauge size={15} /> {t("PC-Monitor")}</Link>
            </div>
          )}
        </Card>
        <Card title={t("Bildschirm")} icon={<MonitorSmartphone size={18} />}>
          <p className="small muted">{t("Den PC-Bildschirm live sehen und mit Touch-Maus, Tastatur und Scrollen steuern – über die eigene, verschlüsselte Verbindung (WLAN oder Tailscale). Muss am PC einmal erlaubt werden.")}</p>
          <Link className="btn sm primary" to="/remote"><MonitorSmartphone size={15} /> {t("Remote Desktop")}</Link>
        </Card>
      </div>

      <Card title={t("Läuft gerade")} icon={<Power size={18} />} style={{ marginTop: 16 }}>
        {!online ? <p className="small muted">{t("Nur mit verbundenem PC.")}</p> : running.length === 0 ? <Empty icon={<Power size={24} />} title={t("Nichts aus deiner Bibliothek läuft")} /> : (
          <div className="stack-sm">
            {running.map((i) => (
              <div key={i.id} className="j-conflict">
                <div className="grow"><b>{i.name}</b> <span className="tiny muted">{i.kind === "game" ? t("Spiel") : t("Programm")}</span></div>
                {canLaunch && <Button size="sm" variant="danger" icon={<X size={14} />} busy={busy === i.id} onClick={() => void close(i)}>{t("Beenden")}</Button>}
              </div>
            ))}
            <p className="tiny muted">{t("Beenden bittet das Programm höflich, sich zu schließen – nie erzwungen. Windows-Prozesse, Launcher, Anti-Cheat und Sicherheitssoftware werden nie geschlossen.")}</p>
          </div>
        )}
      </Card>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title={t("Favoriten")} icon={<Star size={18} />}>
          {favorites.length === 0 ? <p className="small muted">{t("Markiere Spiele oder Programme mit ★ – sie erscheinen hier zum schnellen Start.")}</p> : (
            <div className="row" style={{ gap: 8 }}>{favorites.map((i) => <Button key={i.id} size="sm" icon={<Play size={14} />} busy={busy === i.id} disabled={!online || !canLaunch} onClick={() => void launch(i)}>{i.name}</Button>)}</div>
          )}
        </Card>
        <Card title={t("Zuletzt gestartet")} icon={<Play size={18} />}>
          {recent.length === 0 ? <p className="small muted">{t("Noch nichts gestartet.")}</p> : (
            <div className="stack-sm">{recent.map((r) => (
              <div key={r.item!.id} className="row nowrap"><span className="grow small">{r.item!.name} <span className="tiny muted">· {dateTime(r.at)}</span></span>
                <Button size="sm" icon={<Play size={14} />} busy={busy === r.item!.id} disabled={!online || !canLaunch} onClick={() => void launch(r.item!)} aria-label={t("{n} starten", { n: r.item!.name })} /></div>
            ))}</div>
          )}
        </Card>
      </div>

      {canManage && (
        <Card title={t("Programme mit dem meisten Speicher")} icon={<Gauge size={18} />} style={{ marginTop: 16 }} actions={<Button size="sm" icon={<RefreshCw size={14} />} busy={measuring} disabled={!online} onClick={() => void measure()}>{top ? t("Neu messen") : t("Jetzt messen")}</Button>}>
          {!top ? <p className="small muted">{t("Wird nur gemessen, wenn du tippst (dauert etwa 1 Sekunde) – nicht dauernd im Hintergrund. Frag auch JARVIS: „Welche Programme verbrauchen am meisten RAM?“")}</p> : (
            <div className="grid-2">
              <div><div className="label">{t("Arbeitsspeicher")}</div><ol className="small">{top.ram.map((p) => <li key={p.name}>{p.name} – {p.ramMb >= 1024 ? `${(p.ramMb / 1024).toFixed(1)} GB` : `${Math.round(p.ramMb)} MB`}{p.count > 1 ? ` (${p.count})` : ""}</li>)}</ol></div>
              <div><div className="label">{t("Prozessor (1 Sekunde gemessen)")}</div><ol className="small">{top.cpu.map((p) => <li key={p.name}>{p.name} – {p.cpuPercent} %</li>)}</ol></div>
            </div>
          )}
        </Card>
      )}
      <SessionCompare />
    </>
  );
}

/** Two play sessions side by side – only values the PC measured during them. */
function SessionCompare() {
  const q = useRpc<{ sessions: SessionRow[] }>("history.sessions", {}, ["history"]);
  const list = (q.data?.sessions ?? []).filter((s) => s.perf && s.perf.samples > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 60);
  const [a, setA] = useState(""), [b, setB] = useState("");
  const pick = (k: string) => list.find((s) => s.startedAt + s.itemId === k);
  const A = pick(a) ?? list[1], B = pick(b) ?? list[0];
  const row = (label: string, f: (s: SessionRow) => number | null | undefined, unit = "%") => (
    <tr><td>{label}</td>{[A, B].map((s, n) => <td key={n}>{s && f(s) != null ? `${f(s)} ${unit}` : "–"}</td>)}</tr>
  );
  return (
    <Card title={t("Spielsitzungen vergleichen")} icon={<Activity size={18} />} style={{ marginTop: 16 }}>
      {list.length < 2 ? <p className="small muted">{t("Dafür braucht es zwei Sitzungen mit Leistungsdaten. Die zeichnet der PC beim Spielen auf, wenn „Leistung pro Sitzung aufzeichnen“ an ist.")}</p> : (
        <div className="stack-sm">
          <div className="grid-2">
            {[[a, setA, A], [b, setB, B]].map(([v, set, cur], n) => (
              <select key={n} className="input" aria-label={n === 0 ? t("Erste Sitzung") : t("Zweite Sitzung")} value={(v as string) || ((cur as SessionRow | undefined) ? (cur as SessionRow).startedAt + (cur as SessionRow).itemId : "")} onChange={(e) => (set as (x: string) => void)(e.target.value)}>
                {list.map((s) => <option key={s.startedAt + s.itemId} value={s.startedAt + s.itemId}>{s.name} · {dateTime(s.startedAt)} · {Math.round(s.minutes)} Min.</option>)}
              </select>
            ))}
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th></th><th>{A?.name}</th><th>{B?.name}</th></tr></thead>
            <tbody>
              {row(t("Dauer"), (s) => Math.round(s.minutes), "Min.")}
              {row(t("CPU Ø"), (s) => s.perf?.cpuAvg)}{row(t("CPU max."), (s) => s.perf?.cpuMax)}
              {row(t("RAM Ø"), (s) => s.perf?.ramAvg)}
              {row(t("GPU Ø"), (s) => s.perf?.gpuAvg)}{row(t("GPU max."), (s) => s.perf?.gpuMax)}
            </tbody>
          </table></div>
          <p className="tiny muted">{t("Gemessen vom PC während der Sitzung. FPS werden nicht aufgezeichnet.")}</p>
        </div>
      )}
    </Card>
  );
}
