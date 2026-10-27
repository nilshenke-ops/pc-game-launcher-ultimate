// Auswertungen: year review (F5), play style (F28) and performance archive (F18). Sessions come from the PC's own
// records (history.sessions); nothing is estimated. Missing data is shown as missing.

import { useMemo, useState } from "react";
import { BarChart3, Download, Gauge, Image as ImageIcon, Printer, Sparkles, Trophy } from "lucide-react";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { newId, useJournal } from "../lib/journal";
import type { Data, Schema } from "../lib/collections";
import type { LibraryItem } from "../lib/types";
import {
  compareRuns, compareYears, DAYPARTS, MIN_SESSIONS, PERF_METRICS, playStyle, runFromSession, yearReview, yearsWithData, type PerfRun, type SessionsInfo,
} from "../lib/insights";
import { CollectionView } from "./collection-view";
import { trySave } from "./journal-ui";
import { Banner, Button, Card, Empty, Loadable } from "./ui";

const MONTHS = () => Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleDateString(undefined, { month: "short" }));
const WEEKDAYS = () => Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(undefined, { weekday: "short" })); // 4.1.2026 is a Sunday
const hours = (min: number) => (min >= 60 ? t("{h} Std.", { h: (Math.round((min / 60) * 10) / 10).toLocaleString() }) : t("{m} Min.", { m: Math.round(min) }));

export function useSessions() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const q = useRpc<SessionsInfo>("history.sessions", {}, ["history"], online);
  return { online, q };
}

