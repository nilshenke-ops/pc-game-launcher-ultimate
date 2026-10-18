import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Puzzle, CornerDownLeft, Gamepad2, LayoutGrid, Music, Search, Settings, SquareTerminal, Swords, Zap } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { navItems } from "../lib/nav";
import type { InstalledPlugin, PluginList } from "../lib/plugins";
import { bumpUsage, getPrefs, setPrefs } from "../lib/prefs";
import { toast } from "../lib/hooks";
import type { AutomationRule, LibraryItem, ProfilesFile, QuickAction, SoundsFile } from "../lib/types";
import { Modal } from "./ui";
import { runQuickAction } from "./run-quick";
import { score } from "./search-score";

interface Entry { key: string; group: string; label: string; sub?: string; icon: React.ReactNode; run: () => void; keywords?: string }

const SETTINGS_SECTIONS = ["general", "design", "connection", "security", "notifications", "autostart", "updates", "backup", "privacy"];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<{ items: LibraryItem[]; sounds: SoundsFile | null; quick: QuickAction[]; profiles: ProfilesFile | null; rules: AutomationRule[]; plugins: InstalledPlugin[] }>({ items: [], sounds: null, quick: [], profiles: null, rules: [], plugins: [] });

  useEffect(() => {
    if (client.status.auth !== "ok") return;
    Promise.allSettled([
      client.call<{ items: LibraryItem[] }>("library.list"),
      client.call<{ data: SoundsFile }>("sounds.list"),
      client.call<{ actions: QuickAction[] }>("quick.list"),
      client.call<ProfilesFile>("profiles.list"),
      client.call<{ rules: AutomationRule[] }>("automations.list"),
      client.call<PluginList>("plugins.list"),
    ]).then(([l, s, qa, p, r, pl]) => setData({
      items: l.status === "fulfilled" ? l.value.items : [],
      sounds: s.status === "fulfilled" ? s.value.data : null,
      quick: qa.status === "fulfilled" ? qa.value.actions : [],
      profiles: p.status === "fulfilled" ? p.value : null,
      rules: r.status === "fulfilled" ? r.value.rules : [],
      plugins: pl.status === "fulfilled" ? pl.value.plugins : [],
    }));
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => { nav(path); onClose(); };
    const call = (method: string, params: unknown, ok: string) => () => { onClose(); client.call(method, params).then(() => toast(ok, "success")).catch((e) => toast(e.message, "error")); };
    const list: Entry[] = [];
    for (const n of navItems()) list.push({ key: "nav:" + n.path, group: t("Bereiche"), label: n.label, icon: <n.icon size={18} />, run: go(n.path), keywords: n.keywords });
    const sectionLabels: Record<string, string> = { general: t("Allgemein"), design: t("Design & Layout"), connection: t("Verbindung"), security: t("Sicherheit"), notifications: t("Benachrichtigungen"), autostart: t("Autostart & Hintergrund"), updates: t("Updates"), backup: t("Backup & Wiederherstellung"), privacy: t("Datenschutz") };
    for (const s of SETTINGS_SECTIONS) list.push({ key: "set:" + s, group: t("Einstellungen"), label: sectionLabels[s], sub: t("Einstellungen"), icon: <Settings size={18} />, run: go(`/settings?s=${s}`) });
    for (const i of data.items) list.push({
      key: "item:" + i.id, group: i.kind === "game" ? t("Spiele") : t("Programme"), label: i.name, sub: t("Starten"),
      icon: i.iconData ? <img src={i.iconData} alt="" width={22} /> : i.kind === "game" ? <Gamepad2 size={18} /> : <LayoutGrid size={18} />,
      run: call("library.launch", { id: i.id }, t("{name} wird gestartet", { name: i.name })), keywords: i.categories.join(" "),
    });
    for (const s of data.sounds?.sounds ?? []) list.push({ key: "snd:" + s.id, group: t("Sounds"), label: s.name, sub: t("Abspielen"), icon: <Music size={18} />, run: call("sounds.play", { id: s.id }, t("Sound gestartet")), keywords: s.categories.join(" ") });
    for (const a of data.quick) list.push({ key: "qa:" + a.id, group: t("Quick Actions"), label: a.name, sub: t("Ausführen"), icon: <Zap size={18} />, run: () => { onClose(); runQuickAction(a); }, keywords: a.category ?? "" });
    for (const p of data.profiles?.profiles ?? []) list.push({ key: "prof:" + p.id, group: t("Gaming-Profile"), label: p.name, sub: t("Aktivieren"), icon: <Swords size={18} />, run: call("profiles.activate", { id: p.id }, t("Profil aktiviert")) });
    for (const pl of data.plugins) {
      if (!pl.manifest) continue;
      list.push({ key: "plg:" + pl.id, group: t("Plugins"), label: pl.manifest.name, sub: pl.enabled ? t("Aktiv") : t("Aus"), icon: <Puzzle size={18} />, run: go("/plugins"), keywords: pl.manifest.description });
      if (pl.enabled) for (const a of pl.manifest.contributes.actions)
        list.push({ key: `plga:${pl.id}:${a.id}`, group: t("Plugins"), label: a.name, sub: pl.manifest.name, icon: <Puzzle size={18} />, run: call("plugins.runAction", { id: pl.id, actionId: a.id }, t("Aktion ausgeführt")) });
    }
    for (const r of data.rules) list.push({ key: "rule:" + r.id, group: t("Automatisierungen"), label: r.name, sub: t("Öffnen"), icon: <Bot size={18} />, run: go("/automations") });
    list.push(
      { key: "cmd:stop", group: t("Befehle"), label: t("Alle Sounds stoppen"), icon: <SquareTerminal size={18} />, run: call("sounds.stopAll", {}, t("Alle Sounds gestoppt")) },
      { key: "cmd:diag", group: t("Befehle"), label: t("Diagnose ausführen"), icon: <SquareTerminal size={18} />, run: go("/diagnostics?run=1") },
      { key: "cmd:theme", group: t("Befehle"), label: t("Hell/Dunkel umschalten"), icon: <SquareTerminal size={18} />, run: () => { setPrefs((p) => ({ ...p, theme: { ...p.theme, mode: p.theme.mode === "dark" ? "light" : "dark", background: p.theme.mode === "dark" ? "#eef2f7" : "#070b16" } })); onClose(); } },
      { key: "cmd:lang", group: t("Befehle"), label: t("Sprache wechseln (Deutsch/English)"), icon: <SquareTerminal size={18} />, run: () => { setPrefs((p) => ({ ...p, lang: p.lang === "de" ? "en" : "de" })); onClose(); } },
      { key: "cmd:revert", group: t("Befehle"), label: t("Zum vorherigen Profil wechseln"), icon: <SquareTerminal size={18} />, run: call("profiles.revert", {}, t("Profil gewechselt")) },
    );
    return list;
  }, [data, nav, onClose]);

  const results = useMemo(() => {
    const usage = getPrefs().usage;
    return entries
      .map((e) => ({ e, s: Math.max(score(e.label, q, usage[e.key] ?? 0), e.keywords ? score(e.keywords, q) * 0.5 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 40 : 14)
      .map((x) => x.e);
  }, [entries, q]);

  useEffect(() => setSel(0), [q]);

  const run = (e: Entry) => { bumpUsage(e.key); e.run(); };
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    if (ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (ev.key === "Enter" && results[sel]) { ev.preventDefault(); run(results[sel]); }
  };

  let lastGroup = "";
  return (
    <Modal title={t("Suche")} onClose={onClose} className="palette">
      <div className="palette-input" style={{ margin: "-20px -20px 0" }}>
        <Search size={20} className="muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t("Spiele, Sounds, Einstellungen, Befehle …")} aria-label={t("Suche")} role="combobox" aria-expanded aria-controls="palette-results" />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-results" id="palette-results" role="listbox" style={{ margin: "0 -12px -12px" }}>
        {results.length === 0 && <div className="empty"><b>{t("Keine Treffer")}</b><p>{t("Versuche einen anderen Suchbegriff.")}</p></div>}
        {results.map((e, i) => {
          const header = e.group !== lastGroup ? <div className="palette-group">{e.group}</div> : null;
          lastGroup = e.group;
          return (
            <div key={e.key}>
              {header}
              <button className={`palette-item ${i === sel ? "sel" : ""}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(e)}>
                <span className="ico">{e.icon}</span>
                <span className="grow"><div className="ellipsis">{e.label}</div>{e.sub && <div className="sub">{e.sub}</div>}</span>
                {i === sel && <CornerDownLeft size={16} className="muted" />}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
