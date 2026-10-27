// Update explainer (F13): official patch notes (pasted, or loaded through the PC from Steam's own announcements),
// sorted line by line into gameplay / new content / fixes / technical. The original stays untouched and is always
// shown; the sorting and the short version only reuse the original's own sentences and are labelled as such.

import { useMemo, useState } from "react";
import { CheckCheck, Download, FileText, ScrollText } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useConn, useRpc } from "../lib/hooks";
import { newId, useJournal, type Entry } from "../lib/journal";
import type { Data } from "../lib/collections";
import type { LibraryItem } from "../lib/types";
import { PATCH } from "../lib/collection-schemas";
import { patchDigest, PATCH_CATS, sortPatch, type PatchCat } from "../lib/infos";
import { CollectionView } from "./collection-view";
import { trySave } from "./journal-ui";
import { Banner, Button, Card, Segmented } from "./ui";

export const CAT_LABEL: Record<PatchCat, string> = { gameplay: "Gameplay & Balance", content: "Neue Inhalte", fixes: "Fehlerbehebungen", technical: "Technik & Leistung", other: "Sonstiges" };

function PatchDetail({ e, save }: { e: Entry<Data>; save: (d: Data) => void }) {
  const [view, setView] = useState<"sorted" | "short" | "original">("sorted");
  const sorted = useMemo(() => sortPatch(String(e.data.original ?? "")), [e.data.original]);
  const digest = patchDigest(sorted.lines);
  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Segmented value={view} onChange={setView} label={t("Ansicht")} options={[{ value: "sorted", label: t("Sortiert") }, { value: "short", label: t("Kurzfassung") }, { value: "original", label: t("Original") }]} />
        {!e.data.read && <Button size="sm" icon={<CheckCheck size={15} />} onClick={() => save({ ...e.data, read: true })}>{t("Als gelesen markieren")}</Button>}
      </div>
      {view !== "original" && <Banner kind="info">{t("Automatisch nach Stichwörtern und den Überschriften der Entwickler sortiert – jede Zeile ist wörtlich aus dem Original. Nichts wird hinzugefügt oder umformuliert. Im Zweifel gilt das Original.")}</Banner>}
      {view === "sorted" && PATCH_CATS.map((cat) => {
        const l = sorted.lines.filter((x) => x.cat === cat);
        if (!l.length) return null;
        return (
          <details key={cat} className="patch-cat" open={cat !== "other"}>
            <summary><b className="small">{t(CAT_LABEL[cat])}</b> <span className="badge">{l.length}</span></summary>
            <ul className="patch-lines">{l.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
          </details>
        );
      })}
      {view === "short" && (digest.length === 0 ? <span className="small muted">{t("Kein Text zum Sortieren.")}</span> : (
        <ul className="patch-lines">{digest.map((d) => <li key={d.cat}><b>{t(CAT_LABEL[d.cat])} ({d.count})</b>{d.first.map((f, i) => <div key={i} className="small muted">„{f}“</div>)}{d.count > d.first.length && <div className="tiny muted">{t("… und {n} weitere", { n: d.count - d.first.length })}</div>}</li>)}</ul>
      ))}
      {view === "original" && <pre className="patch-original">{String(e.data.original ?? "")}</pre>}
    </div>
  );
}

interface NewsItem { gid: string; title: string; url: string; date: string; author?: string | null; contents: string; patchNotes: boolean }

/** Loads the official announcements of a Steam game through the PC and takes chosen ones over unchanged. */
function SteamLoader() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const existing = useJournal<Data>(PATCH.kind);
  const steamGames = (lib.data?.items ?? []).filter((i) => i.kind === "game" && i.source === "steam" && /^\d{1,10}$/.test(i.target)).sort((a, b) => a.name.localeCompare(b.name));
  const [appId, setAppId] = useState("");
  const [onlyPatch, setOnlyPatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ appId: string; items: NewsItem[]; source: string } | null>(null);
  const load = async () => {
    setBusy(true);
    try { setRes(await client.call("news.steam", { appId: appId.trim(), count: 10 })); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const take = (n: NewsItem) => {
    const game = lib.data?.items.find((i) => i.source === "steam" && i.target === res?.appId);
    if (trySave(PATCH.kind, newId(), { title: n.title, game: { gameId: game?.id ?? null, gameName: game?.name ?? null }, date: n.date.slice(0, 10), source: n.url, original: n.contents.slice(0, 60000), read: false, steamGid: n.gid, links: [] }))
      toast(t("Übernommen"), "success");
  };
  const items = (res?.items ?? []).filter((n) => !onlyPatch || n.patchNotes);
  return (
    <Card title={t("Offizielle Patchnotes von Steam laden")} icon={<Download size={18} />}>
      {!online ? <span className="small muted">{t("Braucht den PC: Steam erlaubt die Abfrage nicht direkt aus dem Browser. Ohne PC kannst du Patchnotes einfügen (Neu).")}</span> : (
        <div className="stack-sm">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="input" style={{ maxWidth: 260 }} aria-label={t("Spiel")} value={steamGames.some((g) => g.target === appId) ? appId : ""} onChange={(e) => setAppId(e.target.value)}>
              <option value="">{t("Steam-Spiel wählen …")}</option>{steamGames.map((g) => <option key={g.id} value={g.target}>{g.name}</option>)}
            </select>
            <input className="input mono" style={{ maxWidth: 150 }} inputMode="numeric" maxLength={10} placeholder={t("oder App-ID")} aria-label={t("Steam-App-ID")} value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} />
            <Button size="sm" variant="primary" busy={busy} disabled={!appId} onClick={load}>{t("Laden")}</Button>
          </div>
          {res && <>
            <label className="checkbox"><input type="checkbox" checked={onlyPatch} onChange={(e) => setOnlyPatch(e.target.checked)} />{t("Nur als Patchnotes markierte Beiträge")}</label>
            {items.length === 0 ? <span className="small muted">{t("Keine passenden Beiträge in den offiziellen Ankündigungen gefunden.")}</span> : (
              <div className="list">{items.map((n) => {
                const have = existing.some((x) => x.data.steamGid === n.gid);
                return (
                  <div key={n.gid} className="list-item">
                    <FileText size={16} />
                    <div className="grow"><div className="title">{n.title}</div><div className="sub">{new Date(n.date).toLocaleDateString()}{n.patchNotes ? " · " + t("Patchnotes") : ""} · <a href={n.url} target="_blank" rel="noopener noreferrer">{t("Original")}</a></div></div>
                    <Button size="sm" disabled={have} onClick={() => take(n)}>{have ? t("Schon da") : t("Übernehmen")}</Button>
                  </div>
                );
              })}</div>
            )}
            <span className="tiny muted">{t("Quelle: {s}", { s: res.source })}</span>
          </>}
        </div>
      )}
    </Card>
  );
}

export function PatchesView({ focus }: { focus: string | null }) {
  return (
    <>
      <SteamLoader />
      <CollectionView key={`p${focus ?? ""}`} schema={PATCH} icon={<ScrollText size={18} />} focus={focus}
        intro={t("Patchnotes mit Version, Datum und Quelle. Die Sortierung hilft beim Überblick – der Originaltext bleibt unverändert gespeichert. Filter „Gelesen“ und Spiel oben.")}
        cardExtra={(e) => <span className="row" style={{ gap: 4 }}>{e.data.read ? <span className="badge">{t("Gelesen")}</span> : <span className="badge accent">{t("Neu")}</span>}</span>}
        detail={(e, save) => <PatchDetail e={e} save={save} />} />
    </>
  );
}
