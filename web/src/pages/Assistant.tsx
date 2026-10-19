import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Cpu, KeyRound, Mic, MicOff, Plus, RefreshCw, Send, Settings2, Sparkles, User } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card, confirmDialog, Field, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { CHAT_KEY, emptyChat, formatCost, readChat, type AssistantAction, type AssistantReply, type ChatState } from "../lib/assistant";

interface Status {
  mode: "local" | "ollama" | "claude"; model: string; free: boolean;
  ollama: { url: string; model?: string | null; whileGaming: boolean; recommended: { id: string; label: string; note: string }[] }; localFirst: boolean; monthlyLimitUsd: number; keySet: boolean; claudeReady: boolean;
  models: { id: string; label: string; input: number; output: number; cacheRead: number; note: string }[];
  usage: { month: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number };
  examples: string[];
}

const doneText = (kind: string) => ({
  launch: t("Wird gestartet"), sound: t("Sound läuft"), stopSounds: t("Alle Sounds gestoppt"), profile: t("Profil aktiviert"), quick: t("Wird ausgeführt"),
  goal: t("Ziel angelegt"), wish: t("Auf die Wunschliste gesetzt"), match: t("Match eingetragen"),
} as Record<string, string>)[kind] ?? t("Erledigt");

// Web Speech API (Chrome, Edge, Safari) – optional, feature-detected.
type Recognition = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechCtor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

