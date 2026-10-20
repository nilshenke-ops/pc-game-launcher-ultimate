// Gamer-Pass editor: picture, title, favourite games, badges, frame, background, colour, order – with live preview.
// Stored only on this device (and in the own encrypted account, if signed in). Nothing is published automatically.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, RotateCcw, Share2, Trash2, Trophy, Undo2, Upload } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useRpc } from "../lib/hooks";
import { readJson, writeJson } from "../lib/rpc";
import { usePrefs } from "../lib/prefs";
import {
  avatarFromFile, DEFAULT_PASS, drawPass, PASS_BACKGROUNDS, PASS_FRAMES, PASS_SECTIONS, passData, sanitizePass, tier, tierColor,
  type PassInput, type PassSection, type PassStyle,
} from "../lib/gamerpass";
import type { LibraryItem } from "../lib/types";
import { Button, Card, confirmDialog, Field, Segmented } from "./ui";

const KEY = "pgl.gamerpass";
const EMOJIS = ["🎮", "🕹️", "👾", "🐉", "🦊", "🐺", "🚀", "⚔️", "🏆", "🔥", "🌙", "🤖"];
const TITLES = ["Nachtschwärmer", "Speedrunner", "Taktiker", "Sammler", "Teamplayer", "Entdecker"];
const FRAME_LABEL: Record<string, string> = { none: "Ohne", neon: "Neon", gold: "Gold", holo: "Holo", pixel: "Pixel" };
const SECTION_LABEL: Record<PassSection, string> = { stats: "Zahlen", trophies: "Trophäen", favorites: "Lieblingsspiele", badges: "Abzeichen" };

export const loadPass = () => sanitizePass(readJson(KEY));

