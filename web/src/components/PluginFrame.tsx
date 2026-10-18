import { useEffect, useMemo, useRef, useState } from "react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useLiveSubscription, useRpc, toast } from "../lib/hooks";
import { BRIDGE_EVENTS, BRIDGE_METHODS, buildSrcdoc, type InstalledPlugin, type PluginWidgetDef } from "../lib/plugins";
import { Banner } from "./ui";

interface Files { id: string; version: string; files: Record<string, string> }

function themeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return { text: v("--text", "#e5e7eb"), muted: v("--muted", "#94a3b8"), accent: v("--primary", "#22d3ee"), border: v("--border", "rgba(148,163,184,.25)"), bg: v("--bg", "#070b16") };
}

/**
 * Runs one plugin widget in a sandboxed iframe (opaque origin: no access to this app, its storage or cookies).
 * preview = test mode: the widget runs, but every PC call is refused and only logged.
 */
export function PluginFrame({ plugin, widget, preview = false, onLog }: { plugin: InstalledPlugin; widget: PluginWidgetDef; preview?: boolean; onLog?: (line: string) => void }) {
  const q = useRpc<Files>("plugins.files", { id: plugin.id, preview }, []);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(widget.height);
  const [wantsMonitor, setWantsMonitor] = useState(false);
  const calls = useRef<number[]>([]);
  const granted = useMemo(() => new Set(preview ? [] : plugin.granted), [preview, plugin.granted]);
  const log = (line: string) => onLog?.(`${new Date().toLocaleTimeString()} ${line}`);

  const srcdoc = useMemo(() => q.data && q.data.version === plugin.version
    ? buildSrcdoc(q.data.files, widget.entry, { network: granted.has("network"), vars: themeVars() })
    : null, [q.data, plugin.version, widget.entry, granted]);

  const post = (msg: object) => frame.current?.contentWindow?.postMessage({ pgl: 1, ...msg }, "*");

  // Live values only while the widget is shown and allowed.
  useLiveSubscription("monitor", undefined, undefined, wantsMonitor && granted.has("monitor.read"));

  useEffect(() => {
    const offSample = client.on("monitor.sample", (d) => { if (wantsMonitor && granted.has("monitor.read")) post({ type: "event", event: "monitor.sample", data: d }); });
    const offChanged = client.on("changed", (d) => post({ type: "event", event: "changed", data: d }));
    return () => { offSample(); offChanged(); };
  }, [wantsMonitor, granted]);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return; // only this widget's own frame
      const d = e.data as { pgl?: number; type?: string; id?: number; method?: string; params?: unknown; event?: string; text?: string; height?: number; message?: string };
      if (!d || d.pgl !== 1) return;
      const reply = (result?: unknown, error?: string) => post({ type: "reply", id: d.id, result, error });
      switch (d.type) {
        case "ready": if (srcdoc) post({ type: "load", html: srcdoc }); return; // frame page is up: hand over the widget document
        case "call": {
          const method = String(d.method ?? "");
          const perm = BRIDGE_METHODS[method];
          const now = Date.now();
          calls.current = calls.current.filter((x) => now - x < 10_000);
          if (calls.current.length >= 20) { reply(undefined, t("Zu viele Aufrufe – kurz warten")); return; }
          calls.current.push(now);
          if (!perm) { log(`abgelehnt: ${method} (nicht freigegeben für Plugins)`); reply(undefined, t("Methode für Plugins nicht verfügbar: {m}", { m: method })); return; }
          if (!granted.has(perm)) { log(`abgelehnt: ${method} (Berechtigung ${perm} fehlt${preview ? ", Testmodus" : ""})`); reply(undefined, t("Berechtigung fehlt: {p}", { p: perm })); return; }
          try { reply(await client.call(method, d.params ?? {})); log(`ok: ${method}`); }
          catch (err) { reply(undefined, (err as Error).message); log(`Fehler: ${method}: ${(err as Error).message}`); }
          return;
        }
        case "config": reply(plugin.config ?? {}); return;
        case "notify":
          if (!granted.has("notify")) { reply(undefined, t("Berechtigung fehlt: {p}", { p: "notify" })); return; }
          toast(`${plugin.manifest?.name ?? plugin.id}: ${String(d.text ?? "")}`, "info"); reply(true); return;
        case "subscribe": {
          const ev = String(d.event ?? "");
          if (!(ev in BRIDGE_EVENTS)) { log(`abgelehnt: Ereignis ${ev}`); return; }
          const need = BRIDGE_EVENTS[ev];
          if (need && !granted.has(need)) { log(`abgelehnt: Ereignis ${ev} (Berechtigung ${need} fehlt)`); return; }
          if (ev === "monitor.sample") setWantsMonitor(true);
          return;
        }
        case "resize": if (typeof d.height === "number" && isFinite(d.height)) setHeight(Math.max(60, Math.min(800, Math.round(d.height)))); return;
        case "error": {
          const msg = String(d.message ?? "Fehler");
          log(`Skriptfehler: ${msg}`);
          if (!preview) client.call("plugins.reportError", { id: plugin.id, message: msg }).catch(() => {});
          return;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [plugin, granted, preview, srcdoc]);

  if (q.error) return <Banner kind="warn">{q.error.message}</Banner>;
  if (!srcdoc) return <div className="skeleton" style={{ height: widget.height }} />;
  return (
    // Own page with its own strict Content-Security-Policy (the app's policy would block the widget's inline code);
    // sandbox without "allow-same-origin" gives it an opaque origin: no access to this app, its storage or cookies.
    <iframe key={`${plugin.version}-${srcdoc.length}`} ref={frame} title={`${plugin.manifest?.name ?? plugin.id}: ${widget.title}`} src="plugin-frame.html" sandbox="allow-scripts" referrerPolicy="no-referrer"
      style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }} />
  );
}
