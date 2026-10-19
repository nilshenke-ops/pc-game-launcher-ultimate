import { ArrowDown, ArrowUp, Eye, EyeOff, Menu, RotateCcw } from "lucide-react";
import { t } from "../lib/i18n";
import { arrangeNav, NAV_FIXED, navItems } from "../lib/nav";
import { DEFAULT_NAV, setPrefs, usePrefs } from "../lib/prefs";
import { Button, Card, Segmented } from "./ui";

/** Order and visibility of the sections, and the four shortcuts of the phone bar. Stored with the design (synced to the PC). */
export function NavEditor() {
  const prefs = usePrefs();
  const all = navItems();
  const shown = arrangeNav(all, { ...prefs.nav, hidden: [] });
  const groups = [...new Set(shown.map((i) => i.group))];
  const setNav = (fn: (n: typeof prefs.nav) => typeof prefs.nav) => setPrefs((p) => ({ ...p, nav: fn(p.nav) }));
  const move = (path: string, d: number) => setNav((n) => {
    const order = shown.map((i) => i.path);
    const i = order.indexOf(path), item = shown[i], j = i + d;
    if (j < 0 || j >= order.length || shown[j].group !== item.group) return n;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...n, order };
  });
  const toggleHidden = (path: string) => setNav((n) => ({ ...n, hidden: n.hidden.includes(path) ? n.hidden.filter((x) => x !== path) : [...n.hidden, path] }));
  const setBottom = (slot: number, path: string) => setNav((n) => { const b = [...n.bottom]; b[slot] = path; return { ...n, bottom: [...new Set(b)] }; });
  return (
    <Card title={t("Navigation")} icon={<Menu size={18} />}
      actions={<Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={() => setNav(() => structuredClone(DEFAULT_NAV))}>{t("Standard")}</Button>}>
      <div className="stack">
        <p className="small muted">{t("Reihenfolge innerhalb der Kategorien ändern und selten genutzte Bereiche ausblenden. Ausgeblendete Bereiche bleiben über die Suche erreichbar. Home, Einstellungen und PC verbinden lassen sich nicht ausblenden.")}</p>
        <div className="nav-editor">
          {groups.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              {shown.filter((i) => i.group === g).map((i, k, list) => {
                const hidden = prefs.nav.hidden.includes(i.path);
                return (
                  <div key={i.path} className={`nav-editor-row ${hidden ? "off" : ""}`}>
                    <i.icon size={17} /><span className="grow">{i.label}</span>
                    <Button size="sm" variant="ghost" icon={<ArrowUp size={15} />} disabled={k === 0} onClick={() => move(i.path, -1)} aria-label={t("{n} nach oben", { n: i.label })} />
                    <Button size="sm" variant="ghost" icon={<ArrowDown size={15} />} disabled={k === list.length - 1} onClick={() => move(i.path, 1)} aria-label={t("{n} nach unten", { n: i.label })} />
                    <Button size="sm" variant="ghost" icon={hidden ? <EyeOff size={15} /> : <Eye size={15} />} disabled={NAV_FIXED.has(i.path)} onClick={() => toggleHidden(i.path)}
                      aria-label={hidden ? t("{n} einblenden", { n: i.label }) : t("{n} ausblenden", { n: i.label })} aria-pressed={!hidden} />
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div>
          <b className="small">{t("Leiste unten auf dem Handy")}</b>
          <p className="tiny muted">{t("Vier Bereiche für den schnellen Zugriff – „Mehr“ ist immer dabei, „Verbinden“ nur solange kein PC gekoppelt ist.")}</p>
          <div className="grid-4" style={{ marginTop: 8 }}>
            {[0, 1, 2, 3].map((slot) => (
              <select key={slot} className="input" aria-label={t("Platz {n}", { n: slot + 1 })} value={prefs.nav.bottom[slot] ?? ""} onChange={(e) => setBottom(slot, e.target.value)}>
                {!prefs.nav.bottom[slot] && <option value="">–</option>}
                {all.filter((i) => i.path !== "/connect").map((i) => <option key={i.path} value={i.path}>{i.label}</option>)}
              </select>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><b className="small">{t("Farbige Symbole")}</b><p className="tiny muted" style={{ margin: 0 }}>{t("Jeder Bereich mit eigener Farbe in Leiste, Menü und „Mehr“ – aus: schlicht wie früher.")}</p></div>
          <Segmented value={prefs.nav.colors ? "color" : "plain"} onChange={(v) => setNav((n) => ({ ...n, colors: v === "color" }))} label={t("Symbole")}
            options={[{ value: "color", label: t("Farbig") }, { value: "plain", label: t("Schlicht") }]} />
        </div>
      </div>
    </Card>
  );
}
