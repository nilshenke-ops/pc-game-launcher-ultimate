import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserRound } from "lucide-react";
import { t } from "../lib/i18n";
import { Link } from "react-router-dom";
import { listAccounts, session, switchAccount } from "../lib/design-account";
import { toast } from "../lib/hooks";
import { Modal } from "./ui";
import { AccountPanel } from "./design-profile";

/** Person icon next to the bell: signed in = first letter of the user name; a tap opens sign in / account. */
/** The accounts already used on this device: one tap switches – no password. */
function QuickSwitch({ onDone }: { onDone: () => void }) {
  const [list, setList] = useState(listAccounts);
  const [now, setNow] = useState(() => session()?.user);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const f = () => { setList(listAccounts()); setNow(session()?.user); }; window.addEventListener("pgl-account", f); return () => window.removeEventListener("pgl-account", f); }, []);
  if (list.length === 0) return null;
  const go = async (user: string) => {
    setBusy(user);
    try { await switchAccount(user); toast(t("Konto gewechselt: {u}", { u: user }), "success"); onDone(); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };
  return (
    <div className="quick-switch" role="group" aria-label={t("Konto wechseln")}>
      {list.map((a) => (
        <button key={a.user} type="button" className={`qs-item ${a.user === now ? "on" : ""}`} disabled={!!busy || a.user === now} onClick={() => void go(a.user)} aria-current={a.user === now ? "true" : undefined}>
          <span className="qs-av" aria-hidden="true">{a.user.slice(0, 1).toUpperCase()}</span>
          <span className="qs-name">{a.user}</span>
          <span className="qs-state tiny">{a.user === now ? t("aktiv") : busy === a.user ? t("Wechsle …") : t("Wechseln")}</span>
        </button>
      ))}
    </div>
  );
}

export function AccountButton() {
  const [s, setS] = useState(session);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setS(session()); window.addEventListener("pgl-account", f); window.addEventListener("storage", f); return () => { window.removeEventListener("pgl-account", f); window.removeEventListener("storage", f); }; }, []);
  return (
    <>
      <button type="button" className={`btn ghost icon account-btn ${s ? "on" : ""}`} aria-label={s ? t("Konto: {u}", { u: s.user }) : t("Anmelden (optional)")} title={s ? s.user : t("Anmelden (optional)")} onClick={() => setOpen(true)}>
        {s ? <span className="account-initial">{s.user.slice(0, 1).toUpperCase()}</span> : <UserRound size={19} />}
      </button>
      {open && createPortal(<Modal title={s ? t("Konto: {u}", { u: s.user }) : t("Anmelden oder registrieren")} onClose={() => setOpen(false)}><QuickSwitch onDone={() => setOpen(false)} /><AccountPanel onDone={() => setOpen(false)} />{s && <Link to="/profile" className="btn sm" onClick={() => setOpen(false)}>{t("Profil, Cloud & KI-Schlüssel öffnen")}</Link>}</Modal>, document.body)}
    </>
  );
}
