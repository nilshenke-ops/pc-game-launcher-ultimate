import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArchiveRestore, Bell, History, Copy, Download, FolderOpen, Globe, ImagePlus, Languages, LayoutGrid, Lock, Palette, Plus, Power, RefreshCw, RotateCcw,
  Save, Server, Settings as SettingsIcon, ShieldCheck, Trash2, Upload, UserX,
} from "lucide-react";
import { client, defaultServerUrl, serverUrl, setServerUrl } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import {
  ALL_WIDGETS, BG_SCENES, contrast, DEFAULT_LAYOUT, DEFAULT_THEME, PRESETS, profileThemeActive, sanitizePrefs, setPrefs, usePrefs, type Layout, type Theme, type WidgetSize,
} from "../lib/prefs";
import type { Settings } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Field, Loadable, PageHead, Segmented, Switch } from "../components/ui";
import { PcUpdates } from "../components/UpdateCenter";
import { NavEditor } from "../components/NavEditor";

type Section = "general" | "design" | "connection" | "security" | "notifications" | "autostart" | "updates" | "backup" | "privacy";

interface SettingsResp { settings: Settings; relaySecretSet: boolean; dataDir?: string; restartRequired: boolean; webStartError?: string }

function useSettings() {
  const q = useRpc<SettingsResp>("settings.get", {}, ["settings"]);
  const save = async (patch: Partial<Settings>, security = false) => {
    try { await client.call(security ? "settings.saveSecurity" : "settings.save", patch); toast(t("Gespeichert"), "success"); return true; }
    catch (e) { toast((e as Error).message, "error"); return false; }
  };
  return { ...q, save };
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = (params.get("s") as Section) || "general";
  const nav: [Section, string, ReactNode][] = [
    ["general", t("Allgemein"), <SettingsIcon size={17} />],
    ["design", t("Design & Layout"), <Palette size={17} />],
    ["connection", t("Verbindung"), <Globe size={17} />],
    ["security", t("Sicherheit"), <Lock size={17} />],
    ["notifications", t("Benachrichtigungen"), <Bell size={17} />],
    ["autostart", t("Installation & Autostart"), <Power size={17} />],
    ["updates", t("Updates"), <RefreshCw size={17} />],
    ["backup", t("Backup & Wiederherstellung"), <ArchiveRestore size={17} />],
    ["privacy", t("Datenschutz"), <UserX size={17} />],
  ];
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Einstellungen")} />
      <div className="settings">
        <nav className="settings-nav" aria-label={t("Einstellungsbereiche")}>
          {nav.map(([k, label, icon]) => <button key={k} className={section === k ? "on" : ""} aria-current={section === k} onClick={() => setParams({ s: k })}>{icon}{label}</button>)}
        </nav>
        <div className="stack fade-in" key={section}>
          {section === "general" && <General />}
          {section === "design" && <Design />}
          {section === "connection" && <Connection />}
          {section === "security" && <Security />}
          {section === "notifications" && <NotificationSettings />}
          {section === "autostart" && <Autostart />}
          {section === "updates" && <Updates />}
          {section === "backup" && <Backup />}
          {section === "privacy" && <Privacy />}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ general

function General() {
  const s = useSettings();
  const prefs = usePrefs();
  const [name, setName] = useState("");
  const [scan, setScan] = useState(5);
  useEffect(() => { if (s.data) { setName(s.data.settings.pcName); setScan(s.data.settings.processScanSeconds); } }, [s.data]);
  return (
    <Loadable loading={s.loading} error={s.error} onRetry={s.reload}>
      <Card title={t("Allgemein")} icon={<SettingsIcon size={18} />}>
        <div className="stack">
          <Field label={t("Name dieses PCs")} hint={t("Wird auf gekoppelten Geräten angezeigt.")}><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t("Spielerkennung: alle {n} Sekunden prüfen", { n: scan })} hint={t("Niedrigere Werte erkennen Spielstarts schneller, kosten aber minimal mehr Leistung. Empfohlen: 5.")}>
            <input type="range" min={2} max={30} value={scan} onChange={(e) => setScan(+e.target.value)} />
          </Field>
          <div><Button variant="primary" icon={<Save size={16} />} onClick={() => s.save({ pcName: name, processScanSeconds: scan })}>{t("Speichern")}</Button></div>
          {s.data && scan !== s.data.settings.processScanSeconds && <p className="tiny muted">{t("Das Prüfintervall wird nach einem Neustart des Companions wirksam.")}</p>}
        </div>
      </Card>
      <Card title={t("Sprache")} icon={<Languages size={18} />}>
        <div className="stack">
          <Segmented value={prefs.lang} onChange={(lang) => { setPrefs((p) => ({ ...p, lang })); client.call("settings.save", { language: lang }).catch(() => {}); }} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} />
          <p className="tiny muted">{t("Gilt für dieses Gerät. Meldungen des Companions sind derzeit nur auf Deutsch.")}</p>
        </div>
      </Card>
    </Loadable>
  );
}

// ------------------------------------------------------------------ design & layout

