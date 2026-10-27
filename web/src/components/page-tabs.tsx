// The tabs of a page (Journal, Freunde, Medien …), the same everywhere: tabs you don't use go into "Weitere" with "−"
// and come back with "+" (pencil). Nothing is deleted – "Weitere" opens them, a link to a hidden tab still works.
// Stored with the design (synced to the PC like the sidebar).

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Pencil, Plus } from "lucide-react";
import { t } from "../lib/i18n";
import { setPrefs, usePrefs } from "../lib/prefs";

export function PageTabs<T extends string>({ page, tabs, value, onChange, className = "" }: {
  page: string;
  tabs: [T, ReactNode, string][];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const prefs = usePrefs();
  const [edit, setEdit] = useState(false);
  const [more, setMore] = useState(false);
  const hiddenIds = (prefs.tabs[page] ?? []).filter((id) => tabs.some(([v]) => v === id));
  // At least one tab always stays; the open tab is shown even when it is in "Weitere" (e.g. opened by a link).
  const allHidden = hiddenIds.length >= tabs.length;
  const isHidden = (v: T) => !allHidden && hiddenIds.includes(v);
  const shown = tabs.filter(([v]) => !isHidden(v) || v === value);
  const extra = tabs.filter(([v]) => isHidden(v) && v !== value);
  const save = (ids: string[]) => setPrefs((p) => ({ ...p, tabs: { ...p.tabs, [page]: ids } }));
  const hide = (v: T) => { if (tabs.length - hiddenIds.length > 1) save([...new Set([...hiddenIds, v])]); };
  const show = (v: T) => save(hiddenIds.filter((x) => x !== v));

  if (edit) {
    return (
      <div className={`chips j-tabs page-tabs editing ${className}`} role="group" aria-label={t("Reiter ordnen")}>
        {tabs.map(([v, icon, label]) => {
          const off = isHidden(v);
          return (
            <span key={v} className={`chip ${off ? "off" : ""}`}>
              {icon}{label}
              <button type="button" className={`tab-btn ${off ? "add" : "remove"}`} onClick={() => (off ? show(v) : hide(v))}
                disabled={!off && tabs.length - hiddenIds.length <= 1}
                aria-label={off ? t("{n} wieder anzeigen", { n: label }) : t("{n} in „Weitere“ verschieben", { n: label })}>{off ? <Plus size={12} /> : <Minus size={12} />}</button>
            </span>
          );
        })}
        <button type="button" className="chip on" onClick={() => setEdit(false)} aria-label={t("Reiter ordnen beenden")}><Check size={15} />{t("Fertig")}</button>
      </div>
    );
  }
  return (
    <div className={`page-tabs-wrap ${className}`}>
      <div className="chips j-tabs page-tabs" role="tablist" aria-label={t("Bereich")}>
        {shown.map(([v, icon, label]) => (
          <button key={v} type="button" role="tab" aria-selected={value === v} className={`chip ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>{icon}{label}</button>
        ))}
        {extra.length > 0 && (
          <button type="button" className={`chip more ${more ? "open" : ""}`} aria-expanded={more} onClick={() => setMore(!more)}>
            {t("Weitere")} <small>{extra.length}</small><ChevronDown size={14} className={`chev ${more ? "" : "shut"}`} />
          </button>
        )}
        <button type="button" className="chip ghost tab-edit" onClick={() => { setEdit(true); setMore(false); }} aria-label={t("Reiter ordnen")} title={t("Reiter ordnen")}><Pencil size={14} /></button>
      </div>
      {more && extra.length > 0 && (
        <div className="chips page-tabs-more" aria-label={t("Weitere")}>
          {extra.map(([v, icon, label]) => (
            <button key={v} type="button" className="chip" onClick={() => { onChange(v); setMore(false); }}>{icon}{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
