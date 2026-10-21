// Builds & Technik: build/loadout archive (compare two), mod collections with version notes (status only as marked by
// you – nothing installed or downloaded), graphics comparison with a slider over two own screenshots, controls lexicon.

import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Columns2, Gamepad2, Package, Swords } from "lucide-react";
import { t } from "../lib/i18n";
import { useJournal, type Entry } from "../lib/journal";
import { compareRows, groupBy, type Data } from "../lib/collections";
import { BUILD, CONTROLS, GFX, MODLIST } from "../lib/collection-schemas";
import { CollectionView } from "../components/collection-view";
import { JImage, SyncBadge } from "../components/journal-ui";
import { PageHead } from "../components/ui";

type Tab = "build" | "modlist" | "gfx" | "controls";
const TABS: Tab[] = ["build", "modlist", "gfx", "controls"];

export default function BuildsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "build") as Tab;
  const focus = params.get("id");
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Builds & Technik")} text={t("Builds und Loadouts, Mod-Sammlungen, Grafikvergleiche und Steuerung – auf diesem Gerät gespeichert, auch ohne PC.")} actions={<SyncBadge />} />
      <div className="stack">
        <div className="chips j-tabs" role="tablist" aria-label={t("Bereich")}>
          {([["build", <Swords size={15} />, t("Builds")], ["modlist", <Package size={15} />, t("Mod-Sammlungen")], ["gfx", <Columns2 size={15} />, t("Grafikvergleich")], ["controls", <Gamepad2 size={15} />, t("Steuerung")]] as [Tab, ReactNode, string][]).map(([v, icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => setParams({ tab: v }, { replace: true })}>{icon}{label}</button>
          ))}
        </div>
        {tab === "build" && <CollectionView key="b" schema={BUILD} icon={<Swords size={18} />} focus={focus} detail={(e) => <BuildCompare e={e} />} />}
        {tab === "modlist" && <CollectionView key="m" schema={MODLIST} icon={<Package size={18} />} focus={focus}
          intro={<>{t("Hier notierst du Mods und Versionen. Nexus markiert nichts selbst als installiert und lädt nichts herunter. Mods in einem Ordner am PC an- und ausschalten: ")}<Link to="/mods">{t("Mods")}</Link></>}
          cardExtra={(e) => { const m = (e.data.mods as Data[]) ?? []; return <span className="tiny muted">{t("{n} Mods · {i} als installiert markiert", { n: m.length, i: m.filter((x) => x.status === "installed").length })}</span>; }}
          detail={(e) => <ModSummary e={e} />} />}
        {tab === "gfx" && <CollectionView key="g" schema={GFX} icon={<Columns2 size={18} />} focus={focus}
          intro={t("Zwei eigene Screenshots derselben Stelle mit unterschiedlichen Einstellungen – mit dem Schieber vergleichen. Aus Bildern wird keine Bildrate abgeleitet.")}
          detail={(e) => <GfxSlider e={e} />} />}
        {tab === "controls" && <CollectionView key="c" schema={CONTROLS} icon={<Gamepad2 size={18} />} focus={focus}
          intro={t("„Offiziell“ nur mit Quelle (z. B. Handbuch oder Seite des Herstellers) – alles andere ist deine eigene Angabe und wird so angezeigt.")}
          detail={(e) => <ControlsView e={e} />} />}
      </div>
    </>
  );
}

function BuildCompare({ e }: { e: Entry<Data> }) {
  const builds = useJournal<Data>("build").filter((b) => b.id !== e.id);
  const [other, setOther] = useState("");
  const o = builds.find((b) => b.id === other);
  const rows = o ? compareRows(((e.data.props as { name: string; value: string }[]) ?? []), ((o.data.props as { name: string; value: string }[]) ?? [])) : [];
  if (!builds.length) return null;
  return (
    <div className="j-item">
      <b className="small">{t("Mit anderem Build vergleichen")}</b>
      <select className="input" style={{ maxWidth: 320 }} value={other} onChange={(ev) => setOther(ev.target.value)} aria-label={t("Vergleichen mit")}><option value="">{t("Build wählen …")}</option>{builds.map((b) => <option key={b.id} value={b.id}>{String(b.data.title)}</option>)}</select>
      {o && (rows.length === 0 ? <span className="tiny muted">{t("Beide haben noch keine Eigenschaften.")}</span> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t("Eigenschaft")}</th><th>{String(e.data.title)}</th><th>{String(o.data.title)}</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name} className={`cmp-${r.state}`}><td>{r.name}</td><td>{r.a ?? <span className="muted">–</span>}</td><td>{r.b ?? <span className="muted">–</span>}</td></tr>)}</tbody>
        </table></div>
      ))}
      {o && <span className="tiny muted">{t("Gelb = unterschiedlich, grau = nur bei einem vorhanden.")}</span>}
    </div>
  );
}

function ModSummary({ e }: { e: Entry<Data> }) {
  const mods = (e.data.mods as Data[]) ?? [];
  const by = (s: string) => mods.filter((m) => m.status === s).length;
  if (!mods.length) return null;
  return <span className="small">{t("{p} geplant · {i} als installiert markiert · {d} deaktiviert · {r} entfernt", { p: by("planned"), i: by("installed"), d: by("disabled"), r: by("removed") })}</span>;
}

function GfxSlider({ e }: { e: Entry<Data> }) {
  const [pos, setPos] = useState(50);
  if (!e.data.imageA || !e.data.imageB) return null;
  return (
    <div className="stack-sm">
      <div className="gfx-compare" style={{ ["--pos" as string]: `${pos}%` }}>
        <JImage id={String(e.data.imageB)} className="gfx-b" />
        <div className="gfx-a"><JImage id={String(e.data.imageA)} /></div>
        <span className="gfx-line" aria-hidden />
        <span className="gfx-tag left">A{e.data.labelA ? `: ${String(e.data.labelA)}` : ""}</span>
        <span className="gfx-tag right">B{e.data.labelB ? `: ${String(e.data.labelB)}` : ""}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(ev) => setPos(Number(ev.target.value))} aria-label={t("Vergleichs-Schieber: links Bild A, rechts Bild B")} />
    </div>
  );
}

function ControlsView({ e }: { e: Entry<Data> }) {
  const rows = (e.data.entries as Data[]) ?? [];
  const dev = (d: unknown) => d === "pad" ? t("Controller") : d === "kbm" ? t("Tastatur & Maus") : t("Sonstiges");
  if (!rows.length) return null;
  return (
    <div className="stack">
      {groupBy(rows, "device", "other").map(([d, list]) => (
        <div key={d} className="stack-sm">
          <b className="small">{dev(d)}</b>
          {list.map((r, i) => (
            <div key={i} className="row nowrap small" style={{ gap: 8 }}>
              <kbd className="kbd">{String(r.input)}</kbd><span className="grow">{String(r.action)}</span>
              {r.origin === "official" && r.source ? <a className="badge ok" href={String(r.source)} target="_blank" rel="noopener noreferrer">{t("Offiziell – Quelle")}</a> : <span className="badge">{t("Eigene Angabe")}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
