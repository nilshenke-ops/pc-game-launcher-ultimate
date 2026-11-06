import { useEffect, useRef, useState } from "react";
import { Cpu, Download, Grid3x3, KeyRound, RefreshCw, Sparkles } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { Banner, Button, Card, Field, Modal, Segmented, Switch } from "../components/ui";
import { formatCost } from "../lib/assistant";


export interface Status {
  mode: "local" | "ollama" | "claude" | "router" | "smart"; model: string; free: boolean;
  ollama: { url: string; model?: string | null; whileGaming: boolean; recommended: { id: string; label: string; note: string }[] }; localFirst: boolean; monthlyLimitUsd: number; keySet: boolean; claudeReady: boolean;
  models: { id: string; label: string; input: number; output: number; cacheRead: number; note: string }[];
  usage: { month: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number };
  examples: string[];
  bingoAi?: "assistant" | "deepseek"; bingoProvider?: string | null;
  deepSeek?: { keySet: boolean; model: string; monthlyRequests: number; used: number; inputTokens: number; outputTokens: number };
  engines?: { id: string; label: string; free: boolean }[]; webSearch?: boolean;
  researchAi?: string | null; search?: { keySet: boolean; monthlyRequests: number; used: number; providers?: { id: string; name: string; keySet: boolean; used: number }[] };
  router?: { baseUrl?: string | null; keySet: boolean; models: string[]; monthlyRequests: number; used: number; ready: boolean };
}

/** Ready-made router addresses: free models via OpenRouter or Groq, paid MixRoute, or an own router in the home network. */
const ROUTER_PRESETS = [
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", note: "Kostenlose Modelle enden auf „:free“ (laut OpenRouter 20 Anfragen pro Minute, 50 pro Tag). Schlüssel kostenlos auf openrouter.ai → Keys." },
  { id: "groq", label: "Groq", url: "https://api.groq.com/openai/v1", note: "Kostenloser Tarif mit Tageslimits. Schlüssel kostenlos auf console.groq.com → API Keys." },
  { id: "mixroute", label: "MixRoute", url: "https://api.mixroute.ai/v1", note: "Kostenpflichtig (Abrechnung bei MixRoute) – nur nutzen, wenn du dort Guthaben hast." },
  { id: "lan", label: "Eigener Router (LAN)", url: "http://192.168.0.10:4000/v1", note: "OmniRoute oder LiteLLM auf einem Rechner in deinem Heimnetz – 0 €, Schlüssel nur falls dein Router einen verlangt. Adresse anpassen." },
] as const;

