import { useEffect, useState } from "react";
import { Gamepad2, Lightbulb, Vibrate } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card, Field, Loadable, PageHead } from "../components/ui";

interface ControllerInfo { index: number; connected: boolean; kind: string; battery: string }
interface ControllerState { index: number; buttons: Record<string, boolean>; leftX: number; leftY: number; rightX: number; rightY: number; leftTrigger: number; rightTrigger: number; packet: number }
interface RgbDevice { id: number; name: string; vendor: string; type: number; leds: number; zones: { name: string; leds: number }[]; modes: string[]; activeMode: number }
interface RgbStatus { connected: boolean; protocol: number; devices: RgbDevice[]; profiles: string[] }

/** Controllers (XInput) with a live test and RGB lighting through OpenRGB. */
export default function PeripheralsPage() {
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Controller & RGB")}
        text={t("Prüfe deinen Controller (Tasten, Sticks, Vibration, Akku) und steuere die RGB-Beleuchtung über OpenRGB – auch als Baustein in Quick Actions.")} />
      <div className="stack">
        <Controllers />
        <Rgb />
      </div>
    </>
  );
}

function Controllers() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canLaunch = useCan("launch");
  const q = useRpc<{ supported: boolean; controllers: ControllerInfo[] }>("controllers.list", {}, []);
  const [test, setTest] = useState<number | null>(null);
  const list = q.data?.controllers.filter((c) => c.connected) ?? [];
  return (
    <Card title={t("Controller")} icon={<Gamepad2 size={18} />} actions={online && <Button size="sm" variant="ghost" onClick={q.reload}>{t("Neu suchen")}</Button>}>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (!q.data.supported ? <Banner kind="info">{t("Controller werden nur vom Windows-Begleiter erkannt.")}</Banner> : (
          <div className="stack">
            {list.length === 0 ? <p className="small muted">{t("Kein Xbox-kompatibler Controller verbunden.")}</p> : list.map((c) => (
              <div key={c.index} className="list-item">
                <Gamepad2 size={20} />
                <div className="grow"><div className="title small">{t("Controller {n}", { n: c.index + 1 })}</div><div className="sub tiny">{c.kind} · {t("Akku: {b}", { b: c.battery })}</div></div>
                <Button size="sm" disabled={!online} onClick={() => setTest(test === c.index ? null : c.index)}>{test === c.index ? t("Test beenden") : t("Testen")}</Button>
                {canLaunch && <Button size="sm" variant="ghost" icon={<Vibrate size={14} />} aria-label={t("Vibrieren")} disabled={!online} onClick={() => client.call("controllers.rumble", { index: c.index }).catch((e: Error) => toast(e.message, "error"))} />}
              </div>
            ))}
            {test != null && online && <LiveTest index={test} />}
            <p className="tiny muted">{t("Erkannt werden Xbox- und XInput-kompatible Controller. PlayStation- und Switch-Controller erscheinen hier nur, wenn sie über Steam Input oder DS4Windows als Xbox-Controller laufen.")}</p>
          </div>
        ))}
      </Loadable>
    </Card>
  );
}

const BUTTONS = ["a", "b", "x", "y", "lb", "rb", "back", "start", "ls", "rs", "up", "down", "left", "right"];

/** Polls the controller about 10 times a second while the test is shown (stops as soon as it is closed or hidden). */
function LiveTest({ index }: { index: number }) {
  const [s, setS] = useState<ControllerState | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try { const r = await client.call<ControllerState & { connected?: boolean }>("controllers.state", { index }); if (r.connected === false) setLost(true); else { setLost(false); setS(r); } }
        catch { /* next tick */ }
      }
      if (!stop) setTimeout(tick, 100);
    };
    void tick();
    return () => { stop = true; };
  }, [index]);
  if (lost) return <Banner kind="warn">{t("Controller getrennt.")}</Banner>;
  if (!s) return null;
  const stick = (x: number, y: number, label: string) => (
    <div className="pad-stick" aria-label={label}><span style={{ left: `${50 + x * 42}%`, top: `${50 - y * 42}%` }} /></div>
  );
  return (
    <div className="pad-test">
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {BUTTONS.map((b) => <span key={b} className={`pad-btn ${s.buttons[b] ? "on" : ""}`}>{b.toUpperCase()}</span>)}
      </div>
      <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {stick(s.leftX, s.leftY, t("Linker Stick"))}
        {stick(s.rightX, s.rightY, t("Rechter Stick"))}
        <div className="stack-sm" style={{ minWidth: 140 }}>
          <label className="tiny muted">LT<div className="run-bar"><span style={{ width: `${s.leftTrigger * 100}%` }} /></div></label>
          <label className="tiny muted">RT<div className="run-bar"><span style={{ width: `${s.rightTrigger * 100}%` }} /></div></label>
        </div>
      </div>
      <p className="tiny muted">{t("Sticks: kleine Ausschläge (unter 8 %) werden als Ruhe angezeigt – wandert der Punkt ohne Berührung, driftet der Stick.")}</p>
    </div>
  );
}

