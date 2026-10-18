import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { t } from "../lib/i18n";
import { isUnlocked, unlock } from "../lib/access";
import { client } from "../lib/rpc";
import { DEMO_BUILD } from "../lib/demo";

/** Asks once per device for the 4-digit access code. The PC's own window (admin session) and the demo are not asked. */
export function AccessGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => DEMO_BUILD || client.demo || client.hasAdminToken || isUnlocked());
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [wait, setWait] = useState(0);
  const fails = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (wait > 0) { const id = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(id); } }, [wait]);

  if (open) return <>{children}</>;
  const submit = (value: string) => {
    if (value.length !== 4 || wait > 0) return;
    if (unlock(value)) { setOpen(true); return; }
    fails.current++;
    setError(true);
    setCode("");
    if (fails.current >= 3) setWait(Math.min(60, 5 * 2 ** (fails.current - 3))); // slows down guessing
    input.current?.focus();
  };

  return (
    <div className="center-screen">
      <div className="center-card stack fade-in" style={{ textAlign: "center", maxWidth: 380 }}>
        <div className="state-icon"><Lock size={32} /></div>
        <h1>{t("Zugangscode")}</h1>
        <p className="muted">{t("Gib den vierstelligen Code ein. Danach merkt sich dieses Gerät den Zugang.")}</p>
        <label className="pin" onClick={() => input.current?.focus()}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-box ${code.length === i ? "active" : ""} ${error ? "error" : ""}`}>{code[i] ? "•" : ""}</span>)}
          <input ref={input} className="pin-input" value={code} inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" autoFocus maxLength={4}
            aria-label={t("Zugangscode")} disabled={wait > 0}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setCode(v); setError(false); if (v.length === 4) submit(v); }} />
        </label>
        <p className="small" role="status" style={{ minHeight: 20, margin: 0, color: error ? "var(--danger)" : undefined }}>
          {wait > 0 ? t("Zu viele Versuche – bitte {s} s warten.", { s: wait }) : error ? t("Falscher Code.") : ""}
        </p>
      </div>
    </div>
  );
}
