import { useState } from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Wifi } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { connView } from "../lib/conn-state";
import { useAppState } from "../lib/state";
import { useOutbox } from "../lib/outbox";
import { pillText, runningGame, useStatusPill } from "../lib/status-pill";

/** Small status pill under the top bar (phone/tablet, opt-in): tap to open details. Moves with transform/opacity only. */
export function StatusPill() {
  const on = useStatusPill();
  const conn = useConn();
  const { state } = useAppState();
  const waiting = useOutbox();
  const [open, setOpen] = useState(false);
  if (!on || client.demo) return null;
  const view = connView(conn, { hasCredentials: !!client.credentials });
  const connected = view.key === "connected";
  const game = runningGame(state?.running, connected);
  const info = { short: view.short, game, waiting: waiting.length };
  return (
    <div className={`status-pill-wrap ${open ? "open" : ""}`}>
      <button type="button" className={`status-pill ${view.tone}`} aria-expanded={open} onClick={() => setOpen(!open)} aria-label={t("Status: {s}", { s: pillText(info) })}>
        <span className={`dot ${view.tone}`} />
        <span className="sp-text">{pillText(info)}</span>
      </button>
      {open && (
        <div className="status-pill-panel" role="status">
          <div className="sp-row"><Wifi size={16} /><span>{view.label}</span></div>
          {connected && conn.latencyMs != null && <div className="sp-row tiny muted">{conn.hello?.transport === "relay" ? t("Über Relay") : t("Lokal")} · {conn.latencyMs} ms</div>}
          {game && <div className="sp-row"><Gamepad2 size={16} /><span>{t("Läuft gerade: {g}", { g: game })}</span></div>}
          {waiting.length > 0 && <div className="sp-row tiny muted">{t("{n} Änderungen warten auf den PC", { n: waiting.length })}</div>}
          <div className="row">
            <Link className="btn sm" to="/diagnostics" onClick={() => setOpen(false)}>{t("Verbindung prüfen")}</Link>
            {!connected && <button type="button" className="btn sm primary" onClick={() => client.reconnectNow()}>{t("Jetzt verbinden")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
