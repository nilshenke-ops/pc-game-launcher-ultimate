// "PC einschalten" in the PC control: the current state in one line, the start button, and the set-up (FRITZ!Box access + what the PC itself
// reports about Wake-on-LAN). Nothing here pretends: "sent" is shown as "PC wird gestartet", "connected" only when the PC really answers.
import { useEffect, useState } from "react";
import { Check, CircleHelp, Power, Settings2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { session } from "../lib/design-account";
import { Banner, Button, Card, Field, Modal } from "./ui";
import {
  clearWakeConfig, hostLooksRight, loadWakeConfig, MAC_RX, normalizeMac, saveWakeConfig, sendWake, splitAddress, useWake, wakeDone, wakeHostInfo,
  wakeLabel, wakeReset, type WakeConfig, type WakeHostInfo,
} from "../lib/wake";

interface WolInfo {
  adapters: { name: string; description?: string | null; kind: string; mac: string; up: boolean; ip?: string | null }[];
  suggestedMac?: string | null; windows: boolean; checkedAt: string;
  checks: { id: string; ok: boolean | null; text: string; hint?: string | null }[];
}
const GUIDE = "https://github.com/nilshenke-ops/pc-game-launcher-ultimate/blob/main/docs/WAKE-ON-LAN.md";

export function WakeCard() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const w = useWake();
  const [setup, setSetup] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener("pgl-account", f); return () => window.removeEventListener("pgl-account", f); }, []);
  const s = session();
  const signedIn = !!s?.cloud;
  useEffect(() => { if (online) wakeDone(); }, [online]);
  // Not connected and set up: ask the FRITZ!Box once whether the PC is in the home network (honest "off" vs. "not reachable").
  useEffect(() => { if (!online && signedIn && w.configured && w.phase === "idle" && (!w.infoAt || Date.now() - w.infoAt > 60_000)) void wakeHostInfo().catch(() => undefined); }, [online, signedIn, w.configured, w.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = wakeLabel(w, online, signedIn);
  const starting = w.phase === "sending" || w.phase === "sent" || w.phase === "booting" || w.phase === "connecting";
  const step = w.phase === "sent" || w.phase === "sending" ? 1 : w.phase === "booting" ? 2 : w.phase === "connecting" ? 3 : 0;

  return (
    <Card title={t("PC einschalten")} icon={<Power size={18} />} className="wake-card"
      actions={<Button size="sm" variant="ghost" icon={<Settings2 size={15} />} onClick={() => setSetup(true)}>{t("Einrichten")}</Button>}>
      <div className="stack-sm">
        <div className={`wake-status k-${label.key}`} role="status" aria-live="polite"><span className="wake-dot" aria-hidden />{label.text}</div>

        {starting && (
          <ol className="wake-steps" aria-label={t("Fortschritt")}>
            <li className={step >= 1 ? "on" : ""}>{t("Startsignal gesendet")}</li>
            <li className={step >= 2 ? "on" : ""}>{t("PC startet")}</li>
            <li className={step >= 3 ? "on" : ""}>{t("Verbindung")}</li>
          </ol>
        )}
        {w.phase === "sent" && <p className="tiny muted" style={{ margin: 0 }}>{t("Die FRITZ!Box hat das Wecksignal gesendet. Ob der PC wirklich startet, zeigt sich in den nächsten ein bis zwei Minuten.")}</p>}
        {w.phase === "failed" && w.error && <Banner kind="warn">{w.error}</Banner>}

        {!online && label.key === "unavailable" && (
          <p className="small muted" style={{ margin: 0 }}>{!signedIn
            ? t("Zum Einschalten aus der Ferne musst du mit deinem Cloud-Konto angemeldet sein – darüber wird geprüft, dass nur du den PC starten kannst.")
            : t("Noch nicht eingerichtet: einmal die Adresse deiner FRITZ!Box und die MAC-Adresse des PCs eintragen.")}</p>
        )}

        {!online && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {signedIn && w.configured
              ? <Button variant="primary" className={`wake-btn ${starting ? "busy" : ""}`} icon={<Power size={17} />} disabled={starting} onClick={() => void sendWake()}>{starting ? t("Wird gestartet …") : w.phase === "failed" ? t("Nochmal versuchen") : t("PC einschalten")}</Button>
              : <Button variant="primary" icon={<Settings2 size={16} />} onClick={() => setSetup(true)}>{t("Jetzt einrichten")}</Button>}
            {w.phase === "failed" && <Button variant="ghost" onClick={wakeReset}>{t("Schließen")}</Button>}
          </div>
        )}
        {online && <p className="small muted" style={{ margin: 0 }}>{w.configured ? t("Eingerichtet. Ist der PC aus, erscheint hier „PC einschalten“.") : t("Der PC läuft. Jetzt ist ein guter Moment zum Einrichten – die MAC-Adresse wird gerade vom PC gelesen.")}</p>}
      </div>
      {setup && <WakeSetup onClose={() => setSetup(false)} online={online} signedIn={signedIn} />}
    </Card>
  );
}

