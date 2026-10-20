import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Lock, Share2, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../lib/i18n";
import { toast, useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { drawPass, passData, tier, tierColor, type PassInput, type Tier } from "../lib/gamerpass";
import { Banner, Button, Card, Empty, Field, Loadable, PageHead } from "../components/ui";

const KEY = "pgl.gamerpass";
const EMOJIS = ["🎮", "🕹️", "👾", "🐉", "🦊", "🐺", "🚀", "⚔️", "🏆", "🔥", "🌙", "🤖"];
const TIER_LABEL: Record<Tier, () => string> = { gold: () => t("Gold"), silver: () => t("Silber"), bronze: () => t("Bronze") };

function loadPrefs(): { name: string; emoji: string } {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return { name: typeof v.name === "string" ? v.name : "", emoji: typeof v.emoji === "string" ? v.emoji : "🎮" }; }
  catch { return { name: "", emoji: "🎮" }; }
}

/** Trophy room (the GameQuest achievements on shelves) and the Gamer-Pass card – works without the PC from the last copy. */
export default function TrophiesPage() {
  const q = useRpc<PassInput & { offline?: boolean }>("quests.get", {}, ["quests", "history"]);
  const h = useRpc<{ stats: { name: string; totalMinutes: number }[] }>("history.get", {}, ["history"]);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } }, [prefs]);
  const ref = useRef<HTMLCanvasElement>(null);
  const d = q.data;
  const top = h.data?.stats[0]?.name ?? null;
  const pass = d ? passData(d, prefs.name, prefs.emoji, top) : null;
  const labels = { level: t("Level"), hours: t("Stunden"), games: t("Spiele"), streak: t("Tage am Stück"), trophies: t("Trophäen"), top: t("Meistgespielt"), next: pass ? t("noch {n} XP bis Level {l}", { n: pass.xpToNext, l: pass.level + 1 }) : "" };
  useEffect(() => { if (ref.current && pass) drawPass(ref.current, pass, labels); });

  const blob = () => new Promise<Blob | null>((res) => ref.current ? ref.current.toBlob(res, "image/png") : res(null));
  const save = async () => {
    const b = await blob(); if (!b) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gamer-pass.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const b = await blob(); if (!b) return;
    const file = new File([b], "gamer-pass.png", { type: "image/png" });
    try { await navigator.share({ files: [file], title: t("Mein Gamer-Pass") }); }
    catch (e) { if ((e as Error).name !== "AbortError") toast(t("Teilen geht in diesem Browser nicht – nimm „Als Bild speichern“."), "error"); }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  const shelves = (["gold", "silver", "bronze"] as Tier[]).map((x) => ({ tier: x, items: (d?.achievements ?? []).filter((a) => tier(a.xp) === x) }));

  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Trophäenraum")}
        text={t("Deine Erfolge aus GameQuest als Trophäen im Regal und dein Gamer-Pass als Karte zum Teilen – alles aus deinen eigenen Spielzeiten und Zielen.")} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && pass && (
          <div className="stack">
            {q.stale && <Banner kind="info">{t("Ohne PC: zuletzt geladener Stand.")}</Banner>}
            <Card title={t("Gamer-Pass")} icon={<Trophy size={18} />}>
              <div className="stack-sm">
                <canvas ref={ref} className="pass-canvas" role="img" aria-label={t("Gamer-Pass: Level {l}, {h} Stunden, {n} Trophäen", { l: pass.level, h: pass.hours, n: pass.trophies.total })} />
                <div className="grid-2">
                  <Field label={t("Name auf der Karte")}><input className="input" value={prefs.name} maxLength={22} placeholder="Gamer" onChange={(e) => setPrefs({ ...prefs, name: e.target.value })} /></Field>
                  <div className="stack-xs"><span className="small"><b>{t("Symbol")}</b></span>
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>{EMOJIS.map((e) => <button key={e} type="button" className={`chip ${prefs.emoji === e ? "on" : ""}`} aria-label={e} onClick={() => setPrefs({ ...prefs, emoji: e })}>{e}</button>)}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Button variant="primary" icon={<ImageIcon size={15} />} onClick={() => void save()}>{t("Als Bild speichern")}</Button>
                  {canShare && <Button icon={<Share2 size={15} />} onClick={() => void share()}>{t("Teilen")}</Button>}
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{t("Name und Symbol bleiben nur auf diesem Gerät. Die Karte entsteht im Browser – es wird nichts hochgeladen.")}</p>
              </div>
            </Card>

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
