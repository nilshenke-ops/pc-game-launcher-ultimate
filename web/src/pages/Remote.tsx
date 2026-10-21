// Remote desktop: the real screen of the PC on this device, controlled by touch, mouse and keyboard. Pictures come from
// the companion over the existing signed-in connection (WLAN directly, from outside over the tunnel/relay you set up)
// and only while a session runs. Nothing here is simulated: without the PC the page shows exactly that.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronDown, ChevronUp, Hand, Keyboard, Maximize, MonitorOff, MonitorSmartphone, MousePointer2, MousePointerClick, Pause, Play, Settings2, Unplug, Volume2, VolumeX, X, ZoomIn } from "lucide-react";
import { client, savedPcs, RpcError } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import { RemoteAudio } from "../lib/remote-audio";
import { GestureRecognizer, keysFor, loadRemotePrefs, REMOTE_DEFAULTS, sanitizeRemotePrefs, saveRemotePrefs, toScreen, withModifiers, type Gesture, type RemotePrefs } from "../lib/remote";
import { Banner, Button, Card, Field, Loadable, PageHead, Segmented, Switch } from "../components/ui";

interface ScreenInfo { index: number; name: string; width: number; height: number; primary: boolean }
export interface RemoteStatus {
  enabled: boolean; maxMinutes: number; idleMinutes: number; supported: boolean; reason?: string | null; inputSupported: boolean; testSource: boolean;
  screens: ScreenInfo[]; canView: boolean; canControl: boolean; audio: boolean; audioReason?: string | null;
  session?: { id: string; device: string; control: boolean; since: string; screen: number; mine: boolean; paused: boolean } | null;
}
interface Frame { sessionId: string; seq: number; mime: string; data: string; w: number; h: number; sw: number; sh: number; quality: number; bytes: number; captureMs: number; rtt: number }
type Ev = Record<string, unknown> & { t: string };

const LAST_KEY = "pgl.remote.last";

/** Is the companion address on this PC or in the home network (direct connection, not a tunnel)? */
export function isLan(url: string) {
  try {
    const h = new URL(url).hostname;
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|[^.]+\.local$)/.test(h);
  } catch { return false; }
}
const PRESETS = [{ value: "auto", label: "Automatisch" }, { value: "low", label: "Wenig Daten" }, { value: "balanced", label: "Ausgewogen" }, { value: "high", label: "Hohe Qualität" }] as const;

export default function RemotePage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const q = useRpc<RemoteStatus>("remote.status", {}, ["remote", "devices"]);
  const [prefs, setPrefsState] = useState<RemotePrefs>(loadRemotePrefs);
  const setPrefs = (p: Partial<RemotePrefs>) => setPrefsState((old) => { const n = sanitizeRemotePrefs({ ...old, ...p }); saveRemotePrefs(n); return n; });
  const [viewing, setViewing] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);
  const st = online && !q.stale ? q.data : undefined;
  const last = (() => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } })();
  const paired = !!client.credentials || !!conn.me?.isLocal || savedPcs().length > 0;
  const pcName = conn.hello?.info.pcName ?? savedPcs()[0]?.name ?? null;
  const transport = conn.hello?.transport === "relay" ? t("über das Relay (von unterwegs)") : isLan(conn.url) ? t("direkt im WLAN") : conn.url ? t("über den eingerichteten Tunnel (https)") : null;

  const state = !paired ? "setup" : conn.phase === "connecting" ? "connecting" : conn.phase !== "online" ? "unreachable"
    : conn.auth === "paused" ? "paused" : conn.auth !== "ok" ? "auth" : "ready";

  return (
    <>
      <PageHead eyebrow={t("Steuerung")} title={t("Remote Desktop")}
        text={t("Der echte Bildschirm deines PCs live auf diesem Gerät – bedienen mit Touch, Maus und Tastatur. Nur wenn es am PC erlaubt ist, nur für Geräte mit dem Recht dazu, und am PC immer sichtbar.")} />
      <div className="stack">
        {ended && <Banner kind="info" title={t("Verbindung sicher beendet")} actions={<Button size="sm" variant="ghost" onClick={() => setEnded(null)}><X size={14} /></Button>}>{ended}</Banner>}
        <ConnectionCard state={state} st={st} loading={q.loading && online} pcName={pcName} transport={transport} last={last} onConnect={() => { setEnded(null); setViewing(true); }} />
        {conn.me?.isLocal && online && <PcSettings st={st} reload={q.reload} />}
        <LocalSettings prefs={prefs} setPrefs={setPrefs} screens={(q.data?.screens ?? [])} />
        <HelpCard />
      </div>
      {viewing && st && (
        <RemoteViewer prefs={prefs} setPrefs={setPrefs} status={st}
          onEnd={(reason) => { setViewing(false); setEnded(reason); q.reload(); try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch { /* blocked */ } }} />
      )}
    </>
  );
}

