// "Wenn dir dieses Spiel gefällt …" (F15): suggestions only from the user's own data – library categories, own
// genre/feel words and the fact check – with every reason shown. No hidden model, no outside database.

import { useMemo, useState } from "react";
import { Heart, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { money, parsePrice } from "../lib/quest-deal";
import { getEntry, newId, removeEntry, useJournal } from "../lib/journal";
import type { Data } from "../lib/collections";
import type { LibraryItem } from "../lib/types";
import { mergeCandidates, recommend, type Candidate } from "../lib/infos";
import { norm } from "../lib/journal-logic";
import { trySave } from "./journal-ui";
import { Button, Card, Empty, Field } from "./ui";

const PREFS_ID = "j_recprefs";
const PLAYED = new Set(["playing", "paused", "completed", "dropped"]);

function useCandidates(): Candidate[] {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const deals = useRpc<{ items: { title: string; finalCents?: number | null; msFinalCents?: number | null }[] }>("deals.list", {}, ["deals"]);
  const facts = useJournal<Data>("facts");
  return useMemo(() => mergeCandidates([
    ...(lib.data?.items ?? []).filter((i) => i.kind === "game").map((i): Candidate => ({ key: i.id, title: i.name, feel: [], cats: i.categories ?? [], flags: {}, platforms: ["PC"], played: PLAYED.has(i.backlog ?? "") || i.rating != null, priceCents: null, where: ["library"] })),
    ...(deals.data?.items ?? []).map((w): Candidate => {
      const prices = [w.finalCents, w.msFinalCents].filter((x): x is number => x != null);
      return { key: "w" + w.title, title: w.title, feel: [], cats: [], flags: {}, platforms: [], played: false, priceCents: prices.length ? Math.min(...prices) : null, where: ["wish"] };
    }),
    ...facts.filter((f) => !f.data.archived).map((f): Candidate => ({ key: f.id, title: String(f.data.title), feel: (f.data.feel as string[]) ?? [], cats: [], platforms: (f.data.platforms as string[]) ?? [],
      flags: Object.fromEntries(Object.entries(f.data).filter(([, v]) => typeof v === "string" && ["yes", "partial", "no", "unknown"].includes(v as string))) as Record<string, string>, played: false, priceCents: null, where: ["facts"] })),
  ]), [lib.data, deals.data, facts]);
}

const WHERE: Record<string, string> = { library: "Bibliothek", wish: "Wunschliste", facts: "Faktencheck" };

export function RecsView() {
  const all = useCandidates();
  const prefsEntry = useJournal<{ liked?: string[]; disliked?: string[] }>("recpref").find((e) => e.id === PREFS_ID);
  const prefs = { liked: prefsEntry?.data.liked ?? [], disliked: prefsEntry?.data.disliked ?? [] };
  const favs = useJournal<Data>("recfav");
  const [seedKey, setSeedKey] = useState("");
  const [hidePlayed, setHidePlayed] = useState(true);
  const [platform, setPlatform] = useState("");
  const [budget, setBudget] = useState("");
  const budgetCents = budget.trim() ? parsePrice(budget) : null;
  const seed = all.find((c) => c.key === seedKey);
  const recs = useMemo(() => seed ? recommend(seed, all, prefs, { hidePlayed, platform: platform || undefined, budgetCents: budgetCents != null && !Number.isNaN(budgetCents) ? budgetCents : null }) : [], [seed, all, prefs.liked.join(), prefs.disliked.join(), hidePlayed, platform, budgetCents]); // eslint-disable-line react-hooks/exhaustive-deps
  const platforms = [...new Set(all.flatMap((c) => c.platforms))].sort();
  const words = [...new Set(all.flatMap((c) => c.feel).map((w) => w.trim()))].sort((a, b) => a.localeCompare(b));
  const setPref = (w: string, list: "liked" | "disliked") => {
    const cur = { liked: prefs.liked.filter((x) => norm(x) !== norm(w)), disliked: prefs.disliked.filter((x) => norm(x) !== norm(w)) };
    const was = prefs[list].some((x) => norm(x) === norm(w));
    if (!was) cur[list].push(w);
    trySave("recpref", PREFS_ID, { title: t("Vorlieben"), ...cur });
  };
  const fav = (title: string, reasons: string) => {
    const have = favs.find((f) => norm(String(f.data.title)) === norm(title));
    if (have) removeEntry(have.id);
    else trySave("recfav", newId(), { title, seed: seed?.title ?? "", reasons });
  };

  if (all.length < 2) return <Card><Empty icon={<Sparkles size={24} />} title={t("Zu wenig Daten für Empfehlungen")} text={t("Empfehlungen entstehen nur aus deinen eigenen Daten: Spiele in der Bibliothek (mit Kategorien), auf der Wunschliste und im Faktencheck (mit „Genre & Spielgefühl“).")} /></Card>;

  return (
    <div className="stack">
      <Card title={t("Wenn dir dieses Spiel gefällt …")} icon={<Sparkles size={18} />}>
        <div className="stack">
          <span className="small muted">{t("Regelbasiert aus deinen eigenen Angaben: gleiche Stichwörter bei „Genre & Spielgefühl“ (3 Punkte), gleiche Bibliotheks-Kategorie (2), gleiche Spielweise laut Faktencheck (1). Jeder Grund wird angezeigt – keine KI, keine fremde Datenbank.")}</span>
          <div className="grid-2">
            <Field label={t("Spiel")}>
              <select className="input" value={seedKey} onChange={(e) => setSeedKey(e.target.value)}>
                <option value="">{t("Spiel wählen …")}</option>{[...all].sort((a, b) => a.title.localeCompare(b.title)).map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
              </select>
            </Field>
            <Field label={t("Budget (nur Wunschliste mit gemessenem Preis)")} error={budgetCents != null && Number.isNaN(budgetCents) ? t("Bitte als Betrag, z. B. 19,99") : undefined}>
              <input className="input" inputMode="decimal" placeholder="20,00" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </Field>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="checkbox"><input type="checkbox" checked={hidePlayed} onChange={(e) => setHidePlayed(e.target.checked)} />{t("Schon gespielte ausblenden")}</label>
            {platforms.length > 0 && <select className="input" style={{ maxWidth: 200 }} aria-label={t("Plattform")} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">{t("Plattform")}: {t("alle")}</option>{platforms.map((p) => <option key={p} value={p}>{p}</option>)}</select>}
          </div>
          {seed && (recs.length === 0
            ? <span className="small muted">{t("Keine Gemeinsamkeiten gefunden. Trag im Faktencheck „Genre & Spielgefühl“ ein oder vergib Kategorien in der Bibliothek – dann gibt es Treffer.")}</span>
            : <div className="list">{recs.slice(0, 20).map((r) => {
              const reasons = r.reasons.map((x) => t(x.text, { w: (x.translate ? x.words.map((w) => t(w)) : x.words).join(", ") })).join(" · ");
              const isFav = favs.some((f) => norm(String(f.data.title)) === norm(r.c.title));
              return (
                <div key={r.c.key} className="list-item">
                  <div className="grow">
                    <div className="title">{r.c.title} <span className="badge">{t("{n} Punkte", { n: r.score })}</span>{r.c.played && <span className="badge">{t("schon gespielt")}</span>}</div>
                    <div className="sub">{reasons}</div>
                    <div className="tiny muted">{r.c.where.map((w) => t(WHERE[w])).join(", ")}{r.c.priceCents != null ? " · " + money(r.c.priceCents, "EUR") : ""}</div>
                  </div>
                  <Button size="sm" variant="ghost" icon={<Heart size={15} fill={isFav ? "currentColor" : "none"} />} aria-label={isFav ? t("Aus Favoriten entfernen") : t("Als Favorit merken")} onClick={() => fav(r.c.title, reasons)} />
                </div>
              );
            })}</div>)}
        </div>
      </Card>
      {words.length > 0 && (
        <Card title={t("Vorlieben")} icon={<ThumbsUp size={18} />}>
          <span className="small muted">{t("Magst du ein Stichwort, zählt es mehr; magst du es nicht, werden Spiele damit nicht vorgeschlagen.")}</span>
          <div className="stack-xs" style={{ marginTop: 8 }}>{words.map((w) => {
            const like = prefs.liked.some((x) => norm(x) === norm(w)), dis = prefs.disliked.some((x) => norm(x) === norm(w));
            return (
              <div key={w} className="row between"><span className="small">{w}</span>
                <span className="row" style={{ gap: 4 }}>
                  <Button size="sm" variant={like ? "primary" : "ghost"} icon={<ThumbsUp size={14} />} aria-pressed={like} aria-label={t("Mag ich: {w}", { w })} onClick={() => setPref(w, "liked")} />
                  <Button size="sm" variant={dis ? "danger" : "ghost"} icon={<ThumbsDown size={14} />} aria-pressed={dis} aria-label={t("Mag ich nicht: {w}", { w })} onClick={() => setPref(w, "disliked")} />
                </span>
              </div>
            );
          })}</div>
        </Card>
      )}
      {favs.length > 0 && (
        <Card title={t("Gemerkte Empfehlungen")} icon={<Star size={18} />} meta={String(favs.length)}>
          <div className="list">{favs.map((f) => (
            <div key={f.id} className="list-item">
              <div className="grow"><div className="title">{String(f.data.title)}</div><div className="sub">{f.data.seed ? t("weil dir {s} gefällt", { s: String(f.data.seed) }) + " · " : ""}{String(f.data.reasons ?? "")}</div></div>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Entfernen")} onClick={() => getEntry(f.id) && removeEntry(f.id)} />
            </div>
          ))}</div>
        </Card>
      )}
    </div>
  );
}
