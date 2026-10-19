import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { t } from "../lib/i18n";
import { useConn, useRpc } from "../lib/hooks";
import type { CustomWidget } from "../lib/custom-widgets";
import { CustomWidgetView } from "../components/CustomWidgetView";

type HostWindow = Window & { chrome?: { webview?: { postMessage: (m: unknown) => void } } };

/**
 * One own widget as a Windows desktop window (opened by the Windows companion, without navigation). Pressing anywhere
 * except on a button moves the window. The window has no see-through effect, so the widget is shown fully opaque.
 */
export default function DesktopWidget() {
  const { id } = useParams();
  const conn = useConn();
  const q = useRpc<{ widgets: CustomWidget[] }>("widgets.list", {}, ["widgets"]);
  const w = q.data?.widgets.find((x) => x.id === id);
  useEffect(() => {
    document.documentElement.classList.add("desktop-widget-mode");
    return () => document.documentElement.classList.remove("desktop-widget-mode");
  }, []);
  const drag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input")) return;
    (window as HostWindow).chrome?.webview?.postMessage({ type: "drag" });
  };
  if (!w) return <div className="dw-msg">{conn.auth !== "ok" ? t("Verbinde mit dem Begleiter …") : q.loading ? "" : t("Dieses Widget wurde im Widget-Baukasten gelöscht.")}</div>;
  return (
    <div className="dw-root" onPointerDown={drag} title={t("Ziehen zum Verschieben")}>
      <CustomWidgetView widget={{ ...w, opacity: 1, radius: 0 }} height="100vh" />
    </div>
  );
}
