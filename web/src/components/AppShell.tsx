import { PrivacyButton } from "./privacy";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { recentTap } from "../lib/last-tap";
import { AccountButton } from "./account-button";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Check, ChevronDown, Menu, Monitor, MonitorSmartphone, PanelBottom, Pencil, RotateCcw, Search, Shield, Smartphone, Wifi } from "lucide-react";
import { SheetNav } from "./sidebar-nav";
import { MockNav } from "./mock-nav";
import { JarvisIsland } from "./jarvis-island";
import { useInAppIsland } from "../lib/island-inapp";
import { client, exitDemo, HOSTED, lanPc } from "../lib/rpc";
import { connView, isHomeNetworkHost } from "../lib/conn-state";
import { DEMO_BUILD } from "../lib/demo-flag";
import { t } from "../lib/i18n";
import { DEFAULT_BOTTOM, navColor, navItems, type NavItem } from "../lib/nav";

/** Colour of an area's symbol – only when colourful symbols are switched on (Leiste anpassen / Navigation). */
const icStyle = (path: string, on: boolean) => (on ? { ["--ic" as string]: navColor(path) } : undefined);
import { setPrefs, usePrefs } from "../lib/prefs";
import { useConn, useConnectingSoon, useEvent, toast } from "../lib/hooks";
import { onCacheFull } from "../lib/offline-cache";
import { useAppState } from "../lib/state";
import { StatusPill } from "./status-pill";
import { Banner, Button, Modal, Segmented } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { PcPageOutdated, UpdatePrompt } from "./UpdateCenter";
import { CONFIRM_METHODS, needsConfirm, outbox, useOutbox } from "../lib/outbox";
import { startOutboxSync, syncMessage, syncOutbox } from "../lib/outbox-sync";
import { startJournalSync } from "../lib/journal";
import { MemoryHint } from "./memory-hint";
import { startPendingSync } from "../lib/pending-sounds";

/** Bottom of the sidebar: is the PC ready? (real connection state – never "bereit" without a connection) */
function SideStatus({ preview, name, version }: { preview: boolean; name?: string; version?: string }) {
  const conn = useConn();
  const view = connView(conn, { demo: client.demo, hasCredentials: !!client.credentials });
  const ready = view.key === "connected";
  return (
    <NavLink to="/diagnostics" className={`side-status ${ready ? "ok" : view.tone}`} aria-label={t("Verbindungsstatus: {s}", { s: t(view.label) })}>
      <span className="side-status-ic"><Monitor size={18} /></span>
      <span className="side-status-txt">
        <b>{ready ? t("PC verbunden") : preview ? t("Kein PC verbunden") : t(view.short)}</b>
        <small>{ready ? t("Bereit zum Starten") : name ? `${name}${version ? ` · v${version}` : ""}` : t(view.label)}</small>
      </span>
    </NavLink>
  );
}

