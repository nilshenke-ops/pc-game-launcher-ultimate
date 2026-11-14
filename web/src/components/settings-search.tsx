// Settings search box (3.62): results appear while typing (local list, no request); Enter or a click opens the page and
// highlights the setting. Arrow keys move through the results; Esc clears.
import { useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { t } from "../lib/i18n";
import { onSettingsLevel, searchSettings, SETTINGS_CATS, settingsLevel, setSettingsLevel } from "../lib/settings-index";
import { goToSetting } from "../lib/settings-focus";
import { Segmented } from "./ui";

export function useSettingsLevel() { return useSyncExternalStore(onSettingsLevel, settingsLevel); }

export function SettingsLevelSwitch() {
  const level = useSettingsLevel();
  return (
    <Segmented value={level} onChange={setSettingsLevel} label={t("Ansicht der Einstellungen")}
      options={[{ value: "simple", label: t("Einfach") }, { value: "advanced", label: t("Erweitert") }]} />
  );
}

export function SettingsSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => searchSettings(q), [q]);
  const open = (i: number) => { const h = hits[i]; if (!h) return; setQ(""); goToSetting(h.entry, nav); };
  const catLabel = (id: string) => t(SETTINGS_CATS.find((c) => c.id === id)?.label ?? id);
  return (
    <div className="set-search" role="search">
      <label className="set-search-box">
        <Search size={17} aria-hidden />
        <input className="input" value={q} placeholder={t("Einstellung suchen … (z. B. dunkel, Mikrofon, Akku)")} aria-label={t("Einstellungen durchsuchen")}
          role="combobox" aria-expanded={hits.length > 0} aria-controls="set-search-list" aria-autocomplete="list"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); open(sel); }
            else if (e.key === "Escape") setQ("");
          }} />
        {q && <button type="button" className="icon-btn" onClick={() => setQ("")} aria-label={t("Suche leeren")}><X size={15} /></button>}
      </label>
      {q.trim().length >= 2 && (
        <ul className="set-search-list" id="set-search-list" role="listbox" aria-label={t("Gefundene Einstellungen")}>
          {hits.length === 0 && <li className="set-search-none">{t("Keine Einstellung gefunden. Versuch ein anderes Wort.")}</li>}
          {hits.map((h, i) => (
            <li key={h.entry.id} role="option" aria-selected={i === sel}>
              <button type="button" className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)} onClick={() => open(i)}>
                <b>{t(h.entry.label)}</b>
                <span className="tiny muted">{catLabel(h.entry.cat)}{!h.entry.to.startsWith("/settings") ? " · " + t("eigene Seite") : ""}{h.entry.level === "advanced" ? " · " + t("Erweitert") : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
