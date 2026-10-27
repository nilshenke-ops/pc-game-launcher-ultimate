// The "face" of JARVIS: a small orb that shows what he is doing (listening, thinking, speaking), the live state that
// matters for gaming (PC, running game, profile, memory) and his skills as a command deck. Pure CSS animation,
// switched off with "weniger Bewegung"; no timers – everything comes from existing state.

import { Brain, Gamepad2, Mic, Volume2, VolumeX, Wifi, WifiOff, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { useAppState } from "../lib/state";
import { useJournalVersion } from "../lib/journal";
import { memoryCount } from "../lib/jarvis-memory";
import { setVoice, stopSpeaking, useVoice } from "../lib/jarvis-voice";

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
        <details className="jv-skills">
          <summary className="small"><Mic size={13} /> {t("Fähigkeiten")}</summary>
          <div className="chips wrap">{SKILLS().map((s) => <button key={s.name} type="button" className="chip" title={s.ex} onClick={() => onPick(s.ex)}>{s.name}</button>)}</div>
        </details>
      </div>
    </div>
  );
}
