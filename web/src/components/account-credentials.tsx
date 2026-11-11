// Settings of a signed-in cloud account: see the user name and the password, change both, and – if wanted – protect the password view with an extra secret code.
// By default there is no code: the password can be seen straight away on this device.
import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { changeCredentials, confirmPassword, hasAccessCode, MIN_CODE, moveToCloud, passwordState, revealPassword, session, setAccessCode } from "../lib/design-account";
import { AccountPanel } from "./design-profile";
import { Banner, Button, Card, Field } from "./ui";

const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast(t("Kopiert."), "success"); } catch { toast(t("Kopieren ist hier nicht möglich."), "error"); } };

export function AccountCredentials() {
  const [s, setS] = useState(session);
  const [, tick] = useState(0);
  useEffect(() => { const f = () => { setS(session()); tick((n) => n + 1); }; window.addEventListener("pgl-account", f); return () => window.removeEventListener("pgl-account", f); }, []);
  const [shown, setShown] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [typedPw, setTypedPw] = useState("");
  const [mode, setMode] = useState<"" | "user" | "pass" | "code">("");
  const [newUser, setNewUser] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [curPw, setCurPw] = useState("");
  const [codeNew, setCodeNew] = useState("");
  const [codeOld, setCodeOld] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!s) return null;
  const cloud = !!s.cloud;
  const state = passwordState(s.user), locked = hasAccessCode(s.user);
  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); setErr(null); try { await fn(); if (ok) toast(ok, "success"); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const done = () => { setMode(""); setNewUser(""); setNewPw(""); setNewPw2(""); setCurPw(""); setCodeNew(""); setCodeOld(""); setShown(null); setCode(""); setTypedPw(""); };
  const needCurrent = state !== "visible";            // the password is not known here (or locked): it must be typed to prove it

  return (
    <Card title={t("Zugangsdaten")} icon={<KeyRound size={18} />}>
      <div className="stack-sm">
        <Field label={t("Benutzername")}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <code style={{ fontSize: "1.05rem" }}>{s.user}</code>
            <Button size="sm" icon={<Copy size={14} />} onClick={() => void copy(s.user)}>{t("Kopieren")}</Button>
            {cloud && <Button size="sm" onClick={() => { setErr(null); setMode(mode === "user" ? "" : "user"); }}>{t("Ändern")}</Button>}
          </div>
        </Field>

        <Field label={t("Passwort")}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <code style={{ fontSize: "1.05rem" }}>{shown ?? "••••••••••"}</code>
            {shown !== null
              ? <>
                  <Button size="sm" icon={<EyeOff size={14} />} onClick={() => setShown(null)}>{t("Verbergen")}</Button>
                  <Button size="sm" icon={<Copy size={14} />} onClick={() => void copy(shown)}>{t("Kopieren")}</Button>
                </>
              : state === "visible"
                ? <Button size="sm" icon={<Eye size={14} />} onClick={() => void run(async () => setShown(await revealPassword(s.user)))}>{t("Anzeigen")}</Button>
                : null}
            {cloud && <Button size="sm" onClick={() => { setErr(null); setMode(mode === "pass" ? "" : "pass"); }}>{t("Ändern")}</Button>}
          </div>
          {state === "locked" && shown === null && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Geheimcode")} autoComplete="off" style={{ maxWidth: 220 }} />
              <Button size="sm" busy={busy} onClick={() => void run(async () => { setShown(await revealPassword(s.user, code)); setCode(""); })}>{t("Mit Geheimcode anzeigen")}</Button>
            </div>
          )}
          {state === "unknown" && (
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <span className="tiny muted">{t("Dieses Gerät kennt dein Passwort noch nicht (du hast dich früher angemeldet) – aus der Anmeldung lässt es sich nicht zurückrechnen. Gib es einmal ein, oder lege gleich ein neues fest (dafür brauchst du das alte nicht). Danach siehst du es hier immer sofort.")}</span>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input className="input" type="password" value={typedPw} onChange={(e) => setTypedPw(e.target.value)} placeholder={t("Passwort")} autoComplete="current-password" style={{ maxWidth: 260 }} />
                <Button size="sm" variant="primary" busy={busy} onClick={() => void run(async () => { await confirmPassword(typedPw); setTypedPw(""); tick((n) => n + 1); }, t("Passwort gemerkt."))}>{t("Merken")}</Button>
                {cloud && <Button size="sm" onClick={() => { setErr(null); setMode("pass"); }}>{t("Neues Passwort festlegen")}</Button>}
              </div>
            </div>
          )}
          <span className="hint">{t("Das Passwort liegt nur auf diesem Gerät – nie in der Cloud und nicht auf dem PC.")}</span>
        </Field>

        {mode === "user" && (
          <div className="stack-sm card-inner">
            <Field label={t("Neuer Benutzername")} hint={t("3–24 Zeichen: a–z, Ziffern, Punkt, Minus, Unterstrich.")}><input className="input" value={newUser} onChange={(e) => setNewUser(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
            {needCurrent && <Field label={t("Aktuelles Passwort")}><input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" /></Field>}
            <Button variant="primary" busy={busy} onClick={() => void run(async () => { await changeCredentials({ currentPassword: needCurrent ? curPw : await revealPassword(s.user), newUser }); done(); }, t("Benutzername geändert."))}>{t("Benutzernamen ändern")}</Button>
          </div>
        )}

        {mode === "pass" && (
          <div className="stack-sm card-inner">
            <Field label={t("Neues Passwort")} hint={t("Mindestens 6 Zeichen.")}><input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></Field>
            <Field label={t("Neues Passwort wiederholen")}><input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" /></Field>
            <Button variant="primary" busy={busy} onClick={() => void run(async () => {
              if (newPw !== newPw2) throw new Error(t("Die beiden neuen Passwörter sind nicht gleich."));
              await changeCredentials({ newPassword: newPw }); done();
            }, t("Passwort geändert."))}>{t("Passwort ändern")}</Button>
          </div>
        )}
        {(mode === "user" || mode === "pass") && <Banner kind="info">{t("Beim Ändern wird dein Konto neu verschlüsselt. Andere Geräte müssen sich danach einmal mit den neuen Daten anmelden; der PC verbindet sich von selbst neu und lädt seine Daten wieder hoch.")}</Banner>}

        <Field label={t("Extra Geheimcode (freiwillig)")} hint={locked ? t("Der Geheimcode ist gesetzt: Das Passwort wird nur nach Eingabe des Codes angezeigt.") : t("Aktuell ohne Code – das Passwort ist hier direkt sichtbar. Wenn du willst, schützt ein Geheimcode das Anzeigen.")}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="badge">{locked ? t("gesetzt") : t("aus")}</span>
            <Button size="sm" onClick={() => { setErr(null); setMode(mode === "code" ? "" : "code"); }}>{locked ? t("Ändern oder entfernen") : t("Geheimcode festlegen")}</Button>
          </div>
        </Field>
        {mode === "code" && (
          <div className="stack-sm card-inner">
            {locked && <Field label={t("Bisheriger Geheimcode")}><input className="input" type="password" value={codeOld} onChange={(e) => setCodeOld(e.target.value)} autoComplete="off" /></Field>}
            {!locked && state === "unknown" && <Banner kind="warn">{t("Gib zuerst oben dein Passwort einmal ein („Merken“).")}</Banner>}
            <Field label={t("Neuer Geheimcode")} hint={t("Mindestens {n} Zeichen.", { n: MIN_CODE })}><input className="input" type="password" value={codeNew} onChange={(e) => setCodeNew(e.target.value)} autoComplete="off" /></Field>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" busy={busy} onClick={() => void run(async () => { await setAccessCode(codeNew, codeOld); done(); }, t("Geheimcode gespeichert."))}>{t("Geheimcode speichern")}</Button>
              {locked && <Button busy={busy} onClick={() => void run(async () => { await setAccessCode(null, codeOld); done(); }, t("Geheimcode entfernt."))}>{t("Geheimcode entfernen")}</Button>}
            </div>
            <span className="tiny muted">{t("Vergisst du den Geheimcode, hilft nur erneutes Anmelden mit dem Passwort.")}</span>
          </div>
        )}
        {err && <Banner kind="error">{err}</Banner>}
        {!cloud && <MoveToCloud />}
      </div>
    </Card>
  );
}


/** The settings section "Konto & Anmeldedaten": whatever the sign-in state is, it says where the login details are and what to do. */
export function AccountSettings() {
  const [s, setS] = useState(session);
  useEffect(() => { const f = () => setS(session()); window.addEventListener("pgl-account", f); window.addEventListener("storage", f); return () => { window.removeEventListener("pgl-account", f); window.removeEventListener("storage", f); }; }, []);
  if (!s) return (
    <Card title={t("Konto & Anmeldedaten")} icon={<KeyRound size={18} />}>
      <div className="stack-sm">
        <p className="small" style={{ margin: 0 }}>{t("Auf diesem Gerät ist niemand angemeldet. Melde dich an oder lege ein Konto an – danach siehst du hier Benutzername und Passwort und kannst beides ändern.")}</p>
        <AccountPanel />
      </div>
    </Card>
  );
  return <AccountCredentials />;
}

/** An account that exists only at the PC can move into the cloud (same name and password) so the other devices see the PC's data too. */
function MoveToCloud() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack-sm card-inner">
      <Banner kind="warn" title={t("Dieses Konto liegt nur am PC – nicht in der Cloud")}>
        {t("Darum sehen andere Geräte (iPad, Handy) die Spiele deines PCs nicht, und der PC lädt nichts hoch. Übernimm das Konto in die Cloud: gleicher Name, gleiches Passwort.")}
      </Banner>
      <Field label={t("Passwort")} hint={t("Gib dein Passwort einmal ein. Es wird geprüft und danach hier angezeigt.")}>
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      </Field>
      <div><Button variant="primary" busy={busy} onClick={() => { setBusy(true); setErr(null); void moveToCloud(pw).then(() => { setPw(""); toast(t("Konto in der Cloud – der PC verbindet sich jetzt."), "success"); }).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false)); }}>{t("In die Cloud übernehmen")}</Button></div>
      {err && <Banner kind="error">{err}</Banner>}
    </div>
  );
}