function ConnPill() {
  const conn = useConn();
  const nav = useNavigate();
  const view = connView(conn, { demo: client.demo, hasCredentials: !!client.credentials });
  const kind = view.tone;
  // Signed in: how (local/relay) and the measured ping; otherwise the real state in short words.
  const label = view.key === "connected" ? `${conn.hello?.transport === "relay" ? t("Über Relay") : t("Lokal")}${conn.latencyMs != null ? ` · ${conn.latencyMs} ms` : ""}` : t(view.short);
  return (
    <button className="conn-pill" onClick={() => nav("/diagnostics")} title={[t(view.label), conn.lastError].filter(Boolean).join(" – ")} aria-label={t("Verbindungsstatus: {s}", { s: t(view.label) })}>
      <span className={`dot ${kind} ${conn.phase === "connecting" ? "pulse" : ""}`} />
      <span className="label">{label}</span>
      {view.key === "connected" && <Wifi size={16} className="conn-wifi" aria-hidden />}
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
          ? t("Dein PC ist gerade nicht erreichbar. Sobald er an ist und der Nexus Gaming Hub läuft, verbindet sich die App automatisch.")
          : t("Das funktioniert, sobald dein PC verbunden ist. Scanne dazu den QR-Code aus dem Nexus Gaming Hub auf deinem PC oder gib den Code ein. Design und Layout kannst du schon jetzt ändern.")}</p>
      </div>
    </Modal>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => { const on = () => setWide(window.innerWidth >= 1024); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const [sheetEdit, setSheetEdit] = useState(false);
  const [barEdit, setBarEdit] = useState(false);
  // Phone: the top bar floats over the page and only gets its glass once the page has scrolled under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 6); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  const loc = useLocation();
  const [entering, setEntering] = useState(true);
  // A page opened by tapping something INSIDE a page (a card, a tile) grows out of that spot; from the sidebar/top bar it rises as before.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const tap = recentTap(900);
    setOrigin(tap && !tap.side ? { x: tap.x, y: tap.y - (document.querySelector(".content")?.getBoundingClientRect().top ?? 0) } : null);
  }, [loc.pathname]);
  useEffect(() => { setEntering(true); const id = window.setTimeout(() => setEntering(false), 900); return () => window.clearTimeout(id); }, [loc.pathname]);
  const conn = useConn();
  const { state } = useAppState();
  const prefs = usePrefs();
  const all = navItems();
  const current = all.find((i) => i.path !== "/" && loc.pathname.startsWith(i.path)) ?? all[0];
  useEffect(() => { document.documentElement.toggleAttribute("data-nav-plain", !prefs.nav.colors); }, [prefs.nav.colors]);
  useEffect(() => { document.documentElement.toggleAttribute("data-deck-own", prefs.deckOwn === true); }, [prefs.deckOwn]);

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
  useEffect(() => { void import("../lib/transfer").then((m) => m.startTransferSync((r) => {
    if (r.sent) toast(t("{n} wartende Dateien an den PC gesendet", { n: r.sent }), "success");
    if (r.failed) toast(t("{n} Dateien konnten nicht gesendet werden – Details unter „Dateien“", { n: r.failed }), "warning");
  })); }, []);
  useEffect(() => startPendingSync((r) => {
    if (r.sent) toast(t("{n} gespeicherte Sounds auf den PC übertragen", { n: r.sent }), "success");
    if (r.failed) toast(t("{n} Sounds konnten nicht übertragen werden – Details im Soundboard", { n: r.failed }), "warning");
  }), []);

  // Changes made without the PC are sent after every login, in order.
  useEffect(() => startOutboxSync((r) => toast(syncMessage(r), r.failed ? "warning" : "success")), []);
  useEffect(() => startJournalSync(), []);
  // Calendar reminders on this device (also without the PC, while the app is open); loaded separately from the main bundle.
  useEffect(() => { void import("../lib/calendar-reminders").then((m) => m.startCalendarReminders()); }, []);
  useEffect(() => client.on("queued", () => toast(t("Gespeichert – wird übertragen, sobald der PC verbunden ist"), "info")), []);
  const waiting = useOutbox();
  useEffect(() => { const off = onCacheFull(() => toast(t("Der Speicher dieses Geräts ist voll – der letzte Stand kann nicht ganz gespeichert werden. Browser-Daten der Seite aufräumen schafft Platz."), "warning")); return () => { off(); }; }, []);
  const [appUpdated, setAppUpdated] = useState(false);
  useEffect(() => { const on = () => setAppUpdated(true); window.addEventListener("pgl-app-updated", on); return () => window.removeEventListener("pgl-app-updated", on); }, []);
  const [showOutbox, setShowOutbox] = useState(false);

  const inAppIsland = useInAppIsland();
  const preview = client.preview;
  const notifCount = preview ? 0 : state?.counts.notifications ?? 0;

  return (
    <div className="shell">
      <a href="#main" className="sr-only">{t("Zum Inhalt springen")}</a>
      <aside className="sidebar" aria-label={t("Hauptnavigation")}>
        <MockNav moreOpen={more} onSheet={() => setMore(true)}
          status={<SideStatus preview={preview} name={state?.pcName ?? conn.hello?.info.pcName} version={state?.version} />} />
      </aside>

      <div className="main">
        {inAppIsland && <div className="isl-float" role="region" aria-label={t("JARVIS-Insel")}><JarvisIsland floating /></div>}
        <header className={`topbar${scrolled ? " scrolled" : ""}${loc.pathname === "/" ? " on-home" : ""}`}>
          {/* Only where the sidebar is hidden (phone, small tablet): next to the sidebar every area is already there, a second menu button would be clutter. */}
          {!wide && <button type="button" className="topbar-menu" onClick={() => setMore(true)} aria-label={t("Alle Bereiche öffnen")} aria-haspopup="dialog"><Menu size={22} /></button>}
          <span className="title">{current.label}</span>
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label={t("Suche öffnen")}>
            <Search size={17} /><span className="label">{t("Suche nach Spielen, Apps …")}</span><kbd>Ctrl K</kbd>
          </button>
          <span className="spacer" />
          {!preview && state?.activeProfile && (
            <NavLink to="/profiles" className="badge hide-mobile" style={{ background: `${state.activeProfile.color}22`, color: state.activeProfile.color, height: 30, padding: "0 12px" }}>
              ● {state.activeProfile.name}
            </NavLink>
          )}
          <PrivacyButton />
          <ConnPill />
          <AccountButton />
          <NavLink to="/notifications" className="btn ghost icon bell-btn" aria-label={t("Benachrichtigungen")} style={{ position: "relative" }}>
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
        {!DEMO_BUILD && (
          <div style={{ padding: "0 clamp(16px,3vw,36px)" }}><PcPageOutdated /></div>
        )}
        {appUpdated && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="info" title={t("Neue Version der App geladen")} actions={<Button size="sm" variant="primary" onClick={() => location.reload()}>{t("Neu laden")}</Button>}>
              {t("Neu laden, um sie zu verwenden. Nicht gespeicherte Eingaben auf dieser Seite gehen dabei verloren.")}
            </Banner>
          </div>
        )}
        <StatusStrip preview={preview} waiting={waiting} home={loc.pathname === "/"} hidePreview={loc.pathname === "/connect"} onShowOutbox={() => setShowOutbox(true)} />
        {showOutbox && <OutboxDialog onClose={() => setShowOutbox(false)} />}
        <StatusPill />

        <main id="main" className={`content tx-${prefs.fx.transition.kind}${entering ? " entering" : ""}${entering && origin ? " from-tap" : ""}`} style={{ ["--tx-ms" as string]: `${prefs.fx.transition.ms}ms`, ...(origin ? { ["--ox" as string]: `${origin.x}px`, ["--oy" as string]: `${origin.y}px` } : {}) }} key={loc.pathname}>{children}</main>
      </div>

      <MemoryHint />
      <BottomBar items={all} preview={preview} more={more} onMore={() => setMore(true)} onEdit={() => setBarEdit(true)} />

      {barEdit && <BarEditor items={all} onClose={() => setBarEdit(false)} />}
      {more && (
        <Modal title={sheetEdit ? t("Bereiche bearbeiten") : t("Alle Bereiche")} onClose={() => { setMore(false); setSheetEdit(false); }}
          footer={<>
            <Button icon={sheetEdit ? <Check size={16} /> : <Pencil size={16} />} variant={sheetEdit ? "primary" : undefined} onClick={() => setSheetEdit(!sheetEdit)}>{sheetEdit ? t("Fertig") : t("Bearbeiten")}</Button>
            <Button icon={<Shield size={16} />} onClick={() => { setMore(false); setSheetEdit(false); window.dispatchEvent(new Event("pgl-open-privacy")); }}>{t("Datenschutz-Knopf")}</Button>
            <Button icon={<PanelBottom size={16} />} onClick={() => { setMore(false); setSheetEdit(false); setBarEdit(true); }}>{t("Leiste anpassen")}</Button>
          </>}>
          <SheetNav items={all} edit={sheetEdit} />
        </Modal>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <PairingRequests />
      <NeedsPc />
      <UpdatePrompt />
    </div>
  );
}