function ConnectionCard({ state, st, loading, pcName, transport, last, onConnect }: { state: string; st?: RemoteStatus; loading: boolean; pcName: string | null; transport: string | null; last: string | null; onConnect: () => void }) {
  const conn = useConn();
  const other = st?.session && !st.session.mine ? st.session : null;
  const ready = state === "ready" && st && st.supported && st.enabled && st.canView && !other;
  return (
    <Card title={pcName ?? t("Dein PC")} icon={<MonitorSmartphone size={18} />} meta={state === "ready" ? t("Verbunden") : undefined}>
      <div className="stack-sm">
        {state === "setup" && <Banner kind="info" title={t("PC noch nicht eingerichtet")} actions={<Link className="btn primary sm" to="/connect">{t("PC verbinden")}</Link>}>{t("Erst den Begleiter auf dem PC installieren und dieses Gerät koppeln (QR-Code am PC scannen).")}</Banner>}
        {state === "connecting" && <Banner kind="info" title={t("Verbindung wird aufgebaut …")} />}
        {state === "unreachable" && (
          <Banner kind="warn" title={t("Begleiter nicht erreichbar")} actions={<Button size="sm" onClick={() => client.reconnectNow()}>{t("Erneut versuchen")}</Button>}>
            {t("Ist der PC an und läuft der Begleiter? Im WLAN: Handy und PC im selben Netz. Von unterwegs: nur über den eingerichteten Tunnel oder das Relay.")}
            {conn.lastError && <div className="tiny muted">{conn.lastError}</div>}
          </Banner>
        )}
        {state === "paused" && <Banner kind="warn" title={t("Vom PC pausiert (Datenschutzmodus)")}>{conn.authError}</Banner>}
        {state === "auth" && <Banner kind="error" title={t("Geräteanmeldung erforderlich")} actions={<Link className="btn sm" to="/connect">{t("Neu koppeln")}</Link>}>{conn.authError ?? t("Dieses Gerät ist am PC nicht (mehr) angemeldet.")}</Banner>}
        {state === "ready" && (
          <Loadable loading={loading && !st} error={null}>
            {st && (
              <div className="stack-sm">
                {!st.supported && <Banner kind="warn" title={t("Bildschirmübertragung nicht verfügbar")}>{st.reason}</Banner>}
                {st.supported && !st.enabled && <Banner kind="warn" title={t("Am PC ausgeschaltet")}>{t("Am PC im Begleiter: Remote Desktop → „Remote Desktop erlauben“ einschalten. Aus Sicherheitsgründen geht das nur direkt am PC.")}</Banner>}
                {st.supported && st.enabled && !st.canView && <Banner kind="warn" title={t("Diesem Gerät fehlt das Recht")}>{t("Am PC: Geräte → dieses Gerät → „Bildschirm ansehen“ bzw. „Fernsteuern“ ankreuzen → Speichern.")}</Banner>}
                {other && <Banner kind="warn" title={t("Gerade ist „{d}“ verbunden", { d: other.device })}>{t("Es kann immer nur ein Gerät gleichzeitig verbunden sein. Am PC lässt sich die Sitzung beenden.")}</Banner>}
                {st.testSource && <Banner kind="info" title={t("Testbild (Entwicklung)")}>{t("Dieser Begleiter läuft ohne Windows und zeigt ein Testbild statt eines echten Bildschirms.")}</Banner>}
                <div className="small stack-sm">
                  <div><b>{t("Verbindung")}:</b> {transport ?? "–"}</div>
                  <div><b>{t("Rechte dieses Geräts")}:</b> {st.canControl ? t("ansehen und steuern") : st.canView ? t("nur ansehen") : t("keine")}</div>
                  <div><b>{t("Zuletzt verbunden")}:</b> {last ? `${dateTime(last)} (${relTime(last)})` : t("noch nie")}</div>
                  <div><b>{t("Ton")}:</b> {st.audio ? t("verfügbar – in der Leiste mit „Ton“ einschalten") : st.audioReason ?? t("nicht verfügbar")}</div>
                </div>
                <div className="row">
                  <Button variant="primary" icon={<MonitorSmartphone size={16} />} disabled={!ready} onClick={onConnect}>{t("Verbinden")}</Button>
                </div>
              </div>
            )}
          </Loadable>
        )}
      </div>
    </Card>
  );
}

function PcSettings({ st, reload }: { st?: RemoteStatus; reload: () => void }) {
  const save = (p: Record<string, unknown>) => client.call("remote.configure", p).then(() => { toast(t("Gespeichert"), "success"); reload(); }, (e: Error) => toast(e.message, "error"));
  if (!st) return null;
  return (
    <Card title={t("Am PC: Remote Desktop")} icon={<Settings2 size={18} />}>
      <div className="stack-sm">
        <Switch checked={st.enabled} onChange={(v) => void save({ enabled: v })} label={t("Remote Desktop erlauben")}
          hint={t("Nur Geräte mit dem Recht „Bildschirm ansehen“ bzw. „Fernsteuern“ (Geräte-Seite) können sich verbinden. Während einer Sitzung zeigt der PC oben eine Leiste mit „Beenden“.")} />
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Field label={t("Längste Sitzung (Minuten)")}><input className="input" type="number" min={1} max={480} defaultValue={st.maxMinutes} onBlur={(e) => void save({ maxMinutes: Number(e.target.value) })} style={{ width: 110 }} /></Field>
          <Field label={t("Ende ohne Eingabe nach (Minuten)")}><input className="input" type="number" min={1} max={120} defaultValue={st.idleMinutes} onBlur={(e) => void save({ idleMinutes: Number(e.target.value) })} style={{ width: 110 }} /></Field>
        </div>
        {st.session ? (
          <Banner kind="warn" title={t("Aktive Sitzung: {d}", { d: st.session.device })} actions={<Button size="sm" variant="danger" onClick={() => client.call("remote.end").then(reload, (e: Error) => toast(e.message, "error"))}>{t("Sitzung beenden")}</Button>}>
            {t("{m} seit {s}", { m: st.session.control ? t("Sieht und steuert") : t("Sieht"), s: relTime(st.session.since) })}
          </Banner>
        ) : <p className="small muted" style={{ margin: 0 }}>{t("Keine aktive Sitzung.")}</p>}
        <p className="tiny muted" style={{ margin: 0 }}><Link to="/devices">{t("Geräte und Rechte verwalten")}</Link></p>
      </div>
    </Card>
  );
}

