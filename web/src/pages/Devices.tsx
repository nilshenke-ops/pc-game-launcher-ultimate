import { useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Laptop, Link2, LogOut, Monitor, Pencil, RefreshCw, ShieldCheck, Smartphone, Tablet, Trash2 } from "lucide-react";
import { connView } from "../lib/conn-state";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { relTime, dateTime } from "../lib/format";
import type { PairedDevice } from "../lib/types";
import { KeepAccess } from "../components/keep-access";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, OfflineState, PageHead } from "../components/ui";

export function permLabels(): Record<string, string> {
  return { view: t("Ansehen"), launch: t("Starten"), soundboard: t("Soundboard"), manage: t("Verwalten"), power: t("PC ausschalten"), screen: t("Bildschirm ansehen"), remote: t("Fernsteuern"), admin: t("Administration") };
}

/** Device type from the platform name the device gave when pairing. */
function DeviceIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  const Icon = /ipad|tablet/.test(p) ? Tablet : /iphone|android|phone/.test(p) ? Smartphone : /win|mac|linux|x86/.test(p) ? Laptop : Globe;
  return <Icon size={18} className="muted" aria-hidden />;
}

export default function Devices() {
  const conn = useConn();
  const isAdmin = conn.me?.permissions.includes("admin");
  const q = useRpc<{ devices: PairedDevice[]; protection: string; max?: number; pc?: { name: string; version: string; platform: string; online: boolean; startedAt: string } }>("devices.list", {}, ["devices"], !!isAdmin);
  const view = connView(conn, { demo: client.demo, hasCredentials: !!client.credentials });
  const [edit, setEdit] = useState<PairedDevice | null>(null);
  const labels = permLabels();

  const revoke = async (d: PairedDevice) => {
    if (!(await confirmDialog(t("Gerät entfernen?"), t("„{n}“ verliert sofort jeden Zugriff. Für eine erneute Nutzung muss es neu gekoppelt werden.", { n: d.name }), { danger: true, ok: t("Entfernen") }))) return;
    client.call("devices.revoke", { id: d.id }).then(() => toast(t("Gerät entfernt"), "success")).catch((e) => toast(e.message, "error"));
  };

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Geräte & Verbindungen")} text={t("Alle gekoppelten Smartphones, Tablets und Browser. Entfernte Geräte verlieren sofort den Zugriff.")}
        actions={conn.me?.isLocal && <Link to="/pair" className="btn primary"><Link2 size={17} />{t("Gerät koppeln")}</Link>} />
      {!conn.me ? <OfflineState /> : <div className="stack">
        <Card title={t("Diese Sitzung")} icon={conn.me?.isLocal ? <Laptop size={18} /> : <Smartphone size={18} />}>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="grow" style={{ minWidth: 220 }}>
              <b>{conn.me?.isLocal ? t("Direkt am PC") : conn.me?.device?.name}</b>
              <div className="small muted">{conn.hello?.transport === "relay" ? t("Über Relay verbunden") : t("Lokal verbunden")} · {(conn.me?.permissions ?? []).filter((p) => labels[p]).map((p) => labels[p]).join(", ")}</div>
              <div className="small"><span className={`dot ${view.tone}`} /> {t(view.label)}{conn.latencyMs != null && view.key === "connected" ? ` · ${conn.latencyMs} ms` : ""}</div>
            </div>
            <Button size="sm" icon={<RefreshCw size={15} />} onClick={() => client.restart()}>{t("Neu verbinden")}</Button>
            {!conn.me?.isLocal && <Button variant="danger" icon={<LogOut size={16} />} onClick={async () => { if (await confirmDialog(t("Abmelden?"), t("Dieses Gerät muss danach neu gekoppelt werden."), { danger: true })) client.logout(); }}>{t("Abmelden")}</Button>}
          </div>
          {!conn.me?.isLocal && !client.demo && <div style={{ marginTop: 12 }}><KeepAccess /></div>}
        </Card>
        {!isAdmin ? <Banner kind="info">{t("Die Geräteliste ist nur mit Administrationsrecht sichtbar (am PC immer).")}</Banner> : (
          <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
            {q.data?.pc && (
              <Card title={t("Dieser PC")} icon={<Monitor size={18} />}>
                <div className="list-item" style={{ flexWrap: "wrap" }}>
                  <span className="dot ok" />
                  <div className="grow" style={{ minWidth: 180 }}>
                    <div className="title">{q.data.pc.name} <span className="badge ok">{t("Online")}</span></div>
                    <div className="sub">{t("Begleiter {v}", { v: q.data.pc.version })} · {q.data.pc.platform} · {t("läuft seit {r}", { r: relTime(q.data.pc.startedAt) })}</div>
                  </div>
                </div>
              </Card>
            )}
            <Card title={t("Gekoppelte Geräte")} icon={<ShieldCheck size={18} />} meta={[q.data?.max ? t("{n} von {m} Geräten", { n: q.data.devices.length, m: q.data.max }) : null, q.data?.protection].filter(Boolean).join(" · ")}>
              {(q.data?.devices.length ?? 0) === 0 ? <Empty icon={<Smartphone size={26} />} title={t("Noch keine Geräte gekoppelt")} action={conn.me?.isLocal && <Link to="/pair" className="btn sm primary">{t("Jetzt koppeln")}</Link>} /> : (
                <div className="list">
                  {q.data!.devices.map((d) => (
                    <div key={d.id} className="list-item" style={{ flexWrap: "wrap" }}>
                      <span className={`dot ${d.online ? "ok" : ""}`} />
                      <DeviceIcon platform={d.platform} />
                      <div className="grow" style={{ minWidth: 180 }}>
                        <div className="title">{d.name} {d.id === conn.me?.device?.id && <span className="badge info">{t("Dieses Gerät")}</span>}</div>
                        <div className="sub">{d.online ? (d.transport === "relay" ? t("Online über Relay") : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(d.lastIp ?? "") ? t("Online über VPN (Tailscale)") : t("Online im WLAN")) : d.lastSeenAt ? t("Offline · zuletzt verbunden {r}", { r: relTime(d.lastSeenAt) }) : t("Offline · noch nie verbunden")} · {d.platform} · {t("gekoppelt am {d}", { d: dateTime(d.pairedAt) })}{d.lastIp ? ` · ${d.lastIp}` : ""}</div>
                        <div className="row" style={{ gap: 4, marginTop: 4 }}>{d.permissions.map((p) => <span key={p} className={`badge ${p === "admin" ? "warn" : ""}`}>{labels[p] ?? p}</span>)}</div>
                      </div>
                      <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(d)}>{t("Bearbeiten")}</Button>
                      {d.id !== conn.me?.device?.id && <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => revoke(d)}>{t("Entfernen")}</Button>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Loadable>
        )}
      </div>}
      {edit && <EditDevice device={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditDevice({ device, onClose }: { device: PairedDevice; onClose: () => void }) {
  const conn = useConn();
  const [name, setName] = useState(device.name);
  const [perms, setPerms] = useState(device.permissions);
  const labels = permLabels();
  const save = async () => {
    try {
      if (name !== device.name) await client.call("devices.rename", { id: device.id, name });
      if (conn.me?.isLocal && perms.join() !== device.permissions.join()) await client.call("devices.setPermissions", { id: device.id, permissions: perms });
      toast(t("Gespeichert"), "success");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal title={t("Gerät bearbeiten")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" onClick={save}>{t("Speichern")}</Button></>}>
      <Field label={t("Name")}><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("Berechtigungen")} hint={conn.me?.isLocal ? undefined : t("Berechtigungen können nur direkt am PC geändert werden.")}>
        <div className="stack-sm">
          {Object.entries(labels).map(([k, v]) => (
            <label key={k} className="checkbox"><input type="checkbox" disabled={!conn.me?.isLocal || k === "view"} checked={perms.includes(k)} onChange={(e) => setPerms(e.target.checked ? [...perms, k] : perms.filter((p) => p !== k))} />{v}
              <span className="tiny muted">{k === "admin" ? t("– Geräte verwalten, Backups, Updates") : k === "manage" ? t("– Bibliothek, Profile, Regeln bearbeiten") : k === "power" ? t("– Energiesparen, Neustart und Herunterfahren vom Gerät (Sperren geht schon mit „Starten“)") : k === "screen" ? t("– den PC-Bildschirm im Remote Desktop sehen") : k === "remote" ? t("– den PC per Remote Desktop mit Touch, Maus und Tastatur steuern") : ""}</span></label>
          ))}
        </div>
      </Field>
      {perms.includes("admin") && <Banner kind="warn">{t("Administration erlaubt auch das Entfernen anderer Geräte und das Einspielen von Backups.")}</Banner>}
    </Modal>
  );
}
