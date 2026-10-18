import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Code2, Download, FileUp, LayoutGrid, Play, Plug, Puzzle, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, Star, Trash2, Upload } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { setPrefs, usePrefs } from "../lib/prefs";
import { sanitizePrefs } from "../lib/prefs-core";
import { CATEGORY_LABELS, platformText, pluginWidgetId, type CatalogInfo, type InstalledPlugin, type PluginList, type PluginManifest, type PluginTrust } from "../lib/plugins";
import { useStepRefs } from "../components/StepEditor";
import { PluginFrame } from "../components/PluginFrame";
import { Banner, Button, Card, confirmDialog, Field, Loadable, Modal, OfflineState, PageHead, Segmented, Switch } from "../components/ui";
import { IconByName } from "../lib/nav";

type Tab = "installed" | "store" | "dev";

export function TrustBadge({ trust }: { trust: PluginTrust }) {
  return trust === "official" ? <span className="badge ok"><BadgeCheck size={12} /> {t("Offiziell")}</span>
    : trust === "reviewed" ? <span className="badge info"><ShieldCheck size={12} /> {t("Geprüft")}</span>
    : <span className="badge warn"><ShieldAlert size={12} /> {t("Nicht verifiziert")}</span>;
}

const toB64 = (buf: Uint8Array) => { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };

export default function Plugins() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "installed";
  const conn = useConn();
  const q = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  return (
    <>
      <PageHead eyebrow={t("Erweiterungen")} title={t("Plugin Center")}
        text={t("Erweiterungen für Dashboard, Aktionen und Design. Plugins laufen abgeschottet und bekommen nur die Rechte, die du erlaubst.")} />
      <div style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={(v) => setParams({ tab: v })} label={t("Bereich")}
          options={[{ value: "installed", label: t("Installiert") }, { value: "store", label: t("Store") }, { value: "dev", label: t("Entwickler") }]} />
      </div>
      {q.stale && <Banner kind="info">{t("PC nicht verbunden – zuletzt gespeicherter Stand. Installieren und Ändern geht, sobald der PC erreichbar ist.")}</Banner>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (tab === "installed" ? <Installed list={q.data} /> : tab === "store" ? (conn.auth === "ok" ? <Store list={q.data} /> : <OfflineState />) : <Developer list={q.data} />)}
      </Loadable>
    </>
  );
}

// ------------------------------------------------------------------ installed

