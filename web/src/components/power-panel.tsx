// Lock, sleep, restart and shut down the PC from the phone. Locking needs only the right to start games; the rest
// needs the right "PC ausschalten" (given on the PC under Geräte). Restart/shutdown always ask first, can wait a
// while and can be cancelled from every device until then. Never queued while the PC is offline.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Moon, Power, RotateCcw, X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useConn, useRpc } from "../lib/hooks";
import { useAppState } from "../lib/state";
import { Banner, Button, confirmDialog, Modal, Segmented } from "./ui";

export type PowerAction = "lock" | "sleep" | "restart" | "shutdown";
export interface PowerStatus { supported: boolean; planned?: { action: "restart" | "shutdown"; at: string; by: string } | null; canLock: boolean; canPower: boolean }

const DELAYS = [0, 30, 60, 300, 600];
const delayLabel = (s: number) => (s === 0 ? t("Sofort") : s < 60 ? t("{n} s", { n: s }) : t("{n} min", { n: s / 60 }));

/** Locks right away (harmless) or – after asking – puts the PC to sleep / restarts / shuts it down. */
export async function doPower(action: PowerAction, delay = 0) {
  try {
    if (action === "lock") { await client.call("power.lock"); toast(t("PC ist gesperrt"), "success"); return true; }
    await client.call("power.run", { action, delay });
    toast(action === "sleep" ? t("PC geht in den Energiesparmodus – die Verbindung endet gleich")
      : delay > 0 ? t("{a} in {d} – bis dahin abbrechbar", { a: action === "restart" ? t("Neustart") : t("Herunterfahren"), d: delayLabel(delay) })
      : action === "restart" ? t("PC startet neu – die Verbindung kommt danach von selbst wieder") : t("PC fährt herunter – die Verbindung endet gleich"), "success");
    return true;
  } catch (e) { toast((e as Error).message, "error"); return false; }
}

/** Deck key: asks like the panel, restart/shutdown with 60 s to cancel. */
export async function powerFromDeck(action: PowerAction) {
  if (action === "lock") return void doPower("lock");
  const text = action === "sleep" ? t("Der PC geht in den Energiesparmodus.") : t("In 60 Sekunden – bis dahin kannst du hier abbrechen. Nicht gespeicherte Arbeit in offenen Programmen kann verloren gehen.");
  if (await confirmDialog(action === "sleep" ? t("Energiesparmodus?") : action === "restart" ? t("PC neu starten?") : t("PC herunterfahren?"), text, { danger: action !== "sleep", ok: t("Ja") }))
    await doPower(action, action === "sleep" ? 0 : 60);
}

function useCountdown(at?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!at) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [at]);
  return at ? Math.max(0, Math.round((Date.parse(at) - now) / 1000)) : 0;
}

export function PowerPanel({ compact }: { compact?: boolean }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const q = useRpc<PowerStatus>("power.status", {}, ["power"]);
  const { state } = useAppState();
  const [ask, setAsk] = useState<"restart" | "shutdown" | null>(null);
  const [delay, setDelay] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);
  const st = q.data;
  const planned = st?.planned ?? null;
  const left = useCountdown(planned?.at);
  const running = state?.running ?? [];

  if (!online) return <p className="small muted" style={{ margin: 0 }}>{t("Sperren, Neustart und Herunterfahren gehen nur, wenn der PC verbunden ist – sie werden nie für später vorgemerkt.")}</p>;
  if (st && !st.supported) return <p className="small muted" style={{ margin: 0 }}>{t("Energie-Aktionen sind nur im Windows-Begleiter verfügbar.")}</p>;

  const run = async (a: PowerAction, d = 0) => { setBusy(a); await doPower(a, d); setBusy(null); q.reload(); };
  const sleep = async () => { if (await confirmDialog(t("Energiesparmodus?"), t("Der PC geht in den Energiesparmodus. Laufende Downloads und Spiele pausieren."), { ok: t("Ja") })) void run("sleep"); };

  return (
    <div className="stack-sm">
      {planned && left > 0 && (
        <Banner kind="warn" title={planned.action === "restart" ? t("Neustart in {s} s", { s: left }) : t("Herunterfahren in {s} s", { s: left })}
          actions={<Button size="sm" icon={<X size={14} />} busy={busy === "cancel"} disabled={!st?.canPower}
            onClick={async () => { setBusy("cancel"); try { await client.call("power.run", { action: "cancel" }); toast(t("Abgebrochen"), "success"); } catch (e) { toast((e as Error).message, "error"); } setBusy(null); q.reload(); }}>{t("Abbrechen")}</Button>}>
          {t("Angefordert von {n}.", { n: planned.by })}
        </Banner>
      )}
      <div className={`power-grid ${compact ? "compact" : ""}`}>
        <Button icon={<Lock size={18} />} busy={busy === "lock"} disabled={!st?.canLock} onClick={() => void run("lock")}>{t("Sperren")}</Button>
        <Button icon={<Moon size={18} />} busy={busy === "sleep"} disabled={!st?.canPower} onClick={() => void sleep()}>{t("Energiesparen")}</Button>
        <Button icon={<RotateCcw size={18} />} disabled={!st?.canPower} onClick={() => { setDelay(60); setAsk("restart"); }}>{t("Neu starten")}</Button>
        <Button variant="danger" icon={<Power size={18} />} disabled={!st?.canPower} onClick={() => { setDelay(60); setAsk("shutdown"); }}>{t("Herunterfahren")}</Button>
      </div>
      {st && !st.canPower && (
        <p className="tiny muted" style={{ margin: 0 }}>
          {t("Energiesparen, Neustart und Herunterfahren muss der PC für dieses Gerät einmal erlauben: am PC unter Geräte → dieses Gerät → Recht „PC ausschalten“.")}
          {conn.me?.isLocal && <> <Link to="/devices">{t("Geräte öffnen")}</Link></>}
        </p>
      )}
      {ask && (
        <Modal title={ask === "restart" ? t("PC neu starten?") : t("PC herunterfahren?")} onClose={() => setAsk(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setAsk(null)}>{t("Abbrechen")}</Button>
            <Button variant="danger" busy={busy === ask} onClick={async () => { const a = ask; setAsk(null); await run(a, delay); }}>
              {delay === 0 ? (ask === "restart" ? t("Jetzt neu starten") : t("Jetzt herunterfahren")) : (ask === "restart" ? t("In {d} neu starten", { d: delayLabel(delay) }) : t("In {d} herunterfahren", { d: delayLabel(delay) }))}
            </Button>
          </>}>
          <div className="stack-sm">
            {running.length > 0 && <Banner kind="warn">{t("Gerade läuft: {g}. Nicht gespeicherter Spielstand kann verloren gehen.", { g: running.map((r) => r.name).join(", ") })}</Banner>}
            <Segmented value={String(delay)} onChange={(v) => setDelay(Number(v))} label={t("Wann?")} options={DELAYS.map((d) => ({ value: String(d), label: delayLabel(d) }))} />
            <p className="small muted" style={{ margin: 0 }}>{delay > 0 ? t("Windows zeigt am PC einen Hinweis. Bis dahin kannst du hier (oder auf jedem anderen Gerät) abbrechen.") : t("Offene Programme werden geschlossen; nicht gespeicherte Arbeit kann verloren gehen.")}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
