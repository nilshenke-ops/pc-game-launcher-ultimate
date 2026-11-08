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
import { rememberAiChoice } from "../lib/ai-choice-sync";
import { saveNow, session } from "../lib/design-account";
import { AiTiles } from "./ai-tiles";
import { elevenKeyLooksRight, removeLocalElevenKey, saveLocalElevenKey, testLocalEleven, LOCAL_NAME, LOCAL_PROVIDERS, localAiSupported, lockLocalAi, removeLocalKey, needsAttestation, saveLocalKey, saveLocalSearchKey, removeLocalSearchKey, testLocalSearch, SEARCH_NAME, SEARCH_PROVIDERS, testLocal, transferKeysToPc, unlockLocalAi, useLocalAi, type LocalProvider } from "../lib/free-ai-local";

export interface AiProvider {
  id: string; name: string; enabled: boolean; needsKey: boolean; needsAttest?: boolean; keySet: boolean; attested: boolean; consent: boolean;
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
export const CEREBRAS_KEYS_URL = "https://cloud.cerebras.ai/platform";
export const MISTRAL_KEYS_URL = "https://console.mistral.ai/api-keys";
/** Groq, Cerebras and Mistral: the free plan is a plan of the account, so the person confirms it first (OpenRouter prices every model instead). */
const needsAttest = (p: { id: string; needsAttest?: boolean }) => p.needsAttest ?? p.id === "groq";
const keyLabel = (id: string) => id === "openrouter" ? t("OpenRouter-Schlüssel") : id === "groq" ? t("Groq-Schlüssel") : id === "cerebras" ? t("Cerebras-Schlüssel") : t("Mistral-Schlüssel");
const attestText = (name: string) => t("Ich bestätige: Mein {n}-Konto ist im kostenlosen Tarif und hat keine Zahlungsmethode.", { n: name });

/** What each AI is good for – shown at every key, short and honest. */
export const CAN: Record<string, string> = {
  openrouter: "Kann: Fragen, Erklärungen, Texte, Übersetzen, Rechnen – ein Router wählt selbst ein freies Modell, meist gute Qualität, aber mal langsam. Wählen als Allrounder. Weiß nichts Aktuelles (Sport, Nachrichten) ohne Websuche.",
  groq: "Kann: Fragen, Erklärungen, Zusammenfassungen – sehr schnell, dazu große Modelle (Llama, GPT-OSS). Wählen, wenn du schnelle Antworten willst. Weiß nichts Aktuelles (Sport, Nachrichten) ohne Websuche.",
  cerebras: "Kann: Fragen, Erklärungen, Kurztexte – die schnellste der Gratis-KIs, mit kleinerem Tageskontingent. Gut als zweite Wahl für schnelle Antworten. Weiß nichts Aktuelles (Sport, Nachrichten) ohne Websuche.",
  mistral: "Kann: Fragen, Texte, Übersetzen – stark in Deutsch und Europa-Themen, das große Modell schreibt am besten. Wählen für längere, gut formulierte Antworten. Weiß nichts Aktuelles (Sport, Nachrichten) ohne Websuche.",
};
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
  cerebras: { url: CEREBRAS_KEYS_URL, urlLabel: "cloud.cerebras.ai", hint: "csk-…", steps: [
    "Öffne cloud.cerebras.ai und melde dich an (kostenloser Tarif, schnelle Antworten).",
    "Öffne links „API Keys“, tippe auf „Generate API Key“ und kopiere den Schlüssel (beginnt mit „csk-“).",
    "Bestätige unten, dass dein Konto im kostenlosen Tarif ist, füge den Schlüssel ein und tippe auf „Speichern & testen“.",
    "Hinterlege bei Cerebras kein Zahlungsmittel und wechsle nicht auf einen bezahlten Tarif." ] },
  mistral: { url: MISTRAL_KEYS_URL, urlLabel: "console.mistral.ai/api-keys", hint: t("32 Zeichen"), steps: [
    "Öffne console.mistral.ai, melde dich an und wähle den kostenlosen Tarif „Experiment“ (Bestätigung per Handynummer, keine Karte nötig).",
    "Öffne „API Keys“, tippe auf „Create new key“ und kopiere den Schlüssel (32 Buchstaben und Ziffern).",
    "Bestätige unten, dass dein Konto im kostenlosen Tarif ist, füge den Schlüssel ein und tippe auf „Speichern & testen“.",
    "Hinterlege bei Mistral kein Zahlungsmittel und wechsle nicht auf einen bezahlten Tarif." ] },
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
    try { const text = await fn(); if (text) setMsg((m) => ({ ...m, [id]: { ok: true, text } })); st.reload(); onChanged?.(); if (id === "order" || id === "strategy") void rememberAiChoice().then(() => saveNow()).catch(() => { /* the next change tries again */ }); }
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
        {roster && <><AiTiles online={false} /><AiRoster online={false} /></>}
        <p className="tiny muted">{t("Ohne PC antworten Pollinations (ohne Konto, nur mit deinem Ja) und – wenn du unten einen Schlüssel mit Passwort einrichtest – OpenRouter, Groq, Cerebras und Mistral direkt von diesem Gerät. Ollama läuft nur auf dem PC.")}</p>
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
      <p className="tiny muted">{session()
        ? t("Reihenfolge und Betriebsart reisen im Konto mit und werden auf dem PC beim Verbinden gesetzt. KI-Schlüssel bleiben auf dem Gerät.")
        : t("Reihenfolge und Betriebsart reisen mit, sobald du im Konto angemeldet bist. KI-Schlüssel bleiben auf dem Gerät.")}</p>
      {roster && <><AiTiles online ai={o} /><AiRoster online ai={o} /></>}
      <section className="aim-mode" aria-label={t("So arbeiten die KIs zusammen")}>
        <b className="aim-modetitle">{t("So arbeiten die KIs zusammen")}</b>
        <div className="aim-modes" role="radiogroup" aria-label={t("So arbeiten die KIs zusammen")}>
          {([["fallback", t("Ersatz-Reihenfolge"), t("Eine nach der anderen: ist die erste voll oder gestört, fragt JARVIS die nächste.")],
            ["race", t("Schnellster gewinnt"), t("Alle KIs mit Schlüssel werden gleichzeitig gefragt, die schnellere Antwort zählt (verbraucht von allen Gratis-Limits).")],
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
        <details className="tiny aim-can"><summary>{t("Welche KI soll ich nutzen?")}</summary>
          <p>{t("Für den Anfang reichen zwei: eine schnelle (Groq oder Cerebras) und ein Allrounder (OpenRouter oder Mistral) – fällt eine aus, springt die nächste ein. Pollinations braucht kein Konto, ist aber langsam (etwa eine Antwort pro 45 Sekunden). Ollama läuft nur am PC, ohne Internet und privat. Fußball-Fragen („Wer spielt gegen Bayern als Nächstes?“) beantwortet JARVIS kostenlos mit OpenLigaDB; das Wetter für einen genannten Ort kommt kostenlos von Open-Meteo; für Nachrichten und andere Sportarten brauchst du zusätzlich eine Websuche – siehe „Websuche für aktuelle Fragen“ in den Einstellungen.")}</p>
        </details>
        <div className="aim-quick" role="group" aria-label={t("Schnell ein- und ausschalten")}>
          {o.providers.filter((p) => p.needsKey).map((p) => (
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
                  {CAN[p.id] && <p className="tiny aim-can"><b>{t("Wofür?")}</b> {t(CAN[p.id])}</p>}
                  <ol className="tiny">
                    {guide.steps.map((s) => <li key={s}>{t(s)}</li>)}
                  </ol>
                  <p className="tiny"><a href={guide.url} target="_blank" rel="noopener noreferrer">{guide.urlLabel}</a>{" "}
                    <button type="button" className="fas-copy" aria-label={t("Adresse kopieren")} onClick={() => void navigator.clipboard?.writeText(guide.url!).then(() => toast(t("Adresse kopiert"), "success")).catch(() => {})}><Copy size={12} /></button></p>
                  {needsAttest(p) && (
                    <label className="aim-check"><input type="checkbox" checked={p.attested} onChange={(e) => void run(p.id, async () => { await client.call("ai.set", { provider: p.id, attested: e.target.checked }); })} disabled={busy !== null} />
                      <span className="tiny">{attestText(p.name)}</span></label>
                  )}
                  <Key label={keyLabel(p.id)} value={keys[p.id] ?? ""} set={(v) => setKeys((k) => ({ ...k, [p.id]: v }))} hint={guide.hint} />
                  <div className="aim-actions">
                    <button type="button" className="btn sm primary" disabled={!canSave || (needsAttest(p) && !p.attested)} onClick={() => void saveKey(p)}><KeyRound size={14} /> {busy === p.id ? t("Teste …") : t("Speichern & testen")}</button>
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
  const [keys, setKeys] = useState<Record<LocalProvider, string>>({ openrouter: "", groq: "", cerebras: "", mistral: "" });
  const [pass, setPass] = useState("");
  const [keep, setKeep] = useState(false);
  const [attest, setAttest] = useState<Record<LocalProvider, boolean>>({ openrouter: true, groq: false, cerebras: false, mistral: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [skeys, setSkeys] = useState<Record<string, string>>({});
  const [ekey, setEkey] = useState("");
  const anyLocked = snap.eleven === "locked" || LOCAL_PROVIDERS.some((p) => snap[p] === "locked") || SEARCH_PROVIDERS.some((p) => snap.search?.[p] === "locked");
  const anyReady0 = anyLocked || snap.eleven === "ready" || LOCAL_PROVIDERS.some((p) => snap[p] === "ready") || SEARCH_PROVIDERS.some((p) => snap.search?.[p] === "ready");
  const passLabel = anyReady0 ? t("Dein Passwort für die Schlüssel auf diesem Gerät (dasselbe wie bei den anderen – mindestens 6 Zeichen)") : t("Neues Passwort für die Schlüssel auf diesem Gerät (mindestens 6 Zeichen)");
  /** Why "Speichern & testen" is still grey – never a silent disabled button. */
  const why = (keyOk: boolean, keyMsg: string, extra?: string | null) => {
    const m = !keyOk ? keyMsg : pass.length < 6 ? (anyReady0 ? t("Gib unten das Passwort ein, das du für die anderen Schlüssel auf diesem Gerät benutzt (mindestens 6 Zeichen).") : t("Denk dir ein Passwort aus (mindestens 6 Zeichen) – es verschlüsselt den Schlüssel auf diesem Gerät.")) : extra ?? null;
    return m ? <p className="tiny muted aim-why" role="status">{m}</p> : null;
  };
  /** A locked key can only be opened with the password – this points to the one unlock field. */
  const lockedHint = (
    <div className="aim-actions">
      <p className="tiny muted" style={{ margin: 0 }}>{t("Gesperrt heißt: der Schlüssel ist verschlüsselt, bis du dein Passwort eingibst. Passwort vergessen? Schlüssel löschen und neu eintragen.")}</p>
      <button type="button" className="btn sm" onClick={() => { const el = document.querySelector<HTMLInputElement>("#aim-unlock input"); el?.scrollIntoView({ block: "center" }); el?.focus(); }}><KeyRound size={14} /> {t("Passwort eingeben")}</button>
    </div>
  );
  const anyReady = snap.eleven === "ready" || LOCAL_PROVIDERS.some((p) => snap[p] === "ready") || SEARCH_PROVIDERS.some((p) => snap.search?.[p] === "ready");
  const run = async (id: string, fn: () => Promise<string | void>) => {
    setBusy(id); setMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    try { const text = await fn(); if (text) setMsg((m) => ({ ...m, [id]: { ok: true, text } })); }
    catch (e) { setMsg((m) => ({ ...m, [id]: { ok: false, text: friendlyError(e) } })); }
    finally { setBusy(null); }
  };
  if (!localAiSupported()) {
    return <p className="tiny muted">{t("Schlüssel ohne PC gehen nur auf der Website im Internet (https) – nicht auf der Seite, die dein PC im WLAN ausliefert.")}</p>;
  }
  return (
    <section className="fas-card aim-card" id="aim-local" aria-label={t("Schlüssel ohne PC")}>
      <b>{t("Schlüssel ohne PC")}</b>
      <p className="tiny muted">{t("Dein Schlüssel wird auf diesem Gerät mit einem Passwort verschlüsselt gespeichert und nur an den eigenen Dienst geschickt – direkt aus dem Browser, ohne Umweg. Es gelten dieselben Kostenregeln wie am PC (nur kostenlose Modelle, Höchstpreis 0, kein Aufladen). Sicherer ist der PC: Ist er verbunden, benutzt JARVIS dessen Schlüssel.")}</p>
      {online && <p className="tiny">{t("Hier eingerichtete und entsperrte Schlüssel übertragen sich automatisch (versiegelt) an den verbundenen PC, sobald er sie noch nicht hat.")}</p>}
      {anyLocked && (
        <div id="aim-unlock" className="aim-unlock" role="group" aria-label={t("Schlüssel entsperren")}>
          <label className="fas-field"><span className="tiny">{t("Passwort")}</span>
            <input className="input" type="password" autoComplete="current-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort zum Entsperren")} /></label>
          <label className="aim-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span className="tiny">{t("Entsperrt lassen, bis ich den Tab schließe")}</span></label>
          <div className="aim-actions"><button type="button" className="btn sm primary" disabled={pass.length < 6 || busy !== null} onClick={() => void run("unlock", async () => { await unlockLocalAi(pass, keep); setPass(""); return t("Entsperrt – die Schlüssel sind bereit."); })}>{t("Entsperren")}</button></div>
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
                {CAN[p] && <p className="tiny aim-can"><b>{t("Wofür?")}</b> {t(CAN[p])}</p>}
                <ol className="tiny">{guide.steps.map((x) => <li key={x}>{t(x)}</li>)}</ol>
                <p className="tiny"><a href={guide.url} target="_blank" rel="noopener noreferrer">{guide.urlLabel}</a></p>
                {needsAttestation(p) && <label className="aim-check"><input type="checkbox" checked={attest[p]} onChange={(e) => setAttest((a) => ({ ...a, [p]: e.target.checked }))} /><span className="tiny">{attestText(LOCAL_NAME[p])}</span></label>}
                <Key label={keyLabel(p)} value={keys[p]} set={(v) => setKeys((k) => ({ ...k, [p]: v }))} hint={guide.hint} />
                {(
                  <label className="fas-field"><span className="tiny">{passLabel}</span>
                    <input className="input" type="password" autoComplete="new-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort für die Schlüssel")} /></label>
                )}
                <div className="aim-actions">
                  <button type="button" className="btn sm primary" disabled={keys[p].length < 20 || pass.length < 6 || busy !== null || (needsAttestation(p) && !attest[p])}
                    onClick={() => void run(p, async () => { await saveLocalKey(p, keys[p], pass, { attested: attest[p], remember: keep }); setKeys((k) => ({ ...k, [p]: "" })); setPass(""); const r = await testLocal(p); if (!r.ok) throw new Error(r.message); return r.message; })}>
                    <KeyRound size={14} /> {busy === p ? t("Teste …") : t("Speichern & testen")}</button>
                </div>
                {why(keys[p].length >= 20, t("Füge oben den Schlüssel ein (er ist noch zu kurz)."), needsAttestation(p) && !attest[p] ? t("Bestätige oben, dass dein Konto im kostenlosen Tarif ist.") : null)}
              </>
            )}
            {st === "locked" && lockedHint}
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
      <div className="aim-local" role="group" aria-label={t("ElevenLabs auf diesem Gerät")}>
        <div className="aim-row"><b className="aim-name">ElevenLabs</b>
          <span className={`aim-badge ${snap.eleven === "ready" ? "ready" : snap.eleven === "locked" ? "cooldown" : "off"}`}>{snap.eleven === "ready" ? t("Bereit (auf diesem Gerät)") : snap.eleven === "locked" ? t("Gesperrt") : t("Nicht eingerichtet")}</span></div>
        <p className="tiny aim-can"><b>{t("Wofür?")}</b> {t("Spracherkennung „Scribe“ (sehr genau, auch in Firefox und der iPad-App) und die natürlichste Stimme für JARVIS. Kostenlos anmelden auf elevenlabs.io (monatliches Gratis-Kontingent, kein Zahlungsmittel nötig), unter „API Keys“ einen Schlüssel erzeugen (beginnt mit „sk_“). Mit einem kostenpflichtigen Tarif kann ElevenLabs bei Überschreitung Kosten berechnen – JARVIS begrenzt deshalb die Stimme auf 15.000 Zeichen im Monat auf diesem Gerät.")}</p>
        {(snap.eleven ?? "none") === "none" && (
          <>
            <Key label={t("ElevenLabs-Schlüssel")} value={ekey} set={setEkey} hint="sk_…" />
            {(
              <label className="fas-field"><span className="tiny">{passLabel}</span>
                <input className="input" type="password" autoComplete="new-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort für die Schlüssel")} /></label>
            )}
            <div className="aim-actions"><button type="button" className="btn sm primary" disabled={!elevenKeyLooksRight(ekey.trim()) || pass.length < 6 || busy !== null}
              onClick={() => void run("eleven", async () => { await saveLocalElevenKey(ekey, pass, { remember: keep }); setEkey(""); setPass(""); const r = await testLocalEleven(); if (!r.ok) throw new Error(r.message); return r.message; })}>
              <KeyRound size={14} /> {busy === "eleven" ? t("Teste …") : t("Speichern & testen")}</button></div>
            {why(elevenKeyLooksRight(ekey.trim()), ekey.trim() ? t("Das sieht noch nicht nach einem ElevenLabs-Schlüssel aus – er beginnt mit „sk_“ und hat danach viele Zeichen. Bitte vollständig einfügen.") : t("Füge oben den ElevenLabs-Schlüssel ein (beginnt mit „sk_“)."))}
          </>
        )}
        {snap.eleven === "locked" && lockedHint}
        {snap.eleven && snap.eleven !== "none" && (
          <div className="aim-actions">
            {snap.eleven === "ready" && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void run("eleven", async () => { const r = await testLocalEleven(); if (!r.ok) throw new Error(r.message); return r.message; })}><PlugZap size={14} /> {busy === "eleven" ? t("Teste …") : t("Verbindung testen")}</button>}
            <button type="button" className="btn sm" disabled={busy !== null} onClick={() => { removeLocalElevenKey(); setMsg((m) => ({ ...m, eleven: { ok: true, text: t("Schlüssel von diesem Gerät gelöscht.") } })); }}><Trash2 size={14} /> {t("Schlüssel von diesem Gerät löschen")}</button>
          </div>
        )}
        {msg.eleven && <p className={`tiny ${msg.eleven.ok ? "" : "fas-err"}`} role={msg.eleven.ok ? "status" : "alert"}>{msg.eleven.text}</p>}
      </div>
      <div className="aim-local" role="group" aria-label={t("Websuche ohne PC")}>
        <div className="aim-row"><b className="aim-name">{t("Websuche ohne PC")}</b></div>
        <p className="tiny muted">{t("Für Fragen zu Sport, Wetter oder Nachrichten („Wann spielt Bayern als Nächstes?“) sucht JARVIS auch ohne PC direkt aus dem Browser – mit deinem eigenen kostenlosen Schlüssel von Tavily oder Serper (Anleitung bei den Einstellungen am PC). Brave, Exa und SearXNG gehen nur über den PC.")}</p>
        {SEARCH_PROVIDERS.map((p) => {
          const st = snap.search?.[p] ?? "none";
          const k = skeys[p] ?? "";
          return (
            <div key={p} className={`aim-local aim-local-${st}`} role="group" aria-label={`${SEARCH_NAME[p]} ${t("Websuche")}`}>
              <div className="aim-row"><b className="aim-name">{SEARCH_NAME[p]}</b>
                <span className={`aim-badge ${st === "ready" ? "ready" : st === "locked" ? "cooldown" : "off"}`}>{st === "ready" ? t("Bereit (auf diesem Gerät)") : st === "locked" ? t("Gesperrt") : t("Nicht eingerichtet")}</span></div>
              {st === "none" && (
                <>
                  <Key label={`${t("Schlüssel")} ${SEARCH_NAME[p]}`} value={k} set={(v) => setSkeys((m) => ({ ...m, [p]: v }))} hint={p === "tavily" ? "tvly-…" : t("40 Zeichen")} />
                  {(
                    <label className="fas-field"><span className="tiny">{passLabel}</span>
                      <input className="input" type="password" autoComplete="new-password" value={pass} maxLength={100} onChange={(e) => setPass(e.target.value)} aria-label={t("Passwort für die Schlüssel")} /></label>
                  )}
                  <div className="aim-actions">
                    <button type="button" className="btn sm primary" disabled={k.length < 20 || pass.length < 6 || busy !== null}
                      onClick={() => void run("s-" + p, async () => { await saveLocalSearchKey(p, k, pass, { remember: keep }); setSkeys((m) => ({ ...m, [p]: "" })); setPass(""); const r = await testLocalSearch(p); if (!r.ok) throw new Error(r.message); return r.message; })}>
                      <KeyRound size={14} /> {busy === "s-" + p ? t("Teste …") : t("Speichern & testen")}</button>
                  </div>
                  {why(k.length >= 20, t("Füge oben den Schlüssel ein (er ist noch zu kurz)."))}
                </>
              )}
              {st === "locked" && lockedHint}
              {st !== "none" && (
                <div className="aim-actions">
                  {st === "ready" && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void run("s-" + p, async () => { const r = await testLocalSearch(p); if (!r.ok) throw new Error(r.message); return r.message; })}><PlugZap size={14} /> {busy === "s-" + p ? t("Teste …") : t("Verbindung testen")}</button>}
                  <button type="button" className="btn sm" disabled={busy !== null} onClick={() => { removeLocalSearchKey(p); setMsg((m) => ({ ...m, ["s-" + p]: { ok: true, text: t("Schlüssel von diesem Gerät gelöscht.") } })); }}><Trash2 size={14} /> {t("Schlüssel von diesem Gerät löschen")}</button>
                </div>
              )}
              {msg["s-" + p] && <p className={`tiny ${msg["s-" + p].ok ? "" : "fas-err"}`} role={msg["s-" + p].ok ? "status" : "alert"}>{msg["s-" + p].text}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
