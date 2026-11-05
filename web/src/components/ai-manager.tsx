// KI-Verwaltung: the free AIs of JARVIS in one place – OpenRouter, Groq, Pollinations, Ollama, in the order they are asked.
// Everything can be done here, on the iPad or iPhone as well as on the PC: key in, test the connection, switch on/off, order,
// automatic switching, models, errors and limits. The keys are sent to the PC (protected there) and are never kept in this browser.
// Rule above all: it costs nothing – only free models, no paid fallback, no top-up. The PC enforces that; this screen only shows it.

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, KeyRound, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { relTime } from "../lib/format";
import { toast, useCan, useRpc } from "../lib/hooks";
import { setFreeAiConsent, useFreeAiConsent } from "../lib/free-ai";
import { AiSelfTest } from "./ai-selftest";
import { AiRoster } from "./ai-roster";
import { friendlyError } from "../lib/friendly-error";
import { LOCAL_NAME, LOCAL_PROVIDERS, localAiSupported, lockLocalAi, removeLocalKey, saveLocalKey, testLocal, transferKeysToPc, unlockLocalAi, useLocalAi, type LocalProvider } from "../lib/free-ai-local";

export interface AiProvider {
  id: string; name: string; enabled: boolean; needsKey: boolean; keySet: boolean; attested: boolean; consent: boolean;
  state: "ready" | "off" | "setup" | "cooldown" | "error"; stateText: string;
  lastError?: string | null; lastErrorAt?: string | null; lastOkAt?: string | null; lastModel?: string | null;
  models?: { id: string; context: number }[]; modelCount?: number; today?: { limit?: number | null; remaining?: number | null };
  privacy: string; cost: string;
}
export interface AiOverview {
  providers: AiProvider[]; auto: boolean; strategy?: "fallback" | "race" | "single"; single?: string | null; mode: string; smart: boolean; anyReady: boolean;
  last?: { provider: string; name: string; model?: string | null; at?: string | null } | null;
  costGuard?: { freeOnly: boolean; rules: string[] };
}
export const hasReadyAi = (o?: AiOverview | null) => !!o?.anyReady;
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
export const GROQ_KEYS_URL = "https://console.groq.com/keys";

const STEPS: Record<string, { url?: string; urlLabel?: string; steps: string[]; hint?: string }> = {
  openrouter: { url: OPENROUTER_KEYS_URL, urlLabel: "openrouter.ai/keys", hint: "sk-or-…", steps: [
    "Öffne openrouter.ai/keys und melde dich an (kostenlos, kein Zahlungsmittel nötig).",
    "Tippe auf „Create Key“ und kopiere den Schlüssel (beginnt mit „sk-or-“).",
    "Füge ihn unten ein und tippe auf „Speichern & testen“.",
    "Lade bei OpenRouter niemals Guthaben auf und schalte kein „Auto Top-Up“ ein – JARVIS braucht es nicht." ] },
  groq: { url: GROQ_KEYS_URL, urlLabel: "console.groq.com/keys", hint: "gsk_…", steps: [
    "Öffne console.groq.com/keys und melde dich an (kostenloser Tarif).",
    "Tippe auf „Create API Key“ und kopiere den Schlüssel (beginnt mit „gsk_“).",
    "Bestätige unten, dass dein Konto im kostenlosen Tarif ist, füge den Schlüssel ein und tippe auf „Speichern & testen“.",
    "Hinterlege bei Groq kein Zahlungsmittel und wechsle nicht auf einen bezahlten Tarif." ] },
};