export function PassEditor({ quests, topGame }: { quests: PassInput; topGame: string | null }) {
  const [style, setStyleRaw] = useState<PassStyle>(loadPass);
  const history = useRef<PassStyle[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const { theme } = usePrefs();
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const games = useMemo(() => (lib.data?.items ?? []).filter((i) => i.kind === "game").sort((a, b) => a.name.localeCompare(b.name)), [lib.data]);
  const unlocked = quests.achievements.filter((a) => a.unlocked);
  const ref = useRef<HTMLCanvasElement>(null);
  const [avatarImg, setAvatarImg] = useState<HTMLImageElement | null>(null);

  const setStyle = (next: PassStyle) => {
    history.current = [...history.current.slice(-19), style];
    setCanUndo(true);
    setStyleRaw(next);
  };
  const patch = (p: Partial<PassStyle>) => setStyle(sanitizePass({ ...style, ...p }));
  const undo = () => { const prev = history.current.pop(); if (prev) setStyleRaw(prev); setCanUndo(history.current.length > 0); };

  useEffect(() => { writeJson(KEY, style); }, [style]);
  useEffect(() => {
    if (!style.avatar) { setAvatarImg(null); return; }
    const img = new Image(); img.onload = () => setAvatarImg(img); img.src = style.avatar;
  }, [style.avatar]);

  const pass = passData(quests, style.name, style.emoji, topGame);
  const labels = {
    level: t("Level"), hours: t("Stunden"), games: t("Spiele"), streak: t("Tage am Stück"), trophies: t("Trophäen"), top: t("Meistgespielt"),
    next: t("noch {n} XP bis Level {l}", { n: pass.xpToNext, l: pass.level + 1 }), favorites: t("Lieblingsspiele"), badges: t("Abzeichen"),
    noBadges: t("Noch keine Abzeichen gewählt"), noFavorites: t("Noch keine Lieblingsspiele gewählt"),
  };
  useEffect(() => { if (ref.current) drawPass(ref.current, pass, labels, style, { accent: theme.primary, avatar: avatarImg, achievements: quests.achievements }); });

  const blob = () => new Promise<Blob | null>((res) => (ref.current ? ref.current.toBlob(res, "image/png") : res(null)));
  const save = async () => {
    const b = await blob(); if (!b) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gamer-pass.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const b = await blob(); if (!b) return;
    try { await navigator.share({ files: [new File([b], "gamer-pass.png", { type: "image/png" })], title: t("Mein Gamer-Pass") }); }
    catch (e) { if ((e as Error).name !== "AbortError") toast(t("Teilen geht in diesem Browser nicht – nimm „Als Bild speichern“."), "error"); }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const upload = async (f?: File) => {
    if (!f) return;
    try { patch({ avatar: await avatarFromFile(f) }); } catch (e) { toast(t((e as Error).message), "error"); }
  };
  const move = (s: PassSection, dir: -1 | 1) => {
    const o = [...style.order]; const i = o.indexOf(s); const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; patch({ order: o });
  };
  const toggleSection = (s: PassSection) => patch({ order: style.order.includes(s) ? style.order.filter((x) => x !== s) : [...style.order, s] });

  return (
    <Card title={t("Gamer-Pass")} icon={<Trophy size={18} />} actions={<Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!canUndo} onClick={undo}>{t("Rückgängig")}</Button>}>
      <div className="pass-editor">
        <div className="pass-preview">
          <canvas ref={ref} className="pass-canvas" role="img" aria-label={t("Gamer-Pass: Level {l}, {h} Stunden, {n} Trophäen", { l: pass.level, h: pass.hours, n: pass.trophies.total })} />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" icon={<ImageIcon size={15} />} onClick={() => void save()}>{t("Als Bild speichern")}</Button>
            {canShare && <Button icon={<Share2 size={15} />} onClick={() => void share()}>{t("Teilen")}</Button>}
            <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={async () => { if (await confirmDialog(t("Gamer-Pass zurücksetzen?"), t("Name, Bild, Titel, Auswahl und Aussehen gehen auf den Standard zurück."))) setStyle({ ...DEFAULT_PASS }); }}>{t("Zurücksetzen")}</Button>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>{t("Alles bleibt auf diesem Gerät (und in deinem Konto, falls angemeldet). Die Karte entsteht im Browser – nichts wird hochgeladen oder veröffentlicht.")}</p>
        </div>
        <div className="stack">
          <div className="grid-2">
            <Field label={t("Name auf der Karte")}><input className="input" value={style.name} maxLength={22} placeholder="Gamer" onChange={(e) => patch({ name: e.target.value })} /></Field>
            <Field label={t("Titel")}><input className="input" value={style.title} maxLength={30} list="pass-titles" placeholder={t("z. B. Nachtschwärmer")} onChange={(e) => patch({ title: e.target.value })} /></Field>
            <datalist id="pass-titles">{TITLES.map((x) => <option key={x} value={t(x)} />)}</datalist>
          </div>
          <div className="stack-xs">
            <span className="small"><b>{t("Bild")}</b></span>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {EMOJIS.map((e) => <button key={e} type="button" className={`chip ${!style.avatar && style.emoji === e ? "on" : ""}`} aria-label={e} aria-pressed={!style.avatar && style.emoji === e} onClick={() => patch({ emoji: e, avatar: null })}>{e}</button>)}
              <label className="chip" style={{ cursor: "pointer" }}><Upload size={13} /> {t("Eigenes Bild")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
              {style.avatar && <button type="button" className="chip on" onClick={() => patch({ avatar: null })}><Trash2 size={13} /> {t("Bild entfernen")}</button>}
            </div>
          </div>
          <Field label={t("Rahmen")}><Segmented value={style.frame} onChange={(frame) => patch({ frame })} label={t("Rahmen")} options={PASS_FRAMES.map((f) => ({ value: f, label: t(FRAME_LABEL[f]) }))} /></Field>
          <div className="stack-xs">
            <span className="small"><b>{t("Hintergrund")}</b></span>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {Object.entries(PASS_BACKGROUNDS).map(([k, [a, b]]) => <button key={k} type="button" className={`pass-swatch ${style.bg === k ? "on" : ""}`} aria-label={k} aria-pressed={style.bg === k} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => patch({ bg: k })} />)}
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small"><b>{t("Farbe")}</b></span>
            <input type="color" value={style.accent ?? theme.primary} aria-label={t("Farbe")} onChange={(e) => patch({ accent: e.target.value })} />
            <Button size="sm" variant={style.accent ? undefined : "primary"} onClick={() => patch({ accent: null })}>{t("Wie mein Design")}</Button>
          </div>
          <Field label={t("Lieblingsspiele (bis 3)")} hint={games.length ? undefined : t("Spiele erscheinen hier, sobald der PC sie einmal geladen hat.")}>
            <div className="stack-xs">
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {style.favorites.map((f) => <button key={f.id} type="button" className="chip on" aria-label={t("{n} entfernen", { n: f.name })} onClick={() => patch({ favorites: style.favorites.filter((x) => x.id !== f.id) })}>★ {f.name} ✕</button>)}
              </div>
              {style.favorites.length < 3 && games.length > 0 && (
                <select className="input" value="" aria-label={t("Lieblingsspiel hinzufügen")} onChange={(e) => { const g = games.find((x) => x.id === e.target.value); if (g) patch({ favorites: [...style.favorites, { id: g.id, name: g.name }] }); }}>
                  <option value="">{t("Spiel hinzufügen …")}</option>
                  {games.filter((g) => !style.favorites.some((f) => f.id === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </div>
          </Field>
          <Field label={t("Abzeichen (bis 4, aus deinen freigeschalteten Erfolgen)")}>
            {unlocked.length === 0 ? <span className="tiny muted">{t("Noch keine Erfolge freigeschaltet – Abzeichen gibt es nur für echte Erfolge aus GameQuest.")}</span> : (
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {unlocked.map((a) => {
                  const on = style.badges.includes(a.id);
                  return <button key={a.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && style.badges.length >= 4}
                    onClick={() => patch({ badges: on ? style.badges.filter((b) => b !== a.id) : [...style.badges, a.id] })}><span style={{ color: tierColor(tier(a.xp)) }}>●</span> {a.title}</button>;
                })}
              </div>
            )}
          </Field>
          <div className="stack-xs">
            <span className="small"><b>{t("Bereiche und Reihenfolge")}</b></span>
            {[...style.order, ...PASS_SECTIONS.filter((s) => !style.order.includes(s))].map((s) => {
              const shown = style.order.includes(s), i = style.order.indexOf(s);
              return (
                <div key={s} className="row pass-order" style={{ gap: 6 }}>
                  <label className="row grow" style={{ gap: 8 }}><input type="checkbox" checked={shown} onChange={() => toggleSection(s)} />{t(SECTION_LABEL[s])}</label>
                  <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} aria-label={t("{n} nach oben", { n: t(SECTION_LABEL[s]) })} disabled={!shown || i === 0} onClick={() => move(s, -1)} />
                  <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} aria-label={t("{n} nach unten", { n: t(SECTION_LABEL[s]) })} disabled={!shown || i === style.order.length - 1} onClick={() => move(s, 1)} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
