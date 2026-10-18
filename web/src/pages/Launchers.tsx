import { useMemo, useState } from "react";
import { Download, Link2, Play, RefreshCw, Search } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials } from "../lib/format";
import { Banner, Button, Card, Empty, Loadable, Segmented } from "../components/ui";

type Source = "epic" | "ea";
interface LauncherGame { id: string; name: string; cover?: string; installed: boolean; itemId?: string; installable: boolean }
interface LauncherList { source: Source; enabled: boolean; found: boolean; note?: string; games: LauncherGame[] }
const NAMES: Record<Source, string> = { epic: "Epic Games", ea: "EA app" };
const PAGE = 60;

/** "Epic" and "EA" categories in the games library: only what the launchers store on the PC (no login, no official APIs). */
export function LauncherView({ source, search }: { source: Source; search: string }) {
  const q = useRpc<LauncherList>("launchers.list", { source }, ["launchers", "library", "settings"]);
  const conn = useConn();
  const canManage = conn.me?.permissions.includes("manage");
  const [show, setShow] = useState<"all" | "installed">("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;
  const name = NAMES[source];

  const games = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (d?.games ?? []).filter((g) => (!s || g.name.toLowerCase().includes(s)) && (show === "all" || g.installed));
  }, [d, search, show]);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const enableKey = source === "epic" ? "epicEnabled" : "eaEnabled";

  return (
    <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
      {d && !d.enabled ? (
        <Card>
          <Empty icon={<Link2 size={28} />} title={t("{n} verknüpfen", { n: name })}
            text={source === "epic"
              ? t("Deine installierten Epic-Spiele erscheinen dann automatisch in der Bibliothek, deinstallierte verschwinden wieder. Zusätzlich zeigt der PC die Spiele aus dem Bibliotheks-Speicher des Epic Games Launchers – auch nicht installierte. Kein Login nötig.")
              : t("Deine installierten EA-Spiele erscheinen dann automatisch in der Bibliothek, deinstallierte verschwinden wieder. Kein Login nötig. Die ganze EA-Bibliothek lässt sich ohne EA-Login nicht abrufen.")}
            action={canManage ? <Button variant="primary" busy={busy === "enable"} onClick={() => act("enable", () => client.call("settings.save", { [enableKey]: true }), t("{n} verknüpft", { n: name }))}>{t("Verknüpfen")}</Button>
              : <span className="small muted">{t("Verknüpfen braucht die Berechtigung „Verwalten“.")}</span>} />
        </Card>
      ) : d && (
        <div className="stack">
          {q.stale && q.updatedAt && <Banner kind="info" title={t("Gespeicherte Liste (Stand {d})", { d: new Date(q.updatedAt).toLocaleString() })}>{t("Dein PC ist gerade nicht verbunden. Spielen und Installieren geht, sobald er verbunden ist.")}</Banner>}
          <div className="row between">
            <span className="small muted">{t("{n} Spiele · {i} installiert", { n: d.games.length, i: d.games.filter((g) => g.installed).length })}</span>
            <div className="row nowrap">
              {source === "epic" && <Segmented value={show} onChange={(v) => { setShow(v); setLimit(PAGE); }} label={t("Anzeige")} options={[{ value: "all", label: t("Alle") }, { value: "installed", label: t("Installiert") }]} />}
              {canManage && !q.stale && <Button size="sm" icon={<RefreshCw size={15} />} busy={busy === "sync"} onClick={() => act("sync", () => client.call("launchers.sync", { source }))} aria-label={t("Aktualisieren")} />}
            </div>
          </div>
          {!d.found && !q.stale && <Banner kind="warn" title={t("{n} wurde auf dem PC nicht gefunden", { n: name })}>{t("Ist der Launcher installiert? Danach hier auf „Aktualisieren“ tippen.")}</Banner>}
          {d.note && !q.stale && <p className="tiny muted" style={{ margin: 0 }}>{t(d.note)}</p>}
          {d.games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Spiele gefunden")} /></Card>
          ) : games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} /></Card>
          ) : (
            <>
              <div className="lib-grid">
                {games.slice(0, limit).map((g) => (
                  <article key={g.id} className={`game-card ${g.installed ? "" : "not-installed"}`}>
                    <div className="cover" style={{ background: gradientFor(g.name) }}>{g.cover && <img src={g.cover} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
                    {!g.cover && <div className="initials">{initials(g.name)}</div>}
                    <div className="shade" />
                    <div className="top">{g.installed ? <span className="badge ok">✓ {t("Installiert")}</span> : <span className="badge">{t("Nicht installiert")}</span>}</div>
                    <div className="bottom">
                      <b>{g.name}</b>
                      {g.installed && g.itemId
                        ? <Button variant="primary" size="sm" className="play" icon={<Play size={14} />} onClick={() => act("play", async () => { bumpUsage("item:" + g.itemId); await client.call("library.launch", { id: g.itemId }); }, t("{name} wird gestartet", { name: g.name }))}>{t("Spielen")}</Button>
                        : g.installable && <Button size="sm" className="play" icon={<Download size={14} />} onClick={() => act("install", () => client.call("launchers.install", { source, id: g.id }), t("{l} am PC geöffnet: „{n}“ installieren", { l: name, n: g.name }))} style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}>{t("Installieren")}</Button>}
                    </div>
                  </article>
                ))}
              </div>
              {games.length > limit && <div style={{ textAlign: "center" }}><Button onClick={() => setLimit(limit + PAGE * 2)}>{t("Mehr anzeigen ({n} weitere)", { n: games.length - limit })}</Button></div>}
            </>
          )}
        </div>
      )}
    </Loadable>
  );
}
