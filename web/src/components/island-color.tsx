// Picking the island's colour and effect (3.58) – in the island's menu and on the island settings page. Saved on the PC.
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { useIslandLook } from "../lib/island-look";
import { ACCENTS, EFFECTS } from "../lib/island-theme";

export function IslandColorPicker() {
  const { look, save, canManage, online } = useIslandLook();
  const [custom, setCustom] = useState(look.accent.startsWith("#") ? look.accent : "#9ef0c8");
  useEffect(() => { if (look.accent.startsWith("#")) setCustom(look.accent); }, [look.accent]);
  const can = online && canManage;
  const pick = (accent: string) => { if (can) void save({ accent }); };
  return (
    <div className="isl3-form">
      <div className="isl3-frow col">
        <span>{t("Farbe")}</span>
        <div className="isl3-swatches" role="radiogroup" aria-label={t("Farbe der Insel")}>
          <button type="button" role="radio" aria-checked={look.accent === "default"} className="isl3-swatch plain" disabled={!can} onClick={() => pick("default")} aria-label={t("Wie die Vorlage")} title={t("Wie die Vorlage")}>{t("Std")}</button>
          <button type="button" role="radio" aria-checked={look.accent === "auto"} className="isl3-swatch special" disabled={!can} onClick={() => pick("auto")} aria-label={t("Automatisch")} title={t("Automatisch")}>{t("Auto")}</button>
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={look.accent === a.id} className="isl3-swatch" disabled={!can} style={{ ["--sw" as string]: a.id } as React.CSSProperties}
              onClick={() => pick(a.id)} aria-label={t(a.label)} title={t(a.label)} />
          ))}
        </div>
        <label className="isl3-frow" style={{ padding: 0, background: "none" }}>
          <span>{t("Eigene Farbe")}</span>
          <input type="color" value={custom} disabled={!can} aria-label={t("Eigene Farbe")} onChange={(e) => setCustom(e.target.value)} onBlur={() => pick(custom)} />
        </label>
        <p className="tiny muted" style={{ margin: 0 }}>{t("„Automatisch“ färbt die Insel wie die App oder Website vorne am PC (z. B. Discord-Blau, Spotify-Grün), sonst wie das Albumbild des laufenden Lieds.")}</p>
      </div>
      <div className="isl3-frow col">
        <span>{t("Effekt")}</span>
        <div className="isl3-seg wide" role="radiogroup" aria-label={t("Effekt der Insel")}>
          {EFFECTS.map((e) => <button key={e.id} type="button" role="radio" aria-checked={look.effect === e.id} className={look.effect === e.id ? "on" : ""} disabled={!can} onClick={() => void save({ effect: e.id })}>{t(e.label)}</button>)}
        </div>
      </div>
      {!can && <p className="tiny muted">{t("Farbe und Effekt kann nur ein Gerät mit Admin-Recht am PC ändern.")}</p>}
    </div>
  );
}
