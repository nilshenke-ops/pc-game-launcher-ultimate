// The sidebar (and the phone's "Alle Bereiche" sheet): categories that fold, and an edit mode in place – "−" puts a
// section into the folder "Weitere Funktionen", "+" brings it back. Nothing is deleted: removed sections stay one tap
// away in that folder and in the search. Home, Einstellungen and PC verbinden always stay.

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Check, ChevronDown, FolderOpen, Minus, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { arrangeNav, hiddenNav, NAV_FIXED, navColor, type NavItem } from "../lib/nav";
import { setPrefs, usePrefs } from "../lib/prefs";
import { TIDY_HIDDEN, type NavPrefs } from "../lib/prefs-core";
import { readJson, writeJson } from "../lib/rpc";

const FOLDER_KEY = "pgl.nav.folderOpen";
const ic = (path: string, colors: boolean) => (colors ? ({ ["--ic" as string]: navColor(path) }) : undefined);

export function useNavEdit() {
  const prefs = usePrefs();
  const setNav = (fn: (n: NavPrefs) => NavPrefs) => setPrefs((p) => ({ ...p, nav: fn(p.nav) }));
  return {
    nav: prefs.nav,
    remove: (path: string) => { if (!NAV_FIXED.has(path)) setNav((n) => ({ ...n, hidden: [...new Set([...n.hidden, path])] })); },
    add: (path: string) => setNav((n) => ({ ...n, hidden: n.hidden.filter((x) => x !== path) })),
    toggleGroup: (gid: string) => setNav((n) => ({ ...n, collapsed: n.collapsed.includes(gid) ? n.collapsed.filter((x) => x !== gid) : [...n.collapsed, gid] })),
    showAll: () => setNav((n) => ({ ...n, hidden: [] })),
    tidy: () => setNav((n) => ({ ...n, hidden: [...TIDY_HIDDEN] })),
  };
}

export function SidebarNav({ items, notifCount }: { items: NavItem[]; notifCount: number }) {
  const e = useNavEdit();
  const loc = useLocation();
  const [edit, setEdit] = useState(false);
  const [folderOpen, setFolderOpen] = useState(() => { try { return readJson<boolean>(FOLDER_KEY) ?? false; } catch { return false; } });
  const openFolder = (v: boolean) => { setFolderOpen(v); try { writeJson(FOLDER_KEY, v); } catch { /* storage blocked */ } };
  const shown = arrangeNav(items, e.nav);
  const extra = hiddenNav(items, e.nav);
  const groups = [...new Map(shown.map((i) => [i.gid ?? i.group, i.group])).entries()];

  return (
    <div className={`side-nav ${edit ? "editing" : ""}`}>
      <div className={`side-nav-head ${edit ? "" : "corner"}`}>
        {edit ? <b className="small">{t("Seitenleiste ordnen")}</b> : <span />}
        <button type="button" className={`side-edit ${edit ? "on" : ""}`} onClick={() => setEdit(!edit)} aria-pressed={edit}
          aria-label={edit ? t("Ordnen beenden") : t("Seitenleiste ordnen")} title={edit ? t("Fertig") : t("Seitenleiste ordnen")}>
          {edit ? <><Check size={15} /> {t("Fertig")}</> : <Pencil size={14} />}
        </button>
      </div>
      {edit && <p className="tiny muted side-hint">{t("Mit − kommt ein Bereich in „Weitere Funktionen“, mit + wieder zurück. Gelöscht wird nichts.")}</p>}

      {groups.map(([gid, label]) => {
        const list = shown.filter((i) => (i.gid ?? i.group) === gid);
        const folded = !edit && e.nav.collapsed.includes(gid) && !list.some((i) => i.path !== "/" && loc.pathname.startsWith(i.path));
        return (
          <nav className="nav-group" key={gid} aria-label={label}>
            <button type="button" className="nav-group-head" onClick={() => e.toggleGroup(gid)} aria-expanded={!folded} disabled={edit}>
              <span>{label}</span>
              {!edit && <><small>{list.length}</small><ChevronDown size={14} className={`chev ${folded ? "shut" : ""}`} /></>}
            </button>
            {!folded && list.map((i) => (
              <div key={i.path} className="nav-row">
                <NavLink to={i.path} end={i.path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} style={ic(i.path, e.nav.colors)}>
                  <i.icon size={18} />{i.label}
                  {i.path === "/notifications" && notifCount > 0 && !edit && <span className="count">{notifCount}</span>}
                </NavLink>
                {edit && !NAV_FIXED.has(i.path) && (
                  <button type="button" className="nav-row-btn remove" onClick={() => e.remove(i.path)} aria-label={t("{n} in „Weitere Funktionen“ verschieben", { n: i.label })} title={t("Entfernen")}><Minus size={14} /></button>
                )}
              </div>
            ))}
          </nav>
        );
      })}

      {(extra.length > 0 || edit) && (
        <nav className={`nav-group nav-folder ${edit ? "edit" : ""}`} aria-label={t("Weitere Funktionen")}>
          <button type="button" className="nav-group-head folder" onClick={() => openFolder(!folderOpen)} aria-expanded={edit || folderOpen}>
            <FolderOpen size={15} /><span>{t("Weitere Funktionen")}</span><small>{extra.length}</small>
            {!edit && <ChevronDown size={14} className={`chev ${folderOpen ? "" : "shut"}`} />}
          </button>
          {(edit || folderOpen) && (extra.length === 0
            ? <p className="tiny muted side-hint">{t("Leer – alle Bereiche sind in der Leiste.")}</p>
            : extra.map((i) => (
              <div key={i.path} className="nav-row">
                <NavLink to={i.path} className={({ isActive }) => `nav-link small ${isActive ? "active" : ""}`} style={ic(i.path, e.nav.colors)}><i.icon size={16} />{i.label}</NavLink>
                {edit && <button type="button" className="nav-row-btn add" onClick={() => e.add(i.path)} aria-label={t("{n} wieder in die Leiste", { n: i.label })} title={t("Hinzufügen")}><Plus size={14} /></button>}
              </div>
            )))}
        </nav>
      )}

      {edit && (
        <div className="side-edit-actions">
          <button type="button" className="btn sm ghost" onClick={e.tidy}><Sparkles size={14} /> {t("Aufräumen (Vorschlag)")}</button>
          <button type="button" className="btn sm ghost" onClick={e.showAll}><RotateCcw size={14} /> {t("Alle anzeigen")}</button>
        </div>
      )}
    </div>
  );
}

