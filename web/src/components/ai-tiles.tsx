import { type ReactNode } from "react";
import { AudioLines, CloudSun, Globe, MessageSquareText, Mic, Terminal } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { useFreeAiConsent } from "../lib/free-ai";
import { elevenDeviceReady, SEARCH_PROVIDERS, SEARCH_NAME, useLocalAi } from "../lib/free-ai-local";
import { buildRoster, type AssistantLite, type RosterState } from "../lib/ai-roster";
import { resolveStt, sttReady, setSttEngine, sttEngine, useSttEngine, type SttEngine, type SttRoute } from "../lib/island-voice";
import { setTtsEngine, useTtsEngine, type TtsEngine } from "../lib/jarvis-voice";
import { elevenPcKeySet, elevenReady } from "../lib/voice-eleven";
import { useConn } from "../lib/hooks";
import type { AiOverview } from "./ai-manager";

interface Part { name: string; state: RosterState; note?: string }
const DOT: Record<RosterState, string> = { works: "works", limit: "limit", problem: "problem", begun: "begun", none: "none" };

function Tile({ id, icon, title, duty, parts, children, hint }: { id: string; icon: ReactNode; title: string; duty: string; parts: Part[]; children?: ReactNode; hint?: ReactNode }) {
  const active = parts.filter((p) => p.state === "works").length;
  return (
    <section className="aim-tile" aria-label={title} data-tile={id}>
      <div className="aim-tile-head">{icon}<b>{title}</b>
        <span className={`aim-badge ${active > 0 ? "ready" : "off"}`}>{active > 0 ? t("{n} aktiv", { n: active }) : t("nichts aktiv")}</span></div>
      <p className="tiny"><b>{t("Zuständig für:")}</b> {duty}</p>
      <ul className="aim-tile-parts">
        {parts.map((p) => <li key={p.name} className={`aim-chip ${DOT[p.state]}`} title={p.note}><i aria-hidden className="aim-dot" />{p.name}{p.note ? <span className="tiny"> · {p.note}</span> : null}</li>)}
      </ul>
      {children}
      {hint && <p className="tiny muted">{hint}</p>}
    </section>
  );
}

const NAME_STT: Record<SttRoute, string> = { browser: "Browser-Erkennung", groq: "Groq Whisper", "eleven-device": "ElevenLabs Scribe (Schlüssel dieses Geräts)", "eleven-pc": "ElevenLabs Scribe (Schlüssel am PC)" };