function Installed({ list }: { list: PluginList }) {
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const items = list.plugins.filter((p) => (!onlyFav || p.favorite) && (`${p.manifest?.name} ${p.manifest?.description} ${p.id}`.toLowerCase().includes(query.toLowerCase())));
  const current = list.plugins.find((p) => p.id === open);
  if (list.plugins.length === 0)
    return <Card><div className="stack"><p>{t("Noch keine Plugins installiert.")}</p><div className="row"><Link className="btn primary" to="/plugins?tab=store">{t("Zum Store")}</Link><Link className="btn" to="/plugins?tab=dev">{t("Plugin-Datei importieren")}</Link></div></div></Card>;
  return (
    <div className="stack">
      <div className="row">
        <div className="input-icon grow"><Search size={16} /><input className="input" placeholder={t("Plugins durchsuchen")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Plugins durchsuchen")} /></div>
        <Button variant={onlyFav ? "primary" : undefined} icon={<Star size={16} />} onClick={() => setOnlyFav(!onlyFav)}>{t("Favoriten")}</Button>
      </div>
      <div className="grid-2">
        {items.map((p) => <PluginCard key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}
      </div>
      {current && <PluginDetail p={current} list={list} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PluginCard({ p, onOpen }: { p: InstalledPlugin; onOpen: () => void }) {
  const m = p.manifest;
  return (
    <Card title={m?.name ?? p.id} icon={<Puzzle size={18} />} meta={`v${p.version}`}
      actions={<Button size="sm" onClick={onOpen}>{t("Details")}</Button>}>
      <div className="stack-sm">
        <div className="row" style={{ gap: 6 }}>
          <TrustBadge trust={p.trust} />
          <span className={`badge ${p.enabled ? "ok" : ""}`}>{p.enabled ? t("Aktiv") : t("Aus")}</span>
          {m && <span className="badge">{t(CATEGORY_LABELS[m.category] ?? m.category)}</span>}
          {m && <span className="badge">{t(platformText(m.platforms))}</span>}
          {p.update && <span className="badge info">{t("Update {v}", { v: p.update.version })}</span>}
          {p.favorite && <span className="badge"><Star size={12} /></span>}
        </div>
        <p className="small muted">{p.broken ? t("Paket fehlt oder ist beschädigt – bitte neu installieren.") : m?.description}</p>
        {p.disabledReason && !p.enabled && <p className="tiny muted">{t(p.disabledReason)}</p>}
      </div>
    </Card>
  );
}

function PermissionList({ perms, labels, granted, onRevoke }: { perms: string[]; labels: Record<string, string>; granted?: string[]; onRevoke?: (p: string) => void }) {
  if (perms.length === 0) return <p className="small muted">{t("Keine Berechtigungen – das Plugin kann nur anzeigen.")}</p>;
  return (
    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
      {perms.map((x) => (
        <li key={x} style={{ marginBottom: 4 }}>
          <b>{t(labels[x] ?? x)}</b> <span className="muted mono tiny">{x}</span>
          {granted && (granted.includes(x)
            ? onRevoke && <Button size="sm" variant="ghost" onClick={() => onRevoke(x)}>{t("Entziehen")}</Button>
            : <span className="badge warn" style={{ marginLeft: 6 }}>{t("nicht erlaubt")}</span>)}
        </li>
      ))}
    </ul>
  );
}

async function act(method: string, params: object, ok: string) {
  try { const r = await client.call(method, params); toast(ok, "success"); return r; }
  catch (e) { toast((e as Error).message, "error"); return null; }
}

/** Activation always shows the requested permissions first and needs an explicit confirmation. */
async function enable(p: InstalledPlugin, labels: Record<string, string>) {
  const perms = p.manifest?.permissions ?? [];
  const text = perms.length ? t("Das Plugin erhält: {l}. Du kannst einzelne Rechte später entziehen.", { l: perms.map((x) => t(labels[x] ?? x)).join(", ") }) : t("Das Plugin benötigt keine Berechtigungen.");
  const warn = p.trust === "unverified" ? " " + t("Achtung: nicht verifiziertes Plugin – nur aktivieren, wenn du der Quelle vertraust.") : "";
  if (await confirmDialog(t("„{n}“ aktivieren?", { n: p.manifest?.name ?? p.id }), text + warn, { ok: t("Erlauben und aktivieren") }))
    await act("plugins.enable", { id: p.id, grant: perms }, t("Plugin aktiviert"));
}

function PluginDetail({ p, list, onClose }: { p: InstalledPlugin; list: PluginList; onClose: () => void }) {
  const m = p.manifest;
  const prefs = usePrefs();
  const exportPkg = async () => {
    try {
      const parts: string[] = []; let offset = 0; let name = "plugin.pglplugin";
      for (;;) {
        const r = await client.call<{ fileName: string; data: string; done: boolean }>("plugins.export", { id: p.id, offset });
        parts.push(r.data); name = r.fileName; offset += atob(r.data).length;
        if (r.done) break;
      }
      const bin = Uint8Array.from(parts.map((x) => atob(x)).join(""), (c) => c.charCodeAt(0));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bin])); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const addWidget = (wid: string) => {
    const id = pluginWidgetId(p.id, wid);
    setPrefs((pr) => ({ ...pr, layouts: pr.layouts.map((l) => (l.id === pr.activeLayout.desktop || l.id === pr.activeLayout.mobile)
      ? { ...l, widgets: l.widgets.some((w) => w.id === id) ? l.widgets.map((w) => (w.id === id ? { ...w, visible: true } : w)) : [...l.widgets, { id, visible: true, size: "m" }] } : l) }));
    toast(t("Widget zum Dashboard hinzugefügt"), "success");
  };
  const applyTheme = (theme: Record<string, unknown>) => {
    setPrefs((pr) => sanitizePrefs({ ...pr, theme: { ...pr.theme, ...theme, preset: "plugin", bgScene: null } }));
    toast(t("Design übernommen"), "success");
  };
  return (
    <Modal wide title={m?.name ?? p.id} onClose={onClose} footer={<>
      <Button variant="danger" icon={<Trash2 size={16} />} style={{ marginRight: "auto" }} onClick={async () => { if (await confirmDialog(t("Plugin entfernen?"), t("„{n}“ wird deinstalliert. Einstellungen des Plugins werden gelöscht.", { n: m?.name ?? p.id }), { danger: true, ok: t("Entfernen") })) { await act("plugins.uninstall", { id: p.id }, t("Plugin entfernt")); onClose(); } }}>{t("Entfernen")}</Button>
      <Button onClick={onClose}>{t("Schließen")}</Button>
    </>}>
      <div className="stack">
        <div className="row" style={{ gap: 6 }}>
          <TrustBadge trust={p.trust} /><span className="badge">v{p.version}</span>
          {m && <span className="badge">{t(CATEGORY_LABELS[m.category] ?? m.category)}</span>}
          {m && <span className="badge">{t(platformText(m.platforms))}</span>}
        </div>
        {m && <p className="small">{m.description}</p>}
        <p className="tiny muted">{t("Von {a} · Quelle: {s} · installiert {d}", { a: m?.author ?? "?", s: p.source, d: dateTime(p.installedAt) })}{m?.homepage && <> · <a href={m.homepage} target="_blank" rel="noreferrer noopener">{t("Webseite")}</a></>}</p>
        {p.trust === "unverified" && <Banner kind="warn">{t("Nicht verifiziert: Herkunft und Inhalt wurden nicht vom Projekt geprüft. Es läuft trotzdem nur in der Sandbox und mit den Rechten, die du erlaubst.")}</Banner>}
        {(p.missingDependencies?.length ?? 0) > 0 && <Banner kind="error" title={t("Fehlende Abhängigkeiten")}>{p.missingDependencies!.join(", ")}</Banner>}

        <div className="row">
          {p.enabled ? <Button onClick={() => act("plugins.disable", { id: p.id }, t("Plugin deaktiviert"))}>{t("Deaktivieren")}</Button>
            : <Button variant="primary" disabled={p.broken} onClick={() => enable(p, list.permissions)}>{t("Aktivieren")}</Button>}
          <Button icon={<Star size={16} />} variant={p.favorite ? "primary" : undefined} onClick={() => act("plugins.setFlags", { id: p.id, favorite: !p.favorite }, p.favorite ? t("Aus Favoriten entfernt") : t("Zu Favoriten hinzugefügt"))}>{t("Favorit")}</Button>
          <Button icon={<Download size={16} />} onClick={exportPkg}>{t("Exportieren")}</Button>
          {p.previousVersion && <Button icon={<RotateCcw size={16} />} onClick={async () => { if (await confirmDialog(t("Vorherige Version wiederherstellen?"), t("Zurück zu Version {v}.", { v: p.previousVersion! }))) act("plugins.rollback", { id: p.id }, t("Zurückgesetzt")); }}>{t("Version {v} wiederherstellen", { v: p.previousVersion })}</Button>}
        </div>

        {p.update && (
          <Banner kind="info" title={t("Update auf {v} verfügbar", { v: p.update.version })} actions={<Button size="sm" variant="primary" onClick={async () => {
            const extra = p.update!.newPermissions.length ? " " + t("Neue Berechtigungen: {l} – danach erneut aktivieren.", { l: p.update!.newPermissions.join(", ") }) : "";
            if (await confirmDialog(t("Auf {v} aktualisieren?", { v: p.update!.version }), t("Installiert: {a} → neu: {b}.", { a: p.version, b: p.update!.version }) + extra)) act("plugins.update", { id: p.id }, t("Plugin aktualisiert"));
          }}>{t("Aktualisieren")}</Button>}>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{p.update.changelog.filter((c) => c.version === p.update!.version).flatMap((c) => c.changes).map((c) => <li key={c}>{c}</li>)}</ul>
          </Banner>
        )}
        <Switch checked={p.autoUpdate} onChange={(v) => act("plugins.setFlags", { id: p.id, autoUpdate: v }, v ? t("Automatische Updates an") : t("Automatische Updates aus"))}
          label={t("Automatisch aktualisieren")} hint={t("Nur aus dem Katalog und nur, wenn das Update keine neuen Berechtigungen verlangt.")} />

        <Card title={t("Berechtigungen")} className="flat">
          <PermissionList perms={m?.permissions ?? []} labels={list.permissions} granted={p.granted} onRevoke={(x) => act("plugins.revoke", { id: p.id, permission: x }, t("Berechtigung entzogen"))} />
        </Card>

        {m && m.contributes.settings.length > 0 && <PluginSettings p={p} m={m} />}

        {m && m.contributes.actions.length > 0 && (
          <Card title={t("Aktionen")} className="flat">
            <div className="row">{m.contributes.actions.map((a) => (
              <Button key={a.id} icon={<IconByName name={a.icon} size={16} />} disabled={!p.enabled} onClick={async () => {
                const r = await act("plugins.runAction", { id: p.id, actionId: a.id }, t("Aktion ausgeführt")) as { results: string[] } | null;
                if (r?.results.some((x) => x.startsWith("Fehler"))) toast(r.results.join(" · "), "error");
              }}>{a.name}</Button>
            ))}</div>
            {!p.enabled && <p className="tiny muted">{t("Erst aktivieren.")}</p>}
          </Card>
        )}

        {m && m.contributes.widgets.length > 0 && (
          <Card title={t("Widgets")} className="flat">
            <div className="row">{m.contributes.widgets.map((w) => <Button key={w.id} icon={<LayoutGrid size={16} />} disabled={!p.enabled} onClick={() => addWidget(w.id)}>{t("„{n}“ aufs Dashboard", { n: w.title })}</Button>)}</div>
            <p className="tiny muted">{t("Im Dashboard unter „Anpassen“ verschieben, vergrößern oder ausblenden. Gilt für das aktuelle Layout ({n}).", { n: prefs.layouts.find((l) => l.id === prefs.activeLayout.desktop)?.name ?? "" })}</p>
          </Card>
        )}

        {m && m.contributes.themes.length > 0 && (
          <Card title={t("Designs")} className="flat">
            <div className="row">{m.contributes.themes.map((th) => (
              <Button key={th.id} disabled={!p.enabled} onClick={() => applyTheme(th.theme)}>
                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 4, background: String(th.theme.primary ?? "#888") }} /> {th.name}
              </Button>
            ))}</div>
          </Card>
        )}

        {m && m.changelog.length > 0 && (
          <details><summary className="small">{t("Änderungsprotokoll")}</summary>
            <ul className="small">{m.changelog.map((c) => <li key={c.version}><b>{c.version}</b>{c.date ? ` (${c.date})` : ""}: {c.changes.join("; ")}</li>)}</ul>
          </details>
        )}
      </div>
    </Modal>
  );
}

function PluginSettings({ p, m }: { p: InstalledPlugin; m: PluginManifest }) {
  const refs = useStepRefs();
  const [cfg, setCfg] = useState<Record<string, unknown>>(p.config ?? {});
  const set = (k: string, v: unknown) => setCfg((c) => ({ ...c, [k]: v }));
  return (
    <Card title={t("Einstellungen")} className="flat">
      <div className="stack">
        {m.contributes.settings.map((s) => {
          const v = cfg[s.key];
          const pick = (opts: { id: string; name: string }[]) => (
            <select className="input" value={String(v ?? "")} onChange={(e) => set(s.key, e.target.value || null)}>
              <option value="">{t("– wählen –")}</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          );
          return (
            <Field key={s.key} label={s.label}>
              {s.type === "boolean" ? <Switch checked={!!v} onChange={(x) => set(s.key, x)} label={s.label} />
                : s.type === "number" ? <input className="input" type="number" value={v == null ? "" : String(v)} onChange={(e) => set(s.key, e.target.value === "" ? null : Number(e.target.value))} />
                : s.type === "select" ? pick((s.options ?? []).map((o) => ({ id: o, name: o })))
                : s.type === "game" ? pick(refs.items.filter((i) => i.kind === "game"))
                : s.type === "program" ? pick(refs.items.filter((i) => i.kind !== "game"))
                : s.type === "sound" ? pick(refs.sounds)
                : s.type === "profile" ? pick(refs.profiles)
                : <input className="input" value={String(v ?? "")} maxLength={500} onChange={(e) => set(s.key, e.target.value)} />}
            </Field>
          );
        })}
        <div><Button variant="primary" onClick={() => act("plugins.setConfig", { id: p.id, config: cfg }, t("Einstellungen gespeichert"))}>{t("Speichern")}</Button></div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ store

function Store({ list }: { list: PluginList }) {
  const q = useRpc<CatalogInfo>("plugins.catalog", { refresh: false }, ["plugins"]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const items = useMemo(() => (q.data?.plugins ?? []).filter((p) => (!cat || p.category === cat) && `${p.name} ${p.description} ${p.author}`.toLowerCase().includes(query.toLowerCase())), [q.data, query, cat]);
  const install = async (id: string, update: boolean) => {
    setBusy(id);
    await act(update ? "plugins.update" : "plugins.installCatalog", { id }, update ? t("Plugin aktualisiert") : t("Installiert – jetzt unter „Installiert“ prüfen und aktivieren"));
    setBusy(null); q.reload();
  };
  return (
    <div className="stack">
      <div className="row">
        <div className="input-icon grow"><Search size={16} /><input className="input" placeholder={t("Store durchsuchen")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Store durchsuchen")} /></div>
        <select className="input" style={{ maxWidth: 220 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("Kategorie")}>
          <option value="">{t("Alle Kategorien")}</option>{list.categories.map((c) => <option key={c} value={c}>{t(CATEGORY_LABELS[c] ?? c)}</option>)}
        </select>
        <Button icon={<RefreshCw size={16} />} onClick={() => client.call("plugins.catalog", { refresh: true }).then(() => q.reload()).catch((e) => toast((e as Error).message, "error"))}>{t("Aktualisieren")}</Button>
      </div>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data?.error && <Banner kind="error">{q.data.error}</Banner>}
        {q.data && !q.data.error && <p className="tiny muted">{q.data.verified ? t("Katalog signiert und geprüft · Quelle: {u}", { u: q.data.url ?? "" }) : t("Eigener Katalog ohne gültige Signatur – alle Einträge gelten als nicht verifiziert.")}</p>}
        <div className="grid-2">
          {items.map((c) => {
            const installed = c.installedVersion;
            const newer = installed && installed !== c.version;
            return (
              <Card key={c.id} title={c.name} icon={<Plug size={18} />} meta={`v${c.version}`}>
                <div className="stack-sm">
                  <div className="row" style={{ gap: 6 }}><TrustBadge trust={c.trust} /><span className="badge">{t(CATEGORY_LABELS[c.category] ?? c.category)}</span><span className="badge">{t(platformText(c.platforms))}</span><span className="badge">{bytes(c.size)}</span></div>
                  <p className="small muted">{c.description}</p>
                  <p className="tiny muted">{t("Von {a}", { a: c.author })} · {c.permissions.length ? t("Rechte: {l}", { l: c.permissions.map((x) => t(list.permissions[x] ?? x)).join(", ") }) : t("Keine Berechtigungen")}</p>
                  {!c.compatible ? <Banner kind="warn">{t("Benötigt Launcher {v} – bitte zuerst den Begleiter aktualisieren.", { v: c.minAppVersion })}</Banner>
                    : <div className="row">
                        {!installed && <Button variant="primary" busy={busy === c.id} icon={<Download size={16} />} onClick={() => install(c.id, false)}>{t("Installieren")}</Button>}
                        {newer && <Button variant="primary" busy={busy === c.id} onClick={() => install(c.id, true)}>{t("Update {a} → {b}", { a: installed, b: c.version })}</Button>}
                        {installed && !newer && <span className="badge ok">{t("Installiert")}</span>}
                      </div>}
                </div>
              </Card>
            );
          })}
        </div>
        {q.data && items.length === 0 && !q.data.error && <p className="muted">{t("Keine passenden Plugins.")}</p>}
      </Loadable>
    </div>
  );
}

// ------------------------------------------------------------------ developer

function Developer({ list }: { list: PluginList }) {
  const conn = useConn();
  const file = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<{ importId: string; report: { manifest: PluginManifest; sha256: string; size: number; warnings: string[]; installedVersion?: string; missingDependencies: string[] } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const admin = !!conn.me?.permissions?.includes("admin") || !!conn.me?.isLocal;

  const pick = async (f: File) => {
    setBusy(true); setCheck(null);
    try {
      if (!f.name.endsWith(".pglplugin") && !f.name.endsWith(".zip")) throw new Error(t("Bitte eine .pglplugin-Datei wählen."));
      const data = new Uint8Array(await f.arrayBuffer());
      const { importId } = await client.call<{ importId: string }>("plugins.importBegin", { size: data.length });
      for (let o = 0; o < data.length; o += 512 * 1024) await client.call("plugins.importChunk", { importId, data: toB64(data.subarray(o, o + 512 * 1024)) });
      const report = await client.call<NonNullable<typeof check>["report"]>("plugins.importEnd", { importId, check: true });
      setCheck({ importId, report });
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const install = async () => {
    if (!check) return;
    const r = await act("plugins.importEnd", { importId: check.importId, check: false }, t("Installiert (deaktiviert) – jetzt testen und aktivieren"));
    if (r) setCheck(null);
  };
  const previewPlugin = list.plugins.find((p) => p.id === preview);
  return (
    <div className="stack">
      <Card title={t("Plugin-Datei importieren")} icon={<FileUp size={18} />}>
        <div className="stack">
          <p className="small muted">{t("Eigene oder fremde Plugins als .pglplugin-Datei. Die Datei wird zuerst vollständig geprüft (Testmodus) – installiert wird erst nach deiner Bestätigung, und zwar deaktiviert.")}</p>
          <input ref={file} type="file" accept=".pglplugin,.zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
          <div className="row">
            <Button icon={<Upload size={16} />} busy={busy} disabled={!admin || conn.auth !== "ok"} onClick={() => file.current?.click()}>{t("Datei wählen und prüfen")}</Button>
            <a className="btn ghost" href="https://github.com/nilshenke-ops/pc-game-launcher-ultimate/tree/main/plugins/sdk" target="_blank" rel="noreferrer noopener"><Code2 size={16} />{t("Plugin-SDK und Anleitung")}</a>
          </div>
          {!admin && <p className="tiny muted">{t("Nicht verifizierte Plugin-Dateien importieren darf nur der PC selbst oder ein Gerät mit Admin-Recht. Plugins aus dem Store gehen auch so.")}</p>}
          {check && (
            <Banner kind={check.report.warnings.length ? "warn" : "ok"} title={t("Prüfung bestanden: {n} {v}", { n: check.report.manifest.name, v: check.report.manifest.version })}>
              <div className="stack-sm small">
                <span>{check.report.manifest.id} · {t("von {a}", { a: check.report.manifest.author })} · {bytes(check.report.size)} · {t(platformText(check.report.manifest.platforms))}</span>
                <span className="mono tiny" style={{ wordBreak: "break-all" }}>SHA-256 {check.report.sha256}</span>
                {check.report.installedVersion && <span>{t("Installiert ist {v}.", { v: check.report.installedVersion })}</span>}
                <PermissionList perms={check.report.manifest.permissions} labels={list.permissions} />
                {check.report.warnings.map((w) => <span key={w}>⚠ {w}</span>)}
                {check.report.missingDependencies.length > 0 && <span>{t("Fehlende Abhängigkeiten: {l}", { l: check.report.missingDependencies.join(", ") })}</span>}
                <div className="row"><Button variant="primary" onClick={install}>{t("Installieren (deaktiviert)")}</Button><Button onClick={() => setCheck(null)}>{t("Verwerfen")}</Button></div>
              </div>
            </Banner>
          )}
        </div>
      </Card>

      <Card title={t("Testmodus und Protokolle")} icon={<Code2 size={18} />}>
        <div className="stack">
          <p className="small muted">{t("Widgets im Testmodus laufen ohne jeden Zugriff auf den PC: jeder Aufruf wird abgelehnt und hier protokolliert. So siehst du Darstellung und Fehler, bevor du ein Plugin aktivierst.")}</p>
          {list.plugins.length === 0 && <p className="small">{t("Noch keine Plugins installiert.")}</p>}
          {list.plugins.map((p) => (
            <details key={p.id} className="card" style={{ padding: 12 }}>
              <summary><b>{p.manifest?.name ?? p.id}</b> <span className="small muted">v{p.version} · {p.enabled ? t("Aktiv") : t("Aus")} · {t("{n} Protokolleinträge", { n: p.log.length })}</span></summary>
              <div className="stack" style={{ marginTop: 8 }}>
                {(p.manifest?.contributes.widgets.length ?? 0) > 0 && <div><Button size="sm" icon={<Play size={14} />} onClick={() => { setLines([]); setPreview(preview === p.id ? null : p.id); }}>{preview === p.id ? t("Vorschau schließen") : t("Widget im Testmodus starten")}</Button></div>}
                <pre className="log tiny" style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>{p.log.slice().reverse().map((l) => `${dateTime(l.at)} [${l.level}] ${l.message}`).join("\n") || t("Keine Einträge")}</pre>
              </div>
            </details>
          ))}
        </div>
      </Card>

      {previewPlugin?.manifest && (
        <Card title={t("Vorschau (Testmodus): {n}", { n: previewPlugin.manifest.name })} icon={<Play size={18} />}>
          <div className="stack">
            {previewPlugin.manifest.contributes.widgets.map((w) => <div key={w.id} className="card flat" style={{ padding: 12 }}><b className="small">{w.title}</b><PluginFrame plugin={previewPlugin} widget={w} preview onLog={(l) => setLines((x) => [...x.slice(-99), l])} /></div>)}
            <pre className="log tiny" style={{ maxHeight: 200, overflow: "auto" }}>{lines.join("\n") || t("Noch keine Aufrufe.")}</pre>
          </div>
        </Card>
      )}
      <p className="tiny muted">{t("Launcher {v}, Plugin-API {a}.", { v: list.appVersion, a: list.apiVersion })}</p>
    </div>
  );
}
