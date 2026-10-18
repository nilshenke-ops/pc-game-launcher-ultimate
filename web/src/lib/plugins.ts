// Plugin system, web side. Plugins are installed on the PC (companion); the web app shows their widgets in a sandboxed
// iframe and passes calls through a bridge that only allows what the user granted. See plugins/sdk/README.md.

export type PluginTrust = "official" | "reviewed" | "unverified";

export interface PluginSetting { key: string; label: string; type: "text" | "number" | "boolean" | "select" | "game" | "program" | "sound" | "profile"; default?: unknown; options?: string[] }
export interface PluginWidgetDef { id: string; title: string; entry: string; height: number; /** also shown in the in-game overlay */ overlay?: boolean }
export interface PluginActionDef { id: string; name: string; icon: string; steps: { type: string; ref?: string }[] }
export interface PluginThemeDef { id: string; name: string; theme: Record<string, unknown> }
export interface PluginChange { version: string; date?: string; changes: string[] }
export interface PluginManifest {
  id: string; name: string; version: string; apiVersion: number; minAppVersion: string; author: string; description: string; category: string;
  platforms: ("web" | "windows")[]; permissions: string[]; dependencies?: Record<string, string>; homepage?: string;
  contributes: { widgets: PluginWidgetDef[]; actions: PluginActionDef[]; themes: PluginThemeDef[]; settings: PluginSetting[] };
  changelog: PluginChange[];
}
export interface InstalledPlugin {
  /** Installed on this device only, waiting for the PC (see lib/plugins-offline.ts). */
  pending?: boolean;
  id: string; version: string; trust: PluginTrust; source: string; enabled: boolean; granted: string[]; favorite: boolean; autoUpdate: boolean;
  config: Record<string, unknown>; previousVersion?: string; installedAt: string; updatedAt: string; disabledReason?: string;
  log: { at: string; level: string; message: string }[];
  manifest?: PluginManifest; broken?: boolean;
  missingPermissions?: string[]; missingDependencies?: string[];
  update?: { version: string; changelog: PluginChange[]; newPermissions: string[] } | null;
}
export interface PluginList { appVersion: string; apiVersion: number; permissions: Record<string, string>; categories: string[]; catalogUrl?: string; plugins: InstalledPlugin[] }
export interface CatalogEntry {
  id: string; name: string; version: string; description: string; author: string; category: string; platforms: string[]; permissions: string[];
  minAppVersion: string; trust: PluginTrust; size: number; changelog: PluginChange[]; compatible: boolean; installedVersion?: string;
}
export interface CatalogInfo { url?: string; verified: boolean; error?: string; loadedAt?: string; plugins: CatalogEntry[] }

/** Same descriptions as the companion (used while no PC is connected). */
export const PERMISSION_LABELS: Record<string, string> = {
  "library.read": "Spiele und Programme lesen", "library.launch": "Spiele und Programme starten", "history.read": "Spielverlauf und Spielzeit lesen",
  "monitor.read": "Live-Leistungswerte des PCs lesen", "sounds.read": "Soundboard-Liste lesen", "sounds.play": "Sounds abspielen und stoppen",
  "profiles.read": "Gaming-Profile lesen", "profiles.activate": "Gaming-Profile wechseln", "audio.output": "Audio-Ausgabegerät wechseln",
  "diagnostics.run": "Diagnose ausführen", notify: "Hinweise in der App anzeigen", network: "Internetzugriff (nur https) aus dem Widget",
  "capture.control": "Aufnahme und Replays in OBS steuern", "overlay.show": "Overlay im Spiel ein- und ausblenden",
};

export const CATEGORY_LABELS: Record<string, string> = {
  launcher: "Game-Launcher", audio: "Audio", discord: "Discord", performance: "Performance", design: "Design", automation: "Automatisierung",
  device: "Geräte & RGB", information: "Informationen", productivity: "Produktivität", community: "Community",
};

/** Methods a widget may call through the bridge, and the permission each needs. Everything else is refused. */
export const BRIDGE_METHODS: Record<string, string> = {
  "library.list": "library.read",
  "library.launch": "library.launch",
  "history.get": "history.read",
  "sounds.list": "sounds.read",
  "sounds.play": "sounds.play",
  "sounds.stopAll": "sounds.play",
  "profiles.list": "profiles.read",
  "profiles.activate": "profiles.activate",
  "profiles.revert": "profiles.activate",
  "diagnostics.run": "diagnostics.run",
  "obs.status": "capture.control",
  "obs.recordToggle": "capture.control",
  "obs.replaySave": "capture.control",
  "obs.replayToggle": "capture.control",
  "overlay.status": "overlay.show",
  "overlay.toggle": "overlay.show",
  "overlay.hide": "overlay.show",
};
/** Events a widget may subscribe to, with the permission each needs (null = always). */
export const BRIDGE_EVENTS: Record<string, string | null> = { "monitor.sample": "monitor.read", changed: null };

