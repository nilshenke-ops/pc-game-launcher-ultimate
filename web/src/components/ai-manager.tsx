// KI-Verwaltung: the free AIs of JARVIS in one place – OpenRouter, Groq, Pollinations, Ollama, in the order they are asked.
// Everything can be done here, on the iPad or iPhone as well as on the PC: key in, test the connection, switch on/off, order,
// automatic switching, models, errors and limits. The keys are sent to the PC (protected there) and are never kept in this browser.
// Rule above all: it costs nothing – only free models, no paid fallback, no top-up. The PC enforces that; this screen only shows it.

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, KeyRound, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { relTime } from "../lib/format";
import { toast, useCan, useRpc } from "../lib/hooks";
import { setFreeAiConsent, useFreeAiConsent } from "../lib/free-ai";

export interface AiProvider {
  id: string; name: string; enabled: boolean; needsKey: boolean; keySet: boolean; attested: boolean; consent: boolean;
  state: "ready" | "off" | "setup" | "cooldown" | "error"; stateText: string;
  lastError?: string | null; lastErrorAt?: string | null; lastOkAt?: string | null; lastModel?: string | null;
  models?: { id: string; context: number }[]; modelCount?: number; today?: { limit?: number | null; remaining?: number | null };
  privacy: string; cost: string;
}
export interface AiOverview {
  providers: AiProvider[]; auto: boolean; mode: string; smart: boolean; anyReady: boolean;
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

export function AiManager({ online, onChanged }: { online: boolean; onChanged?: () => void }) {
  const canManage = useCan("admin");
  const st = useRpc<AiOverview>("ai.status", {}, ["assistant"], online);
  const consent = useFreeAiConsent();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const o = st.data;

  const run = async (id: string, fn: () => Promise<string | void>) => {
    setBusy(id); setMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    try { const text = await fn(); if (text) setMsg((m) => ({ ...m, [id]: { ok: true, text } })); st.reload(); onChanged?.(); }
    catch (e) { setMsg((m) => ({ ...m, [id]: { ok: false, text: (e as Error).message } })); st.reload(); }
    finally { setBusy(null); }
  };
  const test = async (id: string): Promise<string> => {
    const r = await client.call<{ ok: boolean; message: string }>("ai.test", { provider: id });
    if (!r.ok) throw new Error(r.message);
    return r.message;
  };
  const saveKey = (p: AiProvider, attested?: boolean) => run(p.id, async () => {
    const key = keys[p.id] ?? "";
    await client.call("ai.set", { provider: p.id, key, ...(attested !== undefined ? { attested } : {}) });
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
        <p className="tiny muted">{t("Ohne PC kann nur der kostenlose Dienst ohne Konto (Pollinations) Fragen beantworten – und nur mit deinem Ja. OpenRouter, Groq und Ollama brauchen den PC, weil die Schlüssel nur dort liegen.")}</p>
        <div className="aim-row">
          <span className="aim-name">Pollinations</span>
          <span className={`aim-badge ${consent === "yes" ? "ready" : "off"}`}>{consent === "yes" ? t("Erlaubt auf diesem Gerät") : t("Nicht erlaubt")}</span>
          <Switch on={consent === "yes"} label={t("Pollinations ohne PC erlauben")} onChange={(v) => setFreeAiConsent(v ? "yes" : "no")} />
        </div>
        <p className="tiny muted">{t("Gesendet wird nur die Frage mit den letzten Nachrichten – ohne Schlüssel, ohne Daten deines PCs. Der Dienst gehört einem Dritten und kann ausgelastet sein; dann sagt JARVIS das, statt etwas zu erfinden.")}</p>
      </div>
    );
  }
  if (!o) return <p className="tiny muted" role="status">{st.error ? t("Die KI-Verwaltung lässt sich gerade nicht laden: {e}", { e: st.error.message }) : t("Lade …")}</p>;

  return (
    <div className="aim" aria-live="polite">
      <div className="aim-top">
        <span className="aim-cost"><ShieldCheck size={14} aria-hidden /> {t("0,00 € – nur kostenlose Modelle, kein bezahlter Ausweich, kein Aufladen")}</span>
        <p className="tiny">{o.last ? t("Zuletzt geantwortet: {n}{m} · {w}", { n: o.last.name, m: o.last.model ? ` (${o.last.model})` : "", w: o.last.at ? relTime(o.last.at) : "" }) : t("Noch keine Antwort von einer freien KI.")}</p>
        <div className="aim-row">
          <span>{t("Automatisch zum nächsten wechseln")}</span>
          <Switch on={o.auto} label={t("Automatisch wechseln")} disabled={!canManage} onChange={(v) => void run("auto", async () => { await client.call("ai.auto", { auto: v }); })} />
        </div>
        <p className="tiny muted">{o.auto ? t("Ist ein Anbieter voll oder gestört, fragt JARVIS den nächsten – oder sagt offen, dass gerade keine kostenlose KI erreichbar ist.") : t("Aus: JARVIS fragt nur den ersten aktiven Anbieter und wechselt nicht.")}</p>
      </div>
      {!canManage && <p className="tiny muted">{t("Dieses Gerät darf nichts ändern (Berechtigung „Verwalten“ fehlt) – du siehst nur den Stand.")}</p>}

      {o.providers.map((p, i) => {
        const guide = STEPS[p.id];
        const m = msg[p.id];
        const needSetup = p.state === "setup" || p.state === "error";
        const canSave = (keys[p.id] ?? "").length >= 20 && busy === null;
        return (
          <section key={p.id} className={`fas-card aim-card ${p.state}`} aria-label={p.name}>
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

            <details open={needSetup}>
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
      {o.costGuard && <details><summary className="tiny">{t("Wie wird sichergestellt, dass es nichts kostet?")}</summary><ul className="tiny">{o.costGuard.rules.map((r) => <li key={r}>{t(r)}</li>)}</ul></details>}
    </div>
  );
}