/** "Wartende Änderungen": everything changed without the PC, in the order it will be sent. */
function OutboxDialog({ onClose }: { onClose: () => void }) {
  const list = useOutbox();
  const conn = useConn();
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); const r = await syncOutbox({ retryFailed: true }); if (r.sent || r.failed) toast(syncMessage(r), r.failed ? "warning" : "success"); setBusy(false); };
  return (
    <Modal title={t("Wartende Änderungen")} onClose={onClose} footer={<>
      {conn.auth === "ok" && <Button variant="primary" busy={busy} onClick={retry}>{t("Jetzt übertragen")}</Button>}
      <Button onClick={onClose}>{t("Schließen")}</Button>
    </>}>
      <div className="stack">
        <p className="small muted">{conn.auth === "ok" ? t("Der PC ist verbunden.") : t("Wird übertragen, sobald der PC verbunden ist – in dieser Reihenfolge. Der PC prüft jede Änderung wie bei einer direkten Eingabe.")}</p>
        {list.length === 0 ? <p>{t("Alles übertragen.")}</p> : (
          <div className="list">{list.map((e) => (
            <div key={e.id} className="list-item">
              <span className={`dot ${e.error ? "error" : "warn"}`} />
              <div className="grow"><div className="title small">{e.label}</div><div className="sub tiny">{new Date(e.at).toLocaleString()}{e.error ? " · " + e.error : ""}{!e.error && e.attempts ? " · " + t("{n} Versuche ohne Antwort – wird erneut gesendet", { n: e.attempts }) : ""}
                {needsConfirm(e) && <b className="text-warn"> · {CONFIRM_METHODS.has(e.method) ? t("Bringt neue Plugin-Dateien oder Rechte auf den PC – erst nach Bestätigung") : t("Älter als 7 Tage – erst nach Bestätigung")}</b>}</div></div>
              {needsConfirm(e) && <Button size="sm" variant="primary" onClick={() => { outbox.confirm(e.id); if (conn.auth === "ok") void retry(); }}>{t("Bestätigen")}</Button>}
              <Button size="sm" variant="ghost" onClick={() => outbox.remove(e.id)}>{t("Verwerfen")}</Button>
            </div>
          ))}</div>
        )}
        <p className="tiny muted">{t("Spiele starten, Sounds abspielen oder den PC ausschalten wird nie vorgemerkt – das geht nur, wenn der PC verbunden ist.")}</p>
      </div>
    </Modal>
  );
}

