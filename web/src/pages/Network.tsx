import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Gauge, Plus, Server, Stethoscope, Trash2, Wifi } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { useNetworkHistory, type NetTarget } from "../components/MonitorExtras";
import { connectionQuality, QUALITY_RULES, qualityBars, qualityLabel, type Quality } from "../lib/net-quality";
import { Banner, Button, Card, Field, PageHead } from "../components/ui";

const fmt = (v?: number | null) => (v == null ? "–" : `${Math.round(v)}`);
const ms = (v?: number | null) => (v == null ? "–" : `${Math.round(v)} ms`);
const QUALITY_CLASS: Record<Quality, string> = { excellent: "ok", good: "ok", fair: "warn", poor: "error", unknown: "" };

function Tile({ label, value, unit, hint }: { label: string; value: string; unit: string; hint?: string }) {
  return (
    <div className="nd-tile">
      <span className="nd-tile-label">{label}</span>
      <span className="nd-tile-value">{value}{value !== "–" && <small>{unit}</small>}</span>
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

/** Ping over time of one target: a single line, recessive grid, crosshair with the exact value on hover/touch. */
function PingChart({ target }: { target: NetTarget }) {
  const W = 600, H = 200, padL = 40, padB = 22, padT = 8;
  const pts = target.points;
  const max = Math.max(40, Math.ceil(Math.max(...pts.map((p) => p.ms ?? 0)) / 20) * 20);
  const x = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * (W - padL - 6);
  const y = (ms: number) => padT + (1 - ms / max) * (H - padT - padB);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // Gaps (no answer) break the line, so a lost packet is not drawn as a fast answer.
  const path = useMemo(() => pts.map((p, i) => (p.ms == null ? "" : `${i === 0 || pts[i - 1].ms == null ? "M" : "L"}${x(i).toFixed(1)},${y(p.ms).toFixed(1)}`)).join(""), [pts, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = [0, max / 2, max];
  const seconds = (pts.length - 1) * 2;
  const pick = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const i = Math.round((((clientX - r.left) / r.width) * W - padL) / ((W - padL - 6) / Math.max(1, pts.length - 1)));
    setHover(i >= 0 && i < pts.length ? i : null);
  };
  const hp = hover != null ? pts[hover] : null;
  return (
    <div className="nd-chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Ping-Verlauf von {n}", { n: target.label })}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - 6} y1={y(v)} y2={y(v)} className="nd-grid" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="nd-axis">{Math.round(v)} ms</text>
          </g>
        ))}
        <text x={padL} y={H - 4} className="nd-axis">{seconds > 0 ? t("vor {n}", { n: seconds >= 120 ? `${Math.round(seconds / 60)} min` : `${seconds} s` }) : ""}</text>
        <text x={W - 6} y={H - 4} textAnchor="end" className="nd-axis">{t("jetzt")}</text>
        {pts.map((p, i) => (p.ms == null ? <line key={i} x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} className="nd-loss" /> : null))}
        <path d={path} className="nd-line" />
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="nd-cross" />
            {hp.ms != null && <circle cx={x(hover)} cy={y(hp.ms)} r={4} className="nd-dot" />}
          </g>
        )}
      </svg>
      {hp && <div className="nd-tip" role="status">{new Date(hp.at).toLocaleTimeString()} · <b>{hp.ms == null ? t("keine Antwort") : `${hp.ms} ms`}</b></div>}
    </div>
  );
}

