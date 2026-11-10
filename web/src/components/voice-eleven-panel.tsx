import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Hand, Play, Square, Waves } from "lucide-react";
import { t } from "../lib/i18n";
import { Banner, Button, Card, Field, Switch } from "./ui";
import { useLocalAi } from "../lib/free-ai-local";
import { loadElevenVoices, setElevenAuto, startEleven, stopEleven, talkEnd, talkStart, updateElevenSettings, useElevenChanger } from "../lib/voice-changer-eleven";
import { voiceChangerSupported } from "../lib/voice-changer";

const KIND: Record<string, string> = { premade: "Standard", cloned: "Eigene (geklont)", generated: "Entworfen", professional: "Professionell" };

/** "Echte Stimmen": the sentence goes to ElevenLabs and comes back in a voice of the person's own account. */
export function ElevenPanel() {
  const v = useElevenChanger();
  const snap = useLocalAi();
  const ready = snap.eleven === "ready";
  useEffect(() => { if (ready && v.voices.length === 0 && !v.voicesLoading) void loadElevenVoices(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const secs = Math.round(v.sentSeconds);

  return (
    <>
      {!ready && (
        <Banner kind="info" title={t("ElevenLabs-Schlüssel fehlt")}>
          {snap.eleven === "locked" ? t("Der Schlüssel ist noch gesperrt – in der KI-Verwaltung entsperren.") : t("Trage deinen ElevenLabs-Schlüssel einmal in der KI-Verwaltung ein (Abschnitt „ElevenLabs auf diesem Gerät“). Er gilt dann auf allen Geräten deines Kontos.")}{" "}
          <Link to="/assistant?tab=ai">{t("Zur KI-Verwaltung")}</Link>
        </Banner>
      )}
      {v.error && <Banner kind="error" title={t("Das hat nicht geklappt")}>{v.error}</Banner>}
      <Card title={v.running ? t("Läuft") : t("Aus")} icon={<Waves size={18} />} meta={<span className={`badge${v.running ? " ok" : ""}`}>{v.running ? (v.recording ? t("Nimmt auf") : v.sending ? t("Sendet …") : v.playing ? t("Spricht") : t("Bereit")) : t("Gestoppt")}</span>}>
        <div className="stack-sm">
          <Field label={t("Stimme")} hint={t("Die Stimmen aus deinem ElevenLabs-Konto. Nimm nur Stimmen, für die du die Rechte hast.")}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select className="input" style={{ flex: 1, minWidth: 180 }} value={v.settings.voiceId} onChange={(e) => updateElevenSettings({ voiceId: e.target.value })} aria-label={t("Stimme von ElevenLabs")} disabled={!ready || v.voices.length === 0}>
                {v.voices.length === 0 && <option value="">{v.voicesLoading ? t("Lädt …") : t("Noch keine Stimmen geladen")}</option>}
                {v.voices.map((x) => <option key={x.id} value={x.id}>{x.name}{KIND[x.category] ? ` · ${t(KIND[x.category])}` : ""}</option>)}
              </select>
              <Button size="sm" busy={v.voicesLoading} disabled={!ready} onClick={() => void loadElevenVoices()}>{t("Stimmen laden")}</Button>
            </div>
          </Field>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {v.running
              ? <Button variant="danger" icon={<Square size={16} />} onClick={() => stopEleven()}>{t("Stoppen")}</Button>
              : <Button variant="primary" icon={<Play size={16} />} busy={v.starting} disabled={!ready || !voiceChangerSupported() || !v.settings.voiceId} onClick={() => void startEleven()}>{t("Echte Stimme starten")}</Button>}
            <button type="button" className={`vc-talk${v.recording ? " on" : ""}`} disabled={!v.running || v.settings.auto}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); talkStart(); }} onPointerUp={() => talkEnd()} onPointerCancel={() => talkEnd()}
              onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); talkStart(); } }} onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") talkEnd(); }}
              aria-label={t("Sprechen (halten)")}>
              <Hand size={18} aria-hidden /> {v.recording ? t("Sprich jetzt …") : t("Sprechen (halten)")}
            </button>
          </div>
          <Switch checked={v.settings.auto} onChange={setElevenAuto} label={t("Automatisch bei Sprechpausen")} hint={t("Statt die Taste zu halten: Ein Satz wird aufgenommen, sobald du sprichst, und nach einer kurzen Pause gesendet. Mit Kopfhörern, sonst nimmt das Mikrofon deine Stimme aus den Lautsprechern wieder auf.")} />
          <div className="vc-meters" aria-label={t("Pegel")}>
            <span className="tiny muted">{t("Du")}</span><span className="vc-bar" role="meter" aria-label={t("Pegel Mikrofon")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.level * 100)}><i style={{ width: `${Math.round(v.level * 100)}%` }} /></span>
          </div>
          <p className="small" style={{ margin: 0 }} role="status" aria-label={t("Verzögerung")}>
            {v.lastDelayMs == null ? t("Noch nichts gesendet.") : t("Letzte Verzögerung: {s} s · {n} Sätze · {m} s gesendet", { s: (v.lastDelayMs / 1000).toFixed(1), n: v.sentences, m: secs })}
            {v.pending > 0 ? ` · ${t("{n} warten", { n: v.pending })}` : ""}
          </p>
          <p className="tiny muted" style={{ margin: 0 }}>{t("Nicht live wie die Effekte: Jeder Satz braucht ein bis drei Sekunden bis zur neuen Stimme, wie beim Funk. Die gesendete Sprechzeit zählt gegen das Guthaben deines ElevenLabs-Tarifs.")}</p>
        </div>
      </Card>
    </>
  );
}
