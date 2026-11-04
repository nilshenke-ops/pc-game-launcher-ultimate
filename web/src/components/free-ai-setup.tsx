// "Kostenlose KI einrichten" in three taps, for the island and the JARVIS page: a free Gemini key from Google AI Studio (own Google account,
// no card), and – as a spare in case Gemini is full or down – a second free AI (OpenRouter free models or Groq) with one tap. Keys go to the PC
// only (protected there); this device never keeps them. ChatGPT has no free access for apps, so it is not offered.

import { useState } from "react";
import { Check, Copy, KeyRound, Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useRpc } from "../lib/hooks";

export interface AiStatus { mode?: string; engines?: { id: string; label: string; free?: boolean }[]; gemini?: { keySet: boolean }; router?: { ready: boolean; models?: string[]; baseUrl?: string | null }; ollama?: { model?: string | null } }
export const GEMINI_KEY_URL = "https://aistudio.google.com/app/apikey";
export const hasFreeAi = (s?: AiStatus | null) => !!s && (!!s.gemini?.keySet || !!s.router?.ready || !!s.ollama?.model);

function Field({ label, value, set, hint, ok }: { label: string; value: string; set: (v: string) => void; hint?: string; ok?: boolean }) {
  return (
    <label className="fas-field">
      <span className="tiny">{label}</span>
      <input className="input mono" type="password" autoComplete="off" spellCheck={false} value={value} maxLength={300} placeholder={hint} onChange={(e) => set(e.target.value.trim())} aria-label={label} />
      {ok && <Check size={14} aria-hidden />}
    </label>
  );
}

export function FreeAiSetup({ online, onChanged }: { online: boolean; onChanged?: () => void }) {
  const canManage = useCan("admin");
  const st = useRpc<AiStatus>("assistant.status", {}, ["assistant"], online);
  const [gem, setGem] = useState(""), [orKey, setOrKey] = useState(""), [grKey, setGrKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = st.data;
  const done = async (fn: () => Promise<string>, id: string) => {
    setBusy(id); setMsg(null);
    try { const m = await fn(); setMsg({ ok: true, text: m }); st.reload(); onChanged?.(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  };
  const saveGemini = () => done(async () => {
    await client.call("assistant.configure", { geminiKey: gem });
    setGem("");
    // A real test with this key: one short question to Gemini itself.
    await client.call("assistant.ask", { text: "Antworte nur mit dem Wort: ok", engine: "gemini" });
    return t("Gemini läuft – kostenlos. „Automatisch“ ist jetzt an: Befehle erledigt der PC, Fragen beantwortet Gemini.");
  }, "gem");
  const quick = (preset: "openrouter" | "groq", key: string) => done(async () => {
    await client.call("assistant.quickRouter", { preset, key });
    if (preset === "openrouter") setOrKey(""); else setGrKey("");
    await client.call("assistant.ask", { text: "Antworte nur mit dem Wort: ok", engine: "router" });
    return t("Zweite kostenlose KI läuft – sie springt ein, wenn Gemini ausgelastet ist.");
  }, preset);

  if (!online) return <p className="tiny muted">{t("Die Einrichtung geht nur am PC (oder mit einem Gerät, das den PC verwalten darf) – ohne PC beantwortet die freie KI ohne Konto allgemeine Fragen.")}</p>;
  if (!canManage) return <p className="tiny muted">{t("Dieses Gerät darf nichts einrichten (Berechtigung „Verwalten“ fehlt). Am PC geht es unter KI-Assistent → Einrichten.")}</p>;
  return (
    <div className="fas" aria-live="polite">
      <p className="tiny muted">{t("Alles kostenlos, ohne Zahlungsmittel. Du brauchst nur ein Konto beim jeweiligen Dienst. ChatGPT hat keinen kostenlosen Zugang für Apps – darum Gemini, OpenRouter und Groq.")}</p>
      <section className="fas-card">
        <b><Sparkles size={14} /> {t("1 · Gemini (Google)")} {s?.gemini?.keySet && <span className="badge ok">{t("eingerichtet")}</span>}</b>
        <ol className="tiny">
          <li>{t("Öffne")} <a href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">aistudio.google.com/app/apikey</a> {t("(mit deinem Google-Konto) und wähle „API-Schlüssel erstellen“.")}{" "}
            <button type="button" className="fas-copy" onClick={() => void navigator.clipboard?.writeText(GEMINI_KEY_URL).then(() => toast(t("Adresse kopiert"), "success")).catch(() => {})} aria-label={t("Adresse kopieren")}><Copy size={12} /></button></li>
          <li>{t("Schlüssel hier einfügen (beginnt mit „AIza“):")}</li>
        </ol>
        <Field label={t("Gemini-Schlüssel")} value={gem} set={setGem} hint="AIza…" ok={s?.gemini?.keySet && !gem} />
        <button type="button" className="btn sm primary" disabled={!/^AIza[0-9A-Za-z_-]{30,60}$/.test(gem) || busy !== null} onClick={() => void saveGemini()}><KeyRound size={14} /> {busy === "gem" ? t("Teste …") : t("Speichern & testen")}</button>
      </section>
      <section className="fas-card">
        <b>{t("2 · Zweite KI als Ersatz (empfohlen)")} {s?.router?.ready && <span className="badge ok">{t("eingerichtet")}</span>}</b>
        <p className="tiny muted">{t("Springt ein, wenn Gemini ausgelastet oder nicht erreichbar ist. Der PC wählt die kostenlosen Modelle selbst aus.")}</p>
        <Field label={t("OpenRouter-Schlüssel (openrouter.ai → Keys)")} value={orKey} set={setOrKey} hint="sk-or-…" />
        <button type="button" className="btn sm" disabled={orKey.length < 20 || busy !== null} onClick={() => void quick("openrouter", orKey)}>{busy === "openrouter" ? t("Teste …") : t("OpenRouter einrichten")}</button>
        <Field label={t("Groq-Schlüssel (console.groq.com → API Keys)")} value={grKey} set={setGrKey} hint="gsk_…" />
        <button type="button" className="btn sm" disabled={grKey.length < 20 || busy !== null} onClick={() => void quick("groq", grKey)}>{busy === "groq" ? t("Teste …") : t("Groq einrichten")}</button>
      </section>
      {msg && <p className={`tiny ${msg.ok ? "" : "fas-err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}
