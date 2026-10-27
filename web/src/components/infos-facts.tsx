// Fact check (F14), accessibility finder (F24) and editions/DLC comparison (F16): own entries with sources,
// side-by-side comparison, "must have" filters, and unknown or unproven values always marked as such.

import { useMemo, useState, type ReactNode } from "react";
import { Accessibility, Layers, ListChecks, Scale } from "lucide-react";
import { t } from "../lib/i18n";
import { money } from "../lib/quest-deal";
import { useJournal, type Entry } from "../lib/journal";
import type { Data, Schema } from "../lib/collections";
import { ACCESS, EDITIONS, FACTS } from "../lib/collection-schemas";
import { ACCESS_KEYS, compareFacts, duplicates, editionMatrix, FACT_KEYS, known, meets, type Tri } from "../lib/infos";
import { CollectionView } from "./collection-view";
import { Banner, Card } from "./ui";

const TRI_TEXT: Record<Tri, string> = { yes: "Ja", partial: "Teilweise", no: "Nein", unknown: "Unbekannt" };
const TRI_CLASS: Record<Tri, string> = { yes: "ok", partial: "warn", no: "danger", unknown: "" };

export function TriBadge({ v }: { v: Tri }) { return <span className={`badge ${TRI_CLASS[v]}`}>{v === "unknown" ? "?" : ""} {t(TRI_TEXT[v])}</span>; }

function SourceInfo({ d }: { d: Data }) {
  return (
    <span className="tiny muted">
      {d.source ? <a href={String(d.source)} target="_blank" rel="noopener noreferrer">{t("Quelle")}</a> : <span className="badge warn">{t("ohne Quelle – nicht belegt")}</span>}
      {d.checkedOn ? " · " + t("Stand {d}", { d: new Date(String(d.checkedOn)).toLocaleDateString() }) : ""}
    </span>
  );
}