export const WIDGET_PREFIX = "plugin:";
export const pluginWidgetId = (pluginId: string, widgetId: string) => `plugin:${pluginId}:${widgetId}` as const;
export function parsePluginWidgetId(id: string): { pluginId: string; widgetId: string } | null {
  const m = /^plugin:([a-z0-9.-]{3,64}):([a-z0-9-]{1,32})$/.exec(id);
  return m ? { pluginId: m[1], widgetId: m[2] } : null;
}

const MIME: Record<string, string> = { png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const escapeScript = (s: string) => s.replace(/<\/script/gi, "<\\/script");

/** Bridge running inside the sandbox: window.pgl (call, config, on, notify, resize). Talks to the host only via postMessage. */
export const BRIDGE_SCRIPT = `(()=>{let n=0;const p=new Map(),h={};
const report=(e)=>parent.postMessage({pgl:1,type:"error",message:String((e&&e.stack)||(e&&e.message)||e).slice(0,500)},"*");
addEventListener("message",(e)=>{if(e.source!==parent)return;const d=e.data;if(!d||d.pgl!==1)return;
if(d.type==="reply"){const x=p.get(d.id);if(x){p.delete(d.id);d.error?x[1](new Error(d.error)):x[0](d.result);}}
else if(d.type==="event"){for(const f of h[d.event]||[]){try{f(d.data)}catch(err){report(err)}}}});
const send=(type,o)=>new Promise((res,rej)=>{const id=++n;p.set(id,[res,rej]);parent.postMessage(Object.assign({pgl:1,type,id},o),"*")});
addEventListener("error",(e)=>report(e.error||e.message));addEventListener("unhandledrejection",(e)=>report(e.reason));
window.pgl=Object.freeze({version:1,call:(method,params)=>send("call",{method,params}),config:()=>send("config",{}),
notify:(text)=>send("notify",{text:String(text).slice(0,200)}),
on:(event,f)=>{(h[event]=h[event]||[]).push(f);parent.postMessage({pgl:1,type:"subscribe",event},"*")},
resize:(height)=>parent.postMessage({pgl:1,type:"resize",height:Number(height)},"*")});})();`;

/**
 * Builds the iframe document for a widget: strict Content-Security-Policy (no network unless "network" is granted,
 * no forms, no navigation), the bridge, theme colours, and the package's own CSS/JS/images inlined.
 */
export function buildSrcdoc(files: Record<string, string>, entry: string, opts: { network: boolean; vars: Record<string, string> }): string {
  const text = (name: string) => (files[name] ? decode(files[name]) : null);
  let html = text(entry) ?? "<p>Einstiegsdatei fehlt</p>";
  html = html.replace(/<script\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_all, src: string) => {
    const js = text(src.replace(/^\.\//, ""));
    return js == null ? "" : `<script>${escapeScript(js)}</script>`;
  });
  html = html.replace(/<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi, (all, href: string) => {
    if (!/rel=["']?stylesheet/i.test(all)) return "";
    const css = text(href.replace(/^\.\//, ""));
    return css == null ? "" : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  html = html.replace(/\b(src|href)=["']([^"':]+\.(png|svg|jpe?g|webp))["']/gi, (all, attr: string, path: string, ext: string) => {
    const b64 = files[path.replace(/^\.\//, "")];
    return b64 ? `${attr}="data:${MIME[ext.toLowerCase()]};base64,${b64}"` : all;
  });
  const csp = [
    "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", `img-src data:${opts.network ? " https:" : ""}`, "font-src data:", "media-src data:",
    `connect-src ${opts.network ? "https:" : "'none'"}`, "form-action 'none'", "base-uri 'none'", "frame-src 'none'", "worker-src 'none'",
  ].join("; ");
  const vars = Object.entries(opts.vars).map(([k, v]) => `--pgl-${k}:${v}`).join(";");
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>:root{${vars};color-scheme:dark light}html,body{background:transparent}</style><script>${BRIDGE_SCRIPT}</script>`;
  // Our head must come first so the policy and the bridge apply before any plugin code.
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + head) : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

export const platformText = (p: string[]) =>
  p.includes("web") && p.includes("windows") ? "Web + Windows" : p.includes("windows") ? "nur Windows-Begleiter" : "nur Web-App";