/** Small bar chart (SVG, no library): one bar per value, labels below, value as tooltip and text. */
export function Bars({ values, labels, format = (v: number) => String(v), label }: { values: number[]; labels: string[]; format?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ins-bars" role="img" aria-label={label + ": " + values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}>
      {values.map((v, i) => (
        <div key={i} className="ins-bar" title={`${labels[i]}: ${format(v)}`}>
          <span className="ins-bar-fill" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} />
          <span className="tiny muted">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function NeedPc({ online, info }: { online: boolean; info?: SessionsInfo }) {
  if (!online) return <Banner kind="info">{t("Die Auswertungen brauchen den PC – dort wird aufgezeichnet, was du wann gespielt hast. Ohne Verbindung wird nichts geschätzt.")}</Banner>;
  if (info && !info.enabled) return <Banner kind="warn">{t("Der Spielverlauf ist am PC ausgeschaltet – ohne Aufzeichnung gibt es keine Auswertung. (Einstellungen → Datenschutz)")}</Banner>;
  return null;
}

// ------------------------------------------------------------------------------------------ F5 year review

async function yearCard(r: ReturnType<typeof yearReview>, opts: { names: boolean; time: boolean }) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#1e1b4b"); grad.addColorStop(1, "#0b1020");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = "#a78bfa"; g.font = "bold 44px system-ui, sans-serif"; g.fillText(t("Mein Gaming-Jahr"), 70, 120);
  g.fillStyle = "#f8fafc"; g.font = "bold 160px system-ui, sans-serif"; g.fillText(String(r.year), 64, 290);
  const tiles: [string, string][] = [
    ...(opts.time ? [[t("Spielzeit"), hours(r.minutes)] as [string, string]] : []),
    [t("Sitzungen"), String(r.sessions)], [t("Aktive Tage"), String(r.activeDays)], [t("Längste Serie"), t("{n} Tage", { n: r.streak })],
  ];
  tiles.forEach(([k, v], i) => {
    const x = 70 + (i % 2) * 480, y = 360 + Math.floor(i / 2) * 170;
    g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(x, y, 450, 140);
    g.fillStyle = "#94a3b8"; g.font = "28px system-ui, sans-serif"; g.fillText(k, x + 28, y + 50);
    g.fillStyle = "#f8fafc"; g.font = "bold 56px system-ui, sans-serif"; g.fillText(v, x + 28, y + 112);
  });
  if (opts.names && r.games.length) {
    g.fillStyle = "#c4b5fd"; g.font = "bold 34px system-ui, sans-serif"; g.fillText(t("Meistgespielt"), 70, 760);
    r.games.slice(0, 5).forEach((x, i) => {
      g.fillStyle = "#f1f5f9"; g.font = "32px system-ui, sans-serif";
      g.fillText(`${i + 1}. ${x.name.slice(0, 34)}`, 70, 820 + i * 60);
      if (opts.time) { g.fillStyle = "#94a3b8"; g.textAlign = "right"; g.fillText(hours(x.minutes), W - 70, 820 + i * 60); g.textAlign = "left"; }
    });
  }
  const max = Math.max(1, ...r.byMonth);
  r.byMonth.forEach((m, i) => { const h = (m / max) * 170; g.fillStyle = "#8b5cf6"; g.fillRect(70 + i * 79, 1230 - h, 56, h); });
  g.fillStyle = "#64748b"; g.font = "22px system-ui, sans-serif"; g.fillText(r.coverageFrom ? t("Aufgezeichnet ab {d} – Nexus Gaming Hub", { d: new Date(r.coverageFrom).toLocaleDateString() }) : "Nexus Gaming Hub", 70, 1300);
  return new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
}

export function YearView() {
  const { online, q } = useSessions();
  const info = q.data;
  const sessions = info?.sessions ?? [];
  const years = useMemo(() => yearsWithData(sessions), [sessions]);
  const [year, setYear] = useState<number | null>(null);
  const [names, setNames] = useState(true);
  const [time, setTime] = useState(true);
  const y = year ?? years[0] ?? new Date().getFullYear();
  const r = useMemo(() => yearReview(sessions, y, info?.oldest ?? null), [sessions, y, info?.oldest]);
  const prev = useMemo(() => yearReview(sessions, y - 1, info?.oldest ?? null), [sessions, y, info?.oldest]);
  const cmp = prev.sessions ? compareYears(r, prev) : null;
  const pct = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v} %`);
  const share = async () => {
    const blob = await yearCard(r, { names, time });
    if (!blob) { toast(t("Bild konnte nicht erstellt werden."), "error"); return; }
    const file = new File([blob], `gaming-jahr-${y}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: t("Mein Gaming-Jahr {y}", { y }) }); return; } catch { /* cancelled */ } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <Loadable loading={online && q.loading} error={q.error} onRetry={q.reload}>
      <div className="stack print-area">
        <NeedPc online={online} info={info} />
        {online && info && (sessions.length === 0 ? <Card><Empty icon={<Trophy size={26} />} title={t("Noch keine aufgezeichneten Sitzungen")} text={t("Sobald du Spiele spielst, während der PC-Begleiter läuft, entsteht hier dein Jahresrückblick.")} /></Card> : <>
          <Card title={t("Jahresrückblick {y}", { y })} icon={<Trophy size={18} />} actions={years.length > 1 && <select className="input no-print" style={{ maxWidth: 120 }} aria-label={t("Jahr")} value={y} onChange={(e) => setYear(Number(e.target.value))}>{years.map((x) => <option key={x}>{x}</option>)}</select>}>
            <div className="stack">
              {r.coverageFrom && <Banner kind="info">{t("Aufgezeichnet erst ab {d} – Zeit davor fehlt in diesem Rückblick.", { d: dateTime(r.coverageFrom) })}</Banner>}
              {info.full && <span className="tiny muted">{t("Der PC behält die letzten 1000 Sitzungen – ältere sind nicht mehr enthalten.")}</span>}
              <div className="ins-tiles">
                <div><span className="tiny muted">{t("Spielzeit")}</span><b>{hours(r.minutes)}</b>{cmp && <span className="tiny muted">{t("Vorjahr")}: {pct(cmp.minutes)}</span>}</div>
                <div><span className="tiny muted">{t("Sitzungen")}</span><b>{r.sessions}</b>{cmp && <span className="tiny muted">{t("Vorjahr")}: {pct(cmp.sessions)}</span>}</div>
                <div><span className="tiny muted">{t("Aktive Tage")}</span><b>{r.activeDays}</b>{cmp && <span className="tiny muted">{t("Vorjahr")}: {pct(cmp.activeDays)}</span>}</div>
                <div><span className="tiny muted">{t("Längste Serie")}</span><b>{t("{n} Tage", { n: r.streak })}</b></div>
              </div>
              {cmp?.partly && <span className="tiny muted">{t("Vergleich mit Vorbehalt: eines der Jahre ist nur teilweise aufgezeichnet.")}</span>}
              <div className="stack-xs"><b className="small">{t("Spielzeit je Monat")}</b><Bars values={r.byMonth} labels={MONTHS()} format={hours} label={t("Spielzeit je Monat")} /></div>
              <div className="grid-2">
                <div className="stack-xs"><b className="small">{t("Meistgespielt")}</b>
                  <ol className="ins-list">{r.games.slice(0, 10).map((g) => <li key={g.itemId}><span>{g.name}</span><span className="muted">{hours(g.minutes)} · {t("{n} Sitzungen", { n: g.sessions })}</span></li>)}</ol>
                </div>
                <div className="stack-xs small">
                  {r.longest && <span>{t("Längste Sitzung")}: <b>{r.longest.name}</b> – {hours(r.longest.minutes)} ({dateTime(r.longest.startedAt)})</span>}
                  {r.topWeekday != null && <span>{t("Lieblingstag")}: <b>{WEEKDAYS()[r.topWeekday]}</b></span>}
                  <span>{t("Neu in diesem Jahr")}: {r.newGames == null ? <span className="muted">{t("unbekannt – davor wurde nichts aufgezeichnet")}</span> : r.newGames.length ? r.newGames.slice(0, 8).join(", ") : t("keine")}</span>
                  <span>{t("Verschiedene Spiele")}: <b>{r.games.length}</b></span>
                </div>
              </div>
            </div>
          </Card>
          <Card title={t("Teilen")} icon={<ImageIcon size={18} />} className="no-print">
            <div className="stack-sm">
              <span className="small muted">{t("Du entscheidest, was auf der Karte steht. Geteilt wird nur, was du selbst verschickst – nichts wird hochgeladen.")}</span>
              <label className="checkbox"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />{t("Spielnamen zeigen")}</label>
              <label className="checkbox"><input type="checkbox" checked={time} onChange={(e) => setTime(e.target.checked)} />{t("Spielzeit zeigen")}</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button icon={<ImageIcon size={15} />} onClick={() => void share()}>{t("Als Bild teilen")}</Button>
                <Button icon={<Printer size={15} />} onClick={() => window.print()}>{t("Drucken / als PDF speichern")}</Button>
              </div>
            </div>
          </Card>
        </>)}
      </div>
    </Loadable>
  );
}