/** OpenAI-compatible AI router (OpenRouter, Groq, MixRoute, OmniRoute/LiteLLM): up to three models in order, the next answers when one is busy. */
function RouterCard({ st, atPc, save }: { st: Status; atPc: boolean; save: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const rt = st.router;
  const [url, setUrl] = useState(rt?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [picked, setPicked] = useState<string[]>(rt?.models ?? []);
  const [own, setOwn] = useState("");
  const [cap, setCap] = useState(String(rt?.monthlyRequests ?? 1500));
  const [list, setList] = useState<{ id: string; free?: boolean | null }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(true);
  useEffect(() => { setUrl(rt?.baseUrl ?? ""); setPicked(rt?.models ?? []); }, [rt?.baseUrl, rt?.models?.join("|")]);
  if (!rt) return null;
  const load = () => { setErr(null); setList(null); client.call<{ models: { id: string; free?: boolean | null }[] }>("assistant.routerModels").then((r) => setList(r.models), (e: Error) => setErr(e.message)); };
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]);
  const shown = (list ?? []).filter((m) => !freeOnly || m.free === true).slice(0, 60);
  const preset = ROUTER_PRESETS.find((p) => url && url.startsWith(p.url.replace(/:\d+.*$/, "")));
  return (
    <Card title={t("KI-Router (OpenRouter, Groq, MixRoute …)")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Ein Router bündelt viele KI-Modelle hinter einer Adresse. Du wählst bis zu drei Modelle in deiner Reihenfolge – ist eins überlastet oder am Limit, antwortet das nächste. Unter jeder Antwort steht, welches Modell wirklich geantwortet hat.")}</p>
        {atPc ? (
          <>
            <div className="row wrap">
              {ROUTER_PRESETS.map((p) => <Button key={p.id} variant={preset?.id === p.id ? "primary" : "ghost"} onClick={() => setUrl(p.url)}>{p.label}</Button>)}
            </div>
            {preset && <p className="tiny muted">{t(preset.note)}</p>}
            <form className="row" onSubmit={(e) => { e.preventDefault(); void save({ routerBase: url.trim(), ...(key.trim() ? { routerKey: key.trim() } : {}) }, t("Router gespeichert")).then(() => setKey("")); }}>
              <Field label={t("Router-Adresse")} hint={t("Nur https – oder http für einen Router in deinem Heimnetz. Wechselst du die Adresse, wird der alte Schlüssel gelöscht.")}>
                <input className="input mono" value={url} maxLength={200} placeholder="https://openrouter.ai/api/v1" onChange={(e) => setUrl(e.target.value)} />
              </Field>
              <Field label={rt.keySet ? t("Schlüssel (gespeichert – neu eintragen zum Ersetzen)") : t("Router-Schlüssel")} hint={t("Wird nur auf diesem PC verschlüsselt gespeichert, nie angezeigt und nie ins Backup geschrieben.")}>
                <input className="input mono" type="password" autoComplete="off" value={key} placeholder="sk-…" onChange={(e) => setKey(e.target.value)} />
              </Field>
              <Button type="submit" icon={<KeyRound size={16} />} disabled={!url.trim()}>{t("Speichern")}</Button>
              {rt.keySet && <Button variant="danger" onClick={() => void save({ routerKey: "" }, t("Schlüssel entfernt"))}>{t("Schlüssel löschen")}</Button>}
              {rt.baseUrl && <Button variant="ghost" onClick={() => void save({ routerBase: "" }, t("Router entfernt"))}>{t("Router entfernen")}</Button>}
            </form>
          </>
        ) : <p className="small muted">{rt.baseUrl ? t("Router: {u}{k}", { u: rt.baseUrl, k: rt.keySet ? t(" · Schlüssel gespeichert") : "" }) : t("Adresse und Schlüssel des Routers trägst du direkt am PC ein – der Schlüssel verlässt den PC nie.")}</p>}
        {rt.baseUrl && atPc && (
          <div className="stack-sm">
            <div className="row wrap">
              <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={load}>{t("Modelle laden")}</Button>
              <Switch checked={freeOnly} onChange={setFreeOnly} label={t("Nur kostenlose Modelle")} />
            </div>
            {err && <Banner kind="warn">{err}</Banner>}
            {list && (shown.length ? (
              <div className="as-models" role="group" aria-label={t("Modelle")}>
                {shown.map((m) => (
                  <label key={m.id} className="row small">
                    <input type="checkbox" checked={picked.includes(m.id)} disabled={!picked.includes(m.id) && picked.length >= 3} onChange={() => toggle(m.id)} />
                    <span className="mono">{m.id}</span>{m.free === true && <span className="badge ok">{t("kostenlos")}</span>}
                  </label>
                ))}
              </div>
            ) : <p className="small muted">{freeOnly ? t("Der Router meldet gerade keine kostenlosen Modelle.") : t("Der Router meldet keine Modelle.")}</p>)}
            <form className="row" onSubmit={(e) => { e.preventDefault(); const v = own.trim(); if (v && !picked.includes(v) && picked.length < 3) setPicked([...picked, v]); setOwn(""); }}>
              <Field label={t("Modell von Hand hinzufügen")} hint={t("Genau so, wie der Router es nennt, z. B. „…:free“ bei OpenRouter.")}><input className="input mono" value={own} maxLength={120} onChange={(e) => setOwn(e.target.value)} /></Field>
              <Button type="submit" disabled={!own.trim() || picked.length >= 3}>{t("Hinzufügen")}</Button>
            </form>
            <p className="small">{picked.length ? t("Reihenfolge: {l}", { l: picked.map((m, i) => `${i + 1}. ${m}`).join(" → ") }) : t("Noch kein Modell gewählt.")}</p>
            <div className="row wrap">
              <Button disabled={!picked.length} onClick={() => void save({ routerModels: picked })}>{t("Modelle übernehmen")}</Button>
              {picked.length > 0 && <Button variant="ghost" onClick={() => setPicked([])}>{t("Auswahl leeren")}</Button>}
            </div>
          </div>
        )}
        <form className="row" onSubmit={(e) => { e.preventDefault(); void save({ routerMonthlyRequests: Number(cap) || 0 }); }}>
          <Field label={t("Höchstens Anfragen pro Monat")} hint={t("Danach antwortet bis Monatsende wieder der lokale Assistent.")}><input className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
          <Button type="submit">{t("Übernehmen")}</Button>
        </form>
        <p className="small">{t("Diesen Monat: {n} von {m} Router-Anfragen.", { n: rt.used, m: rt.monthlyRequests })}</p>
        <p className="tiny muted">{t("Datenschutz: Mit dem Router gehen deine Frage und der Gesprächsverlauf an den Router-Anbieter und von dort an das Modell. Kostenlose Modelle dürfen Eingaben laut Anbietern teils zum Training nutzen. Daten von deinem PC, Passwörter und Schlüssel der App sind nie dabei.")}</p>
      </div>
    </Card>
  );
}

/** The AI that writes JARVIS research answers: the free AIs set up under "KI-Verwaltung" (no extra key here). */
function ResearchAiCard({ st }: { st: Status; atPc?: boolean; save?: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  return (
    <Card title={t("KI für JARVIS-Recherche")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Fasst die Quellen, die JARVIS findet, auf Deutsch zusammen (mit Quellennummern) und beantwortet auf deinen Tipp „KI fragen“ Fragen, zu denen keine Quelle passt – dann deutlich als „ohne Quelle“ markiert. Gerade aktiv: {p}.", { p: st.researchAi ?? t("keine KI eingerichtet") })}</p>
        <p className="small muted">{t("Das übernehmen die kostenlosen KIs aus der KI-Verwaltung (OpenRouter, Groq, Pollinations, Ollama) in deiner Reihenfolge. Ist als Modus oben Claude oder die lokale KI gewählt, schreibt diese.")}</p>
      </div>
    </Card>
  );
}

/** Which AI writes bingo tasks – the assistant's own (above) or DeepSeek with an own key (only entered at the PC). */
function BingoAiCard({ st, atPc, save }: { st: Status; atPc: boolean; save: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const ds = st.deepSeek;
  const [key, setKey] = useState("");
  const [model, setModel] = useState(ds?.model ?? "deepseek-flash");
  const [cap, setCap] = useState(String(ds?.monthlyRequests ?? 200));
  if (!ds) return null;
  return (
    <Card title={t("Bingo-KI")} icon={<Grid3x3 size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Schreibt die Aufgaben für „Ultimate Gaming Bingo“. Ohne KI kommen sie aus dem eingebauten Katalog (0 €). Gerade aktiv: {p}.", { p: st.bingoProvider ?? t("Katalog") })}</p>
        <Segmented value={st.bingoAi ?? "assistant"} label={t("Bingo-KI")} onChange={(v) => void save({ bingoAi: v })}
          options={[{ value: "assistant", label: t("Wie der Assistent") }, { value: "deepseek", label: "DeepSeek" }]} />
        {atPc ? (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (key.trim()) void save({ deepSeekKey: key.trim() }, t("Schlüssel gespeichert")).then(() => setKey("")); }}>
            <Field label={ds.keySet ? t("DeepSeek-Schlüssel (gespeichert – neu eintragen zum Ersetzen)") : t("DeepSeek-API-Schlüssel")} hint={t("Bekommst du auf platform.deepseek.com → API Keys (kostenpflichtig, Abrechnung bei DeepSeek). Wird nur auf diesem PC verschlüsselt gespeichert, nie angezeigt und nie ins Backup geschrieben.")}>
              <input className="input mono" type="password" autoComplete="off" value={key} placeholder="sk-…" onChange={(e) => setKey(e.target.value)} />
            </Field>
            <Button type="submit" icon={<KeyRound size={16} />} disabled={!key.trim()}>{t("Speichern")}</Button>
            {ds.keySet && <Button variant="danger" onClick={() => void save({ deepSeekKey: "" }, t("Schlüssel entfernt"))}>{t("Schlüssel löschen")}</Button>}
          </form>
        ) : <p className="small muted">{ds.keySet ? t("Ein DeepSeek-Schlüssel ist auf dem PC gespeichert.") : t("Den DeepSeek-Schlüssel trägst du direkt am PC ein – er verlässt den PC nie.")}</p>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); void save({ deepSeekModel: model.trim(), deepSeekMonthlyRequests: Number(cap) || 0 }); }}>
          <Field label={t("Modell")} hint={t("„deepseek-flash“ ist laut DeepSeek das Modell DeepSeek-V4.1-Flash. Es wird genau dieses Modell angefragt – nie heimlich ein anderes.")}><input className="input mono" value={model} maxLength={60} onChange={(e) => setModel(e.target.value)} /></Field>
          <Field label={t("Höchstens Anfragen pro Monat")}><input className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} /></Field>
          <Button type="submit">{t("Übernehmen")}</Button>
        </form>
        <p className="small">{t("Diesen Monat: {n} von {m} DeepSeek-Anfragen ({i} Eingabe- und {o} Ausgabe-Tokens). Die Kosten rechnet DeepSeek direkt mit dir ab.", { n: ds.used, m: ds.monthlyRequests, i: ds.inputTokens, o: ds.outputTokens })}</p>
        <p className="tiny muted">{t("Hinweis: Freebuff ist ein Programmier-Werkzeug – sein kostenloses DeepSeek-Kontingent kann diese Website nicht nutzen. Dafür braucht es einen eigenen DeepSeek-API-Schlüssel. Mit DeepSeek gehen Spielname, Einstellungen und ausgeschlossene Aufgaben an DeepSeek, sonst nichts.")}</p>
      </div>
    </Card>
  );
}

