import { Lock, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { tier, tierColor, type PassInput, type Tier } from "../lib/gamerpass";
import { PassEditor } from "../components/pass-editor";
import { Banner, Card, Empty, Loadable, PageHead } from "../components/ui";

const TIER_LABEL: Record<Tier, () => string> = { gold: () => t("Gold"), silver: () => t("Silber"), bronze: () => t("Bronze") };

/** Trophy room (the GameQuest achievements on shelves) and the Gamer-Pass card – works without the PC from the last copy. */
export default function TrophiesPage() {
  const q = useRpc<PassInput & { offline?: boolean }>("quests.get", {}, ["quests", "history"]);
  const h = useRpc<{ stats: { name: string; totalMinutes: number }[] }>("history.get", {}, ["history"]);
  const d = q.data;
  const top = h.data?.stats[0]?.name ?? null;

  const shelves = (["gold", "silver", "bronze"] as Tier[]).map((x) => ({ tier: x, items: (d?.achievements ?? []).filter((a) => tier(a.xp) === x) }));

  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Trophäenraum")}
        text={t("Deine Erfolge aus GameQuest als Trophäen im Regal und dein Gamer-Pass als Karte zum Teilen – alles aus deinen eigenen Spielzeiten und Zielen.")} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            {q.stale && <Banner kind="info">{t("Ohne PC: zuletzt geladener Stand.")}</Banner>}
            <PassEditor quests={d} topGame={top} />

            {d.achievements.length === 0 ? <Card><Empty icon={<Trophy size={26} />} title={t("Noch keine Erfolge")} text={t("Erfolge gibt es in GameQuest.")} /></Card> : shelves.map((s) => s.items.length > 0 && (
              <Card key={s.tier} title={t("{t} ({n}/{m})", { t: TIER_LABEL[s.tier](), n: s.items.filter((a) => a.unlocked).length, m: s.items.length })} icon={<Trophy size={18} style={{ color: tierColor(s.tier) }} />}>
                <div className="trophy-shelf">
                  {s.items.map((a) => (
                    <div key={a.id} className={`trophy ${a.unlocked ? "on" : ""}`} style={{ ["--tier" as string]: tierColor(s.tier) }}>
                      <span className="trophy-cup" aria-hidden>{a.unlocked ? <Trophy size={30} /> : <Lock size={24} />}</span>
                      <b className="small">{a.title}</b>
                      <span className="tiny muted">{a.description}</span>
                      {a.unlocked ? <span className="tiny">{a.unlockedAt ? t("Freigeschaltet {d}", { d: dateTime(a.unlockedAt) }) : t("Freigeschaltet")} · +{a.xp} XP</span>
                        : <><div className="run-bar"><span style={{ width: `${Math.min(100, (a.value / a.target) * 100)}%` }} /></div><span className="tiny muted">{a.value.toLocaleString("de-DE")} / {a.target.toLocaleString("de-DE")}</span></>}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
            <p className="tiny muted">{t("Neue Ziele und eigene Matches trägst du in")} <Link to="/quests">GameQuest</Link> {t("ein.")}</p>
          </div>
        )}
      </Loadable>
    </>
  );
}
