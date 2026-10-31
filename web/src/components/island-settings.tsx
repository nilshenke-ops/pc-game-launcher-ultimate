// Switches for the JARVIS island on the PC screen (Windows companion): on the desktop and over programs, and
// separately during games (off by default – the island then hides while a game from the library runs).

import { Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Card, Switch } from "./ui";

interface IslandInfo { supported: boolean; visible: boolean; desktop: boolean; games: boolean; gameRunning: boolean }

export function IslandSettingsCard() {
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
