// The "face" of JARVIS: a small orb that shows what he is doing (listening, thinking, speaking), the live state that
// matters for gaming (PC, running game, profile, memory) and his skills as a command deck. Pure CSS animation,
// switched off with "weniger Bewegung"; no timers – everything comes from existing state.

import { setWebPermission, webPermission, type WebPermission } from "../lib/web-lookup";
import { useEffect, useState } from "react";
import { Brain, Gamepad2, Mic, SlidersHorizontal, Volume2, VolumeX, Wifi, WifiOff, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { useAppState } from "../lib/state";
import { useJournalVersion } from "../lib/journal";
import { memoryCount } from "../lib/jarvis-memory";
import { NATURAL_LABEL, naturalness, setVoice, setVoiceCfg, stopSpeaking, testVoice, useVoice, voiceCfg, voicesFor } from "../lib/jarvis-voice";
import { setStyle, useStyle, type JarvisStyle } from "../lib/jarvis-style";

/** Skills = small tools with one purpose each; the deck only fills in an example – nothing runs before sending. */
const SKILLS = () => [
  { name: t("Starten"), ex: t("Starte mein zuletzt gespieltes Spiel") },
  { name: t("Profile"), ex: t("Aktiviere Profil Streaming") },
  { name: t("Sounds"), ex: t("Stopp alle Sounds") },
  { name: t("Ruckel-Check"), ex: t("Warum ruckelt mein Spiel?") },
  { name: t("Bingo"), ex: t("Erstelle ein 4×4-Bingo für Hollow Knight auf schwer") },
  { name: t("Koop-Finder"), ex: t("Zeige mir, welche meiner Spiele zu zweit spielbar sind") },
  { name: t("Startseite"), ex: t("Erstelle eine neue Dashboard-Anordnung für Minecraft") },
  { name: t("Ordnen"), ex: t("Ordne mein Dashboard übersichtlicher an") },
  { name: t("Gedächtnis"), ex: t("Merk dir, dass ich Shooter mit Controller spiele") },
  { name: t("Spielzeit"), ex: t("Wie lange habe ich diese Woche gespielt?") },
  { name: t("Protokoll"), ex: t("Was hast du heute gemacht?") },
];

export function JarvisHud({ busy, listening, active, online, onPick }: { busy: boolean; listening: boolean; active: boolean; online: boolean; onPick: (text: string) => void }) {
  const { state } = useAppState();
  useJournalVersion();
  const voice = useVoice();
  const mood = listening ? "listening" : busy ? "thinking" : voice.speaking ? "speaking" : active ? "ready" : "off";
  const label = { listening: t("Ich höre zu …"), thinking: t("Ich arbeite daran …"), speaking: t("Ich spreche …"), ready: t("Bereit für deinen Auftrag"), off: t("Nur Knöpfe – JARVIS ist aus") }[mood];
  const running = state?.running ?? [];
  return (
    <div className={`jv-hud jv-${mood}`}>
      <div className="jv-orb" aria-hidden><i /><i /><i /></div>
      <div className="jv-hud-main">
        <b className="jv-mood" aria-live="polite">{label}</b>
        <div className="jv-stats">
          <span className={online ? "ok-text" : "muted"}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? t("PC verbunden") : t("PC nicht verbunden")}</span>
          <span><Gamepad2 size={14} />{running.length ? running.map((r) => r.name).join(", ") : t("kein Spiel läuft")}</span>
          {state?.activeProfile && <span><Zap size={14} />{state.activeProfile.name}</span>}
          <span><Brain size={14} />{t("{n} Erinnerungen", { n: memoryCount() })}</span>
          {voice.supported && (
            <button type="button" className="chip" aria-pressed={voice.on} onClick={() => { if (voice.speaking) stopSpeaking(); else setVoice(!voice.on); }}>
              {voice.on ? <Volume2 size={14} /> : <VolumeX size={14} />}{voice.speaking ? t("Stopp") : voice.on ? t("Stimme an") : t("Stimme aus")}
            </button>
          )}
        </div>
        {voice.supported && <VoiceSettings />}
        <details className="jv-skills">
          <summary className="small"><Mic size={13} /> {t("Fähigkeiten")}</summary>
          <div className="chips wrap">{SKILLS().map((s) => <button key={s.name} type="button" className="chip" title={s.ex} onClick={() => onPick(s.ex)}>{s.name}</button>)}</div>
        </details>
      </div>
    </div>
  );
}

