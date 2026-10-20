import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserRound } from "lucide-react";
import { t } from "../lib/i18n";
import { session } from "../lib/design-account";
import { Modal } from "./ui";
import { AccountPanel } from "./design-profile";

/** Person icon next to the bell: signed in = first letter of the user name; a tap opens sign in / account. */
export function AccountButton() {
  const [s, setS] = useState(session);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setS(session()); window.addEventListener("pgl-account", f); window.addEventListener("storage", f); return () => { window.removeEventListener("pgl-account", f); window.removeEventListener("storage", f); }; }, []);
  return (
    <>
      <button type="button" className={`btn ghost icon account-btn ${s ? "on" : ""}`} aria-label={s ? t("Konto: {u}", { u: s.user }) : t("Anmelden (optional)")} title={s ? s.user : t("Anmelden (optional)")} onClick={() => setOpen(true)}>
        {s ? <span className="account-initial">{s.user.slice(0, 1).toUpperCase()}</span> : <UserRound size={19} />}
      </button>
      {open && createPortal(<Modal title={s ? t("Konto: {u}", { u: s.user }) : t("Anmelden oder registrieren")} onClose={() => setOpen(false)}><AccountPanel onDone={() => setOpen(false)} /></Modal>, document.body)}
    </>
  );
}