function Key({ label, value, set, hint }: { label: string; value: string; set: (v: string) => void; hint?: string }) {
  return (
    <label className="fas-field">
      <span className="tiny">{label}</span>
      <input className="input mono" type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={value} maxLength={300} placeholder={hint}
        onChange={(e) => set(e.target.value.trim())} aria-label={label} />
    </label>
  );
}

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`aim-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}><span /></button>;
}

export function AiManager({ online, onChanged, roster = true }: { online: boolean; onChanged?: () => void; roster?: boolean }) {
  const canManage = useCan("admin");
  const st = useRpc<AiOverview>("ai.status", {}, ["assistant"], online);
  const consent = useFreeAiConsent();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const o = st.data;

  // Set up on this device first – the PC takes over as soon as it is connected: unlocked keys that the PC does not have yet travel sealed.
  const local = useLocalAi();
  const handed = useRef(new Set<string>());
  useEffect(() => {
    if (!online || !canManage || !o || (local.openrouter !== "ready" && local.groq !== "ready")) return;
    void transferKeysToPc(o.providers, async (provider, key, attested) => {
      const send = () => { const sealed = client.sealSecret("ai.key:" + provider, key); return client.call("ai.set", { provider, ...(sealed ? { sealed } : { key }), ...(provider === "groq" ? { attested } : {}) }); };
      try { await send(); } catch (e) { if (/noch einmal absenden/.test((e as Error).message)) await send(); else throw e; }
    }, handed.current).then(({ done, failed }) => {
      if (done.length) { toast(t("{n} automatisch an den PC übertragen.", { n: done.map((p) => LOCAL_NAME[p]).join(" + ") }), "success"); st.reload(); onChanged?.(); }
      for (const f of failed) setMsg((m) => ({ ...m, [f.provider]: { ok: false, text: friendlyError(new Error(f.message)) } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, canManage, o, local.openrouter, local.groq]);

  const run = async (id: string, fn: () => Promise<string | void>) => {
    setBusy(id); setMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    try { const text = await fn(); if (text) setMsg((m) => ({ ...m, [id]: { ok: true, text } })); st.reload(); onChanged?.(); }
    catch (e) { setMsg((m) => ({ ...m, [id]: { ok: false, text: friendlyError(e) } })); st.reload(); }
    finally { setBusy(null); }
  };
  const test = async (id: string): Promise<string> => {
    const r = await client.call<{ ok: boolean; message: string }>("ai.test", { provider: id });
    if (!r.ok) throw new Error(r.message);
    return r.message;
  };
  const saveKey = (p: AiProvider, attested?: boolean) => run(p.id, async () => {
    const key = keys[p.id] ?? "";
    // On a phone or tablet the key travels sealed with the device key (also in the home network without https); at the PC itself it goes as it is.
    const send = () => { const sealed = client.sealSecret("ai.key:" + p.id, key); return client.call("ai.set", { provider: p.id, ...(sealed ? { sealed } : { key }), ...(attested !== undefined ? { attested } : {}) }); };
    try { await send(); } catch (e) { if (/noch einmal absenden/.test((e as Error).message)) await send(); else throw e; }   // the session was renewed in between: seal anew
    setKeys((k) => ({ ...k, [p.id]: "" }));            // the key is not kept in this browser
    return await test(p.id);
  });
  const move = (i: number, d: -1 | 1) => {
    if (!o) return; const ids = o.providers.map((p) => p.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run("order", async () => { await client.call("ai.order", { order: ids }); });
  };

  if (!online) {
    return (
      <div className="aim" aria-live="polite">
        {roster && <AiRoster online={false} />}
        <p className="tiny muted">{t("Ohne PC antworten Pollinations (ohne Konto, nur mit deinem Ja) und – wenn du unten einen Schlüssel mit Passwort einrichtest – OpenRouter und Groq direkt von diesem Gerät. Ollama läuft nur auf dem PC.")}</p>
        <div className="aim-row">
          <span className="aim-name">Pollinations</span>
          <span className={`aim-badge ${consent === "yes" ? "ready" : "off"}`}>{consent === "yes" ? t("Erlaubt auf diesem Gerät") : t("Nicht erlaubt")}</span>
          <Switch on={consent === "yes"} label={t("Pollinations ohne PC erlauben")} onChange={(v) => setFreeAiConsent(v ? "yes" : "no")} />
        </div>
        <p className="tiny muted">{t("Gesendet wird nur die Frage mit den letzten Nachrichten – ohne Schlüssel, ohne Daten deines PCs. Der Dienst gehört einem Dritten und kann ausgelastet sein; dann sagt JARVIS das, statt etwas zu erfinden.")}</p>
        <LocalAiSetup />
        <AiSelfTest providers={[]} online={false} canManage={false} />
      </div>
    );
  }
  if (!o) return <p className="tiny muted" role="status">{st.error ? t("Die KI-Verwaltung lässt sich gerade nicht laden: {e}", { e: st.error.message }) : t("Lade …")}</p>;

  return (
    <div className="aim" aria-live="polite">
      <div className="aim-top">
        <span className="aim-cost"><ShieldCheck size={14} aria-hidden /> {t("0,00 € – nur kostenlose Modelle, kein bezahlter Ausweich, kein Aufladen")}</span>
        <p className="tiny">{o.last ? t("Zuletzt geantwortet: {n}{m} · {w}", { n: o.last.name, m: o.last.model ? ` (${o.last.model})` : "", w: o.last.at ? relTime(o.last.at) : "" }) : t("Noch keine Antwort von einer freien KI.")}</p>
      </div>
      {roster && <AiRoster online ai={o} />}
      <section className="aim-mode" aria-label={t("So arbeiten die KIs zusammen")}>
        <b className="aim-modetitle">{t("So arbeiten die KIs zusammen")}</b>
        <div className="aim-modes" role="radiogroup" aria-label={t("So arbeiten die KIs zusammen")}>
          {([["fallback", t("Ersatz-Reihenfolge"), t("Eine nach der anderen: ist die erste voll oder gestört, fragt JARVIS die nächste.")],
            ["race", t("Schnellster gewinnt"), t("OpenRouter und Groq werden gleichzeitig gefragt, die schnellere Antwort zählt (verbraucht von beiden Gratis-Limits).")],
            ["single", t("Nur eine KI"), t("Nur die gewählte KI antwortet, keine andere springt ein.")]] as const).map(([id, name, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={(o.strategy ?? (o.auto ? "fallback" : "single")) === id} disabled={!canManage || busy !== null}
              className={`aim-mode-btn${(o.strategy ?? (o.auto ? "fallback" : "single")) === id ? " on" : ""}`}
              onClick={() => void run("strategy", async () => { await client.call("ai.strategy", { strategy: id, ...(id === "single" ? { single: o.single ?? o.providers.find((p) => p.state === "ready")?.id ?? undefined } : {}) }); })}>
              <b>{name}</b><span className="tiny">{hint}</span>
            </button>
          ))}
        </div>
        {(o.strategy ?? (o.auto ? "fallback" : "single")) === "single" && o.providers.every((p) => p.state === "setup") && <p className="tiny muted">{t("Noch keine KI eingerichtet – zuerst unten OpenRouter oder Groq einrichten.")}</p>}
        {(o.strategy ?? (o.auto ? "fallback" : "single")) === "single" && o.providers.some((p) => p.state !== "setup") && (
          <div className="aim-single" role="radiogroup" aria-label={t("Welche KI soll antworten")}>
            {o.providers.filter((p) => p.state !== "setup").map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={(o.single ?? o.providers.find((x) => x.state === "ready")?.id) === p.id} disabled={!canManage || busy !== null}
                className={`isl2-chip${(o.single ?? o.providers.find((x) => x.state === "ready")?.id) === p.id ? " on" : ""}`}
                onClick={() => void run("strategy", async () => { await client.call("ai.strategy", { strategy: "single", single: p.id }); })}>{p.name}</button>
            ))}
          </div>
        )}
        {msg.strategy && !msg.strategy.ok && <p className="tiny fas-err" role="alert">{msg.strategy.text}</p>}
        <div className="aim-quick" role="group" aria-label={t("Schnell ein- und ausschalten")}>
          {o.providers.filter((p) => p.id === "openrouter" || p.id === "groq").map((p) => (
            <button key={p.id} type="button" disabled={!canManage || busy !== null} aria-pressed={p.enabled && p.state !== "setup"}
              className={`aim-quickbtn${p.enabled && p.state !== "setup" ? " on" : ""}`}
              onClick={() => {
                if (p.state === "setup") { setOpenId(p.id); requestAnimationFrame(() => document.getElementById(`aim-${p.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })); return; }
                void run(p.id, async () => { await client.call("ai.set", { provider: p.id, enabled: !p.enabled }); });
              }}>
              {p.name}: {p.state === "setup" ? t("einrichten") : p.enabled ? t("an") : t("aus")}
            </button>
          ))}
        </div>
      </section>
      {!canManage && <p className="tiny muted">{t("Dieses Gerät darf nichts ändern (Berechtigung „Verwalten“ fehlt) – du siehst nur den Stand.")}</p>}

      {o.providers.map((p, i) => {
        const guide = STEPS[p.id];
        const m = msg[p.id];
        const needSetup = p.state === "setup" || p.state === "error";
        const canSave = (keys[p.id] ?? "").length >= 20 && busy === null;
        return (
          <section key={p.id} id={`aim-${p.id}`} className={`fas-card aim-card ${p.state}`} aria-label={p.name}>
            <div className="aim-row">
              <span className="aim-no" aria-hidden>{i + 1}</span>
              <b className="aim-name">{p.name}</b>
              <span className={`aim-badge ${p.state}`}>{t(p.stateText)}</span>
              <span className="aim-moves">
                <button type="button" className="aim-icon" disabled={!canManage || i === 0 || busy !== null} onClick={() => move(i, -1)} aria-label={t("{n} weiter nach oben", { n: p.name })}><ArrowUp size={14} /></button>
                <button type="button" className="aim-icon" disabled={!canManage || i === o.providers.length - 1 || busy !== null} onClick={() => move(i, 1)} aria-label={t("{n} weiter nach unten", { n: p.name })}><ArrowDown size={14} /></button>
              </span>
              <Switch on={p.enabled} label={t("{n} einschalten", { n: p.name })} disabled={!canManage || p.state === "setup" || busy !== null}
                onChange={(v) => void run(p.id, async () => { await client.call("ai.set", { provider: p.id, enabled: v }); })} />
            </div>
            {p.today?.limit != null && p.today.remaining != null && <p className="tiny">{t("Heute noch frei: {r} von {l} Anfragen", { r: p.today.remaining, l: p.today.limit })}</p>}
            {p.lastError && p.state !== "ready" && <p className="tiny fas-err" role="status">{t("Letzter Fehler: {e}", { e: p.lastError })}{p.lastErrorAt ? ` · ${relTime(p.lastErrorAt)}` : ""}</p>}

            <details open={needSetup || openId === p.id}>
              <summary>{p.id === "ollama" ? t("Details") : p.keySet || p.consent ? t("Einstellungen & Test") : t("Einrichten")}</summary>
              {canManage && guide && (
                <>
                  <ol className="tiny">
                    {guide.steps.map((s) => <li key={s}>{t(s)}</li>)}
                  </ol>
                  <p className="tiny"><a href={guide.url} target="_blank" rel="noopener noreferrer">{guide.urlLabel}</a>{" "}
                    <button type="button" className="fas-copy" aria-label={t("Adresse kopieren")} onClick={() => void navigator.clipboard?.writeText(guide.url!).then(() => toast(t("Adresse kopiert"), "success")).catch(() => {})}><Copy size={12} /></button></p>
                  {p.id === "groq" && (
                    <label className="aim-check"><input type="checkbox" checked={p.attested} onChange={(e) => void run(p.id, async () => { await client.call("ai.set", { provider: "groq", attested: e.target.checked }); })} disabled={busy !== null} />
                      <span className="tiny">{t("Ich bestätige: Mein Groq-Konto ist im kostenlosen Tarif und hat keine Zahlungsmethode.")}</span></label>
                  )}
                  <Key label={p.id === "openrouter" ? t("OpenRouter-Schlüssel") : t("Groq-Schlüssel")} value={keys[p.id] ?? ""} set={(v) => setKeys((k) => ({ ...k, [p.id]: v }))} hint={guide.hint} />
                  <div className="aim-actions">
                    <button type="button" className="btn sm primary" disabled={!canSave || (p.id === "groq" && !p.attested)} onClick={() => void saveKey(p)}><KeyRound size={14} /> {busy === p.id ? t("Teste …") : t("Speichern & testen")}</button>
                    {p.keySet && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void run(p.id, async () => { await client.call("ai.set", { provider: p.id, key: "" }); return t("Schlüssel entfernt."); })}><Trash2 size={14} /> {t("Schlüssel entfernen")}</button>}
                  </div>
                </>
              )}
              {canManage && p.id === "pollinations" && (
                <label className="aim-check"><input type="checkbox" checked={p.consent} disabled={busy !== null}
                  onChange={(e) => void run(p.id, async () => { await client.call("ai.set", { provider: "pollinations", consent: e.target.checked, enabled: e.target.checked }); })} />
                  <span className="tiny">{t("Ich stimme zu: Fragen gehen an den Dienst Pollinations (Dritter, ohne Konto, ohne Schlüssel).")}</span></label>
              )}
              {p.id === "ollama" && <p className="tiny muted">{p.state === "setup" ? t("Ollama läuft auf deinem Windows-PC und kostet nichts. Installiere Ollama am PC und wähle dort unter „KI-Assistent“ ein Modell – dann erscheint es hier.") : t("Läuft auf deinem PC. Nicht benutzt, solange ein Spiel läuft (einstellbar am PC).")}</p>}
              <p className="tiny muted">{t(p.privacy)}</p>
              <p className="tiny muted">{t(p.cost)}</p>
              {p.models && p.models.length > 0 && (
                <details className="aim-models"><summary className="tiny">{t("{n} kostenlose Modelle gefunden", { n: p.modelCount ?? p.models.length })}</summary>
                  <ul className="tiny">{p.models.map((mo) => <li key={mo.id} className="mono">{mo.id}</li>)}</ul></details>
              )}
              {canManage && (p.state !== "setup") && (
                <div className="aim-actions">
                  <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void run(p.id, () => test(p.id))}><PlugZap size={14} /> {busy === p.id ? t("Teste …") : t("Verbindung testen")}</button>
                </div>
              )}
            </details>
            {m && <p className={`tiny ${m.ok ? "" : "fas-err"}`} role={m.ok ? "status" : "alert"}>{m.ok && <Check size={13} aria-hidden />} {m.text}</p>}
          </section>
        );
      })}
      {msg.order && !msg.order.ok && <p className="tiny fas-err" role="alert">{msg.order.text}</p>}
      {msg.auto && !msg.auto.ok && <p className="tiny fas-err" role="alert">{msg.auto.text}</p>}
      {localAiSupported() && <LocalAiSetup online />}
      <AiSelfTest providers={o.providers} online canManage={canManage} />
      {o.costGuard && <details><summary className="tiny">{t("Wie wird sichergestellt, dass es nichts kostet?")}</summary><ul className="tiny">{o.costGuard.rules.map((r) => <li key={r}>{t(r)}</li>)}</ul></details>}
    </div>
  );
}