// ------------------------------------------------------------------------------------------ F28 play style

export function StyleView() {
  const { online, q } = useSessions();
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const sessions = q.data?.sessions ?? [];
  const p = useMemo(() => playStyle(sessions, (lib.data?.items ?? []) as never), [sessions, lib.data]);
  const pct = (arr: number[]) => { const s = arr.reduce((a, b) => a + b, 0); return arr.map((v) => (s ? Math.round((v / s) * 100) : 0)); };
  return (
    <Loadable loading={online && q.loading} error={q.error} onRetry={q.reload}>
      <div className="stack">
        <NeedPc online={online} info={q.data} />
        {online && q.data && <>
          <Card title={t("Dein Spielstil")} icon={<Sparkles size={18} />} meta={t("{n} Sitzungen", { n: p.sessions })}>
            <div className="stack">
              {!p.enough ? <Banner kind="info">{t("Noch zu wenig Daten: ab {n} aufgezeichneten Sitzungen wird dein Spielstil beschrieben (bisher {m}). Vorher wäre es geraten.", { n: MIN_SESSIONS, m: p.sessions })}</Banner>
                : <ul className="ins-traits">{p.traits.map((x, i) => <li key={i}>{t(x.text, { ...x.vars, p: x.vars?.p ? t(String(x.vars.p)) : "" })}</li>)}</ul>}
              <span className="tiny muted">{t("Regelbasiert aus deiner Aufzeichnung – jede Aussage zeigt die Zahl, aus der sie kommt.")}</span>
              {p.sessions > 0 && <div className="grid-2">
                <div className="stack-xs"><b className="small">{t("Tageszeit (Anteil der Spielzeit)")}</b><Bars values={pct(p.dayparts)} labels={DAYPARTS.map((d) => t(d).split(" ")[0])} format={(v) => `${v} %`} label={t("Tageszeit")} /></div>
                <div className="stack-xs"><b className="small">{t("Wochentag (Anteil der Spielzeit)")}</b><Bars values={pct(p.weekdays)} labels={WEEKDAYS()} format={(v) => `${v} %`} label={t("Wochentag")} /></div>
              </div>}
            </div>
          </Card>
          <div className="grid-2">
            <Card title={t("Meine Bewertungen")} icon={<Trophy size={18} />}>
              {p.ratings.count === 0 ? <span className="small muted">{t("Noch keine Spiele bewertet (Spiele → Spiel öffnen → Bewertung).")}</span> : (
                <div className="stack-xs small">
                  <span>{t("{n} bewertete Spiele, im Schnitt {a} von 5 Sternen", { n: p.ratings.count, a: p.ratings.average!.toLocaleString() })}</span>
                  <ol className="ins-list">{p.ratings.best.map((b) => <li key={b.name}><span>{b.name}</span><span className="muted">{"★".repeat(b.rating)}</span></li>)}</ol>
                </div>
              )}
            </Card>
            <Card title={t("Favorisierte Spiele")} icon={<Sparkles size={18} />}>
              {p.favorites.length === 0 ? <span className="small muted">{t("Noch keine Favoriten markiert.")}</span> : <div className="chips">{p.favorites.map((f) => <span key={f} className="badge">{f}</span>)}</div>}
            </Card>
            <Card title={t("Lieblings-Kategorien")} icon={<BarChart3 size={18} />}>
              {p.topCategories.length === 0 ? <span className="small muted">{t("Keine Kategorien an deinen gespielten Spielen – in der Bibliothek vergeben, dann erscheinen sie hier.")}</span>
                : <ol className="ins-list">{p.topCategories.map((c) => <li key={c.name}><span>{c.name}</span><span className="muted">{hours(c.minutes)}</span></li>)}</ol>}
            </Card>
            <Card title={t("Backlog")} icon={<Gauge size={18} />}>
              {p.backlog.total === 0 ? <span className="small muted">{t("Kein Spiel im Backlog.")}</span>
                : <span className="small">{t("{c} durchgespielt, {p} am Spielen, {d} abgebrochen – von {n} im Backlog", { c: p.backlog.completed, p: p.backlog.playing, d: p.backlog.dropped, n: p.backlog.total })}</span>}
            </Card>
          </div>
        </>}
      </div>
    </Loadable>
  );
}