function OllamaCard({ st, atPc, save }: { st: Status; atPc: boolean; save: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [models, setModels] = useState<{ name: string; sizeGb: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState(st.ollama.url);
  const load = () => { setErr(null); client.call<{ models: { name: string; sizeGb: number }[] }>("assistant.ollamaModels").then((r) => setModels(r.models), (e: Error) => { setModels(null); setErr(e.message); }); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const installed = new Set((models ?? []).map((m) => m.name));
  return (
    <Card title={t("Lokale KI (Ollama) – kostenlos")} icon={<Cpu size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Ein freies Sprachmodell läuft direkt auf deinem PC: 0 €, kein Konto, nichts verlässt den PC. Befehle, PC-Werte und App-Fragen beantwortet trotzdem der genaue lokale Assistent – das Modell nur freie Fragen.")}</p>
        {err ? (
          <Banner kind="warn" title={t("Ollama nicht gefunden")}>
            {t("1. Ollama kostenlos installieren: ollama.com/download (Windows). 2. Im Terminal ein Modell laden, z. B. „ollama pull qwen2.5:7b“. 3. Hier auf „Neu prüfen“ tippen.")}
            <div style={{ marginTop: 8 }}><Button size="sm" icon={<RefreshCw size={15} />} onClick={load}>{t("Neu prüfen")}</Button></div>
          </Banner>
        ) : models == null ? <p className="small muted">{t("Suche Ollama …")}</p> : (
          <Field label={t("Modell")} hint={t("Größere Modelle antworten besser, brauchen aber mehr Grafikspeicher. Im Test machten 1,5B- und 3B-Modelle viele Fehler; empfohlen ist mindestens 7B.")}>
            <select className="input" value={st.ollama.model ?? ""} onChange={(e) => save({ ollamaModel: e.target.value })}>
              <option value="">{t("– Modell wählen –")}</option>
              {models.map((m) => <option key={m.name} value={m.name}>{m.name} · {m.sizeGb.toLocaleString()} GB</option>)}
            </select>
          </Field>
        )}
        {models != null && (
          <ul className="plain-list small">
            {st.ollama.recommended.map((r) => (
              <li key={r.id} className="row between"><span><b>{r.label}</b> <span className="muted">{r.note}</span></span>
                {installed.has(r.id) ? <span className="badge ok">{t("installiert")}</span> : <code className="tiny">ollama pull {r.id}</code>}</li>
            ))}
          </ul>
        )}
        <Switch checked={st.ollama.whileGaming} onChange={(ollamaWhileGaming) => save({ ollamaWhileGaming })} label={t("Auch während eines Spiels benutzen")}
          hint={t("Aus (empfohlen): Läuft ein Spiel, antwortet der einfache lokale Assistent – das Modell würde Grafikkarte und Speicher belasten und FPS kosten. Das Modell wird 2 Minuten nach der letzten Frage aus dem Speicher entfernt.")} />
        {atPc && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); save({ ollamaUrl: url }).then(load); }}>
            <Field label={t("Ollama-Adresse")} hint={t("Normalerweise dieser PC. Ein anderer PC im Heimnetz geht auch.")}><input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
            <Button type="submit">{t("Übernehmen")}</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function SettingsDialog({ st, onClose }: { st: Status; onClose: () => void }) {
  const conn = useConn();
  const atPc = !!conn.me?.isLocal;
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(String(st.monthlyLimitUsd));
  // Which option is shown: Claude can be opened before a key exists (the key is entered there).
  const [view, setView] = useState(st.mode);
  useEffect(() => setView(st.mode), [st.mode]);
  const choose = (m: Status["mode"]) => { setView(m); if (m !== "claude" || st.keySet) void save({ mode: m }); };
  const save = (p: Record<string, unknown>, ok = t("Gespeichert")) => client.call("assistant.configure", p).then(() => toast(ok, "success"), (e: Error) => toast(e.message, "error")) as Promise<void>;
  const model = st.models.find((m) => m.id === st.model);
  return (
    <Modal title={t("Assistent einrichten")} onClose={onClose} wide footer={<Button onClick={onClose}>{t("Fertig")}</Button>}>
      <div className="stack">
        <Field label={t("Wer antwortet?")} hint={view === "local" ? t("Lokal: läuft auf deinem PC, ohne Internet, kostenlos. Versteht Befehle und Fragen zur App.") : view === "ollama" ? t("Lokale KI: zusätzlich ein freies Sprachmodell auf deinem PC für freie Fragen – ebenfalls 0 €.") : t("Claude: freie Fragen und Gespräche. Kostet pro Anfrage (dein Anthropic-Konto).")}>
          <Segmented value={view} onChange={choose} label={t("Wer antwortet?")}
            options={[{ value: "local", label: t("Lokal (0 €)") }, { value: "ollama", label: t("Lokale KI (0 €)") }, { value: "claude", label: t("Claude (kostenpflichtig)") }]} />
        </Field>
        {view === "ollama" && <OllamaCard st={st} atPc={atPc} save={save} />}
        {view === "claude" && !st.keySet && <Banner kind="info">{t("Claude kostet pro Anfrage Geld (dein Anthropic-Konto). Für 0 € nimm „Lokal“ oder „Lokale KI“.")}</Banner>}
        {view === "claude" && <Card title={t("Claude")} icon={<Sparkles size={18} />} className="flat">
          <div className="stack-sm">
            {atPc ? (
              <form className="row" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save({ apiKey: key.trim(), mode: "claude" }, t("Schlüssel gespeichert")).then(() => setKey("")); }}>
                <Field label={st.keySet ? t("API-Schlüssel (gespeichert – neu eintragen zum Ersetzen)") : t("Anthropic-API-Schlüssel")} hint={t("Bekommst du auf console.anthropic.com → API Keys. Wird nur auf diesem PC verschlüsselt gespeichert, nie angezeigt und nie ins Backup geschrieben.")}>
                  <input className="input mono" type="password" autoComplete="off" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
                </Field>
                <Button type="submit" icon={<KeyRound size={16} />} disabled={!key.trim()}>{t("Speichern")}</Button>
                {st.keySet && <Button variant="danger" onClick={() => save({ apiKey: "" }, t("Schlüssel entfernt"))}>{t("Schlüssel löschen")}</Button>}
              </form>
            ) : (
              <p className="small muted">{st.keySet ? t("Ein API-Schlüssel ist auf dem PC gespeichert.") : t("Den API-Schlüssel trägst du direkt am PC ein (Nexus-Fenster → KI-Assistent → Einrichten) – er verlässt den PC nie.")}</p>
            )}
            <Field label={t("Modell")} hint={model ? t("{n}: {i} $ pro Million Eingabe-Tokens, {o} $ pro Million Ausgabe-Tokens", { n: model.label, i: model.input, o: model.output }) : undefined}>
              <select className="input" value={st.model} onChange={(e) => save({ model: e.target.value })}>
                {st.models.map((m) => <option key={m.id} value={m.id}>{m.label} – {m.note}</option>)}
              </select>
            </Field>
            <Switch checked={st.localFirst} onChange={(localFirst) => save({ localFirst })} label={t("Einfache Befehle lokal beantworten")} hint={t("„Starte …“, „Wie geht es meinem PC?“ usw. beantwortet der lokale Assistent sofort und kostenlos – nur der Rest geht an Claude.")} />
            <form className="row" onSubmit={(e) => { e.preventDefault(); save({ monthlyLimitUsd: Number(limit.replace(",", ".")) }); }}>
              <Field label={t("Monatslimit in US-Dollar")} hint={t("Ist es erreicht, antwortet bis Monatsende der lokale Assistent.")}>
                <input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
              <Button type="submit">{t("Übernehmen")}</Button>
            </form>
            <p className="small">{t("Diesen Monat: {n} Anfragen, etwa {c} (geschätzt aus den Token-Zahlen von Anthropic; maßgeblich ist deine Abrechnung).", { n: st.usage.requests, c: formatCost(st.usage.costUsd) })}</p>
            <p className="tiny muted">{t("Datenschutz: Mit Claude gehen deine Frage, der Gesprächsverlauf und die Daten, die Claude dafür abfragt (z. B. Spielnamen, PC-Werte, Spielzeit), an Anthropic. Passwörter und Schlüssel der App sind nie dabei. Im lokalen Modus verlässt nichts den PC.")}</p>
          </div>
        </Card>}
      </div>
    </Modal>
  );
}

function Turn({ turn, onSuggest }: { turn: ChatState["turns"][number]; onSuggest: (text: string) => void }) {
  const nav = useNavigate();
  const [done, setDone] = useState<Record<number, boolean>>({});
  if (turn.role === "user") return <div className="as-turn me"><div className="as-bubble">{turn.text}</div><User size={18} aria-hidden /></div>;
  const r = turn.reply!;
  const run = async (a: AssistantAction, i: number) => {
    if (a.kind === "navigate" && a.path) { nav(a.path); return; }
    if (!a.method) return;
    if (a.confirm && !(await confirmDialog(a.label + "?", t("Das wird jetzt auf deinem PC ausgeführt."), { ok: t("Ausführen") }))) return;
    try {
      await client.call(a.method, a.params ?? {});
      setDone((d) => ({ ...d, [i]: true }));
      toast(doneText(a.kind), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <div className="as-turn bot reply">
      <Bot size={18} aria-hidden />
      <div className="as-bubble">
        <div className="as-text">{r.text}</div>
        {r.actions.length > 0 && (
          <div className="row as-actions">
            {r.actions.map((a, i) => (
              <Button key={i} size="sm" variant={a.kind === "navigate" ? "ghost" : "primary"} disabled={done[i]} onClick={() => run(a, i)}>{done[i] ? "✓ " : ""}{a.label}</Button>
            ))}
          </div>
        )}
        {r.suggestions.length > 0 && <div className="chips as-sugg">{r.suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => onSuggest(s.replace(/^Mehr zu: /, ""))}>{s}</button>)}</div>}
        <div className="tiny muted as-meta">
          {r.mode === "claude" ? `${r.model ?? "Claude"}${r.costUsd != null ? " · " + formatCost(r.costUsd) : ""}` : r.mode === "ollama" ? `${r.model ?? "Ollama"} · ${t("0 €")}` : t("Lokal · 0 €")}
          {r.sources.length > 0 && " · " + t("Quelle: {s}", { s: r.sources.join(", ") })}
        </div>
      </div>
    </div>
  );
}

/** KI-Assistent: answers questions about the app and this PC, suggests actions as buttons. Runs on the PC (local) or with Claude. */
export default function Assistant() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canAdmin = useCan("admin");
  const st = useRpc<Status>("assistant.status", {}, ["assistant"]);
  const [chat, setChat] = useState<ChatState>(readChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat)); } catch { /* private mode */ } end.current?.scrollIntoView({ block: "end" }); }, [chat]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setChat((c) => ({ ...c, turns: [...c.turns, { role: "user", text: question }] }));
    setBusy(true);
    try {
      const r = await client.call<{ conversationId: string; reply: AssistantReply }>("assistant.ask", { conversationId: chat.conversationId, text: question });
      setChat((c) => ({ conversationId: r.conversationId, turns: [...c.turns, { role: "bot", reply: r.reply }] }));
    } catch (e) {
      setChat((c) => ({ ...c, turns: [...c.turns, { role: "bot", reply: { text: (e as Error).message, actions: [], sources: [], suggestions: [], mode: "local" } }] }));
    } finally { setBusy(false); }
  };

  // Opened from the search (Ctrl+K → "Assistent fragen …").
  useEffect(() => {
    const q = params.get("q");
    if (q && online) { setParams({}, { replace: true }); void ask(q); }
  }, [online, params]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    if (chat.conversationId) client.call("assistant.reset", { conversationId: chat.conversationId }).catch(() => {});
    setChat(emptyChat());
  };

  const toggleMic = () => {
    if (!SpeechCtor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechCtor();
    r.lang = document.documentElement.lang === "en" ? "en-US" : "de-DE";
    r.interimResults = false;
    r.onresult = (e) => { const said = e.results[0]?.[0]?.transcript ?? ""; if (said) void ask(said); };
    r.onend = () => setListening(false);
    r.onerror = (e) => { setListening(false); if (e.error !== "aborted") toast(t("Spracheingabe nicht möglich: {e}", { e: e.error }), "error"); };
    rec.current = r;
    setListening(true);
    r.start();
  };

  const s = st.data;
  return (
    <div className="as-page">
      <PageHead eyebrow={t("Dashboard")} title={t("KI-Assistent")}
        text={s?.claudeReady ? t("Frag alles zu deinem PC, deinen Spielen und der App. Antworten kommen von Claude – Befehle erledigt der lokale Assistent kostenlos.") : s?.mode === "ollama" ? t("Frag alles zu deinem PC, deinen Spielen und der App. Alles läuft auf deinem PC – 0 €, ohne Konto.") : t("Frag alles zu deinem PC, deinen Spielen und der App. Der lokale Assistent läuft auf deinem PC – ohne Internet und kostenlos.")}
        actions={<>
          {s && <span className={`badge ${s.claudeReady ? "accent" : "ok"}`}>{s.claudeReady ? s.models.find((m) => m.id === s.model)?.label ?? "Claude" : s.mode === "ollama" ? t("Lokale KI · 0 €") : t("Lokal · 0 €")}</span>}
          <Button icon={<Plus size={16} />} onClick={reset} disabled={chat.turns.length === 0}>{t("Neues Gespräch")}</Button>
          {canAdmin && s && <Button icon={<Settings2 size={16} />} onClick={() => setSettings(true)}>{t("Einrichten")}</Button>}
        </>} />
      {!online && <Banner kind="warn">{t("Der Assistent läuft auf dem PC – ohne Verbindung kann er nicht antworten.")}</Banner>}

      <Card className="as-chat">
        <div className="as-log" aria-live="polite">
          {chat.turns.length === 0 && (
            <div className="as-empty">
              <Sparkles size={28} aria-hidden />
              <p>{t("Ich kenne jede Seite der App, deine Bibliothek, Sounds, Profile und die Live-Werte deines PCs. Aktionen schlage ich als Knopf vor – ausgeführt wird erst, wenn du tippst.")}</p>
              <div className="chips">{(s?.examples ?? []).map((e) => <button key={e} type="button" className="chip" disabled={!online} onClick={() => ask(e)}>{e}</button>)}</div>
            </div>
          )}
          {chat.turns.map((turn, i) => <Turn key={i} turn={turn} onSuggest={ask} />)}
          {busy && <div className="as-turn bot"><Bot size={18} aria-hidden /><div className="as-bubble as-typing" aria-label={t("Antwort wird erstellt")}><i /><i /><i /></div></div>}
          <div ref={end} />
        </div>
        <form className="as-input" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
          <input className="input" value={text} maxLength={2000} disabled={!online} placeholder={t("Frag etwas oder gib einen Befehl, z. B. „Starte Rocket League“")} aria-label={t("Nachricht an den Assistenten")} onChange={(e) => setText(e.target.value)} />
          {SpeechCtor && <Button variant="ghost" icon={listening ? <MicOff size={18} /> : <Mic size={18} />} aria-label={listening ? t("Zuhören beenden") : t("Spracheingabe")} disabled={!online} onClick={toggleMic} />}
          <Button type="submit" variant="primary" icon={<Send size={16} />} busy={busy} disabled={!online || !text.trim()} aria-label={t("Senden")} />
        </form>
      </Card>
      {settings && s && <SettingsDialog st={s} onClose={() => setSettings(false)} />}
    </div>
  );
}