function LocalSettings({ prefs, setPrefs, screens }: { prefs: RemotePrefs; setPrefs: (p: Partial<RemotePrefs>) => void; screens: ScreenInfo[] }) {
  return (
    <Card title={t("Einstellungen auf diesem Gerät")} icon={<Settings2 size={18} />} meta={t("lokal gespeichert")}>
      <div className="stack-sm">
        <Segmented label={t("Bildqualität")} value={prefs.preset} onChange={(v) => setPrefs({ preset: v })} options={PRESETS.map((p) => ({ value: p.value, label: t(p.label) }))} />
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Field label={t("Höchstens Bilder pro Sekunde")}><input className="input" type="number" min={1} max={30} value={prefs.fps} onChange={(e) => setPrefs({ fps: Number(e.target.value) })} style={{ width: 100 }} /></Field>
          <Field label={t("Höchste Bildbreite (Pixel)")}>
            <select className="input" value={prefs.maxWidth} onChange={(e) => setPrefs({ maxWidth: Number(e.target.value) })}>{[960, 1280, 1600, 1920, 2560].map((w) => <option key={w} value={w}>{w}</option>)}</select>
          </Field>
          {screens.length > 1 && (
            <Field label={t("Bildschirm")}>
              <select className="input" value={prefs.screen} onChange={(e) => setPrefs({ screen: Number(e.target.value) })}>{screens.map((s) => <option key={s.index} value={s.index}>{s.name}</option>)}</select>
            </Field>
          )}
        </div>
        <Segmented label={t("Steuerung")} value={prefs.mode} onChange={(v) => setPrefs({ mode: v })} options={[{ value: "touch", label: t("Touch-Maus") }, { value: "touchpad", label: t("Touchpad") }]} />
        {prefs.mode === "touchpad" && <Field label={t("Zeigergeschwindigkeit")}><input type="range" min={0.5} max={4} step={0.1} value={prefs.speed} onChange={(e) => setPrefs({ speed: Number(e.target.value) })} /></Field>}
        <Switch checked={prefs.toolbar === "always"} onChange={(v) => setPrefs({ toolbar: v ? "always" : "auto" })} label={t("Steuerleiste immer zeigen")} hint={t("Aus: die Leiste ist eingeklappt und lässt sich mit dem Griff oben öffnen.")} />
        <Switch checked={prefs.fullscreen} onChange={(v) => setPrefs({ fullscreen: v })} label={t("Beim Verbinden Vollbild versuchen")} hint={t("Auf dem iPhone gibt es für Webseiten kein echtes Vollbild – „Zum Home-Bildschirm“ hinzufügen gibt mehr Platz.")} />
        <Switch checked={prefs.autoReconnect} onChange={(v) => setPrefs({ autoReconnect: v })} label={t("Nach kurzem Abbruch automatisch neu verbinden")} />
        <div><Button size="sm" variant="ghost" onClick={() => setPrefs({ ...REMOTE_DEFAULTS })}>{t("Auf Standard zurücksetzen")}</Button></div>
        <p className="tiny muted" style={{ margin: 0 }}>{t("Diese Werte gelten für dieses Gerät und gehen auch ohne PC. Ob der PC sie schafft, zeigt die gemessene Bildrate während der Verbindung.")}</p>
      </div>
    </Card>
  );
}

function HelpCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card title={t("Hilfe und Grenzen")} actions={<Button size="sm" variant="ghost" icon={open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} onClick={() => setOpen(!open)}>{open ? t("Weniger") : t("Anzeigen")}</Button>}>
      {open ? (
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>{t("Touch-Maus: Tippen = Klick, zweimal tippen = Doppelklick, gedrückt halten = Rechtsklick, halten und ziehen = Ziehen (Fenster verschieben), wischen = scrollen, mit zwei Fingern tippen = Rechtsklick.")}</li>
          <li>{t("Touchpad: Finger bewegen = Zeiger bewegen, tippen = Klick am Zeiger, zwei Finger = scrollen, tippen und gleich wieder halten = Ziehen.")}</li>
          <li>{t("Tastatur: Text mit Umlauten geht direkt. Strg, Alt, Umschalt und Windows auf der Leiste antippen und dann eine Taste – das ergibt die Kombination (z. B. Strg + C). Strg+Alt+Entf geht nur direkt am PC.")}</li>
          <li>{t("Programme, die als Administrator laufen (z. B. manche Installer), nehmen von Windows aus keine Fern-Eingaben an. Der Sperrbildschirm und Sicherheitsabfragen werden nicht übertragen.")}</li>
          <li>{t("Spiele im exklusiven Vollbild können schwarz erscheinen – im Spiel „Randloses Fenster“ wählen. Spiele mit Anti-Cheat sind evtl. nicht steuerbar; das wird nicht umgangen.")}</li>
          <li>{t("Das Bild kommt als Einzelbilder (JPEG) über die bestehende Verbindung – im WLAN meist flüssig, über das Internet langsamer. Die tatsächliche Bildrate und Antwortzeit stehen in der Leiste unter „Qualität“.")}</li>
          <li>{t("Von unterwegs braucht es den eingerichteten Tunnel (Tailscale/Cloudflare) oder ein eigenes Relay – siehe Hilfe → Installation. Die feste Webseite (github.io) kann nicht direkt auf die WLAN-Adresse des PCs zugreifen.")}</li>
          <li>{t("Ton: in der Leiste „Ton“ antippen (iPhone/iPad erlauben Ton erst nach einem Tippen). Übertragen wird, was der PC gerade abspielt – Standardgeräte und Mikrofon bleiben unverändert. Etwa 0,3 s Verzögerung (im Test gemessen); bei sehr langsamer Verbindung wird Ton ausgelassen statt zu stauen. Geschützte Inhalte (manche Streaming-Apps) können stumm bleiben.")}</li>
        </ul>
      ) : <p className="small muted" style={{ margin: 0 }}>{t("Gesten, Tastatur, Spiele, Verbindung von unterwegs.")}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------- viewer

const KEYBAR: [string, string[]][] = [
  ["Esc", ["Escape"]], ["Tab", ["Tab"]], ["↵", ["Enter"]], ["⌫", ["Backspace"]], ["Entf", ["Delete"]], ["←", ["Left"]], ["↑", ["Up"]], ["↓", ["Down"]], ["→", ["Right"]],
  ["Pos1", ["Home"]], ["Ende", ["End"]], ["Bild↑", ["PageUp"]], ["Bild↓", ["PageDown"]], ["Strg+C", ["Ctrl", "C"]], ["Strg+V", ["Ctrl", "V"]], ["Strg+X", ["Ctrl", "X"]],
  ["Strg+Z", ["Ctrl", "Z"]], ["Strg+A", ["Ctrl", "A"]], ["Alt+Tab", ["Alt", "Tab"]], ["Win+D", ["Win", "D"]], ["Win+E", ["Win", "E"]], ["Task-Manager", ["Ctrl", "Shift", "Escape"]],
  ...Array.from({ length: 12 }, (_, i): [string, string[]] => [`F${i + 1}`, [`F${i + 1}`]]),
];
const MODS: [string, string][] = [["Ctrl", "Strg"], ["Alt", "Alt"], ["Shift", "⇧"], ["Win", "Win"]];

function RemoteViewer({ prefs, setPrefs, status, onEnd }: { prefs: RemotePrefs; setPrefs: (p: Partial<RemotePrefs>) => void; status: RemoteStatus; onEnd: (reason: string) => void }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const kbd = useRef<HTMLTextAreaElement>(null);
  const [sid, setSid] = useState<string | null>(null);
  const sidRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"starting" | "live" | "reconnecting" | "failed" | "ending">("starting");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [control, setControl] = useState(false);
  const [bar, setBar] = useState(prefs.toolbar === "always");
  const [keys, setKeys] = useState(false);
  const [mods, setMods] = useState<string[]>([]);
  const [rightNext, setRightNext] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const audio = useRef<RemoteAudio | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [audioBuf, setAudioBuf] = useState(0);
  const [stats, setStats] = useState({ fps: 0, kbps: 0, rtt: 0, w: 0, h: 0, quality: 0, captureMs: 0 });
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const size = useRef({ w: 0, h: 0 });
  const ack = useRef(0);
  const acked = useRef(0);
  const queue = useRef<Ev[]>([]);
  const inflight = useRef(false);
  const lastTick = useRef(0);
  const meter = useRef<{ at: number; bytes: number }[]>([]);
  const rtt = useRef(0);
  const wantRunning = useRef(true);
  const modsRef = useRef<string[]>([]);
  modsRef.current = mods;

  const end = useCallback((reason: string) => { wantRunning.current = false; sidRef.current = null; setSid(null); audio.current?.close(); audio.current = null; onEnd(reason); }, [onEnd]);

  // ---------------------------------------------------------------- session start / reconnect
  const start = useCallback(async () => {
    setPhase((p) => (p === "live" ? "reconnecting" : p)); setError(null);
    try {
      const r = await client.call<{ sessionId: string; control: boolean }>("remote.start", { screen: prefs.screen, preset: prefs.preset, maxWidth: prefs.maxWidth, fps: prefs.fps });
      sidRef.current = r.sessionId; setSid(r.sessionId); setControl(r.control); ack.current = 0; acked.current = 0;
    } catch (e) { setPhase("failed"); setError((e as RpcError).message); }
  }, [prefs.screen, prefs.preset, prefs.maxWidth, prefs.fps]);

  useEffect(() => { void start(); /* once */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Connection lost → the PC ended the session; when the connection is back (and automatic reconnect is on) start anew.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (wasOnline.current && !online && wantRunning.current) { sidRef.current = null; setSid(null); setPhase("reconnecting"); }
    if (!wasOnline.current && online && wantRunning.current) { if (prefs.autoReconnect) void start(); else end(t("Verbindung unterbrochen.")); }
    wasOnline.current = online;
  }, [online, prefs.autoReconnect, start, end]);

  // ---------------------------------------------------------------- pictures
  useEffect(() => {
    let drawing = Promise.resolve();
    const offFrame = client.on("remote.frame", (d) => {
      const f = d as Frame;
      if (f.sessionId !== sidRef.current) return;
      drawing = drawing.then(async () => {
        const bin = atob(f.data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type: f.mime });
        const c = canvas.current;
        if (!c) return;
        let src: CanvasImageSource;
        let close = () => {};
        if (typeof createImageBitmap === "function") { const bmp = await createImageBitmap(blob); src = bmp; close = () => bmp.close(); }
        else {
          const url = URL.createObjectURL(blob);
          const img = new Image(); img.src = url; await img.decode(); src = img; close = () => URL.revokeObjectURL(url);
        }
        if (c.width !== f.w || c.height !== f.h) { c.width = f.w; c.height = f.h; }
        c.getContext("2d")?.drawImage(src, 0, 0, f.w, f.h);
        close();
        size.current = { w: f.w, h: f.h };
        ack.current = Math.max(ack.current, f.seq);
        const now = performance.now();
        meter.current = [...meter.current.filter((m) => now - m.at < 2000), { at: now, bytes: f.bytes }];
        setStats((s) => ({ ...s, w: f.w, h: f.h, quality: f.quality, captureMs: f.captureMs }));
        setPhase("live");
        pumpRef.current();
      }).catch(() => { /* broken picture: skip it */ });
    });
    const offState = client.on("remote.state", (d) => { const x = d as { sessionId: string; problem?: string | null }; if (x.sessionId === sidRef.current) setProblem(x.problem ?? null); });
    const offEnd = client.on("remote.ended", (d) => { const x = d as { sessionId: string; reason: string }; if (x.sessionId === sidRef.current) end(x.reason); });
    const offAudio = client.on("remote.audio", (d) => { const a = d as { sessionId: string; rate: number; channels: number; data: string }; if (a.sessionId === sidRef.current) audio.current?.push(a.data, a.rate, a.channels); });
    return () => { offFrame(); offState(); offEnd(); offAudio(); audio.current?.close(); audio.current = null; };
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- acknowledgements + input (one message in flight)
  const pump = useCallback(() => {
    const id = sidRef.current;
    if (!id || inflight.current || !online) return;
    const now = performance.now();
    const hasAck = ack.current > acked.current;
    if (!hasAck && queue.current.length === 0 && now - lastTick.current < 1500) return;
    const events = queue.current.splice(0, 60);
    const a = ack.current;
    inflight.current = true; lastTick.current = now;
    client.call<{ rtt: number }>("remote.tick", { sessionId: id, ack: a, events })
      .then(() => { acked.current = Math.max(acked.current, a); rtt.current = performance.now() - now; })
      .catch((e: RpcError) => {
        if (e.code === "ended") end(t("Die Sitzung wurde am PC beendet."));
        else if (e.code !== "timeout" && e.code !== "offline") toast(e.message, "error");
      })
      .finally(() => { inflight.current = false; if (queue.current.length || ack.current > acked.current) window.setTimeout(pump, 0); });
  }, [online, end]);

  const pumpRef = useRef(pump);
  pumpRef.current = pump;
  useEffect(() => { const id = window.setInterval(() => pumpRef.current(), 50); return () => clearInterval(id); }, []);
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const m = meter.current.filter((x) => now - x.at < 2000);
      setStats((s) => ({ ...s, fps: Math.round((m.length / 2) * 10) / 10, kbps: Math.round(m.reduce((a, x) => a + x.bytes, 0) / 2 / 1024), rtt: Math.round(rtt.current) }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const send = useCallback((...evs: Ev[]) => {
    if (!control || paused) return;
    for (const e of evs) {
      // Pointer moves are merged: only the newest position matters.
      const lastEv = queue.current[queue.current.length - 1];
      if (e.t === "move" && lastEv?.t === "move") queue.current[queue.current.length - 1] = e;
      else if (e.t === "text" && lastEv?.t === "text" && String(lastEv.s).length + String(e.s).length <= 500) lastEv.s = String(lastEv.s) + String(e.s); // typed letters go together
      else queue.current.push(e);
    }
    pump();
  }, [control, paused, pump]);

  // ---------------------------------------------------------------- background, wake lock, fullscreen
  useEffect(() => {
    const onVis = () => {
      const id = sidRef.current;
      if (!id) return;
      const hidden = document.visibilityState === "hidden";
      client.call("remote.pause", { sessionId: id, paused: hidden }).then(() => setPaused(hidden), () => {});
    };
    document.addEventListener("visibilitychange", onVis);
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }, () => {});
    if (prefs.fullscreen && wrap.current?.requestFullscreen && document.fullscreenEnabled) void wrap.current.requestFullscreen().catch(() => {});
    const noZoom = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", noZoom);
    return () => { document.removeEventListener("visibilitychange", onVis); document.removeEventListener("gesturestart", noZoom); void lock?.release().catch(() => {}); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop on leaving the page.
  useEffect(() => () => { const id = sidRef.current; if (id) void client.call("remote.stop", { sessionId: id }).catch(() => {}); }, []);

  // ---------------------------------------------------------------- gestures
  const norm = useCallback((x: number, y: number) => {
    const c = canvas.current;
    if (!c || !size.current.w) return null;
    return toScreen(x, y, c.getBoundingClientRect(), size.current.w, size.current.h);
  }, []);

  const onGesture = useCallback((g: Gesture) => {
    const touchpad = prefs.mode === "touchpad";
    const at = (x: number, y: number) => (touchpad ? cursorRef.current : norm(x, y));
    switch (g.k) {
      case "tap": {
        const p = at(g.x, g.y);
        if (!p) return;
        const b = rightNext ? "right" : g.button;
        if (rightNext) setRightNext(false);
        send({ t: "click", b, x: p.x, y: p.y });
        if (!touchpad) { cursorRef.current = p; setCursor(p); }
        break;
      }
      case "dragStart": { const p = at(g.x, g.y); if (p) send({ t: "move", x: p.x, y: p.y }, { t: "down", b: "left" }); break; }
      case "dragMove": { const p = norm(g.x, g.y); if (p) { cursorRef.current = p; setCursor(p); send({ t: "move", x: p.x, y: p.y }); } break; }
      case "dragEnd": send({ t: "up", b: "left" }); break;
      case "scroll": {
        const dy = Math.round(g.dy * 2.5), dx = Math.round(-g.dx * 2.5);
        if (dy || dx) send({ t: "wheel", dy, dx });
        break;
      }
      case "move": {
        const box = canvas.current?.getBoundingClientRect();
        if (!box) return;
        const k = prefs.speed / Math.max(200, Math.min(box.width, box.height * (size.current.w / Math.max(1, size.current.h))));
        const p = { x: Math.min(1, Math.max(0, cursorRef.current.x + g.dx * k)), y: Math.min(1, Math.max(0, cursorRef.current.y + g.dy * k * (size.current.w / Math.max(1, size.current.h)))) };
        cursorRef.current = p; setCursor(p);
        send({ t: "move", x: p.x, y: p.y });
        break;
      }
    }
  }, [prefs.mode, prefs.speed, rightNext, send, norm]);

  const recognizer = useMemo(() => new GestureRecognizer(prefs.mode, (g) => onGestureRef.current(g)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;
  recognizer.mode = prefs.mode;

  useEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(".rd-surface");
    if (!el) return;
    const mouseButtons = new Set<number>();
    const name = (b: number) => (b === 2 ? "right" : b === 1 ? "middle" : "left");
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") { e.preventDefault(); el.setPointerCapture?.(e.pointerId); recognizer.down(e.pointerId, e.clientX, e.clientY, performance.now()); return; }
      const p = norm(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      mouseButtons.add(e.button);
      send({ t: "move", x: p.x, y: p.y }, { t: "down", b: rightNext ? "right" : name(e.button) });
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") { recognizer.move(e.pointerId, e.clientX, e.clientY); return; }
      const p = norm(e.clientX, e.clientY);
      if (p) send({ t: "move", x: p.x, y: p.y });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") { recognizer.up(e.pointerId, performance.now()); return; }
      if (!mouseButtons.delete(e.button)) return;
      send({ t: "up", b: rightNext ? "right" : name(e.button) });
      if (rightNext) setRightNext(false);
    };
    const cancel = () => recognizer.cancel();
    const wheel = (e: WheelEvent) => { e.preventDefault(); const dy = Math.round(-e.deltaY * (e.deltaMode === 1 ? 40 : 1)), dx = Math.round(e.deltaX * (e.deltaMode === 1 ? 40 : 1)); if (dy || dx) send({ t: "wheel", dy: Math.max(-2400, Math.min(2400, dy)), dx: Math.max(-2400, Math.min(2400, dx)) }); };
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancel); el.removeEventListener("wheel", wheel); el.removeEventListener("contextmenu", menu); };
  }, [recognizer, norm, send, rightNext]);

  // ---------------------------------------------------------------- keyboard
  const pressKeys = (k: string[]) => { const all = [...new Set([...modsRef.current, ...k])]; setMods([]); send({ t: "keys", k: all }); };
  const typeText = (s: string) => {
    const r = withModifiers(modsRef.current, s);
    if ("keys" in r) { setMods([]); send({ t: "keys", k: r.keys }); } else send({ t: "text", s: r.text });
  };
  const typeRef = useRef(typeText); typeRef.current = typeText;
  const pressRef = useRef(pressKeys); pressRef.current = pressKeys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!sidRef.current || target?.closest?.("input, select, .modal")) return;
      const k = keysFor(e);
      if (k) { e.preventDefault(); pressRef.current(k); return; } // also stops the matching input event (no double Enter/⌫)
      // Letters from a real keyboard while the text field is not used (PC browser, iPad keyboard).
      if (target !== kbd.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeRef.current(e.key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // The hidden text field receives the on-screen keyboard. It always holds one space, so ⌫ also works when "empty".
  useEffect(() => {
    const el = kbd.current;
    if (!el) return;
    const reset = () => { el.value = " "; try { el.setSelectionRange(1, 1); } catch { /* not focused */ } };
    reset();
    const before = (ev: InputEvent) => {
      if (ev.inputType === "insertCompositionText") return; // finished words come with compositionend
      ev.preventDefault();
      if (ev.inputType === "insertText" || ev.inputType === "insertReplacementText" || ev.inputType === "insertFromPaste") { const d = ev.data ?? ev.dataTransfer?.getData("text/plain"); if (d) typeRef.current(d); }
      else if (ev.inputType === "insertLineBreak" || ev.inputType === "insertParagraph") pressRef.current(["Enter"]);
      else if (ev.inputType === "deleteContentBackward" || ev.inputType === "deleteWordBackward") pressRef.current(["Backspace"]);
      else if (ev.inputType === "deleteContentForward") pressRef.current(["Delete"]);
      reset();
    };
    const composed = (ev: CompositionEvent) => { if (ev.data) typeRef.current(ev.data); window.setTimeout(reset, 0); };
    el.addEventListener("beforeinput", before);
    el.addEventListener("compositionend", composed);
    el.addEventListener("input", reset);
    el.addEventListener("focus", reset);
    return () => { el.removeEventListener("beforeinput", before); el.removeEventListener("compositionend", composed); el.removeEventListener("input", reset); el.removeEventListener("focus", reset); };
  }, []);
  useEffect(() => { if (keys) kbd.current?.focus(); else kbd.current?.blur(); }, [keys]);
  // Tapping a key on the bar must not take the focus from the text field (the on-screen keyboard would close).
  const keepFocus = (e: React.PointerEvent) => { e.preventDefault(); kbd.current?.focus(); };

  // Must run inside the tap: browsers only start sound after a user gesture.
  const toggleSound = () => {
    const id = sidRef.current;
    if (!id) return;
    if (soundOn) { setSoundOn(false); audio.current?.close(); audio.current = null; void client.call("remote.audio", { sessionId: id, on: false }).catch(() => {}); return; }
    try { audio.current = new RemoteAudio(prefs.volume); } catch { toast(t("Dieser Browser kann keinen Ton abspielen."), "error"); return; }
    client.call("remote.audio", { sessionId: id, on: true }).then(() => setSoundOn(true), (e: Error) => { audio.current?.close(); audio.current = null; toast(e.message, "error"); });
  };
  useEffect(() => { audio.current?.setVolume(prefs.volume); }, [prefs.volume]);
  useEffect(() => { if (!soundOn) return; const id = window.setInterval(() => setAudioBuf(audio.current?.bufferMs ?? 0), 1000); return () => clearInterval(id); }, [soundOn]);
  // A new session (after reconnecting) starts without sound – the button shows that.
  useEffect(() => { setSoundOn(false); audio.current?.close(); audio.current = null; }, [sid]);

  const setQuality = (preset: RemotePrefs["preset"]) => {
    setPrefs({ preset });
    const id = sidRef.current;
    if (id) void client.call("remote.quality", { sessionId: id, preset, maxWidth: prefs.maxWidth, fps: prefs.fps }).catch((e: Error) => toast(e.message, "error"));
  };
  const togglePause = () => {
    const id = sidRef.current;
    if (!id) return;
    client.call("remote.pause", { sessionId: id, paused: !paused }).then(() => setPaused(!paused), (e: Error) => toast(e.message, "error"));
  };
  const disconnect = () => {
    const id = sidRef.current;
    wantRunning.current = false; setPhase("ending");
    if (!id) { end(t("Verbindung getrennt.")); return; }
    client.call("remote.stop", { sessionId: id }).finally(() => end(t("Verbindung getrennt – die Übertragung am PC ist beendet.")));
  };
  const fullscreen = () => {
    if (wrap.current?.requestFullscreen && document.fullscreenEnabled) {
      if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.current.requestFullscreen().catch(() => toast(t("Vollbild wurde vom Browser abgelehnt."), "error"));
    } else toast(t("Dieser Browser erlaubt Webseiten kein Vollbild (iPhone). Tipp: Teilen → „Zum Home-Bildschirm“ – dann ohne Adressleiste."), "info");
  };
  // From the response time only: an unchanged picture is (on purpose) not sent again, so a low frame rate is no sign of a bad line.
  const quality = stats.rtt === 0 ? "" : stats.rtt < 120 ? t("gut") : stats.rtt < 350 ? t("mittel") : t("schwach");
  const origin = `${cursor.x * 100}% ${cursor.y * 100}%`;

  return (
    <div ref={wrap} className="rd-view" role="application" aria-label={t("Remote Desktop")}>
      {(bar || prefs.toolbar === "always") ? (
        <div className="rd-bar" role="toolbar" aria-label={t("Steuerleiste")}>
          <Button size="sm" variant={prefs.mode === "touchpad" ? "primary" : undefined} icon={prefs.mode === "touchpad" ? <MousePointer2 size={16} /> : <Hand size={16} />} onClick={() => setPrefs({ mode: prefs.mode === "touch" ? "touchpad" : "touch" })} disabled={!control}>
            {prefs.mode === "touchpad" ? t("Touchpad") : t("Touch-Maus")}
          </Button>
          <Button size="sm" variant={keys ? "primary" : undefined} icon={<Keyboard size={16} />} disabled={!control} onClick={() => setKeys(!keys)}>{t("Tastatur")}</Button>
          <Button size="sm" variant={rightNext ? "primary" : undefined} icon={<MousePointerClick size={16} />} disabled={!control} onClick={() => setRightNext(!rightNext)} aria-pressed={rightNext}>{t("Rechtsklick")}</Button>
          <Button size="sm" disabled={!control} onClick={() => send({ t: "release" })} title={t("Lässt alle gedrückten Maustasten und Tasten los")}>{t("Loslassen")}</Button>
          <Button size="sm" icon={<ZoomIn size={16} />} onClick={() => setZoom(zoom >= 3 ? 1 : zoom + 1)}>{zoom}×</Button>
          <Button size="sm" icon={paused ? <Play size={16} /> : <Pause size={16} />} onClick={togglePause} disabled={!sid}>{paused ? t("Fortsetzen") : t("Pause")}</Button>
          <Button size="sm" variant={soundOn ? "primary" : undefined} icon={soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />} disabled={!sid || !status.audio} aria-pressed={soundOn}
            title={status.audio ? undefined : status.audioReason ?? undefined} onClick={toggleSound}>{t("Ton")}</Button>
          <Button size="sm" icon={<Activity size={16} />} variant={showStats ? "primary" : undefined} onClick={() => setShowStats(!showStats)}>{t("Qualität")}{quality && `: ${quality}`}</Button>
          <Button size="sm" icon={<Maximize size={16} />} onClick={fullscreen}>{t("Vollbild")}</Button>
          <Button size="sm" variant="danger" icon={<Unplug size={16} />} onClick={disconnect}>{t("Trennen")}</Button>
          {prefs.toolbar !== "always" && <Button size="sm" variant="ghost" icon={<ChevronUp size={16} />} aria-label={t("Leiste einklappen")} onClick={() => setBar(false)} />}
        </div>
      ) : (
        <button type="button" className="rd-handle" aria-label={t("Steuerleiste zeigen")} onClick={() => setBar(true)}><ChevronDown size={16} /></button>
      )}
      {showStats && (
        <div className="rd-stats small">
          <span>{t("Bildrate (gemessen)")}: <b>{stats.fps}</b>/s</span>
          <span>{t("Daten")}: <b>{stats.kbps}</b> KB/s</span>
          <span>{t("Antwortzeit")}: <b>{stats.rtt || "–"}</b> ms</span>
          <span>{t("Bild")}: <b>{stats.w}×{stats.h}</b> · {t("Qualität")} {stats.quality}</span>
          <span>{t("Aufnahme am PC")}: <b>{stats.captureMs}</b> ms</span>
          {soundOn && <span>{t("Ton-Puffer")}: <b>{audioBuf}</b> ms</span>}
          <label className="row small" style={{ gap: 6 }}>{t("Lautstärke")}<input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} aria-label={t("Lautstärke")} /></label>
          <Segmented value={prefs.preset} onChange={setQuality} options={PRESETS.map((p) => ({ value: p.value, label: t(p.label) }))} />
        </div>
      )}
      {keys && control && (
        <div className="rd-keys">
          {MODS.map(([k, label]) => <button key={k} type="button" onPointerDown={keepFocus} className={`chip ${mods.includes(k) ? "on" : ""}`} aria-pressed={mods.includes(k)} onClick={() => setMods(mods.includes(k) ? mods.filter((x) => x !== k) : [...mods, k])}>{label}</button>)}
          {KEYBAR.map(([label, k]) => <button key={label} type="button" className="chip" onPointerDown={keepFocus} onClick={() => pressKeys(k)}>{label}</button>)}
        </div>
      )}
      <textarea ref={kbd} className="rd-kbd" aria-label={t("Texteingabe für den PC")} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <div className="rd-surface">
        <canvas ref={canvas} className="rd-canvas" style={{ transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: origin }} />
        {prefs.mode === "touchpad" && control && size.current.w > 0 && <Pointer canvas={canvas.current} x={cursor.x} y={cursor.y} w={size.current.w} h={size.current.h} />}
        {phase !== "live" && (
          <div className="rd-overlay">
            {phase === "starting" && <p>{t("Bildschirmübertragung wird gestartet …")}</p>}
            {phase === "reconnecting" && <p>{online ? t("Wiederverbindung läuft …") : t("Verbindung unterbrochen – warte auf den PC …")}</p>}
            {phase === "ending" && <p>{t("Sitzung wird beendet …")}</p>}
            {phase === "failed" && (
              <div className="stack-sm" style={{ alignItems: "center" }}>
                <MonitorOff size={28} />
                <b>{t("Verbindung fehlgeschlagen")}</b>
                <p className="small">{error}</p>
                <div className="row"><Button onClick={() => void start()}>{t("Erneut versuchen")}</Button><Button variant="ghost" onClick={() => end(error ?? "")}>{t("Schließen")}</Button></div>
              </div>
            )}
          </div>
        )}
        {problem && <div className="rd-overlay"><MonitorOff size={28} /><p>{problem}</p></div>}
        {paused && phase === "live" && <div className="rd-overlay"><Pause size={28} /><p>{t("Übertragung pausiert")}</p></div>}
        {status.testSource && <div className="rd-badge">{t("Testbild – kein echter Bildschirm")}</div>}
        {!control && phase === "live" && <div className="rd-badge" style={{ top: 34 }}>{t("Nur ansehen")}</div>}
      </div>
    </div>
  );
}

/** The pointer in touchpad mode, drawn at once on this device (the PC picture follows a moment later). */
function Pointer({ canvas, x, y, w, h }: { canvas: HTMLCanvasElement | null; x: number; y: number; w: number; h: number }) {
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  const parent = canvas.parentElement!.getBoundingClientRect();
  const s = Math.min(box.width / w, box.height / h);
  const left = box.left - parent.left + (box.width - w * s) / 2 + x * w * s, top = box.top - parent.top + (box.height - h * s) / 2 + y * h * s;
  return <MousePointer2 className="rd-pointer" size={22} style={{ left, top }} aria-hidden />;
}