// ------------------------------------------------------------------------------------------ F18 performance archive

const num = (key: string, label: string, max: number, hint?: string) => ({ key, label, type: "number" as const, min: 0, max, hint });

export const PERFRUN: Schema = {
  kind: "perfrun", label: "Messung",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "date", label: "Datum", type: "date", required: true, card: true },
    { key: "source", label: "Herkunft", type: "select", required: true, options: [{ value: "manual", label: "Selbst eingetragen" }, { value: "measured", label: "Vom PC gemessen" }], card: true, filter: true },
    { key: "tool", label: "Messwerkzeug", type: "text", maxLen: 60, placeholder: "z. B. CapFrameX, MSI Afterburner, Spiel-Benchmark" },
    { key: "preset", label: "Grafik-Einstellungen", type: "text", maxLen: 160, placeholder: "z. B. Hoch, DLSS Qualität" },
    { key: "resolution", label: "Auflösung", type: "text", maxLen: 30, placeholder: "z. B. 2560×1440" },
    num("fpsAvg", "FPS (Durchschnitt)", 2000), num("fpsLow", "1 % Low (FPS)", 2000), num("frametimeMs", "Frametime (ms)", 1000),
    num("cpuAvg", "CPU-Last Ø (%)", 100), num("cpuMax", "CPU-Last max (%)", 100), num("gpuAvg", "GPU-Last Ø (%)", 100), num("gpuMax", "GPU-Last max (%)", 100), num("ramAvg", "RAM Ø (%)", 100),
    num("cpuTemp", "CPU-Temperatur (°C)", 130), num("gpuTemp", "GPU-Temperatur (°C)", 130),
    { key: "gfxId", label: "Grafikvergleich", type: "ref", refKind: "gfx", hint: "Verknüpft die Messung mit Bildern aus Builds & Technik → Grafikvergleich." },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 2000 },
  ],
  check: (d) => d.source === "measured" && ["fpsAvg", "fpsLow", "frametimeMs", "cpuTemp", "gpuTemp"].some((k) => d[k] != null)
    ? [{ key: "source", message: "FPS, Frametime und Temperaturen misst der PC nicht – dafür „Selbst eingetragen“ wählen." }] : [],
};