function WakeSetup({ onClose, online, signedIn }: { onClose: () => void; online: boolean; signedIn: boolean }) {
  const wol = useRpc<WolInfo>("wol.info", {}, []);
  const [c, setC] = useState<WakeConfig>({ host: "", port: 0, fbUser: "", fbPass: "", mac: "" });
  const [had, setHad] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { void loadWakeConfig().then((x) => { if (x) { setC(x); setHad(true); } }); }, []);
  // The MAC address of the cable adapter, read by the PC, is filled in when the field is still empty.
  useEffect(() => { const m = wol.data?.suggestedMac; if (m) setC((x) => (x.mac ? x : { ...x, mac: m })); }, [wol.data?.suggestedMac]);

  const mac = normalizeMac(c.mac);
  const valid = hostLooksRight(c.host) && c.port > 0 && c.port < 65536 && !!c.fbUser && !!c.fbPass && MAC_RX.test(mac);
  const describe = (i: WakeHostInfo) => !i.known
    ? t("Die FRITZ!Box ist erreichbar, kennt aber kein Gerät mit dieser MAC-Adresse. Der PC muss einmal per LAN-Kabel an der FRITZ!Box gewesen sein.")
    : t("Die FRITZ!Box ist erreichbar und kennt den PC „{n}“ ({k}) – er ist gerade {a}.", { n: i.name || "?", k: i.iface === "Ethernet" ? t("per LAN-Kabel") : i.iface ? t("zuletzt per WLAN – Wecken geht nur per LAN-Kabel") : t("Anschluss unbekannt"), a: i.active ? t("im Heimnetz") : t("nicht im Heimnetz (aus)") });
  const test = async () => {
    setBusy("test"); setResult(null);
    try { const i = await wakeHostInfo({ ...c, mac }); setResult({ ok: i.known, text: describe(i) }); }
    catch (e) { setResult({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  };
  const save = async () => {
    setBusy("save");
    try { await saveWakeConfig({ ...c, mac }); toast(t("Gespeichert – verschlüsselt auf diesem Gerät und in deinem Konto."), "success"); onClose(); }
    catch (e) { setResult({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  };
  const onAddress = (v: string) => { const a = splitAddress(v); setC((x) => ({ ...x, host: v.includes("/") || v.includes(":") ? a.host : v, port: a.port ?? x.port })); };

  return (
    <Modal title={t("PC einschalten einrichten")} onClose={onClose} wide
      footer={<>
        {had && <Button variant="ghost" onClick={() => { clearWakeConfig(); onClose(); }}>{t("Einrichtung entfernen")}</Button>}
        <Button onClick={test} busy={busy === "test"} disabled={!valid || !signedIn}>{t("Verbindung testen")}</Button>
        <Button variant="primary" onClick={save} busy={busy === "save"} disabled={!valid || !signedIn}>{t("Speichern")}</Button>
      </>}>
      <div className="stack">
        {!signedIn && <Banner kind="warn">{t("Bitte zuerst mit deinem Cloud-Konto anmelden (Profil). Nur angemeldete Geräte deines Kontos dürfen den PC starten.")}</Banner>}
        <p className="small muted" style={{ margin: 0 }}>{t("So funktioniert es: Dein Handy kann selbst kein Wecksignal senden und der PC ist aus. Deshalb schickt deine FRITZ!Box das Signal – ausgelöst über dein Konto. Dafür braucht die FRITZ!Box den Internetzugriff über HTTPS (MyFRITZ!) und einen eigenen Benutzer.")} <a href={GUIDE} target="_blank" rel="noreferrer">{t("Schritt-für-Schritt-Anleitung")}</a></p>

        <Field label={t("MyFRITZ!-Adresse der FRITZ!Box")} hint={t("FRITZ!Box → Internet → MyFRITZ!-Konto. Die ganze Adresse mit Port einfügen geht auch (https://….myfritz.net:12345).")}
          error={c.host && !hostLooksRight(c.host) ? t("Das ist keine MyFRITZ!-Adresse (sie endet auf .myfritz.net).") : undefined}>
          <input className="input" value={c.host} onChange={(e) => onAddress(e.target.value)} placeholder="abcdefgh1234.myfritz.net" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
        </Field>
        <Field label={t("HTTPS-Port")} hint={t("FRITZ!Box → Internet → Freigaben → FRITZ!Box-Dienste → „TCP-Port für HTTPS“.")}>
          <input className="input" value={c.port || ""} onChange={(e) => setC({ ...c, port: Number(e.target.value.replace(/\D/g, "").slice(0, 5)) })} inputMode="numeric" placeholder="z. B. 44321" style={{ maxWidth: 160 }} />
        </Field>
        <div className="grid-2">
          <Field label={t("FRITZ!Box-Benutzer")} hint={t("Am besten ein eigener Benutzer nur dafür (System → FRITZ!Box-Benutzer).")}>
            <input className="input" value={c.fbUser} onChange={(e) => setC({ ...c, fbUser: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" />
          </Field>
          <Field label={t("Kennwort dieses Benutzers")}>
            <input className="input" type="password" value={c.fbPass} onChange={(e) => setC({ ...c, fbPass: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
        <Field label={t("MAC-Adresse des LAN-Anschlusses am PC")} hint={wol.data?.suggestedMac ? t("Vom PC gelesen. Es muss die Adresse des LAN-Anschlusses sein, nicht die vom WLAN.") : t("Steht in der FRITZ!Box unter Heimnetz → Netzwerk beim PC, oder wird vom PC gelesen, sobald er einmal verbunden war.")}
          error={c.mac && !MAC_RX.test(mac) ? t("Form: AA:BB:CC:DD:EE:FF") : undefined}>
          <input className="input" value={c.mac} onChange={(e) => setC({ ...c, mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" autoCapitalize="characters" autoCorrect="off" spellCheck={false} style={{ maxWidth: 260 }} />
        </Field>
        {(wol.data?.adapters.length ?? 0) > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {wol.data!.adapters.map((a) => (
              <button key={a.mac} type="button" className={`chip ${normalizeMac(c.mac) === a.mac ? "on" : ""}`} onClick={() => setC({ ...c, mac: a.mac })} title={a.description ?? a.name}>
                {a.kind === "ethernet" ? t("LAN") : a.kind === "wifi" ? t("WLAN") : a.name} · {a.mac}
              </button>
            ))}
          </div>
        )}

        {result && <Banner kind={result.ok ? "ok" : "warn"}>{result.text}</Banner>}

        <div>
          <b className="small">{t("Was der PC selbst meldet")}</b>
          {!wol.data ? <p className="small muted">{online ? t("Wird gelesen …") : t("Noch nicht bekannt – der PC muss einmal mit dem aktuellen Begleiter verbunden gewesen sein.")}</p> : (
            <ul className="wake-checks">
              {wol.data.checks.map((k) => (
                <li key={k.id} className={k.ok === true ? "ok" : k.ok === false ? "bad" : "unknown"}>
                  {k.ok === true ? <Check size={15} /> : k.ok === false ? <X size={15} /> : <CircleHelp size={15} />}
                  <span><span>{k.text}</span>{k.hint && <small>{k.hint}</small>}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="tiny muted" style={{ margin: "6px 0 0" }}>{t("Diese Prüfung liest nur Windows-Einstellungen. Ob das BIOS deines Laptops das Wecken aus dem ausgeschalteten Zustand zulässt, zeigt erst der echte Test.")}</p>
        </div>
      </div>
    </Modal>
  );
}
