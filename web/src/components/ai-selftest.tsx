// Selbsttest: prüft nacheinander, was JARVIS braucht – PC erreichbar, ein echter PC-Befehl, die Internetsuche, jede eingerichtete KI einzeln
// und die Spracheingabe – und sagt in einfachen Worten, was geklappt hat und was nicht. Nichts wird gestartet oder verändert; die KI-Tests
// zählen je eine Frage gegen das kostenlose Limit. Die Wiederverbindung prüft ein eigener Knopf (er trennt die Verbindung kurz).

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, CircleDashed, Loader2, PlugZap, X } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import type { AiProvider } from "./ai-manager";
import { voiceInputSupported } from "../lib/island-voice";

type State = "wait" | "run" | "ok" | "warn" | "fail";
interface Step { id: string; label: string; state: State; text: string }

/** Words a person understands for what went wrong (the PC's messages are German already). */
export function plainError(e: unknown): string {
  const m = (e as { message?: string; code?: string })?.message ?? "";
  const c = (e as { code?: string })?.code ?? "";
  if (c === "forbidden") return t("Dafür hat dieses Gerät keine Berechtigung.");
  if (/timeout|zu lange/i.test(m)) return t("Es kam keine Antwort in angemessener Zeit.");
  if (/not connected|offline|Verbindung/i.test(m) && !m) return t("Keine Verbindung zum PC.");
  return m || t("Unbekannter Fehler.");
}

// The results live outside the card: while the connection is closed for the reconnection test the card briefly shows the offline view,
// and the result must still be there when it is back.
const store: { steps: Step[]; recon: string | null } = { steps: [], recon: null };
const listeners = new Set<() => void>();
let snapshot = { steps: store.steps, recon: store.recon };
const publish = () => { snapshot = { steps: store.steps, recon: store.recon }; listeners.forEach((l) => l()); };
const useStore = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snapshot);

const transportText = (tr?: string) => (tr === "relay" ? t("über die Relay-Verbindung (verschlüsselt)") : t("direkt im WLAN bzw. am PC"));