function OwnTargets() {
  const canManage = useCan("manage");
  const conn = useConn();
  const q = useRpc<{ targets: { label: string; host: string }[] }>("network.targets", {}, ["network"]);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const list = q.data?.targets ?? [];
  const save = (targets: { label: string; host: string }[]) => client.call("network.setTargets", { targets })
    .then(() => { setLabel(""); setHost(""); toast(conn.auth === "ok" ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"); }, (e: Error) => toast(e.message, "error"));
  return (
    <Card title={t("Eigene Ziele (z. B. Spiel-Server)")} icon={<Server size={18} />}>
      <div className="stack-sm">
        <p className="small muted">{t("Ein Spiel-Server lässt sich nur messen, wenn du seine Adresse kennst – z. B. aus den Server-Infos im Spiel. Ohne Adresse misst die App bewusst keinen „Spiel-Ping“. Manche Server beantworten keinen Ping; dann zeigt die App Verlust, obwohl das Spiel läuft.")}</p>
        {list.map((x, i) => (
          <div key={x.host} className="row between">
            <span><b>{x.label}</b> <span className="mono tiny muted">{x.host}</span></span>
            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} disabled={!canManage} aria-label={t("{n} entfernen", { n: x.label })} onClick={() => save(list.filter((_, j) => j !== i))} />
          </div>
        ))}
        {list.length < 3 && (
          <form className="grid-2" onSubmit={(e) => { e.preventDefault(); if (host.trim()) save([...list, { label: label.trim() || host.trim(), host: host.trim() }]); }}>
            <Field label={t("Name")}><input className="input" value={label} maxLength={40} placeholder={t("z. B. EU-Server")} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label={t("Hostname oder IP-Adresse")}><input className="input mono" value={host} maxLength={253} placeholder="eu.example.net" onChange={(e) => setHost(e.target.value)} /></Field>
            <div><Button type="submit" icon={<Plus size={16} />} disabled={!canManage || !host.trim()}>{t("Ziel hinzufügen")}</Button></div>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Ping Doctor: live ping, jitter and packet loss to the router, the internet and own game servers, measured on the PC. */
export default function Network() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const { hist, err } = useNetworkHistory();
  const [sel, setSel] = useState("internet");
  const target = hist?.find((x) => x.id === sel) ?? hist?.find((x) => x.id === "internet") ?? hist?.[0];
  const last = target?.points.at(-1)?.ms;
  const q = target ? connectionQuality(target) : "unknown";
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Netzwerkdiagnose")}
        text={t("Ping, Schwankung (Jitter) und Paketverlust – gemessen vom PC aus, alle 2 Sekunden, nur solange diese Seite offen ist.")}
        actions={<Link to="/diagnostics" className="btn"><Stethoscope size={16} />{t("Verbindung prüfen")}</Link>} />
      {!online && <Banner kind="warn">{t("Gemessen wird auf dem PC – ohne Verbindung gibt es keine Messwerte. Eigene Ziele kannst du schon eintragen.")}</Banner>}
      {err && <Banner kind="error">{err}</Banner>}
      {online && !hist && !err && <div className="skeleton" style={{ height: 260 }} />}
      {target && (
        <div className="stack">
          <div className="chips" role="radiogroup" aria-label={t("Ziel")}>
            {hist!.map((x) => <button key={x.id} type="button" role="radio" aria-checked={x.id === target.id} className={`chip ${x.id === target.id ? "on" : ""}`} onClick={() => setSel(x.id)}>{x.label}</button>)}
          </div>
          <div className="nd-tiles">
            <Tile label={t("Ping")} value={fmt(last)} unit="ms" hint={t("Mittel {v} ms", { v: fmt(target.avg) })} />
            <Tile label={t("Jitter")} value={fmt(target.jitter)} unit="ms" hint={t("Schwankung zwischen zwei Messungen")} />
            <Tile label={t("Paketverlust")} value={target.lossPercent == null ? "–" : target.lossPercent.toFixed(1)} unit="%" hint={t("{n} Messungen", { n: target.samples })} />
            <Tile label={t("Dieses Gerät → PC")} value={fmt(conn.latencyMs)} unit="ms" hint={t("Antwortzeit der App-Verbindung")} />
          </div>
          <div className="nd-row">
            <Card title={t("Ping-Verlauf – {n}", { n: target.label })} icon={<Activity size={18} />} meta={<span className="mono tiny">{target.host}</span>}>
              {target.points.length > 1 ? <PingChart target={target} /> : <p className="small muted">{t("Erste Messwerte kommen in wenigen Sekunden …")}</p>}
            </Card>
            <Card title={t("Verbindungsqualität")} icon={<Gauge size={18} />}>
              <div className="nd-quality">
                <b className={`nd-q ${QUALITY_CLASS[q]}`}>{qualityLabel(q)}</b>
                <div className="nd-bars" aria-hidden>{[1, 2, 3, 4, 5, 6].map((n) => <i key={n} className={n <= qualityBars(q) ? `on ${QUALITY_CLASS[q]}` : ""} style={{ height: 6 + n * 3 }} />)}</div>
                <details className="tiny muted">
                  <summary>{t("Wie wird bewertet?")}</summary>
                  <ul>{QUALITY_RULES.map((r) => <li key={r.q}>{qualityLabel(r.q)}: {t("Ping ≤ {p} ms, Jitter ≤ {j} ms, Verlust ≤ {l} %", { p: r.ping, j: r.jitter, l: r.loss })}</li>)}<li>{qualityLabel("poor")}: {t("alles darüber")}</li></ul>
                  {t("Faustregeln für Online-Spiele, aus den Werten der letzten Minuten. Eine Garantie für ein bestimmtes Spiel ist das nicht.")}
                </details>
              </div>
            </Card>
          </div>
          <Card title={t("Alle Ziele")} icon={<Wifi size={18} />}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("Ziel")}</th><th>{t("Ping")}</th><th>{t("Mittel")}</th><th>{t("Jitter")}</th><th>{t("Verlust")}</th><th>{t("Qualität")}</th></tr></thead>
                <tbody>{hist!.map((x) => {
                  const xq = connectionQuality(x);
                  return (
                    <tr key={x.id}><td><b>{x.label}</b> <span className="mono tiny muted">{x.host}</span></td>
                      <td>{ms(x.points.at(-1)?.ms)}</td><td>{ms(x.avg)}</td><td>{ms(x.jitter)}</td>
                      <td>{x.lossPercent == null ? "–" : `${x.lossPercent.toFixed(1)} %`}</td><td><span className={`badge ${QUALITY_CLASS[xq]}`}>{qualityLabel(xq)}</span></td></tr>
                  );
                })}</tbody>
              </table>
            </div>
            <p className="tiny muted">{t("Router: Verbindung im Heimnetz (WLAN/Kabel). Internet: Cloudflare und Google als Referenz. Viele Router beantworten keinen Ping – dann zählt das als Verlust, obwohl das Internet geht.")}</p>
          </Card>
        </div>
      )}
      <div style={{ marginTop: 16 }}><OwnTargets /></div>
    </>
  );
}