/** Who is responsible for what: answering, commands, football/weather, web search, listening, speaking – each with the services behind it and whether they work. */
export function AiTiles({ online, ai }: { online: boolean; ai?: AiOverview | null }) {
  const st = useRpc<AssistantLite & { search?: { providers?: { id: string; name: string; keySet: boolean }[] } }>("assistant.status", {}, ["assistant"], online);
  const device = useLocalAi();
  const consent = useFreeAiConsent();
  useConn(); useSttEngine(); useTtsEngine();
  const rows = buildRoster(online ? ai : null, online ? st.data : null, device, consent, (x) => x).filter((r) => r.kind === "free");
  const chat: Part[] = rows.map((r) => ({ name: r.name, state: r.state, note: r.state === "works" ? undefined : r.state === "none" ? undefined : r.text }));

  const searchParts: Part[] = [];
  const pcSearch = online ? st.data?.search?.providers ?? [] : [];
  for (const p of pcSearch) searchParts.push({ name: p.name, state: p.keySet ? "works" : "none", note: p.keySet ? t("am PC") : undefined });
  for (const p of SEARCH_PROVIDERS) { const d = device.search?.[p]; if (d && d !== "none" && !pcSearch.some((x) => x.id === p && x.keySet)) searchParts.push({ name: SEARCH_NAME[p], state: d === "ready" ? "works" : "begun", note: d === "ready" ? t("auf diesem Gerät") : t("gesperrt") }); }
  if (searchParts.length === 0) for (const n of ["Tavily", "Serper", "Exa", "Brave", "SearXNG"]) searchParts.push({ name: n, state: "none" });

  const r = sttReady();
  const eng = sttEngine();
  const route = resolveStt(eng, r);
  const sttParts: Part[] = [
    { name: t("Browser-Erkennung"), state: r.browser ? "works" : "none", note: r.browser ? undefined : t("hat dieser Browser nicht (z. B. Firefox)") },
    { name: "Groq Whisper", state: r.groq ? "works" : "none", note: r.groq ? undefined : t("Groq-Schlüssel auf diesem Gerät nötig") },
    { name: "ElevenLabs Scribe", state: r.elevenDevice || r.elevenPc ? "works" : "none", note: r.elevenDevice ? t("Schlüssel dieses Geräts") : r.elevenPc ? t("Schlüssel am PC") : t("ElevenLabs-Schlüssel nötig") },
  ];
  const sttOpt: [SttEngine, string, string][] = [
    ["auto", t("Automatisch"), t("Browser, wo es ihn gibt – sonst Whisper/Scribe")],
    ["browser", t("Browser"), t("kostenlos, Audio geht an den Browser-Hersteller")],
    ["groq", "Groq Whisper", t("sehr genau, kostenloser Tarif")],
    ["eleven", "ElevenLabs Scribe", t("sehr genau, eigenes Kontingent")],
  ];

  const ttsEng = useTtsEngineValue();
  const deviceEleven = elevenDeviceReady();
  const pcEleven = elevenReady();
  const ttsParts: Part[] = [
    { name: t("Browser-Stimme"), state: typeof window !== "undefined" && "speechSynthesis" in window ? "works" : "none" },
    { name: "ElevenLabs", state: pcEleven || deviceEleven ? "works" : elevenPcKeySet() ? "begun" : "none", note: pcEleven ? t("am PC eingeschaltet") : deviceEleven ? t("Schlüssel dieses Geräts") : elevenPcKeySet() ? t("am PC noch nicht eingeschaltet") : t("ElevenLabs-Schlüssel nötig") },
  ];
  const ttsOpt: [TtsEngine, string, string][] = [
    ["auto", t("Automatisch"), t("ElevenLabs, wenn bereit – sonst Browser")],
    ["browser", t("Browser-Stimme"), t("kostenlos, klingt je nach Gerät unterschiedlich")],
    ["eleven", "ElevenLabs", t("natürlichste Stimme, eigenes Kontingent")],
  ];

  return (
    <div className="aim-tiles" role="group" aria-label={t("Wer ist wofür zuständig")}>
      <Tile id="chat" icon={<MessageSquareText size={16} />} title={t("Antworten")} duty={t("Fragen, Erklärungen, Texte – die erste bereite KI in deiner Reihenfolge antwortet, fällt sie aus, die nächste")} parts={chat}
        hint={t("Schnell: Groq oder Cerebras · Allrounder: OpenRouter oder Mistral · ohne Konto: Pollinations · offline am PC: Ollama")} />
      <Tile id="commands" icon={<Terminal size={16} />} title={t("Befehle & PC")} duty={t("Spiele starten, Lautstärke, Profile, PC-Werte, Spielzeit, dein Wohnort – ohne KI, sofort")}
        parts={[{ name: t("Eingebaute Hilfe am PC"), state: online ? "works" : "none", note: online ? undefined : t("PC nicht verbunden") }]} />
      <Tile id="live" icon={<CloudSun size={16} />} title={t("Fußball & Wetter")} duty={t("Wer spielt wann, Spielstand, Wetter für einen Ort – kostenlos, ohne Schlüssel")}
        parts={[{ name: "OpenLigaDB", state: "works", note: t("Fußball") }, { name: "Open-Meteo", state: "works", note: t("Wetter") }]} hint={t("Die KI formuliert die Antwort aus diesen Daten – dafür reicht irgendeine bereite KI.")} />
      <Tile id="search" icon={<Globe size={16} />} title={t("Websuche")} duty={t("Alles Aktuelle außer Fußball und Wetter: Nachrichten, andere Sportarten, Preise, Patchnotes")} parts={searchParts}
        hint={t("Mehrere sind möglich – ist einer leer, fragt JARVIS den nächsten.")} />
      <Tile id="stt" icon={<Mic size={16} />} title={t("Sprache verstehen")} duty={t("Wandelt deine gesprochene Frage in Text um (Mikrofon in der Insel und im Chat)")} parts={sttParts}
        hint={route ? t("Jetzt aktiv: {n}", { n: t(NAME_STT[route]) }) : t("Hier kann dieses Gerät gerade nicht zuhören – richte Groq oder ElevenLabs ein oder nimm einen Browser mit Spracherkennung.")}>
        <div className="aim-choice" role="radiogroup" aria-label={t("Spracherkennung wählen")}>
          {sttOpt.map(([id, name, why]) => (
            <button key={id} type="button" role="radio" aria-checked={eng === id} className={`isl2-chip${eng === id ? " on" : ""}`} title={why} onClick={() => setSttEngine(id)}>{name}</button>
          ))}
        </div>
      </Tile>
      <Tile id="tts" icon={<AudioLines size={16} />} title={t("Sprache sprechen")} duty={t("Liest JARVIS-Antworten vor (nur auf deine Frage hin, jederzeit abschaltbar)")} parts={ttsParts}
        hint={pcEleven || deviceEleven ? undefined : t("Für die natürlichste Stimme einen ElevenLabs-Schlüssel eintragen (am PC unter KI-Assistent → Stimme, oder hier unter „Schlüssel ohne PC“).")}>
        <div className="aim-choice" role="radiogroup" aria-label={t("Stimme wählen")}>
          {ttsOpt.map(([id, name, why]) => (
            <button key={id} type="button" role="radio" aria-checked={ttsEng === id} className={`isl2-chip${ttsEng === id ? " on" : ""}`} title={why} onClick={() => setTtsEngine(id)}>{name}</button>
          ))}
        </div>
      </Tile>
    </div>
  );
}
function useTtsEngineValue() { return useTtsEngine(); }
