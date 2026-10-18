import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Gamepad2, Home, Menu, MonitorSmartphone, Music, Search, Smartphone, Zap } from "lucide-react";
import { client, exitDemo } from "../lib/rpc";
import { DEMO_BUILD } from "../lib/demo";
import { t } from "../lib/i18n";
import { navItems } from "../lib/nav";
import { useConn, useEvent, toast } from "../lib/hooks";
import { useAppState } from "../lib/state";
import { Banner, Button, Modal } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { UpdatePrompt } from "./UpdateCenter";
import { startPendingSync } from "../lib/pending-sounds";

function ConnPill() {
  const conn = useConn();
  const nav = useNavigate();
  const relayOff = conn.relayCompanion === "offline";
  const kind = conn.phase !== "online" || relayOff ? "error" : conn.auth === "ok" ? "ok" : "warn";
  const label = conn.phase === "connecting" ? t("Verbinde …") : conn.phase === "offline" ? t("Offline") : relayOff ? t("PC offline") :
    `${conn.hello?.transport === "relay" ? t("Über Relay") : t("Lokal")}${conn.latencyMs != null ? ` · ${conn.latencyMs} ms` : ""}`;
  return (
    <button className="conn-pill" onClick={() => nav("/diagnostics")} title={conn.lastError ?? label} aria-label={t("Verbindungsstatus: {s}", { s: label })}>
      <span className={`dot ${kind} ${conn.phase === "connecting" ? "pulse" : ""}`} />
      <span className="label">{label}</span>
    </button>
  );
}

/** Global pairing confirmation on the PC: appears on every page when a device asks to pair. */
function PairingRequests() {
  const conn = useConn();
  const [pending, setPending] = useState<{ requestId: string; deviceName: string; platform: string; ip?: string }[]>([]);
  const isLocal = conn.me?.isLocal;
  const load = useCallback(() => {
    if (!isLocal) return;
    client.call<{ pending: typeof pending }>("pairing.pending").then((r) => setPending(r.pending)).catch(() => {});
  }, [isLocal]);
  useEffect(load, [load]);
  useEvent("pairing.pending", load);
  useEvent<{ topic: string }>("changed", (d) => { if (d.topic === "pairing") load(); });
  const p = pending[0];
  if (!isLocal || !p) return null;
  const decide = async (approve: boolean) => {
    try {
      await client.call("pairing.decide", { requestId: p.requestId, approve });
      toast(approve ? t("„{n}“ ist jetzt gekoppelt", { n: p.deviceName }) : t("Anfrage abgelehnt"), approve ? "success" : "info");
    } catch (e) { toast((e as Error).message, "error"); }
    load();
  };
  return (
    <Modal title={t("Neue Kopplungsanfrage")} onClose={() => decide(false)} footer={<>
      <Button variant="danger" onClick={() => decide(false)}>{t("Ablehnen")}</Button>
      <Button variant="primary" onClick={() => decide(true)}>{t("Erlauben")}</Button>
    </>}>
      <div className="row nowrap">
        <div className="state-icon" style={{ margin: 0, width: 56, height: 56 }}><Smartphone size={28} /></div>
        <div className="grow">
          <h3>{p.deviceName}</h3>
          <div className="muted small">{p.platform}{p.ip ? ` · ${p.ip}` : ""}</div>
        </div>
      </div>
      <Banner kind="warn">{t("Nur erlauben, wenn du gerade selbst ein Gerät koppelst. Das Gerät kann danach Spiele und Programme aus deiner Freigabeliste starten, Sounds abspielen und Einstellungen ändern.")}</Banner>
    </Modal>
  );
}

