// "Meine KIs": one list of every AI JARVIS knows – which one works, which one has been started but is not finished, which is not set up.
// Built from what the PC reports (ai.status, assistant.status) and from the keys on this device. Pure, so it is tested without a browser.

import type { AiOverview } from "../components/ai-manager";
import { LOCAL_NAME, LOCAL_PROVIDERS, needsAttestation, type LocalProvider, type LocalSnap } from "./free-ai-local";
import { t } from "./i18n";

export type RosterState = "works" | "limit" | "problem" | "begun" | "none";
export interface RosterRow { id: string; name: string; state: RosterState; text: string; next?: string; kind: "free" | "paid" | "builtin"; device?: boolean; /** The model that answers first, and up to two more it can fall back to. */ model?: string; more?: string[] }

/** The parts of "assistant.status" that matter here. */
export interface AssistantLite {
  keySet?: boolean; mode?: string;
  ollama?: { model?: string | null };
  router?: { baseUrl?: string | null; keySet?: boolean; models?: string[]; ready?: boolean };
  deepSeek?: { keySet?: boolean };
}

/** Which models an AI will use, best first. OpenRouter: the free router comes first; Pollinations has a fixed fast model; Ollama is the model set at the PC. */
function chosenModels(id: string, listed: string[], st?: AssistantLite | null): string[] {
  if (id === "pollinations") return ["openai-fast"];
  if (id === "ollama") return st?.ollama?.model ? [st.ollama.model] : listed.slice(0, 1);
  return listed;
}

export interface Plan { how: string; steps: { id: string; name: string; model: string | null }[]; commands: string; last?: { name: string; model?: string | null; at?: string | null } }

/** "So antwortet JARVIS gerade": mode, order and the model each AI starts with – from the PC's own settings, nothing guessed. */
export function buildPlan(ai: AiOverview | null | undefined, rows: RosterRow[]): Plan | null {
  if (!ai) return null;
  const strategy = ai.strategy ?? (ai.auto ? "fallback" : "single");
  const usable = ai.providers.filter((p) => p.state === "ready" || p.state === "cooldown");
  const by = (id: string) => rows.find((r) => r.id === id);
  const step = (p: { id: string; name: string }) => ({ id: p.id, name: p.name, model: by(p.id)?.model ?? null });
  const names = (id: string) => ai.providers.find((p) => p.id === id)?.name ?? id;
  let steps = usable.map(step);
  let how = t("Eine nach der anderen: ist die erste voll oder gestört, fragt JARVIS die nächste");
  if (strategy === "race") { steps = usable.filter((p) => isLocalProvider(p.id)).map(step); if (!steps.length) steps = usable.map(step); how = t("Schnellster gewinnt: {n} werden gleichzeitig gefragt, die schnellere Antwort zählt", { n: steps.map((x) => x.name).join(", ") }); }
  if (strategy === "single") { const one = usable.find((p) => p.id === ai.single) ?? usable[0]; steps = one ? [step(one)] : []; how = t("Nur eine KI: {n} – keine andere springt ein", { n: one ? names(one.id) : t("keine eingerichtet") }); }
  return { how, steps, commands: t("Befehle und PC-Werte beantwortet die eingebaute Hilfe am PC – ohne KI, sofort"), last: ai.last ? { name: ai.last.name, model: ai.last.model, at: ai.last.at } : undefined };
}

const isLocalProvider = (id: string): id is LocalProvider => (LOCAL_PROVIDERS as readonly string[]).includes(id);

const ORDER: Record<RosterState, number> = { works: 0, limit: 1, problem: 2, begun: 3, none: 4 };

