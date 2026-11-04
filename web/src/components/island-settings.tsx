// Switches for the JARVIS island on the PC screen (Windows companion): on the desktop and over programs, and
// separately during games (off by default – the island then hides while a game from the library runs).

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card, Field, Segmented, Switch } from "./ui";
import { IslandEyes } from "./jarvis-island";
import { setInAppIsland, useInAppIsland } from "../lib/island-inapp";
import { ISLAND_WIDGETS, toggleWidget } from "../lib/island-widgets";
import { ISLAND_EYES, ISLAND_EYE_SIZES, ISLAND_STYLES, eyeColor, type IslandEye, type IslandEyeSize, type IslandStyle } from "../lib/island";
import { ISLAND_POSITIONS, MIN_OPACITY, useIslandLook, type IslandPosition } from "../lib/island-look";
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
  const inApp = useInAppIsland();
  return (
    <Card title={t("Insel oben auf dem PC-Bildschirm")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <Switch checked={inApp} onChange={setInAppIsland} label={t("Insel auch in dieser App zeigen")} hint={t("Eine kleine schwebende Insel oben in der App (auch am Handy): Tippen öffnet JARVIS, Timer, Spiel und Widgets. Nur auf diesem Gerät.")} />
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

/** Look of the island: pick a template, eyes, place and opacity and see it first (preview); only "Übernehmen" changes the real island.
 *  The settings live on the PC, so a phone with the right to do so can change them too. */
export function IslandStyleCard() {
  const { look, online, canManage, save } = useIslandLook();
  const [pick, setPick] = useState<IslandStyle>(look.style);
  const [eye, setEye] = useState<IslandEye>(look.eye);
  const [eyeSize, setEyeSize] = useState<IslandEyeSize>(look.eyeSize);
  const [position, setPosition] = useState<IslandPosition>(look.position);
  const [opacity, setOpacity] = useState(look.opacity);
  // What the PC has (also after a change from another device) becomes the new starting point of the preview.
  const lookKey = JSON.stringify([look.style, look.eye, look.eyeSize, look.position, look.opacity]);
  useEffect(() => { setPick(look.style); setEye(look.eye); setEyeSize(look.eyeSize); setPosition(look.position); setOpacity(look.opacity); }, [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = pick !== look.style || eye !== look.eye || eyeSize !== look.eyeSize || position !== look.position || opacity !== look.opacity;
  const isDefault = look.style === "default" && look.eye === "auto" && look.eyeSize === "m" && look.position === "center" && look.opacity === 100;
  if (!online || !canManage) return (
    <Card title={t("Aussehen der Insel")} icon={<Sparkles size={18} />} className="flat">
      <p className="small muted">{online ? t("Dafür brauchst du Administrator-Rechte am PC.") : t("Zum Einstellen muss der PC verbunden sein.")}</p>
    </Card>
  );
  return (
    <Card title={t("Aussehen der Insel")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Wähle eine Vorlage und sieh sie dir an. Erst „Übernehmen“ ändert die echte Insel; „Standard“ ist das bisherige Aussehen.")}</p>
        <div className="isl-styles" role="radiogroup" aria-label={t("Vorlage")}>
          {ISLAND_STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} className={`isl-style-card ${pick === s.id ? "on" : ""}`} onClick={() => setPick(s.id)}>
              <div className="isl-host isl-preview" data-isl-style={s.id} data-isl-eye-size={eyeSize} data-isl-eye={eyeColor(eye) ? "1" : undefined} style={{ ...(eyeColor(eye) ? ({ "--isl-eye": eyeColor(eye) } as CSSProperties) : {}), opacity: opacity / 100 }} aria-hidden><div className="isl m-idle"><IslandEyes mood="idle" /><span className="isl-text">{t("JARVIS – bereit")}</span></div></div>
              <span className="small">{t(s.label)}</span>
            </button>
          ))}
        </div>
        <Field label={t("Augenfarbe")} hint={t("Die Farbe für „bereit“. Rückfrage, Fehler, Tanzen und die anderen Stimmungen behalten ihre Farben, damit man den Zustand erkennt.")}>
          <Segmented value={eye} onChange={setEye} label={t("Augenfarbe")} options={ISLAND_EYES.map((e) => ({ value: e.id, label: t(e.label) }))} />
        </Field>
        <Field label={t("Augengröße")}><Segmented value={eyeSize} onChange={setEyeSize} label={t("Augengröße")} options={ISLAND_EYE_SIZES.map((e) => ({ value: e.id, label: t(e.label) }))} /></Field>
        <Field label={t("Position am oberen Bildschirmrand")}><Segmented value={position} onChange={setPosition} label={t("Position")} options={ISLAND_POSITIONS.map((p) => ({ value: p.id, label: t(p.label) }))} /></Field>
        <Field label={t("Deckkraft des Fensters: {v} %", { v: opacity })} hint={t("Nicht ganz durchsichtig: mindestens 50 %, damit die Insel lesbar bleibt.")}>
          <input type="range" min={MIN_OPACITY} max={100} step={5} value={opacity} aria-label={t("Deckkraft")} onChange={(e) => setOpacity(+e.target.value)} />
        </Field>
        <div className="row">
          <Button variant="primary" disabled={!changed} onClick={async () => { if (await save({ style: pick, eye, eyeSize, position, opacity })) toast(t("Aussehen der Insel übernommen"), "success"); }}>{t("Übernehmen")}</Button>
          <Button disabled={isDefault && !changed} onClick={async () => { setPick("default"); setEye("auto"); setEyeSize("m"); setPosition("center"); setOpacity(100); await save({ style: "default", eye: "auto", eyeSize: "m", position: "center", opacity: 100 }); }}>{t("Zurücksetzen")}</Button>
          {changed && <span className="tiny muted">{t("Vorschau – noch nicht übernommen")}</span>}
        </div>
      </div>
    </Card>
  );
}

/** Which widgets the opened island shows. The usual ones are on; the new ones are off until switched on. Stored on the PC. */
export function IslandWidgetsCard() {
  const { look, online, canManage, save } = useIslandLook();
  if (!online || !canManage) return null;
  return (
    <Card title={t("Widgets in der Insel")} icon={<Sparkles size={18} />} className="flat">
      <div className="stack-sm">
        <p className="small muted">{t("Wähle, was beim Antippen der Insel erscheint. Messwerte, Netzwerk-Ping und Temperaturen werden nur gemessen, solange die Insel offen ist.")}</p>
        {ISLAND_WIDGETS.map((w) => <Switch key={w.id} checked={look.widgets.includes(w.id)} onChange={(on) => void save({ widgets: toggleWidget(look.widgets, w.id, on) })} label={t(w.label)} hint={t(w.hint)} />)}
      </div>
    </Card>
  );
}

export function IslandSettingsCard() {
  return <><IslandSwitchesCard /><IslandStyleCard /><IslandWidgetsCard /></>;
}