/** Live facts for questions the AIs cannot know (schedules, news, weather, prices): own key of one or more search services with a free plan and no card, entered at the PC only. */
const SEARCH_GUIDE: Record<string, { url: string; label: string; hint: string; field: string; keyProp: string; step: string; can: string }> = {
  tavily: { url: "https://tavily.com", label: "tavily.com", hint: "tvly-…", field: "searchKey", keyProp: "searchKey", step: "Tavily: kostenlos anmelden, 1000 Suchen im Monat gratis, kein Zahlungsmittel. Unter „API Keys“ den Schlüssel kopieren (beginnt mit „tvly-“).", can: "Kann: liefert JARVIS kurze, saubere Textauszüge aus dem Netz – gebaut für KI-Antworten. Gut für „Wann spielt Bayern als Nächstes?“, Nachrichten, Preise, Patchnotes. Als Erste wählen." },
  serper: { url: "https://serper.dev", label: "serper.dev", hint: t("40 Zeichen"), field: "serperKey", keyProp: "serperKey", step: "Serper (Google-Ergebnisse): kostenlos anmelden, 2500 Suchen gratis einmalig, kein Zahlungsmittel. Unter „API Key“ den Schlüssel kopieren.", can: "Kann: Google-Ergebnisse – gut für Ergebnisse und Tabellen („Wie steht es bei Bayern gegen Dortmund?“), Wetter, Preise. Als Zweite wählen, wenn Tavily leer ist. Einmalig 2500 Suchen." },
  exa: { url: "https://dashboard.exa.ai", label: "dashboard.exa.ai", hint: "01234567-89ab-…", field: "exaKey", keyProp: "exaKey", step: "Exa: kostenlos anmelden, ein monatliches Gratis-Guthaben, kein Zahlungsmittel nötig. Unter „API Keys“ den Schlüssel kopieren (eine lange Kennung mit Bindestrichen).", can: "Kann: sucht nach Bedeutung – gut für Artikel, Erklärungen und Hintergründe („Was ist neu im Patch?“), schwächer bei Live-Ergebnissen. Als Dritte wählen." },
};
function WebSearchCard({ st, atPc, save }: { st: Status; atPc: boolean; save: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const ws = st.search;
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [cap, setCap] = useState(String(ws?.monthlyRequests ?? 800));
  if (!ws) return null;
  const provs = ws.providers ?? [{ id: "tavily", name: "Tavily", keySet: ws.keySet, used: ws.used }];
  return (
    <Card title={t("Websuche für aktuelle Fragen (kostenlos)")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Fragen wie „Wann spielt der FC Bayern als Nächstes?“ oder „Was ist neu im Patch?“ kann keine KI allein wissen. Mit der Websuche sucht JARVIS erst im Internet und antwortet dann aus den Ergebnissen. Gesendet wird nur deine Frage – an den Suchdienst, den du einrichtest. Mehrere sind möglich: ist einer leer oder gestört, fragt JARVIS den nächsten (Reihenfolge Tavily → Serper → Exa).")}</p>
        <div className="tiny aim-can" role="note"><b>{t("Sport und Live-Fragen")}</b> {t("Wer Bayerns nächster Gegner ist oder wie es gerade gegen Dortmund steht, weiß keine KI von allein – dafür braucht JARVIS eine Websuche (Tavily oder Serper) und irgendeine der KIs, die daraus die Antwort formuliert. Der Spielstand ist so aktuell wie die Suchergebnisse (oft einige Minuten Verzögerung): für den exakten Live-Ticker bleibt eine Sport-App genauer.")}</div>
        {provs.map((p) => {
          const g = SEARCH_GUIDE[p.id];
          if (!g) return null;
          const v = keys[p.id] ?? "";
          return (
            <div key={p.id} className="stack-sm" role="group" aria-label={`${t("Websuche")} ${p.name}`}>
              <div className="row between"><b>{p.name}</b><span className="tiny muted">{p.keySet ? t("eingerichtet · diesen Monat {n} Suchen", { n: p.used }) : t("nicht eingerichtet")}</span></div>
              <p className="tiny aim-can"><b>{t("Wofür?")}</b> {t(g.can)}</p>
              <p className="tiny muted">{t(g.step)} <a href={g.url} target="_blank" rel="noopener noreferrer">{g.label}</a></p>
              {atPc ? (
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (v.trim()) void save({ [g.keyProp]: v.trim() }, t("Schlüssel gespeichert")).then(() => setKeys((k) => ({ ...k, [p.id]: "" }))); }}>
                  <Field label={p.keySet ? `${t("Schlüssel")} ${p.name} (${t("gespeichert – neu eintragen zum Ersetzen")})` : `${t("Schlüssel")} ${p.name}`}>
                    <input className="input mono" type="password" autoComplete="off" value={v} placeholder={g.hint} onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))} />
                  </Field>
                  <Button type="submit" icon={<KeyRound size={16} />} disabled={!v.trim()}>{t("Speichern")}</Button>
                  {p.keySet && <Button variant="danger" onClick={() => void save({ [g.keyProp]: "" }, t("Schlüssel entfernt"))}>{t("Schlüssel löschen")}</Button>}
                </form>
              ) : <p className="small muted">{p.keySet ? t("Ein Websuche-Schlüssel ist auf dem PC gespeichert.") : t("Den Websuche-Schlüssel trägst du direkt am PC ein – er verlässt den PC nie.")}</p>}
            </div>
          );
        })}
        {atPc && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); void save({ searchMonthlyRequests: Number(cap) || 0 }); }}>
            <Field label={t("Höchstens Suchen pro Monat")} hint={t("Gilt je Suchdienst und bleibt unter dem kostenlosen Kontingent von 1000.")}><input className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} /></Field>
            <Button type="submit">{t("Übernehmen")}</Button>
          </form>
        )}
        <p className="small">{t("Diesen Monat: {n} von {m} Suchen.", { n: provs.reduce((a, p) => a + p.used, 0), m: ws.monthlyRequests })}</p>
      </div>
    </Card>
  );
}

