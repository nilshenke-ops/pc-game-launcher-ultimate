import { useCallback, useEffect, useState } from "react";
import { Cable, Dices, Headphones, Mic, RefreshCw, Square, Play } from "lucide-react";
import { t } from "../lib/i18n";
import { Banner, Button, Card, Field, PageHead, Segmented, Switch } from "../components/ui";
import { ElevenPanel } from "../components/voice-eleven-panel";
import { stopEleven, useElevenChanger } from "../lib/voice-changer-eleven";
import { VOICES, voiceById } from "../lib/voice-presets";
import { canChooseOutput, isCableInput, listDevices, startVoiceChanger, stopVoiceChanger, suggestDevices, updateSettings, useVoiceChanger, voiceChangerSupported, type DeviceInfo } from "../lib/voice-changer";

/** Stimmenwechsler für Discord: Mikrofon → andere Stimme → virtuelles Kabel; in Discord ist das Kabel das Mikrofon. */
export default function VoiceChanger() {
  const v = useVoiceChanger();
  const ev = useElevenChanger();
  const s = v.settings;
  const [mode, setMode] = useState<"effects" | "eleven">(() => (ev.running ? "eleven" : "effects"));
  const [devs, setDevs] = useState<{ inputs: DeviceInfo[]; outputs: DeviceInfo[]; labelsKnown: boolean }>({ inputs: [], outputs: [], labelsKnown: false });
  const [loading, setLoading] = useState(false);
  const supported = voiceChangerSupported();

  const load = useCallback(async (ask: boolean) => {
    setLoading(true);
    try {
      const d = await listDevices(ask);
      setDevs(d);
      const sg = suggestDevices(d.inputs, d.outputs), cur = s;
      // Nothing chosen yet (or the chosen device is gone): the cable and a real microphone are picked by themselves.
      const micOk = d.inputs.some((x) => x.id === cur.micId), outOk = d.outputs.some((x) => x.id === cur.outId);
      if ((!micOk && sg.micId) || (!outOk && sg.outId)) updateSettings({ ...(!micOk && sg.micId ? { micId: sg.micId } : {}), ...(!outOk && sg.outId ? { outId: sg.outId } : {}) });
    } finally { setLoading(false); }
  }, [s]);
  useEffect(() => { void load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cable = devs.outputs.find((d) => isCableInput(d.label)) ?? devs.outputs.find((d) => d.cable);
  const outDev = devs.outputs.find((d) => d.id === s.outId);
  const micDev = devs.inputs.find((d) => d.id === s.micId);
  const toCable = !!outDev?.cable;
  const voice = voiceById(s.voice);
  const random = () => { const others = VOICES.filter((x) => x.id !== s.voice && x.id !== "original"); updateSettings({ voice: others[Math.floor(Math.random() * others.length)].id }); };

  return (
    <>
      <PageHead eyebrow={t("Audio")} title={t("Stimmenwechsler")}
        text={t("Sprich in Discord mit einer anderen Stimme – tief, hoch, wie ein Roboter oder Monster. Dein Mikrofon läuft durch diese Seite und geht über ein virtuelles Kabel an Discord.")} />
      <div className="stack">
        {!supported && <Banner kind="warn" title={t("Dieser Browser kann das nicht")}>{t("Der Stimmenwechsler braucht Chrome oder Edge am PC (Echtzeit-Audio und Ausgabegerät wählen). Öffne die Seite dort.")}</Banner>}
        {supported && !canChooseOutput() && <Banner kind="warn" title={t("Ausgabegerät nicht wählbar")}>{t("Dieser Browser kann den Ton nicht an das virtuelle Kabel schicken. Chrome oder Edge nehmen.")}</Banner>}
        {v.error && <Banner kind="error" title={t("Das hat nicht geklappt")}>{v.error}</Banner>}
        {v.running && !toCable && <Banner kind="info" title={t("Discord hört dich so nicht")}>{t("Die Stimme geht gerade auf ein normales Gerät, nicht auf das virtuelle Kabel. Wähle unten als Ausgabe „CABLE Input“ – sonst hörst nur du dich.")}</Banner>}

        <Segmented<"effects" | "eleven"> label={t("Art")} value={mode} onChange={setMode}
          options={[{ value: "effects", label: t("Effekte (live)") }, { value: "eleven", label: t("Echte Stimmen (ElevenLabs)") }]} />
        {mode === "effects" ? (<>
        <Card title={v.running ? t("Läuft: {n}", { n: t(voice.name) }) : t("Aus")} icon={<Mic size={18} />}
          meta={<span className={`badge${v.running ? " ok" : ""}`}>{v.running ? t("Aktiv") : t("Gestoppt")}</span>}>
          <div className="stack-sm">
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {v.running
                ? <Button variant="danger" icon={<Square size={16} />} onClick={() => void stopVoiceChanger()}>{t("Stoppen")}</Button>
                : <Button variant="primary" icon={<Play size={16} />} busy={v.starting} disabled={!supported} onClick={() => { stopEleven(); void startVoiceChanger().then(() => load(false)); }}>{t("Stimmenwechsler starten")}</Button>}
              <Button icon={<Dices size={16} />} onClick={random}>{t("Zufällige Stimme")}</Button>
            </div>
            <div className="vc-meters" aria-label={t("Pegel")}>
              <span className="tiny muted">{t("Du")}</span><span className="vc-bar" role="meter" aria-label={t("Pegel Mikrofon")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.inLevel * 100)}><i style={{ width: `${Math.round(v.inLevel * 100)}%` }} /></span>
              <span className="tiny muted">{t("Discord")}</span><span className="vc-bar" role="meter" aria-label={t("Pegel Ausgang")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.outLevel * 100)}><i style={{ width: `${Math.round(v.outLevel * 100)}%` }} /></span>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>{t("Läuft weiter, wenn du eine andere Seite öffnest – nur wenn du das Fenster schließt, hört es auf.")}</p>
          </div>
        </Card>

        <Card title={t("Stimme wählen")} icon={<Mic size={18} />}>
          <div className="vc-grid" role="radiogroup" aria-label={t("Stimme")}>
            {VOICES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={s.voice === x.id} className={`vc-voice${s.voice === x.id ? " on" : ""}`} onClick={() => updateSettings({ voice: x.id })}>
                <span className="vc-emoji" aria-hidden>{x.emoji}</span>
                <b>{t(x.name)}</b>
                <small>{t(x.desc)}</small>
              </button>
            ))}
          </div>
          <div className="stack-sm" style={{ marginTop: 14 }}>
            <Field label={t("Feinabstimmung der Tonhöhe: {v} Halbtöne", { v: (s.trim > 0 ? "+" : "") + s.trim })} hint={t("Macht die gewählte Stimme etwas höher oder tiefer.")}>
              <input type="range" min={-6} max={6} step={1} value={s.trim} onChange={(e) => updateSettings({ trim: +e.target.value })} aria-label={t("Feinabstimmung der Tonhöhe")} />
            </Field>
          </div>
        </Card>

        </>) : <ElevenPanel />}

        <div className="grid-2">
          <Card title={t("Geräte")} icon={<Cable size={18} />}
            meta={<Button size="sm" icon={<RefreshCw size={14} />} busy={loading} onClick={() => void load(true)}>{t("Geräte laden")}</Button>}>
            <div className="stack-sm">
              <Field label={t("Mikrofon")}>
                <select className="input" value={s.micId} onChange={(e) => updateSettings({ micId: e.target.value })} aria-label={t("Mikrofon")}>
                  <option value="">{t("Standard-Mikrofon")}</option>
                  {devs.inputs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </Field>
              <Field label={t("Ausgabe an Discord")} hint={t("Das virtuelle Kabel: „CABLE Input“.")}>
                <select className="input" value={s.outId} onChange={(e) => updateSettings({ outId: e.target.value })} aria-label={t("Ausgabe an Discord")}>
                  <option value="">{t("Standard-Ausgabe (nur du hörst dich)")}</option>
                  {devs.outputs.map((d) => <option key={d.id} value={d.id}>{d.label}{d.cable ? " · " + t("virtuell") : ""}</option>)}
                </select>
              </Field>
              {v.running && <p className="tiny muted" style={{ margin: 0 }}>{t("Geräte wechseln gilt nach dem nächsten Start.")}</p>}
              <Field label={t("Mikrofon-Lautstärke: {v} %", { v: Math.round(s.micGain * 100) })}>
                <input type="range" min={0} max={2} step={0.05} value={s.micGain} onChange={(e) => updateSettings({ micGain: +e.target.value })} aria-label={t("Mikrofon-Lautstärke")} />
              </Field>
              <Field label={t("Ausgabe-Lautstärke: {v} %", { v: Math.round(s.volume * 100) })}>
                <input type="range" min={0} max={1.5} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: +e.target.value })} aria-label={t("Ausgabe-Lautstärke")} />
              </Field>
              <Switch checked={s.monitor} onChange={(monitor) => updateSettings({ monitor })} label={t("Mich selbst hören")} hint={t("Auf deinen Standard-Kopfhörern – bitte nur mit Kopfhörern, sonst pfeift es.")} />
              <Switch checked={s.clean} onChange={(clean) => updateSettings({ clean })} label={t("Rauschunterdrückung")} hint={t("Filtert Tastaturklappern und Rauschen. Gilt nach dem nächsten Start.")} />
            </div>
          </Card>

          <Card title={t("So hören dich deine Freunde")} icon={<Headphones size={18} />}>
            <ol className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
              <li className="small">{cable ? t("Virtuelles Kabel gefunden: {n}.", { n: cable.label }) : t("Ein virtuelles Audiokabel installieren – z. B. „VB-Audio Virtual Cable“ (kostenlos, von vb-audio.com). Danach hier „Geräte laden“.")}</li>
              <li className="small">{toCable ? t("Ausgabe steht auf dem Kabel – gut.") : t("Oben als „Ausgabe an Discord“ das Kabel („CABLE Input“) wählen.")}</li>
              <li className="small">{micDev?.cable ? t("Als Mikrofon ist das Kabel selbst gewählt – bitte dein echtes Mikrofon wählen.") : t("Hier „Stimmenwechsler starten“ tippen.")}</li>
              <li className="small">{t("In Discord → Einstellungen → Sprache & Video: Eingabegerät = „CABLE Output“. Das kann keine App von außen prüfen – mit dem Mikrofontest von Discord kontrollieren.")}</li>
            </ol>
            <details style={{ marginTop: 10 }}>
              <summary className="small">{t("Mit anderen Voice-Changern kombinieren")}</summary>
              <ul className="stack-sm tiny muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                <li>{t("Voicemod, Voicemeeter, RVC/w-okada und ähnliche Programme haben ihr eigenes virtuelles Gerät. Du kannst sie hintereinanderschalten.")}</li>
                <li>{t("Erst diese Seite, dann das andere Programm: Hier als „Ausgabe an Discord“ das virtuelle Gerät des anderen Programms wählen (dessen Eingang), in Discord dessen Ausgang als Mikrofon.")}</li>
                <li>{t("Erst das andere Programm, dann diese Seite: Hier als „Mikrofon“ das virtuelle Gerät des anderen Programms wählen, als Ausgabe das Kabel für Discord.")}</li>
                <li>{t("Zwei Programme nacheinander verzögern etwas mehr. Voicemod bietet keine offene Schnittstelle – es lässt sich nur so einbinden, nicht steuern.")}</li>
              </ul>
            </details>
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>{t("Tipp: Discords eigene Rauschunterdrückung und Echo-Entfernung kannst du dann ausschalten, die Seite macht das schon.")}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