/**
 * OpenRouter and Groq WITHOUT the PC: the key is typed here, locked with a password and kept on this device (never sent anywhere but to its own service).
 * With the PC connected, unlocked keys are handed over to it automatically (safer) – this is for the case that it is not there.
 */
function LocalAiSetup({ online = false }: { online?: boolean }) {
  const snap = useLocalAi();
  const [keys, setKeys] = useState<Record<LocalProvider, string>>({ openrouter: "", groq: "" });
  const [pass, setPass] = useState("");
  const [keep, setKeep] = useState(false);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const anyLocked = LOCAL_PROVIDERS.some((p) => snap[p] === "locked");
  const anyReady = LOCAL_PROVIDERS.some((p) => snap[p] === "ready");
  const run = async (id: string, fn: () => Promise<string | void>) => {
    setBusy(id); setMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    try { const text = await fn(); if (text) setMsg((m) => ({ ...m, [id]: { ok: true, text } })); }
    catch (e) { setMsg((m) => ({ ...m, [id]: { ok: false, text: friendlyError(e) } })); }
    finally { setBusy(null); }
  };
  if (!localAiSupported()) {
    return <p className="tiny muted">{t("OpenRouter und Groq ohne PC gehen nur auf der Website im Internet (https) – nicht auf der Seite, die dein PC im WLAN ausliefert.")}</p>;
  }
  return (
    <section className="fas-card aim-card" id="aim-local" aria-label={t("OpenRouter und Groq ohne PC")}>
      <b>{t("OpenRouter und Groq ohne PC")}</b>
      <p className="tiny muted">{t("Dein Schlüssel wird auf diesem Gerät mit einem Passwort verschlüsselt gespeichert und nur an den eigenen Dienst geschickt – direkt aus dem Browser, ohne Umweg. Es gelten dieselben Kostenregeln wie am PC (nur kostenlose Modelle, Höchstpreis 0, kein Aufladen). Sicherer ist der PC: Ist er verbunden, benutzt JARVIS dessen Schlüssel.")}</p>
      {online && <p className="tiny">{t("Hier eingerichtete und entsperrte Schlüssel übertragen sich automatisch (versiegelt) an den verbundenen PC, sobald er sie noch nicht hat.")}</p>}
      {anyLocked && (
        <div className="aim-unlock" role="group" aria-label={t("Schlüssel entsperren")}>
          <label className="fas-field"><span className="tiny">{t("Passwort")}</span>
            <input className="input" type="password" autoComplete="current-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort zum Entsperren")} /></label>
          <label className="aim-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span className="tiny">{t("Entsperrt lassen, bis ich den Tab schließe")}</span></label>
          <div className="aim-actions"><button type="button" className="btn sm primary" disabled={pass.length < 6 || busy !== null} onClick={() => void run("unlock", async () => { await unlockLocalAi(pass, keep); setPass(""); return t("Entsperrt – OpenRouter und Groq sind bereit."); })}>{t("Entsperren")}</button></div>
        </div>
      )}
      {msg.unlock && <p className={`tiny ${msg.unlock.ok ? "" : "fas-err"}`} role={msg.unlock.ok ? "status" : "alert"}>{msg.unlock.text}</p>}
      {anyReady && <div className="aim-actions"><button type="button" className="btn sm" onClick={() => lockLocalAi()}>{t("Wieder sperren")}</button></div>}
      {LOCAL_PROVIDERS.map((p) => {
        const guide = STEPS[p];
        const st = snap[p];
        return (
          <div key={p} className={`aim-local aim-local-${st}`} role="group" aria-label={`${LOCAL_NAME[p]} ${t("auf diesem Gerät")}`}>
            <div className="aim-row"><b className="aim-name">{LOCAL_NAME[p]}</b>
              <span className={`aim-badge ${st === "ready" ? "ready" : st === "locked" ? "cooldown" : "off"}`}>{st === "ready" ? t("Bereit (auf diesem Gerät)") : st === "locked" ? t("Gesperrt") : t("Nicht eingerichtet")}</span></div>
            {st === "none" && guide && (
              <>
                <ol className="tiny">{guide.steps.map((x) => <li key={x}>{t(x)}</li>)}</ol>
                <p className="tiny"><a href={guide.url} target="_blank" rel="noopener noreferrer">{guide.urlLabel}</a></p>
                {p === "groq" && <label className="aim-check"><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} /><span className="tiny">{t("Ich bestätige: Mein Groq-Konto ist im kostenlosen Tarif und hat keine Zahlungsmethode.")}</span></label>}
                <Key label={p === "openrouter" ? t("OpenRouter-Schlüssel") : t("Groq-Schlüssel")} value={keys[p]} set={(v) => setKeys((k) => ({ ...k, [p]: v }))} hint={guide.hint} />
                {!anyLocked && (
                  <label className="fas-field"><span className="tiny">{t("Neues Passwort für die Schlüssel auf diesem Gerät (mindestens 6 Zeichen)")}</span>
                    <input className="input" type="password" autoComplete="new-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort für die Schlüssel")} /></label>
                )}
                <div className="aim-actions">
                  <button type="button" className="btn sm primary" disabled={keys[p].length < 20 || pass.length < 6 || busy !== null || (p === "groq" && !attest)}
                    onClick={() => void run(p, async () => { await saveLocalKey(p, keys[p], pass, { attested: attest, remember: keep }); setKeys((k) => ({ ...k, [p]: "" })); setPass(""); const r = await testLocal(p); if (!r.ok) throw new Error(r.message); return r.message; })}>
                    <KeyRound size={14} /> {busy === p ? t("Teste …") : t("Speichern & testen")}</button>
                </div>
              </>
            )}
            {st !== "none" && (
              <div className="aim-actions">
                {st === "ready" && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void run(p, async () => { const r = await testLocal(p); if (!r.ok) throw new Error(r.message); return r.message; })}><PlugZap size={14} /> {busy === p ? t("Teste …") : t("Verbindung testen")}</button>}
                <button type="button" className="btn sm" disabled={busy !== null} onClick={() => { removeLocalKey(p); setMsg((m) => ({ ...m, [p]: { ok: true, text: t("Schlüssel von diesem Gerät gelöscht.") } })); }}><Trash2 size={14} /> {t("Schlüssel von diesem Gerät löschen")}</button>
              </div>
            )}
            {msg[p] && <p className={`tiny ${msg[p].ok ? "" : "fas-err"}`} role={msg[p].ok ? "status" : "alert"}>{msg[p].text}</p>}
          </div>
        );
      })}
    </section>
  );
}