function Rgb() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const canLaunch = useCan("launch");
  const cfg = useRpc<{ host: string; port: number }>("rgb.settings", {}, []);
  const st = useRpc<RgbStatus>("rgb.status", {}, []);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(6742);
  const [color, setColor] = useState("#8b5cf6");
  useEffect(() => { if (cfg.data) { setHost(cfg.data.host); setPort(cfg.data.port); } }, [cfg.data]);
  const save = () => client.call("rgb.configure", { host, port }).then(() => { toast(t("Gespeichert"), "success"); st.reload(); }, (e: Error) => toast(e.message, "error"));
  const set = (deviceId?: number) => client.call<{ devices: number }>("rgb.setColor", { color, deviceId }).then((r) => toast(t("Farbe auf {n} Gerät(en) gesetzt", { n: r.devices }), "success"), (e: Error) => toast(e.message, "error"));
  const load = (name: string) => client.call("rgb.loadProfile", { name }).then(() => toast(t("Profil „{n}“ geladen", { n: name }), "success"), (e: Error) => toast(e.message, "error"));
  return (
    <Card title={t("RGB-Beleuchtung (OpenRGB)")} icon={<Lightbulb size={18} />} actions={online && <Button size="sm" variant="ghost" onClick={st.reload}>{t("Neu verbinden")}</Button>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{t("Läuft über das kostenlose OpenRGB (openrgb.org), das Tastatur, Maus, RAM, Mainboard und Lüfter vieler Hersteller steuert. In OpenRGB unter „SDK Server“ auf „Start Server“ tippen (am besten „Start at login“ und „Start Server“ in den Einstellungen anhaken).")}</p>
        {st.error ? <Banner kind="warn">{st.error.message}</Banner> : st.data && (
          <>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t("Farbe")} style={{ width: 52, height: 40, border: 0, background: "none" }} />
              {["#ff0000", "#00ff66", "#0080ff", "#8b5cf6", "#ffffff", "#000000"].map((c) => <button key={c} type="button" className={`color-dot ${color === c ? "on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />)}
              {canLaunch && <Button variant="primary" disabled={!online || !st.data.devices.length} onClick={() => void set()}>{t("Alle Geräte")}</Button>}
            </div>
            {st.data.devices.length === 0 ? <p className="small muted">{t("OpenRGB ist verbunden, findet aber keine Geräte.")}</p> : (
              <div className="list">{st.data.devices.map((d) => (
                <div key={d.id} className="list-item">
                  <Lightbulb size={18} className="muted" />
                  <div className="grow" style={{ minWidth: 0 }}><div className="title small ellipsis">{d.name}</div><div className="sub tiny">{[d.vendor, t("{n} LEDs", { n: d.leds }), d.modes[d.activeMode]].filter(Boolean).join(" · ")}</div></div>
                  {canLaunch && <Button size="sm" disabled={!online} onClick={() => void set(d.id)}>{t("Farbe setzen")}</Button>}
                </div>
              ))}</div>
            )}
            {st.data.profiles.length > 0 && <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="small muted">{t("Profile:")}</span>
              {st.data.profiles.map((p) => <button key={p} type="button" className="chip" disabled={!online || !canLaunch} onClick={() => void load(p)}>{p}</button>)}
            </div>}
          </>
        )}
        {canManage && <details>
          <summary className="small">{t("Verbindung zu OpenRGB")}</summary>
          <div className="row nowrap" style={{ gap: 8, marginTop: 8 }}>
            <Field label={t("Adresse")}><input className="input mono" value={host} onChange={(e) => setHost(e.target.value)} /></Field>
            <Field label={t("Port")}><input className="input mono" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} style={{ maxWidth: 110 }} /></Field>
            <Button disabled={!online} onClick={save} style={{ alignSelf: "end" }}>{t("Speichern")}</Button>
          </div>
          <p className="tiny muted">{t("Nur dieser PC (127.0.0.1) oder ein Gerät im Heimnetz – OpenRGB hat kein Passwort.")}</p>
        </details>}
      </div>
    </Card>
  );
}