export function AiSelfTest({ providers, online, canManage }: { providers: AiProvider[]; online: boolean; canManage: boolean }) {
  const { steps, recon } = useStore();
  const setSteps = (v: Step[]) => { store.steps = v; publish(); };
  const setRecon = (v: string | null) => { store.recon = v; publish(); };
  const [running, setRunning] = useState(false);
  const [reconBusy, setReconBusy] = useState(false);

  const run = async () => {
    setRunning(true);
    const list: Step[] = [];
    const push = (s: Step) => { list.push(s); setSteps([...list]); return list.length - 1; };
    const set = (i: number, p: Partial<Step>) => { list[i] = { ...list[i], ...p }; setSteps([...list]); };
    try {
      if (online) {
        // 1 · the PC answers
        let i = push({ id: "pc", label: t("PC erreichbar"), state: "run", text: "" });
        try { const t0 = performance.now(); await client.call("assistant.status"); set(i, { state: "ok", text: t("Der PC antwortet in {ms} ms ({v}).", { ms: Math.round(performance.now() - t0), v: transportText(client.status.hello?.transport) }) }); }
        catch (e) { set(i, { state: "fail", text: plainError(e) }); }
        // 2 · a real PC command (a value of the PC – nothing is started or changed)
        i = push({ id: "cmd", label: t("PC-Befehl"), state: "run", text: "" });
        try {
          const r = await client.call<{ reply: { text: string; sources?: string[] } }>("assistant.ask", { text: "Wie geht es meinem PC?", engine: "local" });
          const txt = (r.reply?.text ?? "").replace(/\s+/g, " ").trim();
          set(i, txt ? { state: "ok", text: t("Der PC hat selbst geantwortet: „{x}“", { x: txt.slice(0, 140) }) } : { state: "warn", text: t("Der PC hat geantwortet, aber ohne Werte.") });
        } catch (e) { set(i, { state: "fail", text: plainError(e) }); }
      }
      // 3 · the internet search (open wikis, from this device)
      let i = push({ id: "search", label: t("Internetsuche"), state: "run", text: "" });
      try {
        const w = await import("../lib/web-lookup");
        const r = await w.lookup("Mount Everest", null, fetch, "Wie hoch ist der Mount Everest");
        if (r.all.length > 0) set(i, { state: "ok", text: t("Die offenen Wikis antworten ({n} Treffer, z. B. {s}).", { n: r.all.length, s: r.all[0].source.split(" – ")[0] }) });
        else set(i, { state: "fail", text: t("Keine der offenen Wikis hat geantwortet ({e}). Internet prüfen.", { e: (r.errors[0] ?? r.tried.join(", ")) || t("kein Netz") }) });
      } catch (e) { set(i, { state: "fail", text: plainError(e) }); }
      // 4 · every set-up AI on its own (one small question each)
      if (online && canManage) {
        const set_up = providers.filter((p) => p.state !== "setup");
        if (set_up.length === 0) push({ id: "ai", label: t("KI-Anbieter"), state: "warn", text: t("Noch keine KI eingerichtet – oben OpenRouter oder Groq einrichten.") });
        for (const p of set_up) {
          i = push({ id: "ai-" + p.id, label: p.name, state: "run", text: "" });
          try {
            const r = await client.call<{ ok: boolean; message: string; ms?: number }>("ai.test", { provider: p.id });
            set(i, { state: r.ok ? "ok" : "fail", text: r.ok ? `${r.message}${r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ""}` : r.message });
          } catch (e) { set(i, { state: "fail", text: plainError(e) }); }
        }
      } else if (online) push({ id: "ai", label: t("KI-Anbieter"), state: "warn", text: t("Zum Testen der KI-Anbieter fehlt diesem Gerät die Berechtigung „Verwalten“.") });
      // 5 · speaking to JARVIS
      push({ id: "voice", label: t("Spracheingabe"), state: voiceInputSupported() ? "ok" : "warn",
        text: voiceInputSupported() ? t("Dieser Browser kann Sprache erkennen. Beim ersten Mal fragt er nach dem Mikrofon – bitte erlauben.")
          : t("Dieser Browser (oder diese Home-Bildschirm-App) kann keine Sprache erkennen. Öffne die Seite in Safari oder Chrome – oder tippe deine Frage.") });
    } finally { setRunning(false); }
  };

  // The only test that changes anything: the connection is closed and opened again – how long until the app is back?
  const reconnect = async () => {
    setReconBusy(true); setRecon(null);
    const t0 = performance.now();
    const back = () => client.status.phase === "online" && client.status.auth === "ok";
    client.restart();
    try {
      let dropped = false;
      for (let w = 0; w < 80; w++) {                     // up to 20 seconds
        await new Promise((r) => setTimeout(r, 250));
        if (!back()) dropped = true;
        if (dropped && back()) { setRecon(t("Wiederverbunden nach {s} Sekunden – die automatische Wiederverbindung funktioniert.", { s: ((performance.now() - t0) / 1000).toFixed(1) })); return; }
        if (!dropped && w > 8 && back()) { setRecon(t("Die Verbindung war sofort wieder da (unter einer Sekunde) – die automatische Wiederverbindung funktioniert.")); return; }
      }
      setRecon(t("Nach 20 Sekunden noch nicht wieder verbunden. Ist der PC an und im selben Netz? Unter „Verbinden“ → „Diagnose“ steht der genaue Grund."));
    } finally { setReconBusy(false); }
  };

  const icon = (s: State) => s === "ok" ? <Check size={15} className="aim-ok" aria-label={t("geklappt")} /> : s === "fail" ? <X size={15} className="aim-bad" aria-label={t("fehlgeschlagen")} /> : s === "warn" ? <AlertTriangle size={15} className="aim-warn" aria-label={t("Hinweis")} /> : s === "run" ? <Loader2 size={15} className="spin" aria-label={t("läuft")} /> : <CircleDashed size={15} />;
  return (
    <details className="aim-test" open={steps.length > 0 || !!recon}>
      <summary>{t("Selbsttest")}</summary>
      <div className="aim-selftest">
      <div className="aim-actions">
        <button type="button" className="btn sm primary" disabled={running || reconBusy} onClick={() => void run()}><PlugZap size={14} /> {running ? t("Teste …") : t("Alles testen")}</button>
        {online && <button type="button" className="btn sm" disabled={running || reconBusy} onClick={() => void reconnect()}>{reconBusy ? t("Prüfe …") : t("Wiederverbindung prüfen")}</button>}
      </div>
      <p className="tiny muted">{t("Prüft PC, einen echten PC-Befehl, die Internetsuche, jede eingerichtete KI einzeln und die Spracheingabe. Es wird nichts gestartet oder verändert; jeder KI-Test zählt eine Frage gegen das kostenlose Limit. „Wiederverbindung prüfen“ trennt die Verbindung kurz und misst, wie schnell sie von selbst wieder steht.")}</p>
      {steps.length > 0 && (
        <ul className="aim-steps" aria-live="polite">
          {steps.map((s) => <li key={s.id} className={`aim-step ${s.state}`}><span className="aim-stepicon">{icon(s.state)}</span><b>{s.label}</b><span className="tiny">{s.text}</span></li>)}
        </ul>
      )}
      {recon && <p className="tiny" role="status">{recon}</p>}
      </div>
    </details>
  );
}