export function PerfView({ focus }: { focus: string | null }) {
  const { online, q } = useSessions();
  const runs = useJournal<PerfRun & Data>("perfrun");
  const measured = (q.data?.sessions ?? []).filter((s) => s.perf?.samples).slice(0, 30);
  const [a, setA] = useState(""), [b, setB] = useState("");
  const [metric, setMetric] = useState<keyof PerfRun>("fpsAvg");
  const [game, setGame] = useState("");
  const games = [...new Set(runs.map((r) => r.data.game?.gameName ?? "").filter(Boolean))].sort();
  const ra = runs.find((r) => r.id === a)?.data, rb = runs.find((r) => r.id === b)?.data;
  const series = runs.filter((r) => (!game || r.data.game?.gameName === game) && typeof r.data[metric] === "number").sort((x, y) => String(x.data.date).localeCompare(String(y.data.date)));
  const take = (i: number) => {
    const r = runFromSession(measured[i]);
    if (r && trySave("perfrun", newId(), { ...r, links: [] })) toast(t("Ins Archiv übernommen"), "success");
  };
  const m = PERF_METRICS.find((x) => x.key === metric)!;
  return (
    <div className="stack">
      {online && measured.length > 0 && (
        <Card title={t("Vom PC gemessen")} icon={<Gauge size={18} />}>
          <span className="small muted">{t("Während Spielen misst der PC die Last von CPU, GPU und RAM. FPS und Temperaturen kann Windows ohne Zusatzprogramm nicht liefern – die trägst du bei Bedarf selbst ein (z. B. aus CapFrameX).")}</span>
          <div className="list" style={{ marginTop: 8 }}>{measured.slice(0, 8).map((s, i) => (
            <div key={s.startedAt + s.itemId} className="list-item">
              <div className="grow"><div className="title">{s.name}</div><div className="sub">{dateTime(s.startedAt)} · CPU Ø {s.perf?.cpuAvg?.toFixed(0) ?? "–"} % · GPU Ø {s.perf?.gpuAvg?.toFixed(0) ?? "–"} %</div></div>
              <Button size="sm" onClick={() => take(i)}>{t("Ins Archiv")}</Button>
            </div>
          ))}</div>
        </Card>
      )}
      {runs.length >= 2 && (
        <Card title={t("Vergleichen")} icon={<BarChart3 size={18} />}>
          <div className="stack-sm">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {[[a, setA, "A"], [b, setB, "B"]].map(([v, set, n]) => (
                <select key={n as string} className="input" style={{ maxWidth: 280 }} aria-label={t("Messung {n}", { n: n as string })} value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value)}>
                  <option value="">{t("Messung {n} wählen", { n: n as string })}</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.data.title}</option>)}
                </select>
              ))}
            </div>
            {ra && rb && (
              <div className="table-wrap"><table className="table">
                <thead><tr><th /><th>A</th><th>B</th><th>{t("Unterschied")}</th></tr></thead>
                <tbody>{compareRuns(ra, rb).map((x) => <tr key={x.key}><td>{t(x.label)}</td><td>{x.a ?? "–"}</td><td>{x.b ?? "–"}</td><td className={x.better == null ? "muted" : x.better ? "ok-text" : "bad-text"}>{x.diff == null ? t("nicht vergleichbar") : `${x.diff > 0 ? "+" : ""}${x.diff} ${x.unit}`}</td></tr>)}</tbody>
              </table></div>
            )}
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <select className="input" style={{ maxWidth: 220 }} aria-label={t("Messwert")} value={metric} onChange={(e) => setMetric(e.target.value as keyof PerfRun)}>{PERF_METRICS.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}</select>
              {games.length > 0 && <select className="input" style={{ maxWidth: 220 }} aria-label={t("Spiel")} value={game} onChange={(e) => setGame(e.target.value)}><option value="">{t("Spiel")}: {t("alle")}</option>{games.map((g) => <option key={g}>{g}</option>)}</select>}
            </div>
            {series.length === 0 ? <span className="small muted">{t("Keine Messung mit diesem Wert.")}</span>
              : <Bars values={series.map((r) => r.data[metric] as number)} labels={series.map((r) => String(r.data.date ?? "").slice(5))} format={(v) => `${v} ${m.unit}`} label={t(m.label)} />}
          </div>
        </Card>
      )}
      <CollectionView key={`pr${focus ?? ""}`} schema={PERFRUN} icon={<Gauge size={18} />} focus={focus}
        intro={t("Nur gemessene Werte: vom PC (Last) oder selbst mit einem Messwerkzeug ermittelt und als „Selbst eingetragen“ markiert. Leere Felder bleiben leer.")}
        cardExtra={(e) => <span className="row" style={{ gap: 4 }}>{e.data.fpsAvg != null && <span className="badge accent">{String(e.data.fpsAvg)} fps</span>}{e.data.gpuAvg != null && <span className="badge">GPU {String(e.data.gpuAvg)} %</span>}</span>} />
      <span className="tiny muted"><Download size={12} /> {t("Export: „Tabelle (CSV)“ oder „Exportieren“ in der Liste oben.")}</span>
    </div>
  );
}
