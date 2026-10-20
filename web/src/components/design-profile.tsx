import { useState } from "react";
import { Copy, KeyRound, LogIn, LogOut, Save, Trash2, UserPlus } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { relTime } from "../lib/format";
import { applyDesignCode, createProfile, cryptoAvailable, deleteProfile, designCode, saveNow, session, signIn, signOut, USER_RX } from "../lib/design-account";
import { Banner, Button, Card, confirmDialog, Field, Segmented } from "./ui";

/** Optional design profile (user name + password) and the design code – to take the own design to another browser. */
export function DesignProfileCard() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const [s, setS] = useState(session);
  const [mode, setMode] = useState<"login" | "create">("login");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const refresh = () => setS(session());
  const u = user.trim().toLowerCase();
  const valid = USER_RX.test(u) && pw.length >= 8 && (mode === "login" || pw === pw2);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, "success"); setPw(""); setPw2(""); refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <Card title={t("Design-Profil")} icon={<KeyRound size={18} />}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{t("Optional: Mit Benutzername und Passwort nimmst du dein Design (Farben, Hintergrund, Startseite, untere Leiste, Sprache) in einen neuen Browser mit. Das Design wird schon im Browser verschlüsselt und auf deinem PC gespeichert – der PC kann es nicht lesen, das Passwort verlässt dein Gerät nie.")}</p>
        {!cryptoAvailable() ? <Banner kind="info">{t("Dieser Browser erlaubt die Verschlüsselung nur auf https-Seiten. Öffne die Website-Adresse (https) oder die PC-Ansicht am PC selbst.")}</Banner>
          : s ? (
            <div className="stack-sm">
              <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
                <span><b>{s.user}</b> <span className="tiny muted">{s.savedAt ? t("· gespeichert {d}", { d: relTime(s.savedAt) }) : ""}</span></span>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" icon={<Save size={14} />} busy={busy} disabled={!online} onClick={() => void run(saveNow, t("Design im Profil gespeichert"))}>{t("Jetzt speichern")}</Button>
                  <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => { signOut(); refresh(); }}>{t("Abmelden")}</Button>
                </div>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>{t("Änderungen am Design werden automatisch ins Profil gespeichert, sobald der PC verbunden ist.")}</p>
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={!online} onClick={async () => { if (await confirmDialog(t("Design-Profil löschen?"), t("Das Profil „{u}“ wird vom PC gelöscht. Das Design auf diesem Gerät bleibt.", { u: s.user }), { danger: true, ok: t("Löschen") })) void run(deleteProfile, t("Profil gelöscht")); }}>{t("Profil löschen")}</Button>
            </div>
          ) : (
            <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); if (!valid) return; void run(() => (mode === "login" ? signIn(u, pw) : createProfile(u, pw)), mode === "login" ? t("Angemeldet – dein Design ist geladen") : t("Profil angelegt – dein Design ist gespeichert")); }}>
              <Segmented value={mode} onChange={setMode} label={t("Profil")} options={[{ value: "login", label: t("Anmelden") }, { value: "create", label: t("Neues Profil") }]} />
              <Field label={t("Benutzername")} hint={t("3–24 Zeichen: a–z, Ziffern, Punkt, Minus, Unterstrich")} error={user && !USER_RX.test(u) ? t("Ungültiger Benutzername") : undefined}>
                <input className="input" value={user} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={(e) => setUser(e.target.value)} />
              </Field>
              <Field label={t("Passwort")} hint={t("Mindestens 8 Zeichen. Vergessen = Design nicht wiederherstellbar (es ist verschlüsselt).")}>
                <input className="input" type="password" value={pw} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(e) => setPw(e.target.value)} />
              </Field>
              {mode === "create" && <Field label={t("Passwort wiederholen")} error={pw2 && pw !== pw2 ? t("Passwörter sind verschieden") : undefined}>
                <input className="input" type="password" value={pw2} autoComplete="new-password" onChange={(e) => setPw2(e.target.value)} />
              </Field>}
              <Button type="submit" variant="primary" icon={mode === "login" ? <LogIn size={15} /> : <UserPlus size={15} />} busy={busy} disabled={!valid || !online}>{mode === "login" ? t("Anmelden und Design laden") : t("Profil anlegen")}</Button>
              {!online && <p className="tiny muted" style={{ margin: 0 }}>{t("Braucht die Verbindung zu deinem PC – dort liegt das Profil. Ohne PC: Design-Code unten.")}</p>}
            </form>
          )}
        <details>
          <summary className="small">{t("Design-Code (ohne Konto und ohne PC)")}</summary>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <Button size="sm" icon={<Copy size={14} />} onClick={() => { const c = designCode(); navigator.clipboard?.writeText(c).then(() => toast(t("Design-Code kopiert – im anderen Browser hier einfügen"), "success"), () => setCode(c)); setCode(c); }}>{t("Design-Code kopieren")}</Button>
            <textarea className="input mono" rows={3} value={code} placeholder="NXD1:…" aria-label={t("Design-Code")} onChange={(e) => setCode(e.target.value)} />
            <Button size="sm" disabled={!code.trim().startsWith("NXD1:")} onClick={() => { const ok = applyDesignCode(code); toast(ok ? t("Design übernommen") : t("Der Code ist ungültig."), ok ? "success" : "error"); }}>{t("Code übernehmen")}</Button>
            <p className="tiny muted" style={{ margin: 0 }}>{t("Der Code enthält nur das Design und ist nicht verschlüsselt – teile ihn nur mit dir selbst.")}</p>
          </div>
        </details>
      </div>
    </Card>
  );
}