export function buildRoster(ai: AiOverview | null | undefined, st: AssistantLite | null | undefined, device: LocalSnap | null | undefined, consent: "yes" | "no" | "ask" = "no", when: (iso: string) => string = (x) => x): RosterRow[] {
  const rows: RosterRow[] = [{ id: "local", name: t("Eingebaute Hilfe"), kind: "builtin", state: "works", text: t("Funktioniert immer – kostenlos, auch ohne Internet (Befehle, Fragen zur App, deine Bibliothek)") }];

  // OpenRouter, Groq, Cerebras, Mistral, Pollinations, Ollama
  const names: Record<string, string> = { ...LOCAL_NAME, pollinations: "Pollinations", ollama: "Lokale KI (Ollama)" };
  const ids = ai ? ai.providers.map((p) => p.id) : [...LOCAL_PROVIDERS, "pollinations"];
  for (const id of ids) {
    const p = ai?.providers.find((x) => x.id === id);
    const name = p?.name ?? names[id] ?? id;
    const onDevice = isLocalProvider(id) ? device?.[id] : undefined;
    let r: RosterRow;
    if (p) {
      if (p.state === "ready") r = { id, name, kind: "free", state: "works", text: p.lastOkAt ? t("Funktioniert – zuletzt geantwortet {w}{m}", { w: when(p.lastOkAt), m: p.lastModel ? ` (${p.lastModel})` : "" }) : t("Bereit – noch nicht benutzt (am besten „Verbindung testen“)") };
      else if (p.state === "cooldown") r = { id, name, kind: "free", state: "limit", text: p.stateText || t("Gerade am Limit – später wieder"), next: t("Wartet von selbst") };
      else if (p.state === "error") r = { id, name, kind: "free", state: "problem", text: p.lastError || p.stateText || t("Fehler"), next: t("Schlüssel prüfen und neu eintragen") };
      else if (p.state === "off") r = { id, name, kind: "free", state: "begun", text: t("Eingerichtet, aber ausgeschaltet"), next: t("Schalter einschalten") };
      else if (p.keySet || p.consent || p.attested) r = { id, name, kind: "free", state: "begun", text: p.stateText || "Angefangen", next: isLocalProvider(id) && needsAttestation(id) && !p.attested ? t("Kostenlosen Tarif bestätigen") : t("Einrichtung abschließen") };
      else r = { id, name, kind: "free", state: "none", text: id === "ollama" ? t("Nicht eingerichtet – am PC Ollama installieren und ein Modell wählen") : t("Nicht eingerichtet"), next: id === "ollama" ? undefined : t("Einrichten") };
    } else if (id === "pollinations") {
      r = consent === "yes" ? { id, name, kind: "free", state: "works", text: t("Erlaubt auf diesem Gerät – antwortet auch ohne PC") } : { id, name, kind: "free", state: "none", text: t("Nicht erlaubt"), next: t("„Pollinations ohne PC erlauben“") };
    } else r = { id, name, kind: "free", state: "none", text: t("Nur am PC prüfbar (nicht verbunden)") };
    // Keys kept on this device (without the PC)
    if (onDevice === "ready" && r.state !== "works") r = { ...r, state: "works", text: t("Auf diesem Gerät bereit – antwortet auch ohne PC"), device: true, next: undefined };
    else if (onDevice === "ready") r = { ...r, text: t("{x} · auch auf diesem Gerät", { x: r.text }), device: true };
    else if (onDevice === "locked" && r.state !== "works") r = { ...r, state: "begun", text: t("Schlüssel auf diesem Gerät gespeichert, aber gesperrt"), next: t("Mit dem Passwort entsperren"), device: true };
    const pm = p ? chosenModels(id, p.models?.map((m) => m.id) ?? [], st) : [];
    if (pm.length && r.state !== "none") r = { ...r, model: pm[0], more: pm.slice(1, 3) };
    rows.push(r);
  }

  // Further engines the PC knows
  if (st) {
    if (!ai && st.ollama?.model) rows.push({ id: "ollama", name: names.ollama, kind: "free", state: "works", text: t("Eingestellt: {m}", { m: st.ollama.model }) });
    const rt = st.router;
    rows.push(rt?.ready ? { id: "router", name: t("KI-Router"), kind: "free", state: "works", text: `Bereit – ${rt.models?.[0] ?? t("Modell gewählt")}` }
      : rt && (rt.baseUrl || rt.keySet || (rt.models?.length ?? 0) > 0) ? { id: "router", name: t("KI-Router"), kind: "free", state: "begun", text: !rt.baseUrl ? t("Adresse fehlt") : !rt.keySet ? t("Adresse eingetragen, Schlüssel fehlt") : !(rt.models?.length) ? t("Noch kein Modell gewählt") : t("Angefangen"), next: t("Am PC fertig einrichten") }
      : { id: "router", name: t("KI-Router"), kind: "free", state: "none", text: t("Nicht eingerichtet (optional)") });
    rows.push(st.keySet ? { id: "claude", name: t("Claude"), kind: "paid", state: "works", text: t("Schlüssel eingetragen – kostet Geld, wird nur benutzt, wenn du es ausdrücklich wählst") } : { id: "claude", name: t("Claude"), kind: "paid", state: "none", text: t("Nicht eingerichtet (kostenpflichtig, optional)") });
    if (st.deepSeek?.keySet) rows.push({ id: "deepseek", name: t("DeepSeek (Recherche)"), kind: "paid", state: "works", text: t("Schlüssel eingetragen – nur für Zusammenfassungen nach einer Suche") });
  }
  return rows.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.state] - ORDER[b.r.state] || a.i - b.i).map((x) => x.r);
}

export function rosterSummary(rows: RosterRow[]): { works: number; begun: number; none: number; problems: number } {
  const c = { works: 0, begun: 0, none: 0, problems: 0 };
  for (const r of rows) { if (r.state === "works" || r.state === "limit") c.works++; else if (r.state === "begun") c.begun++; else if (r.state === "problem") c.problems++; else c.none++; }
  return c;
}
