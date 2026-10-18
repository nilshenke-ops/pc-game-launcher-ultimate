import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc } from "../lib/hooks";
import type { PluginList } from "../lib/plugins";
import { PluginFrame } from "../components/PluginFrame";

/**
 * Content of the in-game overlay window (Windows companion, opened with the overlay shortcut).
 * Shows the widgets of active plugins that are marked for the overlay. Esc, a click on the background or the shortcut close it.
 */
export default function Overlay() {
  const conn = useConn();
  const plugins = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  const [now, setNow] = useState(new Date());
  const hide = () => client.call("overlay.hide").catch(() => {});

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    window.addEventListener("keydown", onKey);
    const tick = window.setInterval(() => setNow(new Date()), 10_000);
    return () => { document.documentElement.classList.remove("overlay-mode"); window.removeEventListener("keydown", onKey); clearInterval(tick); };
  }, []);

  const widgets = (plugins.data?.plugins ?? []).filter((p) => p.enabled && p.manifest)
    .flatMap((p) => p.manifest!.contributes.widgets.filter((w) => w.overlay).map((w) => ({ plugin: p, widget: w })));

  return (
    <div className="overlay-root" onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}>
      <header className="overlay-bar">
        <b>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
        <span className="muted small">{t("Overlay")} · {t("Esc oder dein Tastenkürzel schließt es")}</span>
        <button className="btn icon sm" onClick={hide} aria-label={t("Schließen")}><X size={16} /></button>
      </header>
      <div className="overlay-grid" onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}>
        {conn.auth !== "ok" ? <div className="card overlay-card">{t("Verbinde mit dem Begleiter …")}</div>
          : widgets.length === 0 ? (
            <div className="card overlay-card stack-sm">
              <b>{t("Noch kein Overlay-Inhalt")}</b>
              <span className="small muted">{t("Installiere im Plugin Center das Plugin „Game-Overlay“ und aktiviere es. Danach erscheinen hier Leistungswerte, Aufnahme und Replay.")}</span>
            </div>
          ) : widgets.map(({ plugin, widget }) => (
            <section key={plugin.id + widget.id} className="card overlay-card">
              <div className="overlay-card-title small">{widget.title}</div>
              <PluginFrame plugin={plugin} widget={widget} />
            </section>
          ))}
      </div>
    </div>
  );
}