/** Which voice JARVIS speaks with (the most human-sounding voices of this device first), speed, pitch and his tone. */
function VoiceSettings() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => window.speechSynthesis.getVoices());
  useEffect(() => {
    const up = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener?.("voiceschanged", up);
    up();
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", up);
  }, []);
  const [cfg, setCfg] = useState(voiceCfg);
  const style = useStyle();
  const lang = document.documentElement.lang === "en" ? "en-US" : "de-DE";
  const list = voicesFor(lang, voices);
  const update = (c: Partial<typeof cfg>) => { setVoiceCfg(c); setCfg(voiceCfg()); };
  const best = list[0];
  const chosen = list.find((v) => v.voiceURI === cfg.voiceURI) ?? best;
  return (
    <details className="jv-skills">
      <summary className="small"><SlidersHorizontal size={13} /> {t("Stimme & Ton")}</summary>
      <div className="stack-sm small" style={{ marginTop: 8 }}>
        {list.length === 0 ? <span className="muted">{t("Dieser Browser hat keine Stimmen für diese Sprache.")}</span> : (
          <label className="stack-sm">
            <span>{t("Stimme")}</span>
            <select className="input" value={cfg.voiceURI ?? ""} onChange={(e) => update({ voiceURI: e.target.value || null })} aria-label={t("Stimme")}>
              <option value="">{t("Automatisch (natürlichste: {n})", { n: best?.name ?? "–" })}</option>
              {list.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} – {t(NATURAL_LABEL[naturalness(v)])}</option>)}
            </select>
          </label>
        )}
        {chosen && naturalness(chosen) < 2 && <span className="muted">{t("Für eine wirklich menschlich klingende Stimme: am PC oder Android den Browser Microsoft Edge nutzen (Stimmen „… Online (Natural)“, z. B. Conrad, Killian, Katja, Amala) oder unter Android in den Einstellungen „Google Sprachausgabe“ mit einer hochwertigen deutschen Stimme wählen. iPhone/iPad: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch → eine „Premium“- oder „Erweitert“-Stimme laden.")}</span>}
        <label className="row" style={{ gap: 8 }}><span style={{ minWidth: 70 }}>{t("Tempo")}</span><input type="range" min={0.6} max={1.6} step={0.05} value={cfg.rate} onChange={(e) => update({ rate: Number(e.target.value) })} aria-label={t("Tempo")} className="grow" /><span>{cfg.rate.toFixed(2)}×</span></label>
        <label className="row" style={{ gap: 8 }}><span style={{ minWidth: 70 }}>{t("Tonhöhe")}</span><input type="range" min={0.5} max={1.5} step={0.05} value={cfg.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} aria-label={t("Tonhöhe")} className="grow" /><span>{cfg.pitch.toFixed(2)}</span></label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="chip" onClick={() => testVoice(style === "locker" ? t("Na, wer hat mich gerufen? Ich bin JARVIS – und ich hab heute richtig Bock aufs Zocken.") : undefined)}>{t("Probe hören")}</button>
          <span className="muted">{t("Ton")}:</span>
          {(["sachlich", "locker"] as JarvisStyle[]).map((s) => <button key={s} type="button" className={`chip ${style === s ? "on" : ""}`} aria-pressed={style === s} onClick={() => setStyle(s)}>{s === "sachlich" ? t("Sachlich") : t("Locker (mit Sprüchen)")}</button>)}
        </div>
        <WebLookupSetting />
        <span className="muted tiny">{t("„Locker“ hängt nach erledigten Aufträgen einen frechen Spruch an – Zahlen und Fakten bleiben gleich, bei Fehlern und Rückfragen gibt es keinen Spruch. JARVIS ahmt keine echte Person nach.")}</span>
      </div>
    </details>
  );
}

/** Whether JARVIS may look unknown things up in open wikis (Wikipedia, game wikis): ask each time, always, never. */
function WebLookupSetting() {
  const [v, setV] = useState<WebPermission>(webPermission);
  const set = (x: WebPermission) => { setWebPermission(x); setV(x); };
  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="muted">{t("Unbekanntes nachschlagen")}:</span>
        {(["ask", "always", "never"] as WebPermission[]).map((x) => <button key={x} type="button" className={`chip ${v === x ? "on" : ""}`} aria-pressed={v === x} onClick={() => set(x)}>{x === "ask" ? t("Vorher fragen") : x === "always" ? t("Immer") : t("Nie")}</button>)}
      </div>
      <span className="muted tiny">{t("Nur offene Wissensquellen: Wikipedia und offizielle Spiele-Wikis (Minecraft, Terraria, Stardew Valley, Elden Ring). Gesendet wird nur der Suchbegriff. Gefundenes steht mit Quelle unter Wiki → „JARVIS-Wissen (nachgeschlagen)“.")}</span>
    </div>
  );
}
