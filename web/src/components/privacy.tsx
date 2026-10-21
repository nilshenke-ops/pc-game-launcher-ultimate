// Privacy / emergency button. One tap runs the steps chosen beforehand on the PC (stop sounds, mic passthrough off,
// Windows mic mute, quiet notifications, pause other devices, hide content) and shows what each step really did.
// Without the PC only this device can hide its content – the PC steps are shown as not done. Never queued.
import { useEffect, useState, useSyncExternalStore } from "react";
import { EyeOff, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { relTime } from "../lib/format";
import { Banner, Button, Modal, StatusIcon, Switch } from "./ui";

export interface PrivacyConfig { stopSounds: boolean; stopMicPassthrough: boolean; muteMic: boolean; quietNotifications: boolean; quietCategories: string[]; pauseOtherDevices: boolean; hideSensitive: boolean }
export interface PrivacyResult { id: string; label: string; status: "active" | "done" | "failed" | "unsupported" | "info"; detail: string }
export interface PrivacyStatus { active: boolean; since?: string | null; by?: string | null; results?: PrivacyResult[]; hideSensitive?: boolean; config: PrivacyConfig; can: { sounds: boolean; passthrough: boolean; micMute: boolean } }

export const PRIVACY_CATEGORIES: [string, string][] = [["update", "Updates"], ["launch", "Spielstarts"], ["automation", "Automatisierungen"], ["plugin", "Plugins"], ["quest", "Ziele"], ["deal", "Angebote"], ["recording", "Aufnahme"], ["assistant", "Assistent"], ["gamemode", "Spielmodus"], ["calendar", "Kalender"], ["system", "System"]];
const STATUS_LABEL: Record<PrivacyResult["status"], string> = { active: "Wirkt", done: "Erledigt", failed: "Fehlgeschlagen", unsupported: "Nicht möglich", info: "Hinweis" };
const STATUS_ICON: Record<PrivacyResult["status"], string> = { active: "ok", done: "ok", failed: "error", unsupported: "unsupported", info: "info" };

// ---------------------------------------------------------------- hiding on this device (works without the PC)
const LOCAL_KEY = "pgl.privacy.hide";
let localHide = (() => { try { return localStorage.getItem(LOCAL_KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
export function setLocalHide(v: boolean) {
  localHide = v;
  try { if (v) localStorage.setItem(LOCAL_KEY, "1"); else localStorage.removeItem(LOCAL_KEY); } catch { /* blocked */ }
  listeners.forEach((l) => l());
}
const useLocalHide = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => localHide);

/** What gets covered while hiding is on (kept in sync with styles.css). */
export const SENSITIVE = ".dash > *, .list-item.ntf, .as-bubble, .cap-tile, .cap-view, .sensitive";
const online = () => client.status.phase === "online" && client.status.auth === "ok";

/** Deck key: switches the privacy mode on/off; without the PC only hides this device's content. */
export async function privacyFromDeck() {
  if (!online()) {
    setLocalHide(!localHide);
    toast(localHide ? t("Inhalte auf diesem Gerät verdeckt – die Schritte am PC gehen erst mit Verbindung.") : t("Inhalte wieder sichtbar"), localHide ? "info" : "success");
    return;
  }
  try {
    const st = await client.call<PrivacyStatus>("privacy.status");
    const r = await client.call<PrivacyStatus>(st.active ? "privacy.off" : "privacy.on");
    toast(r.active ? summary(r) : t("Datenschutzmodus aus"), r.active ? "success" : "info");
  } catch (e) { toast((e as Error).message, "error"); }
}

function summary(st: PrivacyStatus) {
  const res = st.results ?? [];
  const n = res.filter((r) => r.status === "active" || r.status === "done").length;
  const bad = res.filter((r) => r.status === "failed" || r.status === "unsupported").length;
  return bad ? t("Datenschutzmodus an: {n} Schritte wirken, {b} nicht möglich", { n, b: bad }) : t("Datenschutzmodus an: {n} Schritte wirken", { n });
}

/** Shield in the top bar: shows the state, opens the panel. Also sets the page-wide "hide content" class. */
export function PrivacyButton() {
  const conn = useConn();
  const isOnline = conn.phase === "online" && conn.auth === "ok";
  const q = useRpc<PrivacyStatus>("privacy.status", {}, ["privacy"]);
  const local = useLocalHide();
  const [open, setOpen] = useState(false);
  const pcActive = isOnline && !q.stale && !!q.data?.active;
  const hide = local || (pcActive && !!q.data?.hideSensitive);
  useEffect(() => {
    document.body.classList.toggle("privacy-on", hide);
    if (!hide) return () => document.body.classList.remove("privacy-on");
    // First tap on a covered area only shows it for a few seconds – it never triggers what is underneath.
    const onTap = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(SENSITIVE);
      if (!el || el.classList.contains("revealed")) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.add("revealed");
      window.setTimeout(() => el.classList.remove("revealed"), 6000);
    };
    document.addEventListener("click", onTap, true);
    return () => { document.removeEventListener("click", onTap, true); document.body.classList.remove("privacy-on"); };
  }, [hide]);
  const on = pcActive || local;
  return (
    <>
      <button type="button" className={`btn ghost icon privacy-btn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setOpen(true)}
        aria-label={on ? t("Datenschutzmodus ist an – öffnen") : t("Datenschutz- und Notfalltaste")} title={on ? t("Datenschutzmodus ist an") : t("Datenschutz- und Notfalltaste")}>
        {on ? <ShieldCheck size={19} /> : <Shield size={19} />}
      </button>
      {open && <PrivacyPanel st={isOnline && !q.stale ? q.data : undefined} saved={q.data} reload={q.reload} onClose={() => setOpen(false)} />}
    </>
  );
}

function PrivacyPanel({ st, saved, reload, onClose }: { st?: PrivacyStatus; saved?: PrivacyStatus; reload: () => void; onClose: () => void }) {
  const conn = useConn();
  const isOnline = conn.phase === "online" && conn.auth === "ok";
  const canRun = useCan("launch");
  const local = useLocalHide();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const run = async (m: "privacy.on" | "privacy.off") => {
    setBusy(true);
    try { const r = await client.call<PrivacyStatus>(m); toast(r.active ? summary(r) : t("Datenschutzmodus aus"), r.active ? "success" : "info"); reload(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Modal title={t("Datenschutz- und Notfalltaste")} onClose={onClose} wide
      footer={<>
        <Button variant="ghost" style={{ marginRight: "auto" }} onClick={() => setEdit(!edit)}>{edit ? t("Fertig") : t("Schritte einstellen")}</Button>
        <Button onClick={onClose}>{t("Schließen")}</Button>
        {isOnline && st && (st.active
          ? <Button variant="primary" icon={<ShieldOff size={16} />} busy={busy} disabled={!canRun} onClick={() => void run("privacy.off")}>{t("Ausschalten")}</Button>
          : <Button variant="danger" icon={<ShieldCheck size={16} />} busy={busy} disabled={!canRun} onClick={() => void run("privacy.on")}>{t("Jetzt einschalten")}</Button>)}
      </>}>
      <div className="stack">
        {!isOnline && (
          <Banner kind="warn" title={t("PC nicht verbunden")}>
            {t("Soundboard, Mikrofon, Benachrichtigungen und andere Geräte steuert der PC – das geht erst mit Verbindung und wird nicht für später vorgemerkt. Verdecken kannst du die Inhalte auf diesem Gerät aber sofort.")}
          </Banner>
        )}
        {isOnline && st?.active && <Banner kind="ok" title={t("Datenschutzmodus ist an")}>{t("Seit {d} · eingeschaltet von {b}", { d: relTime(st.since), b: st.by ?? "?" })}</Banner>}
        {isOnline && st?.active && (
          <div>
            {(st.results ?? []).map((r) => (
              <div key={r.id} className="check-row">
                <StatusIcon status={STATUS_ICON[r.status]} />
                <div className="grow">
                  <div className="row between"><b>{t(r.label)}</b><span className={`badge ${r.status === "active" || r.status === "done" ? "ok" : r.status === "failed" ? "error" : r.status === "unsupported" ? "warn" : ""}`}>{t(STATUS_LABEL[r.status])}</span></div>
                  <div className="small muted">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {isOnline && st && !st.active && !edit && <PlannedSteps st={st} />}
        <Switch checked={local} onChange={setLocalHide} label={t("Inhalte auf diesem Gerät verdecken")}
          hint={t("Verdeckt Benachrichtigungen, Dashboard-Widgets, Chats, Dateien und Aufnahmen nur hier – geht auch ohne PC. Antippen zeigt einen verdeckten Bereich kurz.")} />
        {edit && <PrivacySettings cfg={saved?.config} can={st?.can} onSaved={reload} />}
      </div>
    </Modal>
  );
}

function PlannedSteps({ st }: { st: PrivacyStatus }) {
  const c = st.config;
  const rows: [boolean, string, boolean][] = [
    [c.stopSounds, t("Soundboard stoppen"), st.can.sounds],
    [c.stopMicPassthrough, t("Mikrofon-Durchleitung aus"), st.can.passthrough],
    [c.muteMic, t("Windows-Mikrofon stumm"), st.can.micMute],
    [c.quietNotifications, t("Benachrichtigungen leise"), true],
    [c.pauseOtherDevices, t("Andere Geräte pausieren"), true],
    [c.hideSensitive, t("Inhalte verdecken"), true],
  ];
  const chosen = rows.filter((r) => r[0]);
  return (
    <div className="small">
      <b>{t("Beim Einschalten passiert:")}</b>
      {chosen.length === 0 ? <p className="muted" style={{ margin: "4px 0 0" }}>{t("Noch kein Schritt gewählt – unter „Schritte einstellen“ auswählen.")}</p> : (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {chosen.map(([, label, ok]) => <li key={label}>{label}{!ok && <span className="muted"> – {t("geht mit diesem Begleiter nicht")}</span>}</li>)}
        </ul>
      )}
      <p className="tiny muted" style={{ margin: "6px 0 0" }}>{t("Discord, Spiele und andere Programme werden davon nicht stummgeschaltet oder versteckt.")}</p>
    </div>
  );
}

export function PrivacySettings({ cfg, can, onSaved }: { cfg?: PrivacyConfig; can?: PrivacyStatus["can"]; onSaved?: () => void }) {
  const canManage = useCan("manage");
  const conn = useConn();
  const isOnline = conn.phase === "online" && conn.auth === "ok";
  const [c, setC] = useState<PrivacyConfig>(cfg ?? { stopSounds: true, stopMicPassthrough: true, muteMic: false, quietNotifications: true, quietCategories: [], pauseOtherDevices: false, hideSensitive: true });
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  const save = (next: PrivacyConfig) => {
    setC(next);
    client.call("privacy.configure", next).then(() => { toast(isOnline ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"); onSaved?.(); }, (e: Error) => toast(e.message, "error"));
  };
  const set = <K extends keyof PrivacyConfig>(k: K, v: PrivacyConfig[K]) => save({ ...c, [k]: v });
  const no = (ok?: boolean) => (can && !ok ? " " + t("(geht mit diesem Begleiter nicht)") : "");
  if (!canManage) return <p className="small muted">{t("Die Schritte festlegen darf nur ein Gerät mit dem Recht „Bearbeiten“.")}</p>;
  return (
    <div className="stack-sm">
      <b className="small">{t("Was soll die Taste tun?")}</b>
      <Switch checked={c.stopSounds} onChange={(v) => set("stopSounds", v)} label={t("Soundboard stoppen") + no(can?.sounds)} />
      <Switch checked={c.stopMicPassthrough} onChange={(v) => set("stopMicPassthrough", v)} label={t("Mikrofon-Durchleitung aus") + no(can?.passthrough)} hint={t("Dein Mikrofon geht dann nicht mehr über das virtuelle Kabel (z. B. zu Discord).")} />
      <Switch checked={c.muteMic} onChange={(v) => set("muteMic", v)} label={t("Windows-Mikrofon stummschalten") + no(can?.micMute)} hint={t("Schaltet das Standard-Mikrofon in Windows stumm und beim Ausschalten wieder ein – nur, wenn die Taste es stummgeschaltet hat.")} />
      <Switch checked={c.quietNotifications} onChange={(v) => set("quietNotifications", v)} label={t("Benachrichtigungen leise")} hint={t("Keine Windows-Hinweise und keine Push-Nachrichten; gespeichert werden sie weiter.")} />
      {c.quietNotifications && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="tiny muted">{t("Nur diese (keine Auswahl = alle):")}</span>
          {PRIVACY_CATEGORIES.map(([id, label]) => {
            const sel = c.quietCategories.includes(id);
            return <button key={id} type="button" className={`chip ${sel ? "on" : ""}`} aria-pressed={sel} onClick={() => set("quietCategories", sel ? c.quietCategories.filter((x) => x !== id) : [...c.quietCategories, id])}>{t(label)}</button>;
          })}
        </div>
      )}
      <Switch checked={c.pauseOtherDevices} onChange={(v) => set("pauseOtherDevices", v)} label={t("Andere Geräte pausieren")} hint={t("Meldet alle anderen Geräte ab, bis der Modus aus ist – der PC und das einschaltende Gerät bleiben. Die Kopplung bleibt bestehen.")} />
      <Switch checked={c.hideSensitive} onChange={(v) => set("hideSensitive", v)} label={t("Inhalte verdecken")} hint={t("Auf allen verbundenen Geräten: Benachrichtigungen, Dashboard-Widgets, Chats, Dateien und Aufnahmen werden in dieser App verdeckt.")} />
      <p className="tiny muted" style={{ margin: 0 }}><EyeOff size={12} /> {t("Auslösen: Schild oben in der Leiste oder eine Deck-Taste „Datenschutzmodus“. Wird nie für später vorgemerkt.")}</p>
    </div>
  );
}