function Design() {
  const prefs = usePrefs();
  const th = prefs.theme;
  const setTheme = (p: Partial<Theme>) => setPrefs((x) => ({ ...x, theme: { ...x.theme, ...p } }));
  const ratio = contrast(th.mode === "dark" ? "#e8edf7" : "#0f172a", th.background);
  const primaryRatio = contrast(th.primary, th.background);
  const [palName, setPalName] = useState("");

  const uploadBg = (f?: File) => {
    if (!f) return;
    if (f.size > 4_000_000) { toast(t("Bild ist zu groß (max. 4 MB)."), "error"); return; }
    const img = new Image();
    img.onload = () => {
      // Downscale to keep the stored preferences small.
      const scale = Math.min(1, 1920 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.8);
      if (url.length > 1_100_000) { toast(t("Bild ist nach dem Verkleinern immer noch zu groß."), "error"); return; }
      setTheme({ bgImage: url });
    };
    img.src = URL.createObjectURL(f);
  };

  return (
    <>
      <Card title={t("Themes")} icon={<Palette size={18} />}>
        <div className="stack">
          <Switch checked={prefs.profileThemes} onChange={(v) => setPrefs((p) => ({ ...p, profileThemes: v }))} label={t("Themes der Gaming-Profile anzeigen")}
            hint={t("Hat das aktive Profil ein eigenes Theme (z. B. beim Start eines zugeordneten Spiels), zeigt dieses Gerät es an. Aus = immer dein eigenes Design.")} />
          {profileThemeActive() && <Banner kind="info">{t("Gerade ist das Theme des aktiven Profils zu sehen. Änderungen hier gelten für dein eigenes Design und erscheinen, sobald das Profil endet.")}</Banner>}
          <div className="swatches">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} className={`swatch ${th.preset === k ? "on" : ""}`} style={{ background: `linear-gradient(135deg, ${p.background} 40%, ${p.primary} 75%, ${p.accent})` }} onClick={() => setTheme({ preset: k, mode: p.mode, primary: p.primary, accent: p.accent, background: p.background })} aria-pressed={th.preset === k}><span>{p.name}</span></button>
            ))}
            {prefs.palettes.map((p, i) => (
              <button key={"c" + i} className={`swatch ${th.preset === "custom:" + p.name ? "on" : ""}`} style={{ background: `linear-gradient(135deg, ${p.background} 40%, ${p.primary} 75%, ${p.accent})` }} onClick={() => setTheme({ preset: "custom:" + p.name, primary: p.primary, accent: p.accent, background: p.background })}><span>{p.name}</span></button>
            ))}
          </div>
          <Segmented value={th.mode} onChange={(mode) => setTheme({ mode, background: mode === "light" ? "#eef2f7" : PRESETS.neon.background, preset: "custom" })} options={[{ value: "dark", label: t("Dunkel") }, { value: "light", label: t("Hell") }]} />
        </div>
      </Card>
      <Card title={t("Farben")} icon={<Palette size={18} />}>
        <div className="stack">
          <div className="grid-3">
            <Field label={t("Hauptfarbe")}><div className="row nowrap"><input type="color" value={th.primary} onChange={(e) => setTheme({ primary: e.target.value, preset: "custom" })} /><code>{th.primary}</code></div></Field>
            <Field label={t("Akzentfarbe")}><div className="row nowrap"><input type="color" value={th.accent} onChange={(e) => setTheme({ accent: e.target.value, preset: "custom" })} /><code>{th.accent}</code></div></Field>
            <Field label={t("Hintergrund")}><div className="row nowrap"><input type="color" value={th.background} onChange={(e) => setTheme({ background: e.target.value, preset: "custom" })} /><code>{th.background}</code></div></Field>
          </div>
          {ratio < 4.5 && <Banner kind="warn">{t("Geringer Kontrast zwischen Text und Hintergrund ({r}:1). Für gute Lesbarkeit mindestens 4,5:1 wählen.", { r: ratio.toFixed(1) })}</Banner>}
          {primaryRatio < 3 && <Banner kind="warn">{t("Die Hauptfarbe hebt sich kaum vom Hintergrund ab ({r}:1).", { r: primaryRatio.toFixed(1) })}</Banner>}
          <div className="row">
            <input className="input" style={{ maxWidth: 240 }} value={palName} onChange={(e) => setPalName(e.target.value)} placeholder={t("Name der Farbpalette")} maxLength={30} />
            <Button icon={<Plus size={16} />} disabled={!palName.trim()} onClick={() => { setPrefs((p) => ({ ...p, palettes: [...p.palettes.filter((x) => x.name !== palName.trim()), { name: palName.trim(), primary: th.primary, accent: th.accent, background: th.background }] })); setPalName(""); toast(t("Farbpalette gespeichert"), "success"); }}>{t("Palette speichern")}</Button>
            {prefs.palettes.length > 0 && <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setPrefs((p) => ({ ...p, palettes: [] }))}>{t("Eigene Paletten löschen")}</Button>}
          </div>
        </div>
      </Card>
      <Card title={t("Darstellung")} icon={<LayoutGrid size={18} />}>
        <div className="grid-2">
          <Field label={t("Schriftgröße: {v} %", { v: Math.round(th.fontScale * 100) })}><input type="range" min={0.85} max={1.35} step={0.05} value={th.fontScale} onChange={(e) => setTheme({ fontScale: +e.target.value })} /></Field>
          <Field label={t("Ecken-Rundung: {v} px", { v: th.radius })}><input type="range" min={0} max={28} value={th.radius} onChange={(e) => setTheme({ radius: +e.target.value })} /></Field>
          <Field label={t("Deckkraft der Karten: {v} %", { v: Math.round(th.surfaceAlpha * 100) })}><input type="range" min={0.35} max={1} step={0.01} value={th.surfaceAlpha} onChange={(e) => setTheme({ surfaceAlpha: +e.target.value })} /></Field>
          <Switch checked={th.reduceMotion} onChange={(reduceMotion) => setTheme({ reduceMotion })} label={t("Animationen reduzieren")} />
          <Switch checked={!!th.lite} onChange={(lite) => setTheme({ lite })} label={t("Leichte Darstellung (spart Leistung)")}
            hint={t("Ohne Unschärfe-Effekte, Leuchten und Animationen. Für schwächere Geräte, längere Akkulaufzeit oder wenn die App neben einem Spiel offen ist.")} />
        </div>
      </Card>
      <NavEditor />
      <Card title={t("Hintergrund")} icon={<ImagePlus size={18} />}>
        <div className="stack">
          <div className="scene-grid" role="radiogroup" aria-label={t("Hintergrund")}>
            <button className={`scene ${!th.bgScene && !th.bgImage ? "on" : ""}`} role="radio" aria-checked={!th.bgScene && !th.bgImage} onClick={() => setTheme({ bgScene: null, bgImage: null })}
              style={{ background: `linear-gradient(135deg, ${th.background}, ${th.primary}55)` }}><span>{t("Ohne")}</span></button>
            {BG_SCENES.map((sc) => (
              <button key={sc.id} className={`scene ${th.bgScene === sc.id && !th.bgImage ? "on" : ""}`} role="radio" aria-checked={th.bgScene === sc.id && !th.bgImage}
                style={{ backgroundImage: `url("backgrounds/${sc.id}.svg")` }}
                onClick={() => setTheme({ bgScene: sc.id, bgImage: null, mode: sc.mode, primary: sc.primary, accent: sc.accent, background: sc.background, bgDim: sc.dim, preset: "scene:" + sc.id })}>
                <span>{t(sc.name)}</span>
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>{t("Beim Auswählen werden passende Farben gesetzt – du kannst sie oben jederzeit ändern.")}</p>
          <div className="row">
            <label className="btn"><Upload size={16} />{t("Eigenes Bild wählen")}<input type="file" accept="image/*" hidden onChange={(e) => uploadBg(e.target.files?.[0])} /></label>
            {th.bgImage && <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setTheme({ bgImage: null })}>{t("Eigenes Bild entfernen")}</Button>}
          </div>
          {(th.bgImage || th.bgScene) && <Field label={t("Abdunkeln: {v} %", { v: Math.round(th.bgDim * 100) })}><input type="range" min={0} max={0.9} step={0.05} value={th.bgDim} onChange={(e) => setTheme({ bgDim: +e.target.value })} /></Field>}
        </div>
      </Card>
      <Layouts />
      <Card>
        <div className="row">
          <Button icon={<RotateCcw size={16} />} onClick={async () => { if (await confirmDialog(t("Design zurücksetzen?"), t("Farben, Schrift und Hintergrund werden auf den Standard gesetzt. Layouts bleiben erhalten."))) setTheme({ ...DEFAULT_THEME }); }}>{t("Standard-Design wiederherstellen")}</Button>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>{t("Design und Layouts werden auf diesem Gerät und zusätzlich auf dem PC gespeichert – sie bleiben nach dem Neuladen erhalten.")}</p>
      </Card>
    </>
  );
}