function OllamaCard({ st, atPc, save }: { st: Status; atPc: boolean; save: (p: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [models, setModels] = useState<{ name: string; sizeGb: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState(st.ollama.url);
  const load = () => { setErr(null); client.call<{ models: { name: string; sizeGb: number }[] }>("assistant.ollamaModels").then((r) => setModels(r.models), (e: Error) => { setModels(null); setErr(e.message); }); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const installed = new Set((models ?? []).map((m) => m.name));
  // Loading a model from Ollama's library straight from here (with progress) – no terminal needed.
  const [pull, setPull] = useState<{ active: boolean; model: string | null; status: string; percent: number; done: boolean; error: string | null } | null>(null);
  const [custom, setCustom] = useState("");
  const poll = () => client.call<NonNullable<typeof pull>>("assistant.ollamaPullStatus").then(setPull).catch(() => {});
  useEffect(() => { void poll(); }, []);                                           // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pull?.active) return;
    const id = setInterval(() => { void poll(); }, 1500);
    return () => clearInterval(id);
  }, [pull?.active]);                                                              // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useRef<string | null>(null);
  useEffect(() => {                                                                // finished: refresh the list and choose it if nothing was chosen yet
    if (pull?.done && pull.model && seen.current !== pull.model) {
      seen.current = pull.model; load();
      if (!st.ollama.model) void save({ ollamaModel: pull.model }, t("Modell geladen und ausgewählt"));
      else toast(t("Modell {m} geladen.", { m: pull.model }), "success");
    }
  }, [pull?.done, pull?.model]);                                                   // eslint-disable-line react-hooks/exhaustive-deps
  const startPull = (model: string) => client.call<NonNullable<typeof pull>>("assistant.ollamaPull", { model }).then(setPull, (e: Error) => toast(e.message, "error"));
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
            {models.length === 0 && <p className="small" role="status">{t("Noch kein Modell installiert – darum ist die Liste leer. Tippe unten bei einem empfohlenen Modell auf „Installieren“; danach erscheint es hier und wird ausgewählt.")}</p>}
          </Field>
        )}
        {models != null && (
          <ul className="plain-list small">
            {st.ollama.recommended.map((r) => (
              <li key={r.id} className="row between"><span><b>{r.label}</b> <span className="muted">{r.note}</span></span>
                {installed.has(r.id) ? <span className="badge ok">{t("installiert")}</span>
                  : pull?.active && pull.model === r.id ? <span className="tiny">{pull.status || t("lädt")} {pull.percent}%</span>
                  : <Button size="sm" icon={<Download size={14} />} disabled={!!pull?.active} onClick={() => void startPull(r.id)}>{t("Installieren")}</Button>}</li>
            ))}
          </ul>
        )}
        {pull?.active && <div className="progress-bar" role="progressbar" aria-label={t("Modell wird geladen")} aria-valuenow={pull.percent}><i style={{ width: `${pull.percent}%` }} /></div>}
        {pull?.error && <Banner kind="error">{pull.error}</Banner>}
        {models != null && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void startPull(custom.trim()).then(() => setCustom("")); }}>
            <Field label={t("Anderes Modell aus der Ollama-Bibliothek laden")} hint={t("Name wie auf ollama.com/library, z. B. mistral:7b oder gemma2:9b. Wichtig: Es muss Werkzeuge unterstützen („tools“).")}>
              <input className="input mono" value={custom} placeholder="qwen2.5:7b" onChange={(e) => setCustom(e.target.value)} aria-label={t("Modellname")} />
            </Field>
            <Button type="submit" icon={<Download size={16} />} disabled={!custom.trim() || !!pull?.active}>{t("Laden")}</Button>
          </form>
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

