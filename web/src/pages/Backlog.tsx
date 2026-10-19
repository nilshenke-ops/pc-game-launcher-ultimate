import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Dices, Download, ListTodo, Play, Plus, Search, Upload, X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { duration, gradientFor, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { matches, pickRandom, planImport, priorityLabel, sortItems, STATUSES, statusLabel, toCsv, toExport, type BacklogSort, type ImportPlan, type PlayFilter, type PlayStats } from "../lib/backlog";
import { Banner, Button, Card, Empty, Field, Loadable, Meter, Modal, PageHead, Thumb } from "../components/ui";

interface HistoryStats { stats: { itemId: string; totalMinutes: number; lastPlayed: string }[] }

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Backlog() {
  const lib = useRpc<{ items: LibraryItem[]; running: string[] }>("library.list", {}, ["library"]);
  const hist = useRpc<HistoryStats>("history.get", {}, ["history"]);
  const canManage = useCan("manage");
  const [statuses, setStatuses] = useState<string[]>(["backlog", "next", "playing", "paused"]);
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [play, setPlay] = useState<PlayFilter>("all");
  const [sort, setSort] = useState<BacklogSort>("priority");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [random, setRandom] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const games = useMemo(() => (lib.data?.items ?? []).filter((i) => i.kind === "game"), [lib.data]);
  const stats = useMemo(() => new Map<string, PlayStats>((hist.data?.stats ?? []).map((s) => [s.itemId, { totalMinutes: s.totalMinutes, lastPlayed: s.lastPlayed }])), [hist.data]);
  const inBacklog = games.filter((g) => g.backlog);
  const shown = useMemo(() => sortItems(inBacklog.filter((i) => matches(i, { statuses, source: source || undefined, category: category || undefined, play, search }, stats)), sort, stats),
    [inBacklog, statuses, source, category, play, search, sort, stats]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, inBacklog.filter((i) => i.backlog === s).length])), [inBacklog]);
  const sources = [...new Set(inBacklog.map((i) => i.source))];
  const categories = [...new Set(inBacklog.flatMap((i) => i.categories))].sort();

  const update = (i: LibraryItem, patch: Partial<Pick<LibraryItem, "backlog" | "priority" | "goalHours">>) =>
    client.call("library.update", { id: i.id, ...patch, ...(patch.backlog === null ? { backlog: "" } : {}), ...(patch.goalHours === null ? { goalHours: 0 } : {}) }).catch((e: Error) => toast(e.message, "error"));
  const launch = (i: LibraryItem) => client.call("library.launch", { id: i.id }).then(() => toast(t("{name} wird gestartet", { name: i.name }), "success"), (e: Error) => toast(e.message, "error"));
  const toggleStatus = (s: string) => setStatuses((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  const importFile = async (f: File) => {
    try {
      if (f.size > 2_000_000) throw new Error(t("Datei ist zu groß (max. 2 MB)."));
      setPlan(planImport(JSON.parse(await f.text()), games));
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const applyImport = async () => {
    if (!plan) return;
    let ok = 0;
    for (const m of plan.matched.filter((x) => x.changes.length > 0)) {
      try { await client.call("library.update", { id: m.item.id, backlog: m.entry.status, priority: m.entry.priority ?? 0, goalHours: m.entry.goalHours ?? 0 }); ok++; }
      catch (e) { toast(`${m.item.name}: ${(e as Error).message}`, "error"); }
    }
    toast(t("{n} Spiele übernommen", { n: ok }), "success");
    setPlan(null);
  };

  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Backlog")} text={t("Was du noch spielen willst, gerade spielst oder durchgespielt hast. Den Status setzt nur du – nichts wird automatisch als durchgespielt markiert. Spielzeit kommt aus dem Gaming-Verlauf.")}
        actions={<>
          <Button icon={<Dices size={16} />} onClick={() => setRandom(true)} disabled={inBacklog.length === 0}>{t("Zufallsauswahl")}</Button>
          {canManage && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t("Spiele hinzufügen")}</Button>}
        </>} />
      <Loadable loading={lib.loading} error={lib.error} onRetry={lib.reload}>
        <div className="stack">
          <div className="chips" role="group" aria-label={t("Status")}>
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={statuses.includes(s)} className={`chip ${statuses.includes(s) ? "on" : ""}`} onClick={() => toggleStatus(s)}>
                {statusLabel(s)} <span className="muted">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <div className="input-icon grow" style={{ minWidth: 200 }}><Search size={17} /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Suchen (Name, Notiz)")} aria-label={t("Backlog durchsuchen")} /></div>
            <select className="input" style={{ width: "auto" }} value={source} onChange={(e) => setSource(e.target.value)} aria-label={t("Plattform")}>
              <option value="">{t("Alle Plattformen")}</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {categories.length > 0 && (
              <select className="input" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("Kategorie")}>
                <option value="">{t("Alle Kategorien")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <select className="input" style={{ width: "auto" }} value={play} onChange={(e) => setPlay(e.target.value as PlayFilter)} aria-label={t("Spielzeit")}>
              <option value="all">{t("Jede Spielzeit")}</option><option value="never">{t("Noch nie gespielt")}</option><option value="lt1">{t("Unter 1 Stunde")}</option>
              <option value="1to10">{t("1–10 Stunden")}</option><option value="gt10">{t("Über 10 Stunden")}</option>
            </select>
            <select className="input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value as BacklogSort)} aria-label={t("Sortierung")}>
              <option value="priority">{t("Priorität")}</option><option value="name">{t("Name")}</option><option value="lastPlayed">{t("Zuletzt gespielt")}</option>
              <option value="playtime">{t("Spielzeit")}</option><option value="changed">{t("Zuletzt geändert")}</option>
            </select>
          </div>

          {inBacklog.length === 0 ? (
            <Empty icon={<ListTodo size={28} />} title={t("Noch nichts im Backlog")} text={t("Füge Spiele aus deiner Bibliothek hinzu und gib ihnen einen Status und eine Priorität.")}
              action={canManage ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t("Spiele hinzufügen")}</Button> : undefined} />
          ) : shown.length === 0 ? (
            <Empty icon={<Search size={28} />} title={t("Kein Spiel passt zu den Filtern")} />
          ) : (
            <div className="list">
              {shown.map((i) => {
                const st = stats.get(i.id);
                const hours = (st?.totalMinutes ?? 0) / 60;
                const running = lib.data?.running.includes(i.id);
                return (
                  <div key={i.id} className="list-item backlog-item">
                    <Thumb name={i.name} icon={i.iconData} cover={i.coverUrl} gradient={gradientFor(i.name)} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title ellipsis">{i.name}{running && <span className="badge ok" style={{ marginLeft: 6 }}>{t("läuft")}</span>}</div>
                      <div className="sub">
                        {st ? t("{d} gespielt · zuletzt {r}", { d: duration(st.totalMinutes), r: relTime(st.lastPlayed!) }) : t("Noch nicht gespielt (laut Verlauf)")}
                        {running && i.backlog !== "playing" && i.backlog !== "completed" && canManage && (
                          <> · <button type="button" className="link" onClick={() => update(i, { backlog: "playing" })}>{t("auf „Gerade aktiv“ setzen")}</button></>
                        )}
                      </div>
                      {i.goalHours ? <div className="row nowrap small" style={{ gap: 8, marginTop: 4 }}><Meter value={Math.min(100, (hours / i.goalHours) * 100)} /><span className="muted nowrap">{hours.toFixed(1)} / {i.goalHours} h</span></div> : null}
                      {i.notes && <div className="tiny muted ellipsis">{i.notes}</div>}
                    </div>
                    <div className="row nowrap backlog-controls">
                      <select className="input" value={i.backlog ?? ""} disabled={!canManage} onChange={(e) => update(i, { backlog: e.target.value || null })} aria-label={t("Status von {n}", { n: i.name })}>
                        {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                        <option value="">{t("Aus dem Backlog entfernen")}</option>
                      </select>
                      <select className="input" value={i.priority ?? 0} disabled={!canManage} onChange={(e) => update(i, { priority: Number(e.target.value) })} aria-label={t("Priorität von {n}", { n: i.name })}>
                        {[3, 2, 1, 0].map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
                      </select>
                      <GoalInput item={i} disabled={!canManage} onSave={(h) => update(i, { goalHours: h })} />
                      <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => launch(i)} aria-label={t("{name} starten", { name: i.name })} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Card title={t("Wunschliste, Export und Import")}>
            <div className="stack-sm small">
              <span className="muted">{t("Spiele, die du noch nicht besitzt, stehen auf der Wunschliste im Deal Radar (mit Zielpreis).")} <Link to="/deals">{t("Zum Deal Radar")}</Link></span>
              <div className="row">
                <Button size="sm" icon={<Download size={15} />} disabled={inBacklog.length === 0} onClick={() => download(`backlog-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(toExport(games), null, 2), "application/json")}>{t("Export (JSON)")}</Button>
                <Button size="sm" icon={<Download size={15} />} disabled={inBacklog.length === 0} onClick={() => download(`backlog-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(games, stats), "text/csv")}>{t("Tabelle (CSV)")}</Button>
                {canManage && <Button size="sm" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>{t("Import (JSON)")}</Button>}
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
              </div>
              <span className="tiny muted">{t("Der Import ordnet Einträge den Spielen in deiner Bibliothek zu (gleicher Launcher und Eintrag, sonst gleicher Name) und zeigt vorher, was sich ändert. Spiele, die es hier nicht gibt, werden nicht angelegt. Das Backup enthält den Backlog ebenfalls.")}</span>
            </div>
          </Card>
        </div>
      </Loadable>
      {adding && <AddDialog games={games.filter((g) => !g.backlog)} onClose={() => setAdding(false)} />}
      {random && <RandomDialog games={inBacklog} onLaunch={launch} onClose={() => setRandom(false)} />}
      {plan && (
        <Modal title={t("Backlog importieren")} onClose={() => setPlan(null)}
          footer={<><Button onClick={() => setPlan(null)}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!plan.matched.some((m) => m.changes.length)} onClick={applyImport}>{t("Übernehmen")}</Button></>}>
          <div className="stack-sm small">
            <b>{t("{n} Spiele werden geändert", { n: plan.matched.filter((m) => m.changes.length).length })}</b>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {plan.matched.filter((m) => m.changes.length).slice(0, 50).map((m) => <li key={m.item.id}><b>{m.item.name}</b>: {m.changes.join(", ")}</li>)}
            </ul>
            {plan.matched.some((m) => !m.changes.length) && <span className="muted">{t("{n} Spiele sind bereits gleich.", { n: plan.matched.filter((m) => !m.changes.length).length })}</span>}
            {plan.unmatched.length > 0 && <Banner kind="warn">{t("Nicht in dieser Bibliothek (werden übersprungen): {l}", { l: plan.unmatched.slice(0, 10).map((u) => u.name).join(", ") + (plan.unmatched.length > 10 ? " …" : "") })}</Banner>}
            {plan.invalid > 0 && <Banner kind="warn">{t("{n} fehlerhafte Einträge werden ignoriert.", { n: plan.invalid })}</Banner>}
          </div>
        </Modal>
      )}
    </>
  );
}

function GoalInput({ item, disabled, onSave }: { item: LibraryItem; disabled: boolean; onSave: (h: number | null) => void }) {
  const [v, setV] = useState(item.goalHours ? String(item.goalHours) : "");
  const commit = () => {
    const n = v.trim() === "" ? null : Number(v.replace(",", "."));
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 10000)) { toast(t("Ziel muss zwischen 0 und 10 000 Stunden liegen."), "error"); return; }
    if ((n ?? null) !== (item.goalHours ?? null)) onSave(n && n > 0 ? n : null);
  };
  return <input className="input goal-input" inputMode="decimal" value={v} disabled={disabled} placeholder={t("Ziel h")} aria-label={t("Ziel in Stunden für {n}", { n: item.name })}
    onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function AddDialog({ games, onClose }: { games: LibraryItem[]; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("backlog");
  const [q, setQ] = useState("");
  const list = games.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const add = async () => {
    for (const id of sel) await client.call("library.update", { id, backlog: status }).catch((e: Error) => toast(e.message, "error"));
    toast(t("{n} Spiele zum Backlog hinzugefügt", { n: sel.size }), "success");
    onClose();
  };
  return (
    <Modal title={t("Spiele zum Backlog hinzufügen")} onClose={onClose}
      footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" disabled={sel.size === 0} onClick={add}>{t("{n} hinzufügen", { n: sel.size })}</Button></>}>
      <div className="stack-sm">
        {games.length === 0 ? <p className="muted small">{t("Alle Spiele der Bibliothek sind schon im Backlog.")}</p> : <>
          <div className="row">
            <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Suchen")} aria-label={t("Spiele suchen")} />
            <Field label={t("Status")}><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></Field>
          </div>
          <div className="list" style={{ maxHeight: "50vh", overflow: "auto" }}>
            {list.map((g) => (
              <label key={g.id} className="list-item checkbox">
                <input type="checkbox" checked={sel.has(g.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(g.id); else n.delete(g.id); return n; })} />
                <span className="grow">{g.name}</span><span className="tiny muted">{g.source}</span>
              </label>
            ))}
          </div>
        </>}
      </div>
    </Modal>
  );
}

function RandomDialog({ games, onLaunch, onClose }: { games: LibraryItem[]; onLaunch: (i: LibraryItem) => void; onClose: () => void }) {
  const [from, setFrom] = useState<string[]>(["backlog", "next"]);
  const [weighted, setWeighted] = useState(true);
  const pool = games.filter((g) => from.includes(g.backlog ?? ""));
  const [pick, setPick] = useState<LibraryItem | null>(null);
  const roll = () => setPick(pickRandom(pool, weighted));
  return (
    <Modal title={t("Zufallsauswahl")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Schließen")}</Button><Button variant="primary" icon={<Dices size={16} />} disabled={pool.length === 0} onClick={roll}>{pick ? t("Nochmal") : t("Auswählen")}</Button></>}>
      <div className="stack">
        <div className="chips" role="group" aria-label={t("Auswählen aus")}>
          {STATUSES.map((s) => <button key={s} type="button" aria-pressed={from.includes(s)} className={`chip ${from.includes(s) ? "on" : ""}`} onClick={() => { setPick(null); setFrom((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s])); }}>{statusLabel(s)}</button>)}
        </div>
        <label className="checkbox small"><input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} />{t("Höhere Priorität öfter ziehen")}</label>
        <span className="small muted">{t("{n} Spiele im Topf", { n: pool.length })}</span>
        {pick && (
          <div className="list-item" style={{ alignItems: "center" }}>
            <Thumb name={pick.name} icon={pick.iconData} cover={pick.coverUrl} gradient={gradientFor(pick.name)} />
            <div className="grow"><div className="title">{pick.name}</div><div className="sub">{statusLabel(pick.backlog ?? "")} · {t("Priorität")}: {priorityLabel(pick.priority ?? 0)}</div></div>
            <Button variant="primary" icon={<Play size={15} />} onClick={() => onLaunch(pick)}>{t("Spielen")}</Button>
            <Button variant="ghost" icon={<X size={15} />} aria-label={t("Verwerfen")} onClick={() => setPick(null)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