/** The phone's "Alle Bereiche": the same categories, the folder at the end, and the same edit mode. */
export function SheetNav({ items, edit }: { items: NavItem[]; edit: boolean }) {
  const e = useNavEdit();
  const shown = arrangeNav(items, e.nav);
  const extra = hiddenNav(items, e.nav);
  const groups = [...new Map(shown.map((i) => [i.gid ?? i.group, i.group])).entries()];
  const tile = (i: NavItem, kind: "remove" | "add" | null) => (
    <div key={i.path} className="sheet-cell">
      <NavLink to={i.path} end={i.path === "/"} className={({ isActive }) => (isActive ? "active" : "")} style={ic(i.path, e.nav.colors)}><span className="nav-tile"><i.icon size={22} /></span>{i.short ?? i.label}</NavLink>
      {kind && <button type="button" className={`sheet-btn ${kind}`} onClick={() => (kind === "add" ? e.add(i.path) : e.remove(i.path))}
        aria-label={kind === "add" ? t("{n} wieder in die Leiste", { n: i.label }) : t("{n} in „Weitere Funktionen“ verschieben", { n: i.label })}>{kind === "add" ? <Plus size={14} /> : <Minus size={14} />}</button>}
    </div>
  );
  return (
    <>
      {edit && <p className="small muted" style={{ marginTop: 0 }}>{t("Mit − kommt ein Bereich in „Weitere Funktionen“, mit + wieder zurück. Gelöscht wird nichts.")}</p>}
      {groups.map(([gid, label]) => (
        <section key={gid} className="sheet-group" aria-label={label}>
          <h3>{label}</h3>
          <div className="sheet-grid">{shown.filter((i) => (i.gid ?? i.group) === gid).map((i) => tile(i, edit && !NAV_FIXED.has(i.path) ? "remove" : null))}</div>
        </section>
      ))}
      {(extra.length > 0 || edit) && (
        <section className="sheet-group sheet-folder" aria-label={t("Weitere Funktionen")}>
          <h3><FolderOpen size={14} style={{ verticalAlign: -2 }} /> {t("Weitere Funktionen")} · {extra.length}</h3>
          {extra.length === 0 ? <p className="tiny muted">{t("Leer – alle Bereiche sind in der Leiste.")}</p> : <div className="sheet-grid">{extra.map((i) => tile(i, edit ? "add" : null))}</div>}
        </section>
      )}
      {edit && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={e.tidy}><Sparkles size={14} /> {t("Aufräumen (Vorschlag)")}</button>
          <button type="button" className="btn sm" onClick={e.showAll}><RotateCcw size={14} /> {t("Alle anzeigen")}</button>
        </div>
      )}
    </>
  );
}