/** Opens when something is used that needs the PC while no PC is connected yet. */
function NeedsPc() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  useEvent("needs-pc", () => setOpen(true));
  if (!open) return null;
  const paired = !!client.credentials;
  return (
    <Modal title={t("Erst PC verbinden")} onClose={() => setOpen(false)} footer={<>
      <Button onClick={() => setOpen(false)}>{t("Weiter umsehen")}</Button>
      <Button variant="primary" icon={<MonitorSmartphone size={16} />} onClick={() => { setOpen(false); nav("/connect"); }}>{t("PC verbinden")}</Button>
    </>}>
      <div className="row nowrap">
        <div className="state-icon" style={{ margin: 0, width: 56, height: 56, flex: "none" }}><MonitorSmartphone size={28} /></div>
        <p className="muted" style={{ margin: 0 }}>{paired
          ? t("Dein PC ist gerade nicht erreichbar. Sobald er an ist und der PC Game Launcher läuft, verbindet sich die App automatisch.")
          : t("Das funktioniert, sobald dein PC verbunden ist. Scanne dazu den QR-Code aus dem PC Game Launcher auf deinem PC oder gib den Code ein. Design und Layout kannst du schon jetzt ändern.")}</p>
      </div>
    </Modal>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const conn = useConn();
  const { state } = useAppState();
  const items = navItems();
  const current = items.find((i) => i.path !== "/" && loc.pathname.startsWith(i.path)) ?? items[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement).tagName);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setMore(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  // Sounds added while the PC was off are uploaded after every login.
  useEffect(() => startPendingSync((r) => {
    if (r.sent) toast(t("{n} gespeicherte Sounds auf den PC übertragen", { n: r.sent }), "success");
    if (r.failed) toast(t("{n} Sounds konnten nicht übertragen werden – Details im Soundboard", { n: r.failed }), "warning");
  }), []);

  const groups = [...new Set(items.map((i) => i.group))];
  const preview = client.preview;
  const notifCount = preview ? 0 : state?.counts.notifications ?? 0;

  return (
    <div className="shell">
      <a href="#main" className="sr-only">{t("Zum Inhalt springen")}</a>
      <aside className="sidebar" aria-label={t("Hauptnavigation")}>
        <div className="brand">
          <img src="icons/icon-192.png" alt="" />
          <div><b>Game Launcher</b><small>Ultimate</small></div>
        </div>
        {groups.map((g) => (
          <nav className="nav-group" key={g} aria-label={g}>
            <span>{g}</span>
            {items.filter((i) => i.group === g).map((i) => (
              <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <i.icon size={18} />{i.label}
                {i.path === "/notifications" && notifCount > 0 && <span className="count">{notifCount}</span>}
              </NavLink>
            ))}
          </nav>
        ))}
        <div style={{ marginTop: "auto", padding: "14px 10px 4px" }} className="tiny muted">
          {preview ? t("Kein PC verbunden") : state ? `${state.pcName} · v${state.version}` : conn.hello?.info.pcName}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="title">{current.label}</span>
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label={t("Suche öffnen")}>
            <Search size={17} /><span className="label">{t("Suchen …")}</span><kbd>Ctrl K</kbd>
          </button>
          <span className="spacer" />
          {!preview && state?.activeProfile && (
            <NavLink to="/profiles" className="badge hide-mobile" style={{ background: `${state.activeProfile.color}22`, color: state.activeProfile.color, height: 30, padding: "0 12px" }}>
              ● {state.activeProfile.name}
            </NavLink>
          )}
          <ConnPill />
          <NavLink to="/notifications" className="btn ghost icon" aria-label={t("Benachrichtigungen")} style={{ position: "relative" }}>
            <Bell size={19} />
            {notifCount > 0 && <span className="dot error" style={{ position: "absolute", top: 8, right: 9 }} />}
          </NavLink>
        </header>

        {client.demo && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="info" title={t("Demo-Ansicht – kein PC verbunden")}
              actions={!DEMO_BUILD && <Button size="sm" onClick={exitDemo}>{t("Demo beenden")}</Button>}>
              {t("Alle Inhalte sind Beispiele, Aktionen werden nicht ausgeführt. Zum Steuern deines PCs den Companion starten und die Adresse aus „Gerät koppeln“ öffnen.")}
            </Banner>
          </div>
        )}
        {preview && loc.pathname !== "/connect" && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="warn" title={conn.auth === "revoked" ? t("Kopplung wurde aufgehoben") : t("Offline – kein PC verbunden")} actions={
              <NavLink to="/connect" className="btn primary sm"><MonitorSmartphone size={15} />{t("PC verbinden")}</NavLink>}>
              {t("Design und Layout kannst du schon ändern.")}
            </Banner>
          </div>
        )}
        {!preview && conn.phase !== "online" && !client.demo && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="warn" title={conn.everConnected ? t("Verbindung unterbrochen") : t("PC ist aus oder nicht erreichbar")}
              actions={<Button size="sm" onClick={() => client.reconnectNow()}>{t("Jetzt verbinden")}</Button>}>
              {conn.everConnected ? t("Automatischer neuer Versuch läuft. Angezeigte Daten können veraltet sein.")
                : t("Die App verbindet sich automatisch, sobald der PC an ist. Design und Layout kannst du schon jetzt unter Einstellungen ändern.")}
            </Banner>
          </div>
        )}
        {conn.relayCompanion === "offline" && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="error" title={t("PC nicht erreichbar")}>{t("Das Relay ist erreichbar, aber der Companion auf deinem PC ist nicht verbunden. Ist der PC an und läuft der Companion?")}</Banner>
          </div>
        )}

        <main id="main" className="content" key={loc.pathname}>{children}</main>
      </div>

      <nav className="bottom-nav" aria-label={t("Schnellnavigation")}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}><Home size={22} />{t("Home")}</NavLink>
        <NavLink to="/games" className={({ isActive }) => (isActive ? "active" : "")}><Gamepad2 size={22} />{t("Spiele")}</NavLink>
        <NavLink to="/soundboard" className={({ isActive }) => (isActive ? "active" : "")}><Music size={22} />{t("Sounds")}</NavLink>
        <NavLink to="/quick" className={({ isActive }) => (isActive ? "active" : "")}><Zap size={22} />{t("Aktionen")}</NavLink>
        <NavLink to="/connect" className={({ isActive }) => `connect-item ${isActive ? "active" : ""}`}>
          <MonitorSmartphone size={22} />{t("Verbinden")}
          <span className={`dot ${conn.auth === "ok" && conn.phase === "online" ? "ok" : client.demo ? "warn" : "error"}`} aria-hidden />
        </NavLink>
        <button onClick={() => setMore(true)} className={more ? "active" : ""}><Menu size={22} />{t("Mehr")}</button>
      </nav>

      {more && (
        <Modal title={t("Alle Bereiche")} onClose={() => setMore(false)}>
          <div className="sheet-grid">
            {items.map((i) => (
              <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => (isActive ? "active" : "")}><i.icon size={22} />{i.label}</NavLink>
            ))}
          </div>
        </Modal>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <PairingRequests />
      <NeedsPc />
      <UpdatePrompt />
    </div>
  );
}
