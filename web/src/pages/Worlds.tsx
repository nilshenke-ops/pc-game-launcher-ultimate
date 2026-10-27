// Welten & Bauen: Minecraft world archive (coordinates, POIs, Nether ↔ Overworld), build projects (tasks, materials,
// progress from the tasks), map markers (list, table, groups – on a map only with an own map picture).

import { useRef, useState, type ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
import { useSearchParams } from "react-router-dom";
import { Globe2, Hammer, MapPin } from "lucide-react";
import { t } from "../lib/i18n";
import { useJournal, type Entry } from "../lib/journal";
import { distance, groupBy, markerPos, materialProgress, netherToOverworld, overworldToNether, taskProgress, type Data } from "../lib/collections";
import { MARKERS, PROJECT, WORLD } from "../lib/collection-schemas";
import { CollectionView } from "../components/collection-view";
import { JImage, SyncBadge } from "../components/journal-ui";
import { Banner, Meter, PageHead } from "../components/ui";

type Tab = "world" | "project" | "markers";
const TABS: Tab[] = ["world", "project", "markers"];

export default function WorldsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "world") as Tab;
  const focus = params.get("id");
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Welten & Bauen")} text={t("Minecraft-Welten mit Koordinaten, Bauprojekte mit Aufgaben und Material, Karten-Marker – auf diesem Gerät gespeichert, auch ohne PC.")} actions={<SyncBadge />} />
      <div className="stack">
        <PageTabs page="worlds" tabs={[["world", <Globe2 size={15} />, t("Minecraft-Welten")], ["project", <Hammer size={15} />, t("Bauprojekte")], ["markers", <MapPin size={15} />, t("Karten-Marker")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
        {tab === "world" && <CollectionView key="w" schema={WORLD} icon={<Globe2 size={18} />} focus={focus}
          intro={t("Nexus liest keine Spielstände und zeichnet keine Karte: Koordinaten und Orte trägst du selbst ein (im Spiel F3 bzw. „Koordinaten anzeigen“).")}
          cardExtra={(e) => <span className="tiny muted">{t("{n} Orte", { n: ((e.data.pois as Data[]) ?? []).length })}</span>}
          detail={(e) => <WorldTools e={e} />} />}
        {tab === "project" && <CollectionView key="p" schema={PROJECT} icon={<Hammer size={18} />} focus={focus}
          cardExtra={(e) => { const p = taskProgress((e.data.tasks as Data[]) ?? []); return <span className="stack-sm" style={{ width: "100%" }}><Meter value={p.percent} /><span className="tiny muted">{t("{d} von {n} Aufgaben", { d: p.done, n: p.total })}</span></span>; }}
          detail={(e, save) => <ProjectTools e={e} save={save} />} />}
        {tab === "markers" && <CollectionView key="m" schema={MARKERS} icon={<MapPin size={18} />} focus={focus}
          intro={t("Liste, Tabelle und Gruppen gehen immer. Auf einer Karte erscheinen Marker nur, wenn du ein eigenes Kartenbild hinzufügst – dann tippst du die Stellen selbst an.")}
          cardExtra={(e) => <span className="tiny muted">{t("{n} Marker", { n: ((e.data.markers as Data[]) ?? []).length })}{e.data.mapImage ? " · " + t("mit Kartenbild") : ""}</span>}
          detail={(e, save) => <MarkerTools e={e} save={save} />} />}
      </div>
    </>
  );
}

function WorldTools({ e }: { e: Entry<Data> }) {
  const pois = (e.data.pois as Data[]) ?? [];
  const projects = useJournal<Data>("project").filter((p) => p.data.worldId === e.id);
  const [from, setFrom] = useState<"overworld" | "nether">("overworld");
  const [x, setX] = useState(""), [z, setZ] = useState(""), [y, setY] = useState("64");
  const [a, setA] = useState(0), [b, setB] = useState(1);
  const nx = Number(x), nz = Number(z), ny = Number(y) || 0;
  const conv = Number.isFinite(nx) && Number.isFinite(nz) && x !== "" && z !== "" ? (from === "overworld" ? overworldToNether({ x: nx, y: ny, z: nz }) : netherToOverworld({ x: nx, y: ny, z: nz })) : null;
  const pa = pois[a], pb = pois[b];
  const dimLabel = (d: unknown) => d === "nether" ? t("Nether") : d === "end" ? t("End") : t("Oberwelt");
  return (
    <div className="stack">
      <div className="j-item">
        <b className="small">{t("Nether ↔ Oberwelt umrechnen")}</b>
        <span className="tiny muted">{t("Regel des Spiels: 1 Block im Nether = 8 Blöcke in der Oberwelt (X und Z), Y bleibt.")}</span>
        <div className="row" style={{ gap: 6 }}>
          <select className="input" style={{ maxWidth: 160 }} value={from} onChange={(ev) => setFrom(ev.target.value as "overworld" | "nether")} aria-label={t("Von")}><option value="overworld">{t("Von Oberwelt")}</option><option value="nether">{t("Von Nether")}</option></select>
          <input className="input" style={{ maxWidth: 110 }} inputMode="numeric" placeholder="X" aria-label="X" value={x} onChange={(ev) => setX(ev.target.value)} />
          <input className="input" style={{ maxWidth: 90 }} inputMode="numeric" placeholder="Y" aria-label="Y" value={y} onChange={(ev) => setY(ev.target.value)} />
          <input className="input" style={{ maxWidth: 110 }} inputMode="numeric" placeholder="Z" aria-label="Z" value={z} onChange={(ev) => setZ(ev.target.value)} />
        </div>
        {conv && <span className="small"><b>{from === "overworld" ? t("Im Nether") : t("In der Oberwelt")}:</b> X {conv.x} · Y {conv.y} · Z {conv.z}</span>}
      </div>
      {pois.length >= 2 && (
        <div className="j-item">
          <b className="small">{t("Abstand zwischen zwei Orten")}</b>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" style={{ maxWidth: 220 }} value={a} onChange={(ev) => setA(Number(ev.target.value))} aria-label={t("Ort A")}>{pois.map((p, i) => <option key={i} value={i}>{String(p.name)}</option>)}</select>
            <select className="input" style={{ maxWidth: 220 }} value={b} onChange={(ev) => setB(Number(ev.target.value))} aria-label={t("Ort B")}>{pois.map((p, i) => <option key={i} value={i}>{String(p.name)}</option>)}</select>
          </div>
          {pa && pb && (pa.dim !== pb.dim ? <span className="tiny muted">{t("Die Orte liegen in verschiedenen Dimensionen ({a} / {b}) – rechne einen erst um.", { a: dimLabel(pa.dim), b: dimLabel(pb.dim) })}</span>
            : (() => { const d = distance({ x: Number(pa.x), y: pa.y == null ? null : Number(pa.y), z: Number(pa.z) }, { x: Number(pb.x), y: pb.y == null ? null : Number(pb.y), z: Number(pb.z) });
              return <span className="small">{t("{n} Blöcke Luftlinie", { n: d.blocks })}{!d.withY && <span className="tiny muted"> · {t("ohne Höhe (Y fehlt bei einem Ort)")}</span>}</span>; })())}
        </div>
      )}
      {projects.length > 0 && (
        <div className="stack-sm">
          <b className="small">{t("Bauprojekte in dieser Welt")}</b>
          {projects.map((p) => { const pr = taskProgress((p.data.tasks as Data[]) ?? []); return <div key={p.id} className="row nowrap small" style={{ gap: 8 }}><span className="grow">{String(p.data.title)}</span><Meter value={pr.percent} /><span className="tiny muted">{pr.percent} %</span></div>; })}
        </div>
      )}
    </div>
  );
}

function ProjectTools({ e, save }: { e: Entry<Data>; save: (d: Data) => void }) {
  const tasks = (e.data.tasks as Data[]) ?? [];
  const p = taskProgress(tasks);
  const m = materialProgress(((e.data.materials as Data[]) ?? []).map((r) => ({ needed: Number(r.needed ?? 0), have: Number(r.have ?? 0), item: r.item })) as { needed: number; have: number }[]);
  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="row between"><b className="small">{t("Fortschritt")}</b><span className="tiny muted">{t("{d} von {n} Aufgaben", { d: p.done, n: p.total })}</span></div>
        <Meter value={p.percent} />
        {tasks.length === 0 && <span className="tiny muted">{t("Noch keine Aufgaben – der Fortschritt wird nur aus Aufgaben berechnet.")}</span>}
        <div className="stack-sm">{tasks.map((tk, i) => (
          <label key={i} className="checkbox"><input type="checkbox" checked={!!tk.done} onChange={() => save({ ...e.data, tasks: tasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} /><span className={tk.done ? "muted" : ""}>{String(tk.text ?? "")}</span></label>
        ))}</div>
      </div>
      {m.need > 0 && (
        <div className="stack-sm">
          <div className="row between"><b className="small">{t("Material")}</b><span className="tiny muted">{m.have} / {m.need} ({m.percent} %)</span></div>
          <Meter value={m.percent} />
          {m.missing.length > 0 && <span className="tiny muted">{t("Fehlt noch")}: {(m.missing as unknown as Data[]).map((r) => `${String(r.item)} ${Number(r.needed) - Number(r.have ?? 0)}`).join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

function MarkerTools({ e, save }: { e: Entry<Data>; save: (d: Data) => void }) {
  const markers = (e.data.markers as Data[]) ?? [];
  const [sel, setSel] = useState<number | "new">("new");
  const box = useRef<HTMLDivElement>(null);
  const groups = groupBy(markers, "group", t("Ohne Gruppe"));
  const place = (ev: React.MouseEvent) => {
    const img = box.current?.querySelector("img");
    if (!img) return;
    const pos = markerPos(ev.clientX, ev.clientY, img.getBoundingClientRect());
    if (!pos) return;
    if (sel === "new") save({ ...e.data, markers: [...markers, { name: t("Marker {n}", { n: markers.length + 1 }), ...pos, done: false }] });
    else save({ ...e.data, markers: markers.map((m, i) => (i === sel ? { ...m, ...pos } : m)) });
  };
  return (
    <div className="stack">
      {e.data.mapImage ? (
        <div className="stack-sm">
          <div className="row" style={{ gap: 6 }}>
            <span className="small">{t("Antippen setzt")}:</span>
            <select className="input" style={{ maxWidth: 240 }} value={String(sel)} onChange={(ev) => setSel(ev.target.value === "new" ? "new" : Number(ev.target.value))} aria-label={t("Marker zum Setzen")}>
              <option value="new">{t("Neuen Marker")}</option>{markers.map((m, i) => <option key={i} value={i}>{String(m.name)}</option>)}
            </select>
          </div>
          <div ref={box} className="marker-map" onClick={place} role="application" aria-label={t("Kartenbild – antippen, um einen Marker zu setzen")}>
            <JImage id={String(e.data.mapImage)} />
            {markers.map((m, i) => m.px != null && m.py != null ? <span key={i} className={`marker-dot ${m.done ? "done" : ""}`} style={{ left: `${Number(m.px) * 100}%`, top: `${Number(m.py) * 100}%` }} title={String(m.name)}><span>{String(m.name)}</span></span> : null)}
          </div>
        </div>
      ) : <Banner kind="info">{t("Kein Kartenbild – Marker stehen als Liste und Tabelle. Füge unter „Bearbeiten“ einen Screenshot der Karte hinzu, um sie darauf zu setzen.")}</Banner>}
      {groups.map(([g, rows]) => (
        <div key={g} className="stack-sm">
          <b className="small">{g} ({rows.length})</b>
          {rows.map((m) => { const i = markers.indexOf(m); return (
            <label key={i} className="checkbox"><input type="checkbox" checked={!!m.done} onChange={() => save({ ...e.data, markers: markers.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
              <span className={m.done ? "muted" : ""}>{String(m.name)}{m.x != null && m.y != null ? <span className="tiny muted"> · X {String(m.x)} · Y {String(m.y)}</span> : null}{m.note ? <span className="tiny muted"> · {String(m.note)}</span> : null}</span></label>
          ); })}
        </div>
      ))}
    </div>
  );
}

