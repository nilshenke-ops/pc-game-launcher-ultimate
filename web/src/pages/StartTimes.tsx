import { Timer, TrendingDown, TrendingUp } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Banner, Card, Empty, Loadable, PageHead, Sparkline } from "../components/ui";

interface StartGame {
  itemId: string; name: string; count: number; last: number; median: number; fastest: number; slowest: number;
  accuracy?: number | null; trend?: "slower" | "faster" | null; spread: boolean; recent: { at: string; seconds: number; accuracy?: number | null }[];
}
interface StartReport { games: StartGame[]; windowMinutes: number }

const secs = (s: number) => (s < 60 ? t("{n} s", { n: s.toLocaleString("de-DE", { maximumFractionDigits: 1 }) }) : t("{m} min {s} s", { m: Math.floor(s / 60), s: Math.round(s % 60) }));

/** Start-time analysis: from the start command in the app until the game runs – only own measurements. */
export default function StartTimesPage() {
  const q = useRpc<StartReport>("history.startTimes", {}, ["history"]);
  const games = q.data?.games ?? [];
  const max = Math.max(1, ...games.map((g) => g.slowest));
  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Startzeit-Analyse")}
        text={t("Wie lange dauert es vom Tippen auf „Spielen“, bis das Spiel am PC läuft? Gemessen wird bei jedem Start aus der App – je Spiel mit Verlauf.")} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (
          <div className="stack">
            {q.stale && <Banner kind="info">{t("Ohne PC: zuletzt geladener Stand.")}</Banner>}
            {games.length === 0 ? (
              <Card><Empty icon={<Timer size={26} />} title={t("Noch keine Messung")} text={t("Starte ein Spiel aus der App – sobald sein Programm läuft, steht hier die Zeit. Spiele brauchen dafür eine Erkennung (Prozessname oder Installationsordner).")} /></Card>
            ) : games.map((g) => (
              <Card key={g.itemId} title={g.name} icon={<Timer size={18} />} meta={<span className="tiny">{g.count === 1 ? t("1 Start") : t("{n} Starts", { n: g.count })}</span>}>
                <div className="stack-sm">
                  <div className="start-stats">
                    <div><span className="tiny muted">{t("Zuletzt")}</span><b>{secs(g.last)}</b></div>
                    <div><span className="tiny muted">{t("Üblich (Median)")}</span><b>{secs(g.median)}</b></div>
                    <div><span className="tiny muted">{t("Am schnellsten")}</span><b>{secs(g.fastest)}</b></div>
                    <div><span className="tiny muted">{t("Am langsamsten")}</span><b>{secs(g.slowest)}</b></div>
                  </div>
                  <div className="run-bar" title={t("Üblich im Vergleich zum langsamsten Spiel")}><span style={{ width: `${(g.median / max) * 100}%` }} /></div>
                  {g.recent.length > 1 && <div className="deal-spark wide" title={t("Letzte Starts")}><Sparkline values={g.recent.map((r) => r.seconds)} max={Math.max(...g.recent.map((r) => r.seconds), 1)} /></div>}
                  {g.trend === "slower" && <p className="small" style={{ margin: 0 }}><TrendingUp size={14} /> {t("Die letzten Starts waren deutlich langsamer als vorher. Häufige Gründe: ein Update wird beim Start geprüft, Shader werden neu erstellt oder der Launcher musste erst selbst starten.")}</p>}
                  {g.trend === "faster" && <p className="small" style={{ margin: 0 }}><TrendingDown size={14} /> {t("Die letzten Starts waren deutlich schneller als vorher.")}</p>}
                  {g.spread && !g.trend && <p className="small muted" style={{ margin: 0 }}>{t("Einzelne Starts dauern viel länger als üblich – oft der erste Start nach einem Update oder Neustart des PCs.")}</p>}
                  <span className="tiny muted">{t("Letzter Start {d}", { d: dateTime(g.recent[g.recent.length - 1]?.at) })}{g.accuracy ? " · " + t("auf ±{n} s genau", { n: g.accuracy }) : ""}</span>
                </div>
              </Card>
            ))}
            <p className="tiny muted">{t("Gemessen wird bis das Programm des Spiels läuft – nicht bis zum Hauptmenü. Gezählt werden nur Starts aus der App, bei denen das Spiel innerhalb von {m} Minuten erkannt wurde. Nach einem Start sucht der PC 3 Minuten lang jede Sekunde nach dem Spiel, dadurch ist die Messung auf etwa eine Sekunde genau.", { m: q.data.windowMinutes })}</p>
          </div>
        )}
      </Loadable>
    </>
  );
}