const MAX_BAR = 4;

/** Phone bar: up to four own entries + "Mehr". "Verbinden" only while no PC is paired (afterwards the dot at the top shows the state). Long press = edit. */
/** One small line instead of several large banners (they took half of a phone screen): connection state and waiting
 * changes, with the explanation one tap away. */
function StatusStrip({ preview, waiting, home, hidePreview, onShowOutbox }: { preview: boolean; waiting: ReturnType<typeof useOutbox>; home: boolean; hidePreview: boolean; onShowOutbox: () => void }) {
  const conn = useConn();
  const [open, setOpen] = useState(false);
  const soon = useConnectingSoon();
  const offline = !client.demo && !preview && conn.phase !== "online" && !soon;
  const relayDown = conn.relayCompanion === "offline";
  const paused = !client.demo && conn.phase === "online" && conn.auth === "paused";
  // Signed in to the cloud account: the cloud link waits for the PC (or the cloud itself does not answer) – said as it is, with nothing to do for the user.
  const cloudWait = !client.demo && conn.phase !== "online" && conn.cloudLink === "waiting";
  const cloudDown = !client.demo && conn.phase !== "online" && conn.cloudLink === "down" && conn.via === "cloud";
  const cloudSeek = !client.demo && conn.phase === "connecting" && conn.via === "cloud";
  const showConn = (preview && !hidePreview && !home) || (offline && !home) || relayDown || paused || ((cloudWait || cloudDown) && !home);
  if (!showConn && waiting.length === 0) return null;
  const error = waiting.some((w) => w.error), confirm = waiting.some((w) => needsConfirm(w));
  const kind = relayDown || error || cloudDown ? "error" : preview || offline || confirm || paused || cloudWait ? "warn" : "info";
  const title = cloudWait ? t("Cloud verbunden · PC offline") : cloudDown ? t("Cloud nicht erreichbar") : cloudSeek && (preview || offline) ? t("PC wird gesucht") : preview ? (conn.auth === "revoked" ? t("Kopplung wurde aufgehoben") : t("Offline – kein PC verbunden"))
    : paused ? t("Vom PC pausiert (Datenschutzmodus)") : relayDown ? t("PC nicht erreichbar") : offline ? (conn.everConnected ? t("Verbindung unterbrochen") : t("PC ist aus oder nicht erreichbar")) : null;
  const lanHome = HOSTED && location.protocol === "https:" ? lanPc() : null;
  const detail = [
    lanHome && preview ? t("Diese Website (https) darf den PC im WLAN nicht direkt erreichen. Im WLAN läuft die App direkt vom PC unter {u} – dort ist dieses Gerät gekoppelt. Tipp: Diese PC-Seite zum Home-Bildschirm hinzufügen (Geräte & Verbindungen → „Als App auf den Home-Bildschirm“).", { u: lanHome.replace(/^http:\/\//, "") }) : null,
    cloudWait ? t("Dein Konto ist angemeldet, deine Cloud-Daten sind da. Sobald dein PC an ist und der Begleiter läuft, verbindet sich diese Seite von selbst – ohne QR-Code, ohne Code und ohne erneutes Anmelden.") : null,
    cloudDown ? t("Die Cloud antwortet gerade nicht. Es wird in wachsenden Abständen erneut versucht; im WLAN verbindet sich die Seite weiter direkt mit dem PC.") : null,
    preview && !cloudWait && !cloudDown ? t("Du kannst schon alles einrichten – Spiele bearbeiten, Sounds, Profile, Hotkeys, Aktionen, Automatisierungen, Plugins, Design. Übertragen wird beim ersten Verbinden.") : null,
    paused ? `${conn.authError ?? ""} ${t("Sobald der Datenschutzmodus am PC aus ist, verbindet sich dieses Gerät von selbst wieder. Angezeigt wird bis dahin der letzte Stand.")}`.trim() : null,
    relayDown ? t("Das Relay ist erreichbar, aber der Companion auf deinem PC ist nicht verbunden. Ist der PC an und läuft der Companion?") : null,
    offline && !relayDown && !HOSTED && isHomeNetworkHost(conn.url) && navigator.onLine ? t("Ist am Handy ein VPN aktiv? Viele VPNs leiten auch Verbindungen ins Heimnetz um – dann im VPN „Zugriff auf lokales Netzwerk“ erlauben oder es kurz ausschalten. Diagnose zeigt Details.") : null,
    offline && !relayDown && !cloudWait && !cloudDown ? (conn.everConnected ? t("Automatischer neuer Versuch läuft. Angezeigte Daten können veraltet sein.") : t("Die App verbindet sich automatisch, sobald der PC an ist. Design und Layout kannst du schon jetzt unter Einstellungen ändern.")) : null,
    waiting.length ? (error ? t("Einige Änderungen hat der PC abgelehnt – bitte ansehen.") : confirm ? t("Einige Änderungen (Plugins oder ältere) werden erst nach deiner Bestätigung übertragen.") : t("Sie werden automatisch übertragen, sobald der PC verbunden ist.")) : null,
  ].filter(Boolean);
  return (
    <div className={`status-strip ${kind}`} role="status">
      <button type="button" className="ss-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`dot ${kind === "info" ? "ok" : kind === "warn" ? "warn" : "error"}`} />
        <span className="ss-text">
          {title && <b>{title}</b>}
          {title && waiting.length > 0 && <span className="ss-sep"> · </span>}
          {waiting.length > 0 && <span>{t("{n} Änderungen warten auf den PC", { n: waiting.length })}</span>}
        </span>
        <ChevronDown size={16} className={open ? "ss-chev open" : "ss-chev"} aria-hidden />
      </button>
      <span className="ss-actions">
        {preview && !hidePreview && lanHome && <a href={`${lanHome}/#/`} className="btn primary sm"><MonitorSmartphone size={15} />{t("Zur PC-App (WLAN)")}</a>}
        {preview && !hidePreview && !lanHome && !cloudWait && !cloudSeek && <NavLink to="/connect" className="btn primary sm"><MonitorSmartphone size={15} />{t("PC verbinden")}</NavLink>}
        {offline && !relayDown && !cloudWait && <Button size="sm" onClick={() => client.reconnectNow()}>{t("Jetzt verbinden")}</Button>}
        {waiting.length > 0 && <Button size="sm" onClick={onShowOutbox}>{t("Anzeigen")}</Button>}
      </span>
      {open && <div className="ss-detail small">{detail.map((d) => <p key={d}>{d}</p>)}</div>}
    </div>
  );
}

function BottomBar({ items, preview, more, onMore, onEdit }: { items: NavItem[]; preview: boolean; more: boolean; onMore: () => void; onEdit: () => void }) {
  const prefs = usePrefs();
  const press = useRef<number | null>(null);
  const shown = prefs.nav.bottom.flatMap((p) => items.filter((i) => i.path === p && p !== "/connect")).slice(0, MAX_BAR);
  const start = () => { press.current = window.setTimeout(() => { press.current = null; navigator.vibrate?.(20); onEdit(); }, 600); };
  const cancel = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };
  const cols = shown.length + (preview ? 1 : 0) + 1;
  // One highlight that glides from entry to entry (measured, so it fits every number of entries and every label). A page that is not in the bar
  // belongs to "Mehr" – so there is always one place lit and the bar says where you are.
  const loc = useLocation();
  const inBar = shown.some((i) => (i.path === "/" ? loc.pathname === "/" : loc.pathname === i.path || loc.pathname.startsWith(i.path + "/"))) || (preview && loc.pathname.startsWith("/connect"));
  const moreOn = more || !inBar;
  const navRef = useRef<HTMLElement>(null), thumbRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const nav = navRef.current, th = thumbRef.current;
      if (!nav || !th) return;
      const act = nav.querySelector<HTMLElement>(".active .bn-icon");
      if (!act) { th.style.opacity = "0"; return; }
      // offsets instead of screen rectangles: the bar's own entrance animation must not shift the measurement
      let x = 0, y = 0;
      for (let el: HTMLElement | null = act; el && el !== nav; el = el.offsetParent as HTMLElement | null) { x += el.offsetLeft; y += el.offsetTop; }
      th.style.width = `${act.offsetWidth}px`; th.style.height = `${act.offsetHeight}px`;
      th.style.transform = `translate(${x}px, ${y}px)`;
      th.style.opacity = "1";
      th.style.setProperty("--bn-c", getComputedStyle(act).color);
      requestAnimationFrame(() => th.classList.add("ready"));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [loc.pathname, moreOn, cols, prefs.nav.bottom.join(","), prefs.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = () => { navigator.vibrate?.(6); };
  return (
    <nav ref={navRef} className="bottom-nav has-thumb" aria-label={t("Schnellnavigation")} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} onClick={tap}
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={(e) => { e.preventDefault(); cancel(); onEdit(); }}>
      <span className="bn-thumb" ref={thumbRef} aria-hidden />
      {shown.map((i) => (
        <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => (isActive ? "active" : "")} style={icStyle(i.path, prefs.nav.colors)}>
          <span className="bn-icon"><i.icon size={22} /></span><span className="bn-label">{i.short ?? i.label}</span>
        </NavLink>
      ))}
      {preview && (
        <NavLink to="/connect" className={({ isActive }) => `connect-item ${isActive ? "active" : ""}`}>
          <span className="bn-icon"><MonitorSmartphone size={22} /><span className="dot error" aria-hidden /></span><span className="bn-label">{t("Verbinden")}</span>
        </NavLink>
      )}
      <button type="button" onClick={onMore} className={moreOn ? "active" : ""} aria-expanded={more} aria-haspopup="dialog">
        <span className="bn-icon"><Menu size={22} /></span><span className="bn-label">{t("Mehr")}</span>
      </button>
    </nav>
  );
}

function BarEditor({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  const prefs = usePrefs();
  const [sel, setSel] = useState<string[]>(prefs.nav.bottom.filter((p) => p !== "/connect").slice(0, MAX_BAR));
  const [colors, setColors] = useState(prefs.nav.colors);
  const toggle = (p: string) => setSel((x) => (x.includes(p) ? x.filter((y) => y !== p) : x.length >= MAX_BAR ? x : [...x, p]));
  const move = (p: string, d: number) => setSel((x) => { const i = x.indexOf(p), j = i + d; if (j < 0 || j >= x.length) return x; const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = () => { setPrefs((p) => ({ ...p, nav: { ...p.nav, bottom: sel.length ? sel : [...DEFAULT_BOTTOM], colors } })); toast(t("Leiste gespeichert"), "success"); onClose(); };
  const byPath = new Map(items.map((i) => [i.path, i]));
  return (
    <Modal title={t("Untere Leiste anpassen")} onClose={onClose} footer={<>
      <Button icon={<RotateCcw size={15} />} onClick={() => { setSel([...DEFAULT_BOTTOM]); setColors(true); }} style={{ marginRight: "auto" }}>{t("Standard")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{t("Bis zu {n} Bereiche für den schnellen Zugriff – alles andere steht unter „Mehr“. Tipp: Lange auf die Leiste drücken öffnet diese Einstellung.", { n: MAX_BAR })}</p>
        <div className="bar-preview" aria-label={t("Vorschau")}>
          {sel.map((p) => { const i = byPath.get(p); if (!i) return null; return (
            <div key={p} className="bar-preview-item" style={icStyle(p, colors)}>
              <i.icon size={20} /><span>{i.short ?? i.label}</span>
              <div className="row nowrap" style={{ gap: 2 }}>
                <button type="button" className="link" aria-label={t("Nach links")} onClick={() => move(p, -1)}>‹</button>
                <button type="button" className="link" aria-label={t("Nach rechts")} onClick={() => move(p, 1)}>›</button>
              </div>
            </div>
          ); })}
          <div className="bar-preview-item muted"><Menu size={20} /><span>{t("Mehr")}</span></div>
        </div>
        <Segmented value={colors ? "color" : "plain"} onChange={(v) => setColors(v === "color")} label={t("Symbole")}
          options={[{ value: "color", label: t("Farbig") }, { value: "plain", label: t("Schlicht") }]} />
        <div className="chips" role="group" aria-label={t("Bereiche")} style={{ flexWrap: "wrap" }}>
          {items.filter((i) => i.path !== "/connect" && !prefs.nav.hidden.includes(i.path)).map((i) => (
            <button key={i.path} type="button" aria-pressed={sel.includes(i.path)} disabled={!sel.includes(i.path) && sel.length >= MAX_BAR}
              className={`chip ${sel.includes(i.path) ? "on" : ""}`} onClick={() => toggle(i.path)}><i.icon size={14} /> {i.short ?? i.label}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