/** Compare up to four games and filter by "must have" – shared by the fact check and the accessibility finder. */
function CompareAndFilter({ schema, keys, icon, intro }: { schema: Schema; keys: { key: string; label: string }[]; icon: ReactNode; intro: string }) {
  const list = useJournal<Data>(schema.kind).filter((e) => !e.data.archived);
  const [picked, setPicked] = useState<string[]>([]);
  const [must, setMust] = useState<string[]>([]);
  const [partialOk, setPartialOk] = useState(false);
  const chosen = picked.map((id) => list.find((e) => e.id === id)).filter((e): e is Entry<Data> => !!e);
  const cmp = compareFacts(chosen.map((e) => ({ title: String(e.data.title), data: e.data })), keys);
  const matches = must.length ? list.filter((e) => meets(e.data, must, partialOk)) : [];
  if (list.length === 0) return null;
  return (
    <Card title={t("Vergleichen und filtern")} icon={icon}>
      <div className="stack">
        <span className="small muted">{t(intro)}</span>
        <div className="stack-xs">
          <b className="small">{t("Muss haben")}</b>
          <div className="chips">{keys.map((k) => <button key={k.key} type="button" className={`chip ${must.includes(k.key) ? "on" : ""}`} onClick={() => setMust((m) => m.includes(k.key) ? m.filter((x) => x !== k.key) : [...m, k.key])}>{t(k.label)}</button>)}</div>
          {must.length > 0 && <>
            <label className="checkbox"><input type="checkbox" checked={partialOk} onChange={(e) => setPartialOk(e.target.checked)} />{t("„Teilweise“ reicht")}</label>
            {matches.length === 0 ? <span className="small muted">{t("Kein eingetragenes Spiel erfüllt alles. „Unbekannt“ zählt nie als erfüllt.")}</span>
              : <div className="chips">{matches.map((e) => <span key={e.id} className="badge ok">{String(e.data.title)}</span>)}</div>}
          </>}
        </div>
        <div className="stack-xs">
          <b className="small">{t("Nebeneinander (bis zu 4)")}</b>
          <div className="chips">{list.map((e) => <button key={e.id} type="button" className={`chip ${picked.includes(e.id) ? "on" : ""}`} disabled={!picked.includes(e.id) && picked.length >= 4} onClick={() => setPicked((p) => p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id])}>{String(e.data.title)}</button>)}</div>
        </div>
        {chosen.length >= 2 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th />{chosen.map((e) => <th key={e.id}>{String(e.data.title)}<div><SourceInfo d={e.data} /></div></th>)}</tr></thead>
              <tbody>{cmp.rows.map((r) => {
                const label = keys.find((k) => k.key === r.key)!.label;
                return <tr key={r.key} className={cmp.differs.includes(r.key) ? "row-diff" : ""}><td>{t(label)}</td>{r.values.map((v, i) => <td key={i}><TriBadge v={v} /></td>)}</tr>;
              })}</tbody>
            </table>
            {cmp.allUnknown.length > 0 && <span className="tiny muted">{t("Bei allen unbekannt: {l}", { l: cmp.allUnknown.map((k) => t(keys.find((x) => x.key === k)!.label)).join(", ") })}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}

function knownBadge(d: Data, keys: { key: string }[]) {
  const k = known(d, keys);
  return <span className="row" style={{ gap: 4 }}><span className={`badge ${k.known === k.of ? "ok" : ""}`}>{t("{n} von {m} bekannt", { n: k.known, m: k.of })}</span>{!d.source && <span className="badge warn">{t("ohne Quelle")}</span>}</span>;
}

function TriList({ d, keys }: { d: Data; keys: { key: string; label: string }[] }) {
  return (
    <div className="stack-sm">
      <SourceInfo d={d} />
      <div className="tri-grid">{keys.map((k) => <div key={k.key} className="row between"><span className="small">{t(k.label)}</span><TriBadge v={(["yes", "partial", "no"].includes(d[k.key] as string) ? d[k.key] : "unknown") as Tri} /></div>)}</div>
    </div>
  );
}

export function FactsView({ focus }: { focus: string | null }) {
  return (
    <>
      <CompareAndFilter schema={FACTS} keys={FACT_KEYS} icon={<Scale size={18} />} intro="Zum Beispiel „Koop“ und „Offline spielbar“ wählen – gezeigt werden nur Spiele, bei denen beides mit „Ja“ eingetragen ist." />
      <CollectionView key={`f${focus ?? ""}`} schema={FACTS} icon={<ListChecks size={18} />} focus={focus}
        intro={t("Was ein Spiel kann – von dir eingetragen, mit Quelle und Stand. Unbekanntes bleibt „Unbekannt“ und wird nirgends als Ja gezählt. Der Gruppen-Finder nutzt Crossplay nur mit Quelle.")}
        cardExtra={(e) => knownBadge(e.data, FACT_KEYS)} detail={(e) => <TriList d={e.data} keys={FACT_KEYS} />} />
    </>
  );
}

export function AccessView({ focus }: { focus: string | null }) {
  return (
    <>
      <CompareAndFilter schema={ACCESS} keys={ACCESS_KEYS} icon={<Accessibility size={18} />} intro="Wähle, was du brauchst – z. B. Untertitel-Größe und frei belegbare Tasten. So findest du Spiele, die zu dir passen." />
      <CollectionView key={`a${focus ?? ""}`} schema={ACCESS} icon={<Accessibility size={18} />} focus={focus}
        intro={t("Barrierefreiheits-Optionen je Spiel, mit Quelle. Was nicht geprüft ist, steht als „Unbekannt“ da – so verlässt sich niemand auf eine Vermutung.")}
        cardExtra={(e) => knownBadge(e.data, ACCESS_KEYS)} detail={(e) => <TriList d={e.data} keys={ACCESS_KEYS} />} />
    </>
  );
}

// ------------------------------------------------------------------------------------------ F16

interface Row { kind?: string; name?: string; contents?: string; platform?: string; price?: number | null; priceSource?: string | null; owned?: boolean; confirmed?: boolean }

function EditionsDetail({ d }: { d: Data }) {
  const rows = ((d.rows as Row[] | undefined) ?? []);
  const m = useMemo(() => editionMatrix(rows), [rows]);
  const dup = useMemo(() => duplicates(rows), [rows]);
  if (!rows.length) return <span className="small muted">{t("Noch keine Editionen oder DLCs eingetragen.")}</span>;
  return (
    <div className="stack-sm">
      {dup.wouldDuplicate.map((x) => (
        <Banner key={x.row} kind="warn">{x.all
          ? t("„{n}“ würdest du komplett doppelt kaufen – alles darin hast du schon.", { n: x.name })
          : t("„{n}“ enthält Dinge, die du schon hast: {l}", { n: x.name, l: x.items.map((i) => `${i.item} (${t("über {v}", { v: i.via })})`).join(", ") })}</Banner>
      ))}
      {dup.paidTwice.length > 0 && <Banner kind="warn">{t("Doppelt in deinem Besitz: {l}", { l: dup.paidTwice.map((x) => `${x.item} (${x.rows.join(", ")})`).join("; ") })}</Banner>}
      {m.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("Inhalt")}</th>{rows.map((r, i) => <th key={i}>{r.name}{r.owned ? " ✓" : ""}<div className="tiny muted">{r.confirmed ? t("bestätigt") : t("unbestätigt")}</div></th>)}</tr></thead>
            <tbody>
              {m.items.map((it, i) => <tr key={it}><td>{it}</td>{m.has[i].map((h, j) => <td key={j}>{h ? "✓" : ""}</td>)}</tr>)}
              <tr><td>{t("Preis")}</td>{rows.map((r, i) => <td key={i}>{r.price != null && r.priceSource ? <a href={r.priceSource} target="_blank" rel="noopener noreferrer">{money(Math.round(r.price * 100), "EUR")}</a> : <span className="tiny muted">{t("kein belegter Preis")}</span>}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <span className="tiny muted">{t("Preise nur mit Quelle und nur so, wie du sie eingetragen hast – sie können sich im Shop inzwischen geändert haben.")}</span>
    </div>
  );
}

export function EditionsView({ focus }: { focus: string | null }) {
  return (
    <CollectionView key={`ed${focus ?? ""}`} schema={EDITIONS} icon={<Layers size={18} />} focus={focus}
      intro={t("Editionen, DLCs und Pässe eines Spiels nebeneinander: was steckt wo drin, was hast du schon (selbst markiert) – und wo würdest du doppelt kaufen.")}
      cardExtra={(e) => { const r = (e.data.rows as Row[] | undefined) ?? []; const dup = duplicates(r).wouldDuplicate.length; return <span className="row" style={{ gap: 4 }}><span className="badge">{t("{n} Einträge", { n: r.length })}</span>{dup > 0 && <span className="badge warn">{t("Doppelkauf-Hinweis")}</span>}</span>; }}
      detail={(e) => <EditionsDetail d={e.data} />} />
  );
}
