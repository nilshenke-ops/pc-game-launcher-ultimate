import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Menu, MonitorSmartphone, PanelBottom, RotateCcw, Search, Smartphone } from "lucide-react";
import { client, exitDemo } from "../lib/rpc";
import { DEMO_BUILD } from "../lib/demo-flag";
import { t } from "../lib/i18n";
import { arrangeNav, DEFAULT_BOTTOM, navColor, navItems, type NavItem } from "../lib/nav";
import { setPrefs, usePrefs } from "../lib/prefs";
import { useConn, useEvent, toast } from "../lib/hooks";
import { useAppState } from "../lib/state";
import { Banner, Button, Modal } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { UpdatePrompt } from "./UpdateCenter";
import { CONFIRM_METHODS, needsConfirm, outbox, useOutbox } from "../lib/outbox";
import { startOutboxSync, syncMessage, syncOutbox } from "../lib/outbox-sync";
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
          ? t("Dein PC ist gerade nicht erreichbar. Sobald er an ist und der Nexus Gaming Hub läuft, verbindet sich die App automatisch.")
          : t("Das funktioniert, sobald dein PC verbunden ist. Scanne dazu den QR-Code aus dem Nexus Gaming Hub auf deinem PC oder gib den Code ein. Design und Layout kannst du schon jetzt ändern.")}</p>
      </div>
    </Modal>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const [barEdit, setBarEdit] = useState(false);
  const loc = useLocation();
  const conn = useConn();
  const { state } = useAppState();
  const prefs = usePrefs();
  const all = navItems();
  const items = arrangeNav(all, prefs.nav);
  const current = all.find((i) => i.path !== "/" && loc.pathname.startsWith(i.path)) ?? all[0];

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

  // Changes made without the PC are sent after every login, in order.
  useEffect(() => startOutboxSync((r) => toast(syncMessage(r), r.failed ? "warning" : "success")), []);
  useEffect(() => client.on("queued", () => toast(t("Gespeichert – wird übertragen, sobald der PC verbunden ist"), "info")), []);
  const waiting = useOutbox();
  const [appUpdated, setAppUpdated] = useState(false);
  useEffect(() => { const on = () => setAppUpdated(true); window.addEventListener("pgl-app-updated", on); return () => window.removeEventListener("pgl-app-updated", on); }, []);
  const [showOutbox, setShowOutbox] = useState(false);

  const groups = [...new Set(items.map((i) => i.group))];
  const preview = client.preview;
  const notifCount = preview ? 0 : state?.counts.notifications ?? 0;

  return (
    <div className="shell">
      <a href="#main" className="sr-only">{t("Zum Inhalt springen")}</a>
      <aside className="sidebar" aria-label={t("Hauptnavigation")}>
        <div className="brand">
          <img src="icons/icon-192.png" alt="" />
          <div><b>Nexus</b><small>Gaming Hub</small></div>
        </div>
        {groups.map((g) => (
          <nav className="nav-group" key={g} aria-label={g}>
            <span>{g}</span>
            {items.filter((i) => i.group === g).map((i) => (
              <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} style={{ ["--ic" as string]: navColor(i.path) }}>
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
        {preview && loc.pathname !== "/connect" && loc.pathname !== "/" && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="warn" title={conn.auth === "revoked" ? t("Kopplung wurde aufgehoben") : t("Offline – kein PC verbunden")} actions={
              <NavLink to="/connect" className="btn primary sm"><MonitorSmartphone size={15} />{t("PC verbinden")}</NavLink>}>
              {t("Du kannst schon alles einrichten – Spiele bearbeiten, Sounds, Profile, Hotkeys, Aktionen, Automatisierungen, Plugins, Design. Übertragen wird beim ersten Verbinden.")}
            </Banner>
          </div>
        )}
        {appUpdated && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind="info" title={t("Neue Version der App geladen")} actions={<Button size="sm" variant="primary" onClick={() => location.reload()}>{t("Neu laden")}</Button>}>
              {t("Neu laden, um sie zu verwenden. Nicht gespeicherte Eingaben auf dieser Seite gehen dabei verloren.")}
            </Banner>
          </div>
        )}
        {waiting.length > 0 && (
          <div style={{ padding: "12px clamp(16px,3vw,36px) 0" }}>
            <Banner kind={waiting.some((w) => w.error) ? "error" : waiting.some((w) => needsConfirm(w)) ? "warn" : "info"} title={t("{n} Änderungen warten auf den PC", { n: waiting.length })}
              actions={<Button size="sm" onClick={() => setShowOutbox(true)}>{t("Anzeigen")}</Button>}>
              {waiting.some((w) => w.error) ? t("Einige Änderungen hat der PC abgelehnt – bitte ansehen.")
                : waiting.some((w) => needsConfirm(w)) ? t("Einige Änderungen (Plugins oder ältere) werden erst nach deiner Bestätigung übertragen.")
                : t("Sie werden automatisch übertragen, sobald der PC verbunden ist.")}
            </Banner>
          </div>
        )}
        {showOutbox && <OutboxDialog onClose={() => setShowOutbox(false)} />}
        {!preview && conn.phase !== "online" && !client.demo && loc.pathname !== "/" && (
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

      <BottomBar items={all} preview={preview} more={more} onMore={() => setMore(true)} onEdit={() => setBarEdit(true)} />

      {barEdit && <BarEditor items={all} onClose={() => setBarEdit(false)} />}
      {more && (
        <Modal title={t("Alle Bereiche")} onClose={() => setMore(false)}
          footer={<Button icon={<PanelBottom size={16} />} onClick={() => { setMore(false); setBarEdit(true); }}>{t("Leiste anpassen")}</Button>}>
          {groups.map((g) => (
            <section key={g} className="sheet-group" aria-label={g}>
              <h3>{g}</h3>
              <div className="sheet-grid">
                {items.filter((i) => i.group === g).map((i) => (
                  <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => (isActive ? "active" : "")} style={{ ["--ic" as string]: navColor(i.path) }}><span className="nav-tile"><i.icon size={22} /></span>{i.label}</NavLink>
                ))}
              </div>
            </section>
          ))}
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
function BottomBar({ items, preview, more, onMore, onEdit }: { items: NavItem[]; preview: boolean; more: boolean; onMore: () => void; onEdit: () => void }) {
  const prefs = usePrefs();
  const press = useRef<number | null>(null);
  const shown = prefs.nav.bottom.flatMap((p) => items.filter((i) => i.path === p && p !== "/connect")).slice(0, MAX_BAR);
  const start = () => { press.current = window.setTimeout(() => { press.current = null; navigator.vibrate?.(20); onEdit(); }, 600); };
  const cancel = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };
  const cols = shown.length + (preview ? 1 : 0) + 1;
  return (
    <nav className="bottom-nav" aria-label={t("Schnellnavigation")} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={(e) => { e.preventDefault(); cancel(); onEdit(); }}>
      {shown.map((i) => (
        <NavLink key={i.path} to={i.path} end={i.path === "/"} className={({ isActive }) => (isActive ? "active" : "")} style={{ ["--ic" as string]: navColor(i.path) }}>
          <span className="bn-icon"><i.icon size={22} /></span><span className="bn-label">{i.short ?? i.label}</span>
        </NavLink>
      ))}
      {preview && (
        <NavLink to="/connect" className={({ isActive }) => `connect-item ${isActive ? "active" : ""}`}>
          <span className="bn-icon"><MonitorSmartphone size={22} /><span className="dot error" aria-hidden /></span><span className="bn-label">{t("Verbinden")}</span>
        </NavLink>
      )}
      <button type="button" onClick={onMore} className={more ? "active" : ""} aria-expanded={more} aria-haspopup="dialog">
        <span className="bn-icon"><Menu size={22} /></span><span className="bn-label">{t("Mehr")}</span>
      </button>
    </nav>
  );
}

function BarEditor({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  const prefs = usePrefs();
  const [sel, setSel] = useState<string[]>(prefs.nav.bottom.filter((p) => p !== "/connect").slice(0, MAX_BAR));
  const toggle = (p: string) => setSel((x) => (x.includes(p) ? x.filter((y) => y !== p) : x.length >= MAX_BAR ? x : [...x, p]));
  const move = (p: string, d: number) => setSel((x) => { const i = x.indexOf(p), j = i + d; if (j < 0 || j >= x.length) return x; const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = () => { setPrefs((p) => ({ ...p, nav: { ...p.nav, bottom: sel.length ? sel : [...DEFAULT_BOTTOM] } })); toast(t("Leiste gespeichert"), "success"); onClose(); };
  const byPath = new Map(items.map((i) => [i.path, i]));
  return (
    <Modal title={t("Untere Leiste anpassen")} onClose={onClose} footer={<>
      <Button icon={<RotateCcw size={15} />} onClick={() => setSel([...DEFAULT_BOTTOM])} style={{ marginRight: "auto" }}>{t("Standard")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{t("Bis zu {n} Bereiche für den schnellen Zugriff – alles andere steht unter „Mehr“. Tipp: Lange auf die Leiste drücken öffnet diese Einstellung.", { n: MAX_BAR })}</p>
        <div className="bar-preview" aria-label={t("Vorschau")}>
          {sel.map((p) => { const i = byPath.get(p); if (!i) return null; return (
            <div key={p} className="bar-preview-item">
              <i.icon size={20} /><span>{i.short ?? i.label}</span>
              <div className="row nowrap" style={{ gap: 2 }}>
                <button type="button" className="link" aria-label={t("Nach links")} onClick={() => move(p, -1)}>‹</button>
                <button type="button" className="link" aria-label={t("Nach rechts")} onClick={() => move(p, 1)}>›</button>
              </div>
            </div>
          ); })}
          <div className="bar-preview-item muted"><Menu size={20} /><span>{t("Mehr")}</span></div>
        </div>
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