function Layouts() {
  const cw = useRpc<{ widgets: { id: string; name: string }[] }>("widgets.list", {}, ["widgets"]);
  const customNames = new Map((cw.data?.widgets ?? []).map((w) => [w.id, w.name]));
  const prefs = usePrefs();
  const [sel, setSel] = useState(prefs.layouts[0].id);
  const layout = prefs.layouts.find((l) => l.id === sel) ?? prefs.layouts[0];
  const update = (fn: (l: Layout) => Layout) => setPrefs((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === layout.id ? fn(l) : l)) }));
  const add = (copyFrom?: Layout) => {
    const id = "l" + Date.now().toString(36);
    setPrefs((p) => ({ ...p, layouts: [...p.layouts, { ...(copyFrom ? structuredClone(copyFrom) : structuredClone(DEFAULT_LAYOUT)), id, name: copyFrom ? `${copyFrom.name} (${t("Kopie")})` : t("Neues Layout") }] }));
    setSel(id);
  };
  const exportAll = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: "pgl-layouts", version: 1, theme: prefs.theme, palettes: prefs.palettes, layouts: prefs.layouts, activeLayout: prefs.activeLayout }, null, 2)], { type: "application/json" }));
    a.download = "pgl-design-layouts.json";
    a.click();
  };
  const importAll = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.format !== "pgl-layouts") throw new Error(t("Keine Layout-Datei."));
      const clean = sanitizePrefs({ ...prefs, theme: data.theme ?? prefs.theme, palettes: data.palettes ?? prefs.palettes, layouts: data.layouts, activeLayout: data.activeLayout });
      setPrefs((p) => ({ ...p, theme: clean.theme, palettes: clean.palettes, layouts: clean.layouts, activeLayout: clean.activeLayout }));
      toast(t("Design und Layouts importiert"), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Card title={t("Dashboard-Layouts")} icon={<LayoutGrid size={18} />}>
      <div className="stack">
        <div className="row">
          <select className="input" style={{ maxWidth: 260 }} value={layout.id} onChange={(e) => setSel(e.target.value)} aria-label={t("Layout")}>
            {prefs.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => add()}>{t("Neu")}</Button>
          <Button size="sm" icon={<Copy size={15} />} onClick={() => add(layout)}>{t("Kopieren")}</Button>
          {prefs.layouts.length > 1 && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => { setPrefs((p) => ({ ...p, layouts: p.layouts.filter((l) => l.id !== layout.id) })); setSel(prefs.layouts[0].id); }}>{t("Löschen")}</Button>}
        </div>
        <Field label={t("Name")}><input className="input" value={layout.name} maxLength={40} onChange={(e) => update((l) => ({ ...l, name: e.target.value }))} /></Field>
        <div className="grid-2">
          <Field label={t("Verwenden auf großen Bildschirmen")}>
            <select className="input" value={prefs.activeLayout.desktop} onChange={(e) => setPrefs((p) => ({ ...p, activeLayout: { ...p.activeLayout, desktop: e.target.value } }))}>
              {prefs.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label={t("Verwenden auf dem Smartphone")}>
            <select className="input" value={prefs.activeLayout.mobile} onChange={(e) => setPrefs((p) => ({ ...p, activeLayout: { ...p.activeLayout, mobile: e.target.value } }))}>
              {prefs.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="list">
          {layout.widgets.map((w) => {
            // Own widgets (widget editor) and plugin widgets are not in the built-in list.
            const meta = ALL_WIDGETS.find((x) => x.id === w.id) ?? {
              label: w.id.startsWith("custom:") ? `${customNames.get(w.id.slice(7)) ?? t("Eigenes Widget (gelöscht)")} (${t("eigenes")})` : `${w.id.split(":")[2] ?? w.id} (${t("Plugin")})`,
              sizes: ["s", "m", "l"] as WidgetSize[],
            };
            return (
              <div key={w.id} className="list-item">
                <label className="checkbox grow"><input type="checkbox" checked={w.visible} onChange={(e) => update((l) => ({ ...l, widgets: l.widgets.map((x) => (x.id === w.id ? { ...x, visible: e.target.checked } : x)) }))} />{ALL_WIDGETS.some((x) => x.id === w.id) ? t(meta.label) : meta.label}</label>
                <Segmented value={w.size} onChange={(size) => update((l) => ({ ...l, widgets: l.widgets.map((x) => (x.id === w.id ? { ...x, size } : x)) }))} options={meta.sizes.map((s) => ({ value: s, label: s === "s" ? t("Klein") : s === "m" ? t("Mittel") : t("Breit") }))} />
              </div>
            );
          })}
        </div>
        <div className="row">
          <Button size="sm" icon={<Download size={15} />} onClick={exportAll}>{t("Exportieren")}</Button>
          <label className="btn sm"><Upload size={15} />{t("Importieren")}<input type="file" accept=".json,application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} /></label>
          <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={() => update((l) => ({ ...l, widgets: structuredClone(DEFAULT_LAYOUT.widgets) }))}>{t("Standardlayout wiederherstellen")}</Button>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ connection

function Connection() {
  const s = useSettings();
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const st = useRpc<{ lanUrls: string[]; relay: { state: string; lastError?: string } }>("state.get", {}, ["settings"]);
  const [f, setF] = useState({ publicUrl: "", webAppUrl: "", relayUrl: "", relayCompanionId: "", relaySecret: "", port: 8787 });
  const [url, setUrl] = useState(serverUrl());
  useEffect(() => { if (s.data) setF({ publicUrl: s.data.settings.publicUrl ?? "", webAppUrl: s.data.settings.webAppUrl ?? "", relayUrl: s.data.settings.relayUrl ?? "", relayCompanionId: s.data.settings.relayCompanionId ?? "", relaySecret: "", port: s.data.settings.port }); }, [s.data]);
  const set = s.data?.settings;
  return (
    <Loadable loading={s.loading} error={s.error} onRetry={s.reload}>
      {s.data?.restartRequired && <Banner kind="warn" title={t("Neustart erforderlich")}>{t("Port oder WLAN-Zugriff wurden geändert. Bitte den Companion neu starten (Infobereich → Beenden, dann neu öffnen).")}</Banner>}
      {s.data?.webStartError && <Banner kind="error">{s.data.webStartError}</Banner>}
      <Card title={t("Lokales Netzwerk (WLAN)")} icon={<Globe size={18} />}>
        <div className="stack">
          <Switch checked={!!set?.lanAccess} disabled={!isLocal} onChange={(v) => s.save({ lanAccess: v }, true)} label={t("Im WLAN erreichbar")} hint={t("Smartphones und Tablets im selben Netzwerk können die Web-App öffnen. Aus = nur dieser PC. Es werden keine Router-Ports geöffnet.")} />
          <Field label={t("Port")} hint={t("Standard 8787. Änderung wird nach Neustart wirksam.")}>
            <div className="row nowrap"><input className="input" type="number" min={1024} max={65535} value={f.port} disabled={!isLocal} onChange={(e) => setF({ ...f, port: +e.target.value })} style={{ maxWidth: 140 }} />
              {isLocal && <Button onClick={() => s.save({ port: f.port }, true)}>{t("Übernehmen")}</Button>}</div>
          </Field>
          <div className="stack-sm"><span className="label">{t("Adressen für dein Handy")}</span>{(st.data?.lanUrls ?? []).map((u) => <code key={u}>{u}</code>)}{st.data && st.data.lanUrls.length === 0 && <span className="small muted">{t("Keine WLAN-Adresse gefunden.")}</span>}</div>
          <Banner kind="info">{t("Im Heimnetz ist die Verbindung unverschlüsselt (http). Anmeldungen sind trotzdem per Challenge-Response geschützt; für Zugriffe von außen bitte nur https/wss nutzen.")}</Banner>
        </div>
      </Card>
      <Card title={t("Zugriff von unterwegs")} icon={<Server size={18} />} meta={<span className={`badge ${st.data?.relay.state === "connected" ? "ok" : st.data?.relay.state === "disabled" ? "" : "warn"}`}>{t("Relay")}: {st.data?.relay.state ?? "–"}</span>}>
        <div className="stack">
          {!isLocal && <Banner kind="info">{t("Verbindungseinstellungen können nur direkt am PC geändert werden.")}</Banner>}
          <Field label={t("Öffentliche Adresse der Web-App (optional)")} hint={t("z. B. dein Cloudflare-Tunnel https://games.deinedomain.de – wird im QR-Code verwendet. Eine temporäre trycloudflare.com-Adresse ändert sich bei jedem Start.")}>
            <div className="row nowrap"><input className="input" value={f.publicUrl} disabled={!conn.me?.permissions.includes("admin")} onChange={(e) => setF({ ...f, publicUrl: e.target.value })} placeholder="https://…" />
              <Button onClick={() => s.save({ publicUrl: f.publicUrl }, true)}>{t("Speichern")}</Button></div>
          </Field>
          <Field label={t("Adresse der gehosteten Web-App (optional)")} hint={t("Feste Webseite, die auch bei ausgeschaltetem PC erreichbar ist (z. B. https://dein-name.pages.dev). Der QR-Code öffnet dann diese Seite mit Code und PC-Adresse.")}>
            <div className="row nowrap"><input className="input" value={f.webAppUrl} disabled={!conn.me?.permissions.includes("admin")} onChange={(e) => setF({ ...f, webAppUrl: e.target.value })} placeholder="https://…" />
              <Button onClick={() => s.save({ webAppUrl: f.webAppUrl }, true)}>{t("Speichern")}</Button></div>
          </Field>
          <div className="divider" />
          <Switch checked={!!set?.relayEnabled} disabled={!isLocal} onChange={(v) => s.save({ relayEnabled: v }, true)} label={t("Mit eigenem Relay verbinden")} hint={t("Der PC baut eine ausgehende Verbindung zu deinem Relay-Server auf. Anmeldung und Kopplung bleiben Ende-zu-Ende beim Companion.")} />
          <div className="grid-2">
            <Field label={t("Relay-Adresse")}><input className="input mono" value={f.relayUrl} disabled={!isLocal} onChange={(e) => setF({ ...f, relayUrl: e.target.value })} placeholder="wss://relay.example.com" /></Field>
            <Field label={t("Companion-ID")}><input className="input mono" value={f.relayCompanionId} disabled={!isLocal} onChange={(e) => setF({ ...f, relayCompanionId: e.target.value })} placeholder="mein-pc" /></Field>
            <Field label={t("Relay-Schlüssel")} hint={s.data?.relaySecretSet ? t("Gespeichert (verschlüsselt). Leer lassen = unverändert.") : t("Mindestens 24 Zeichen, identisch zur Relay-Konfiguration.")}><input className="input mono" type="password" value={f.relaySecret} disabled={!isLocal} onChange={(e) => setF({ ...f, relaySecret: e.target.value })} autoComplete="new-password" /></Field>
          </div>
          {isLocal && <div><Button variant="primary" onClick={() => s.save({ relayUrl: f.relayUrl, relayCompanionId: f.relayCompanionId, ...(f.relaySecret ? { relaySecret: f.relaySecret } as object : {}) }, true)}>{t("Relay-Einstellungen speichern")}</Button></div>}
          {st.data?.relay.lastError && <Banner kind="warn">{st.data.relay.lastError}</Banner>}
        </div>
      </Card>
      <Card title={t("Server für diesen Browser")} icon={<Server size={18} />}>
        <div className="stack">
          <Field label={t("WebSocket-Adresse")} hint={t("Leer/Standard = der Server, der diese Seite ausgeliefert hat.")}><input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <div className="row">
            <Button onClick={() => { setServerUrl(url === defaultServerUrl() ? null : url); client.restart(); }}>{t("Speichern & neu verbinden")}</Button>
            <Button variant="ghost" onClick={() => { setServerUrl(null); setUrl(defaultServerUrl()); client.restart(); }}>{t("Standard")}</Button>
          </div>
        </div>
      </Card>
    </Loadable>
  );
}

// ------------------------------------------------------------------ security

function Security() {
  const conn = useConn();
  const dev = useRpc<{ protection: string }>("devices.list", {}, [], !!conn.me?.permissions.includes("admin"));
  return (
    <Card title={t("Sicherheit")} icon={<ShieldCheck size={18} />}>
      <div className="stack small">
        <Banner kind="ok" title={t("So ist dein PC geschützt")}>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>{t("Kopplung nur mit einmaligem 5-Minuten-Code und Bestätigung am PC; Sperre nach 5 Fehlversuchen.")}</li>
            <li>{t("Jedes Gerät hat einen eigenen 256-Bit-Schlüssel; gespeichert wird nur ein Hash.")}</li>
            <li>{t("Anmeldung per Challenge-Response – mitgeschnittene Anmeldungen sind wertlos (Replay-Schutz).")}</li>
            <li>{t("Gestartet werden nur Einträge aus deiner Freigabeliste; neue EXE-Dateien nur direkt am PC.")}</li>
            <li>{t("Keine Kommandozeilen, keine beliebigen Befehle, keine Administratorrechte.")}</li>
          </ul>
        </Banner>
        {dev.data && <p className="muted">{t("Schlüsselspeicher")}: {dev.data.protection}</p>}
        <Link className="btn" to="/devices" style={{ alignSelf: "flex-start" }}>{t("Geräte & Sitzungen verwalten")}</Link>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ notifications

function NotificationSettings() {
  const s = useSettings();
  const set = s.data?.settings;
  return (
    <Loadable loading={s.loading} error={s.error} onRetry={s.reload}>
      {set && (
        <Card title={t("Benachrichtigungen")} icon={<Bell size={18} />}>
          <div className="stack">
            <Switch checked={set.notifyInfo} onChange={(v) => s.save({ notifyInfo: v })} label={t("Info-Meldungen anzeigen")} hint={t("Warnungen und Fehler werden immer angezeigt.")} />
            <Switch checked={set.quietWhileGaming} onChange={(v) => s.save({ quietWhileGaming: v })} label={t("Während des Spielens reduzieren")} hint={t("Solange ein Spiel läuft, nur Warnungen und Fehler.")} />
            {set.mutedNotificationKeys.length > 0 && (
              <div className="row"><span className="small muted">{t("{n} Meldungsarten stummgeschaltet", { n: set.mutedNotificationKeys.length })}</span><Button size="sm" onClick={() => s.save({ mutedNotificationKeys: [] })}>{t("Alle wieder anzeigen")}</Button></div>
            )}
          </div>
        </Card>
      )}
    </Loadable>
  );
}

// ------------------------------------------------------------------ autostart

function Autostart() {
  const s = useSettings();
  const a = useRpc<{ supported: boolean; enabled: boolean }>("autostart.get", {}, ["autostart"]);
  const conn = useConn();
  const set = s.data?.settings;
  const toggle = (v: boolean) => client.call("autostart.set", { enabled: v }).then(() => toast(v ? t("Autostart aktiviert") : t("Autostart deaktiviert"), "success")).catch((e) => toast(e.message, "error"));
  return (
    <Loadable loading={s.loading || a.loading} error={s.error ?? a.error} onRetry={() => { s.reload(); a.reload(); }}>
      {conn.me?.isLocal && <InstallCard />}
      <Card title={t("Autostart & Hintergrund")} icon={<Power size={18} />}>
        <div className="stack">
          {a.data && !a.data.supported && <Banner kind="info">{t("Autostart wird nur vom Windows-Companion unterstützt.")}</Banner>}
          <Switch checked={!!a.data?.enabled} disabled={!a.data?.supported || !conn.me?.isLocal} onChange={toggle} label={t("Mit Windows starten")} hint={t("Wird nur für dein Benutzerkonto eingetragen (kein Administrator nötig). Status wird direkt aus Windows gelesen.")} />
          {set && <>
            <Switch checked={set.startMinimized} onChange={(v) => s.save({ startMinimized: v })} label={t("Beim Autostart nur im Infobereich starten")} />
            <Switch checked={set.keepRunningInTray} onChange={(v) => s.save({ keepRunningInTray: v })} label={t("Beim Schließen des Fensters im Hintergrund weiterlaufen")} hint={t("Beenden dann über das Symbol im Infobereich. Aus = Schließen beendet den Companion.")} />
          </>}
          {!conn.me?.isLocal && <p className="tiny muted">{t("Autostart kann nur direkt am PC geändert werden.")}</p>}
        </div>
      </Card>
    </Loadable>
  );
}

interface InstallStatus { supported: boolean; installed: boolean; currentPath?: string | null; installPath?: string | null; startMenu: boolean; desktop: boolean; uninstallEntry: boolean; autostart: boolean; otherCopyInstalled: boolean; reason?: string | null }

/** Install the single EXE for this Windows user (own folder, Start menu, Apps & Features) – only at the PC itself. */
function InstallCard() {
  const q = useRpc<InstallStatus>("install.status", {}, ["autostart"]);
  const [o, setO] = useState({ startMenu: true, desktop: false, autostart: true });
  const [busy, setBusy] = useState(false);
  const st = q.data;
  useEffect(() => { if (st?.installed) setO({ startMenu: st.startMenu, desktop: st.desktop, autostart: st.autostart }); }, [st]);
  const install = async () => {
    setBusy(true);
    try {
      const r = await client.call<InstallStatus>("install.run", o);
      toast(r.installed ? t("Gespeichert") : t("Installiert – das Programm startet jetzt aus dem neuen Ordner neu"), "success");
      q.reload();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const uninstall = async () => {
    if (!(await confirmDialog(t("Nexus Gaming Hub deinstallieren?"), t("Startmenü-Eintrag, Desktop-Symbol, Autostart und das Programm werden entfernt. Deine Einstellungen und Daten bleiben (für eine spätere Installation)."), { danger: true, ok: t("Deinstallieren") }))) return;
    client.call("install.uninstall", { removeData: false }).catch((e: Error) => toast(e.message, "error"));
  };
  if (!st) return null;
  return (
    <Card title={t("Installation")} icon={<Download size={18} />} style={{ marginBottom: 16 }}>
      <div className="stack">
        {!st.supported ? <Banner kind="info">{st.reason ?? t("Installieren gibt es nur im Windows-Begleiter.")}</Banner> : <>
          {st.installed
            ? <Banner kind="ok">{t("Installiert für dein Benutzerkonto – in „Apps & Features“ als „Nexus Gaming Hub“.")}</Banner>
            : <Banner kind="info">{st.otherCopyInstalled ? t("Es ist schon eine Version installiert, diese hier läuft aber von einem anderen Ort. „Installieren“ ersetzt die installierte durch diese.") : t("Läuft gerade direkt aus der heruntergeladenen Datei. Installieren legt das Programm in einen eigenen Ordner, ins Startmenü und in „Apps & Features“ (mit Deinstallieren) – ohne Administrator.")}</Banner>}
          <Switch checked={o.startMenu} onChange={(v) => setO({ ...o, startMenu: v })} label={t("Eintrag im Startmenü")} />
          <Switch checked={o.desktop} onChange={(v) => setO({ ...o, desktop: v })} label={t("Symbol auf dem Desktop")} />
          <Switch checked={o.autostart} onChange={(v) => setO({ ...o, autostart: v })} label={t("Mit Windows starten")} />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" busy={busy} onClick={() => void install()}>{st.installed ? t("Speichern") : t("Installieren")}</Button>
            {(st.installed || st.uninstallEntry) && <Button variant="danger" onClick={() => void uninstall()}>{t("Deinstallieren")}</Button>}
          </div>
          <p className="tiny muted mono ellipsis" title={st.installPath ?? ""}>{t("Ordner: {p}", { p: st.installPath ?? "–" })}</p>
          <p className="tiny muted">{t("Daten (Bibliothek, Profile, Kopplungen …) liegen getrennt und bleiben bei Updates und beim Deinstallieren erhalten. Ohne Code-Signatur zeigt Windows beim ersten Start evtl. „Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“.")}</p>
        </>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ updates

function Updates() {
  const s = useSettings();
  const [src, setSrc] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => { setSrc(s.data?.settings.updateManifestUrl ?? ""); setCat(s.data?.settings.pluginCatalogUrl ?? ""); }, [s.data]);
  return (
    <>
      <Card title={t("Update-Quelle")} icon={<RefreshCw size={18} />} actions={<Link className="btn sm" to="/updates">{t("Updates & Versionen")}</Link>}>
        <Field label={t("Update-Quelle (Manifest-URL)")} hint={t("Standard: die offizielle Download-Seite. Wird 2 Minuten nach dem Start und dann einmal täglich geprüft; bei einer neuen Version kommt eine Benachrichtigung. Leer = keine Prüfung. Es wird nie automatisch installiert.")}>
          <div className="row nowrap"><input className="input mono" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://…/update.json" />
            <Button onClick={() => s.save({ updateManifestUrl: src }, true)}>{t("Speichern")}</Button></div>
        </Field>
        <p className="tiny muted">{t("Updates der offiziellen Quelle müssen mit dem Schlüssel des Projekts signiert sein. Eigene Quellen dürfen unsigniert sein und werden dann so gekennzeichnet.")}</p>
        <Field label={t("Plugin-Katalog (Store)")} hint={t("Standard: offizieller, signierter Katalog des Projekts. Leer = kein Store; Plugin-Dateien lassen sich trotzdem importieren.")}>
          <div className="row nowrap"><input className="input mono" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="https://…/catalog.json" />
            <Button onClick={() => s.save({ pluginCatalogUrl: cat }, true)}>{t("Speichern")}</Button></div>
        </Field>
      </Card>
      <PcUpdates />
    </>
  );
}

// ------------------------------------------------------------------ backup

const PARTS: [string, string][] = [["settings", "Einstellungen"], ["library", "Spiele & Programme"], ["quickactions", "Quick Actions"], ["profiles", "Gaming-Profile"], ["automations", "Automatisierungen"], ["hotkeys", "Hotkeys"], ["sounds", "Soundboard"], ["audio", "Audio-Einstellungen"], ["history", "Verlauf"], ["uiprefs", "Design & Layouts (PC)"], ["widgets", "Eigene Widgets"], ["quests", "GameQuest"], ["deals", "Deal Radar"], ["gamemode", "Spielmodus-Programme"]];

function toB64(buf: Uint8Array) { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }

function Backup() {
  const [withSounds, setWithSounds] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState<{ id: string; summary: Record<string, unknown> & { parts: string[] } } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const conn = useConn();
  const s = useSettings();

  const exportBackup = async () => {
    setBusy("export"); setProgress(0);
    try {
      const info = await client.call<{ exportId: string; size: number; fileName: string }>("backup.export", { includeSounds: withSounds });
      const parts: Uint8Array[] = [];
      let offset = 0;
      for (;;) {
        const r = await client.call<{ data: string; done: boolean }>("backup.export", { exportId: info.exportId, offset });
        const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
        parts.push(bin); offset += bin.length; setProgress(offset / info.size);
        if (r.done) break;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "application/zip" }));
      a.download = info.fileName;
      a.click();
      toast(t("Backup erstellt ({s})", { s: bytes(info.size) }), "success");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const validate = async (f?: File) => {
    if (!f) return;
    setBusy("validate"); setProgress(0); setUpload(null);
    try {
      const { uploadId } = await client.call<{ uploadId: string }>("backup.validate", { size: f.size });
      const data = new Uint8Array(await f.arrayBuffer());
      const CH = 384 * 1024;
      for (let o = 0; o < data.length; o += CH) { await client.call("backup.validate", { uploadId, data: toB64(data.subarray(o, o + CH)) }); setProgress(Math.min(1, (o + CH) / data.length)); }
      const summary = await client.call<Record<string, unknown> & { parts: string[] }>("backup.validate", { uploadId });
      setUpload({ id: uploadId, summary });
      setSelected(summary.parts.filter((p) => p !== "history"));
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const points = useRpc<{ points: { name: string; kind: string; size: number; createdAt: string }[] }>("backup.points", {}, ["backup"]);
  const openPoint = async (name: string) => {
    setBusy("validate"); setUpload(null);
    try {
      const { uploadId } = await client.call<{ uploadId: string }>("backup.openPoint", { name });
      const summary = await client.call<Record<string, unknown> & { parts: string[] }>("backup.validate", { uploadId });
      setUpload({ id: uploadId, summary });
      setSelected(summary.parts.filter((p) => p !== "history" && (p !== "library" || !!conn.me?.isLocal)));
      toast(t("Punkt geprüft – unten die Bereiche wählen"), "info");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const restore = async () => {
    if (!upload || !(await confirmDialog(t("Wiederherstellen?"), t("Die ausgewählten Bereiche werden ersetzt. Vorher wird automatisch eine Sicherung des aktuellen Stands angelegt."), { ok: t("Wiederherstellen") }))) return;
    setBusy("restore");
    try {
      const r = await client.call<{ restored: string[]; safetyBackup: string }>("backup.restore", { uploadId: upload.id, parts: selected });
      toast(t("Wiederhergestellt: {p}", { p: r.restored.join(", ") }), "success");
      setUpload(null);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const sum = upload?.summary as { manifest?: { createdAt?: string; pc?: string; app?: string }; games?: number; programs?: number; profiles?: number; sounds?: number; soundFiles?: number } | undefined;
  return (
    <>
      <Card title={t("Backup erstellen")} icon={<Download size={18} />}>
        <div className="stack">
          <p className="small muted">{t("Sichert Bibliothek, Favoriten, Kategorien, Profile, Soundboard, Hotkeys, Automatisierungen, Einstellungen sowie Design und Layouts des PC-Fensters als ZIP. Gekoppelte Geräte, Schlüssel und Relay-Zugang werden nie exportiert bzw. übernommen. Die Bibliothek lässt sich nur direkt am PC wiederherstellen.")}</p>
          <Switch checked={withSounds} onChange={setWithSounds} label={t("Audiodateien mitsichern")} />
          {busy === "export" && <div className="progress-bar"><i style={{ width: `${progress * 100}%` }} /></div>}
          <div className="row">
            <Button variant="primary" icon={<Download size={16} />} busy={busy === "export"} onClick={exportBackup}>{t("Backup herunterladen")}</Button>
            {conn.me?.isLocal && s.data?.dataDir && <Button icon={<FolderOpen size={16} />} onClick={() => client.call("system.openDataFolder")}>{t("Datenordner öffnen")}</Button>}
          </div>
          {s.data?.dataDir && <p className="tiny muted">{t("Datenordner")}: <code>{s.data.dataDir}</code></p>}
        </div>
      </Card>
      <Card title={t("Wiederherstellungspunkte")} icon={<History size={18} />} actions={<Button size="sm" onClick={() => client.call("backup.createPoint").then(() => { toast(t("Wiederherstellungspunkt angelegt"), "success"); points.reload(); }).catch((e) => toast((e as Error).message, "error"))}>{t("Jetzt anlegen")}</Button>}>
        <Loadable loading={points.loading} error={points.error} onRetry={points.reload}>
          <div className="stack">
            <p className="small muted">{t("Automatisch: einmal pro Woche, vor jedem Update und vor jeder Wiederherstellung (ohne Audiodateien). Die letzten 5 automatischen Punkte bleiben erhalten.")}</p>
            {(points.data?.points.length ?? 0) === 0 ? <p className="small">{t("Noch keine Punkte.")}</p> : (
              <div className="list">{points.data!.points.slice(0, 12).map((p) => (
                <div key={p.name} className="list-item">
                  <div className="grow"><div className="title small">{dateTime(p.createdAt)} · {t(p.kind)}</div><div className="sub tiny mono">{p.name} · {bytes(p.size)}</div></div>
                  <Button size="sm" busy={busy === "validate"} onClick={() => openPoint(p.name)}>{t("Prüfen & wiederherstellen")}</Button>
                </div>
              ))}</div>
            )}
          </div>
        </Loadable>
      </Card>
      <Card title={t("Wiederherstellen")} icon={<Upload size={18} />}>
        <div className="stack">
          <label className="btn" style={{ alignSelf: "flex-start" }}><Upload size={16} />{t("Backup-Datei wählen")}<input type="file" accept=".zip,application/zip" hidden onChange={(e) => validate(e.target.files?.[0])} /></label>
          {busy === "validate" && <div className="progress-bar"><i style={{ width: `${progress * 100}%` }} /></div>}
          {upload && sum && (
            <>
              <Banner kind="ok" title={t("Backup ist gültig")}>{t("Erstellt {d} auf „{pc}“ (v{v}): {g} Spiele, {p} Programme, {pr} Profile, {s} Sounds ({f} Audiodateien).", { d: dateTime(sum.manifest?.createdAt), pc: sum.manifest?.pc ?? "?", v: sum.manifest?.app ?? "?", g: sum.games ?? 0, p: sum.programs ?? 0, pr: sum.profiles ?? 0, s: sum.sounds ?? 0, f: sum.soundFiles ?? 0 })}</Banner>
              <div className="grid-2">
                {PARTS.filter(([k]) => upload.summary.parts.includes(k)).map(([k, label]) => (
                  <label key={k} className="checkbox"><input type="checkbox" checked={selected.includes(k)} onChange={(e) => setSelected(e.target.checked ? [...selected, k] : selected.filter((x) => x !== k))} />{t(label)}</label>
                ))}
              </div>
              <div><Button variant="primary" busy={busy === "restore"} disabled={!selected.length} onClick={restore}>{t("Ausgewählte Bereiche wiederherstellen")}</Button></div>
            </>
          )}
          <p className="tiny muted">{t("Die Datei wird vollständig geprüft, bevor etwas geändert wird. Ein beschädigtes Backup verändert deine Konfiguration nicht.")}</p>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ privacy

function Privacy() {
  const s = useSettings();
  const set = s.data?.settings;
  return (
    <Loadable loading={s.loading} error={s.error} onRetry={s.reload}>
      {set && (
        <Card title={t("Datenschutz")} icon={<UserX size={18} />}>
          <div className="stack">
            <Switch checked={set.historyEnabled} onChange={(v) => s.save({ historyEnabled: v })} label={t("Spielverlauf aufzeichnen")} hint={t("Startzeiten und Spieldauer, nur lokal auf dem PC.")} />
            <Switch checked={set.recordSessionPerf !== false} disabled={!set.historyEnabled} onChange={(v) => s.save({ recordSessionPerf: v })} label={t("Leistungswerte während Spielsitzungen aufzeichnen")} hint={t("CPU-, RAM- und GPU-Auslastung alle 10 Sekunden, nur solange ein Spiel läuft. Bleibt auf dem PC.")} />
            <Switch checked={set.coverSearch ?? true} onChange={(v) => s.save({ coverSearch: v })} label={t("Cover automatisch suchen")} hint={t("Der PC sucht für Spiele ohne Bild das echte Cover bei Steam und im Microsoft Store (nur bei exakt gleichem Titel). Dabei wird der Spielname an diese Shops gesendet.")} />
            <Switch checked={set.steamCoversFromCdn} onChange={(v) => s.save({ steamCoversFromCdn: v })} label={t("Steam-Cover aus dem Steam-CDN laden")} hint={t("Dein Gerät ruft die Bilder direkt bei Steam ab (dabei sieht Steam deine IP-Adresse).")} />
            <div className="divider" />
            <b className="small">{t("Was wird wo gespeichert?")}</b>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>{t("Auf dem PC (Datenordner): Bibliothek, Profile, Regeln, Hotkeys, Sounds, Verlauf, Einstellungen und Hashes der Geräteschlüssel.")}</li>
              <li>{t("Auf diesem Gerät (Browser-Speicher): Gerätekennung und Schlüssel, Design, Layouts, Spracheinstellung.")}</li>
              <li>{t("Auf einem Relay: nichts dauerhaft – es leitet nur Nachrichten weiter und protokolliert Verbindungszeiten ohne Inhalte.")}</li>
              <li>{t("Keine Telemetrie, keine Werbung, kein Konto.")}</li>
            </ul>
            <b className="small">{t("Wer erfährt etwas? (nur wenn die Funktion genutzt wird)")}</b>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>{t("GitHub Pages: Update-Prüfung und Plugin-Katalog (täglich, nicht während eines Spiels) – sieht die IP-Adresse des PCs.")}</li>
              <li>{t("Steam / Microsoft Store: Cover-Suche (Spielname), Steam-CDN für Bilder (IP-Adresse), Steam Web API mit deinem Schlüssel, Game-Pass-Katalog.")}</li>
              <li>{t("Deal Radar (nur wenn eingeschaltet, höchstens alle 6 Stunden): Steam-Shop – sieht die IP-Adresse des PCs und die App-IDs deiner Wunschliste.")}</li>
              <li>{t("Netzwerkdiagnose: Ping an Cloudflare (1.1.1.1), Google (8.8.8.8) und deine eigenen Ziele – nur solange die Seite offen ist.")}</li>
              <li>{t("Sound-Links, Bild-Adressen in Widgets und Plugins mit Netzwerk-Recht: die jeweilige Adresse.")}</li>
            </ul>
            <a className="small" href="https://github.com/nilshenke-ops/pc-game-launcher-ultimate/blob/main/docs/DATENSCHUTZ.md" target="_blank" rel="noreferrer">{t("Vollständige Datenschutz-Übersicht (Speicherorte, Löschen, alle Online-Ziele)")}</a>
          </div>
        </Card>
      )}
    </Loadable>
  );
}