export function SettingsDialog({ st, onClose }: { st: Status; onClose: () => void }) {
  const conn = useConn();
  const atPc = !!conn.me?.isLocal;
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(String(st.monthlyLimitUsd));
  // Which option is shown: Claude can be opened before a key exists (the key is entered there).
  const [view, setView] = useState(st.mode);
  useEffect(() => setView(st.mode), [st.mode]);
  const ready = (m: Status["mode"]) => m === "claude" ? st.keySet : m === "router" ? !!st.router?.ready : true;
  const choose = (m: Status["mode"]) => { setView(m); if (ready(m)) void save({ mode: m }); };
  const save = (p: Record<string, unknown>, ok = t("Gespeichert")) => client.call("assistant.configure", p).then(() => toast(ok, "success"), (e: Error) => toast(e.message, "error")) as Promise<void>;
  const model = st.models.find((m) => m.id === st.model);
  return (
    <Modal title={t("Assistent einrichten")} onClose={onClose} wide footer={<Button onClick={onClose}>{t("Fertig")}</Button>}>
      <div className="stack">
        <Field label={t("Wer antwortet?")} hint={view === "local" ? t("Lokal: läuft auf deinem PC, ohne Internet, kostenlos. Versteht Befehle und Fragen zur App.") : view === "ollama" ? t("Lokale KI: zusätzlich ein freies Sprachmodell auf deinem PC für freie Fragen – ebenfalls 0 €.") : view === "router" ? t("KI-Router: freie Fragen über OpenRouter, Groq & Co. – mit kostenlosen Modellen 0 €, bei Ausfall springt dein nächstes Modell ein.") : t("Claude: freie Fragen und Gespräche. Kostet pro Anfrage (dein Anthropic-Konto).")}>
          <Segmented value={view} onChange={choose} label={t("Wer antwortet?")}
            options={[{ value: "local", label: t("Lokal (0 €)") }, { value: "ollama", label: t("Lokale KI (0 €)") }, { value: "router", label: t("KI-Router") }, { value: "claude", label: t("Claude (kostenpflichtig)") }]} />
        </Field>
        {view !== st.mode && !ready(view) && <Banner kind="info">{view === "router" ? t("Trag unten Router-Adresse, Schlüssel und mindestens ein Modell ein – dann wähle „KI-Router“ noch einmal.") : t("Trag zuerst den API-Schlüssel ein.")}</Banner>}
        {view === "ollama" && <OllamaCard st={st} atPc={atPc} save={save} />}
        <RouterCard st={st} atPc={atPc} save={save} />
        <ResearchAiCard st={st} atPc={atPc} save={save} />
        <WebSearchCard st={st} atPc={atPc} save={save} />
        <BingoAiCard st={st} atPc={atPc} save={save} />
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
