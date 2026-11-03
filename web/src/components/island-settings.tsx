// Switches for the JARVIS island on the PC screen (Windows companion): on the desktop and over programs, and
// separately during games (off by default – the island then hides while a game from the library runs).

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card, Field, Segmented, Switch } from "./ui";
import { IslandEyes } from "./jarvis-island";
import { ISLAND_EYES, ISLAND_EYE_SIZES, ISLAND_STYLES, eyeColor, setIslandPrefs, useIslandPrefs, type IslandEye, type IslandEyeSize, type IslandStyle } from "../lib/island";
import type { CSSProperties } from "react";

interface IslandInfo { supported: boolean; visible: boolean; desktop: boolean; games: boolean; gameRunning: boolean }

function IslandSwitchesCard() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canManage = useCan("admin");
  const st = useRpc<IslandInfo>("island.get", {}, ["island", "session"], online);
  const save = (p: { desktop?: boolean; games?: boolean }) =>
    client.call<{ error?: string | null }>("island.configure", p).then((r) => { if (r.error) toast(r.error, "error"); st.reload(); }, (e: Error) => toast(e.message, "error"));
  const d = st.data;
  return (
    <Card title={t("Insel oben auf dem PC-Bildschirm")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Oben in der Mitte des Bildschirms sind nur JARVIS' Augen zu sehen. Fährst du mit der Maus darüber, zeigt er, was er tut; antippen öffnet Widgets (laufendes Spiel, Musiktasten, Uhr, Fokus-Timer, Frage an JARVIS). Fragt er nach (z. B. Spiel starten), bestätigst du direkt dort. Auf dem Windows-Sperrbildschirm darf kein Programm etwas anzeigen.")}</p>
        {!online ? <Banner kind="info">{t("Zum Einstellen muss der PC verbunden sein.")}</Banner>
          : d && !d.supported ? <Banner kind="info">{t("Die Insel gibt es nur im Windows-Begleiter.")}</Banner>
          : d && (
            <>
              <Switch checked={d.desktop} disabled={!canManage} onChange={(desktop) => void save({ desktop })} label={t("Auf dem Desktop und in Programmen anzeigen")} />
              <Switch checked={d.games} disabled={!canManage || !d.desktop} onChange={(games) => void save({ games })} label={t("Auch in Spielen anzeigen")}
                hint={t("Aus: Sobald ein Spiel aus deiner Bibliothek läuft, verschwindet die Insel ganz und kommt danach wieder. Spiele im exklusiven Vollbild verdecken sie ohnehin – das entscheidet Windows.")} />
              <p className="tiny muted">{d.visible ? t("Gerade sichtbar.") : d.desktop && d.gameRunning && !d.games ? t("Gerade ausgeblendet, weil ein Spiel läuft.") : t("Gerade nicht sichtbar.")}</p>
            </>
          )}
      </div>
    </Card>
  );
}

/** Look of the island: pick a template and see it first (preview), only "Übernehmen" changes the real island. Only in the PC's own window –
 *  the island window shares its storage with it; a phone cannot reach it. */
export function IslandStyleCard() {
  const conn = useConn();
  const prefs = useIslandPrefs();
  const saved = prefs.style;
  const [pick, setPick] = useState<IslandStyle>(saved);
  const [eye, setEye] = useState<IslandEye>(prefs.eye);
  const [eyeSize, setEyeSize] = useState<IslandEyeSize>(prefs.eyeSize);
  const changed = pick !== saved || eye !== prefs.eye || eyeSize !== prefs.eyeSize;
  const isDefault = prefs.style === "default" && prefs.eye === "auto" && prefs.eyeSize === "m";
  if (!conn.me?.isLocal) return (
    <Card title={t("Aussehen der Insel")} icon={<Sparkles size={18} />} className="flat">
      <p className="small muted">{t("Das Aussehen der Insel stellst du am PC selbst ein (in diesem Fenster am PC).")}</p>
    </Card>
  );
  return (
    <Card title={t("Aussehen der Insel")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Wähle eine Vorlage und sieh sie dir an. Erst „Übernehmen“ ändert die echte Insel; „Standard“ ist das bisherige Aussehen.")}</p>
        <div className="isl-styles" role="radiogroup" aria-label={t("Vorlage")}>
          {ISLAND_STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} className={`isl-style-card ${pick === s.id ? "on" : ""}`} onClick={() => setPick(s.id)}>
              <div className="isl-host isl-preview" data-isl-style={s.id} data-isl-eye-size={eyeSize} data-isl-eye={eyeColor(eye) ? "1" : undefined} style={eyeColor(eye) ? ({ "--isl-eye": eyeColor(eye) } as CSSProperties) : undefined} aria-hidden><div className="isl m-idle"><IslandEyes mood="idle" /><span className="isl-text">{t("JARVIS – bereit")}</span></div></div>
              <span className="small">{t(s.label)}</span>
            </button>
          ))}
        </div>
        <Field label={t("Augenfarbe")} hint={t("Die Farbe für „bereit“. Rückfrage, Fehler, Tanzen und die anderen Stimmungen behalten ihre Farben, damit man den Zustand erkennt.")}>
          <Segmented value={eye} onChange={setEye} label={t("Augenfarbe")} options={ISLAND_EYES.map((e) => ({ value: e.id, label: t(e.label) }))} />
        </Field>
        <Field label={t("Augengröße")}><Segmented value={eyeSize} onChange={setEyeSize} label={t("Augengröße")} options={ISLAND_EYE_SIZES.map((e) => ({ value: e.id, label: t(e.label) }))} /></Field>
        <div className="row">
          <Button variant="primary" disabled={!changed} onClick={() => { setIslandPrefs({ style: pick, eye, eyeSize }); toast(t("Aussehen der Insel übernommen"), "success"); }}>{t("Übernehmen")}</Button>
          <Button disabled={isDefault && !changed} onClick={() => { setPick("default"); setEye("auto"); setEyeSize("m"); setIslandPrefs({ style: "default", eye: "auto", eyeSize: "m" }); }}>{t("Zurücksetzen")}</Button>
          {changed && <span className="tiny muted">{t("Vorschau – noch nicht übernommen")}</span>}
        </div>
      </div>
    </Card>
  );
}

export function IslandSettingsCard() {
  return <><IslandSwitchesCard /><IslandStyleCard /></>;
}
