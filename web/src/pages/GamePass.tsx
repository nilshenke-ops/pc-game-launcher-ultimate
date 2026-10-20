import { useEffect, useMemo, useState } from "react";
import { Download, Gamepad2, Play, RefreshCw, Search, Loader2 } from "lucide-react";
import { client } from "../lib/rpc";
import { useTileAction } from "../components/launch-tiles";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials, relTime } from "../lib/format";
import { Banner, Button, Card, Empty, Loadable, OfflineState, Segmented } from "../components/ui";

interface GamePassGame { id: string; title: string; cover?: string; category?: string; installed: boolean; launchable: boolean; itemId?: string; isNew: boolean }
interface Snapshot { fetchedAt: string; initialAt?: string; market: string; games: { id: string; title: string; cover?: string; category?: string; firstSeen?: string }[] }
interface GamePassList { enabled: boolean; market: string; lastSync?: string; error?: string; syncing: boolean; installScanSupported: boolean; games: GamePassGame[] }
type Show = "all" | "installed" | "new";
const PAGE = 60;

/** "Game Pass" category in the games library: the whole PC Game Pass catalog, installed games marked and playable. */
export function GamePassView({ search }: { search: string }) {
  const q = useRpc<GamePassList>("gamepass.list", {}, ["gamepass", "library", "settings"]);
  const canManage = useCan("manage");
  const [show, setShow] = useState<Show>("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  // Without a PC: the last list from the PC (q.stale), otherwise the website's own copy of the catalog (refreshed daily).
  const [snapshot, setSnapshot] = useState<GamePassList | null | "none">(null);
  const offline = !!q.error && q.error.code === "offline" && !q.data;
  useEffect(() => {
    if (!offline || snapshot) return;
    fetch("gamepass.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((s: Snapshot) => setSnapshot({
      enabled: true, market: s.market, lastSync: s.fetchedAt, syncing: false, installScanSupported: false,
      games: s.games.map((g) => ({ ...g, installed: false, launchable: false,
        isNew: !!g.firstSeen && !!s.initialAt && g.firstSeen > s.initialAt && Date.now() - Date.parse(g.firstSeen) < 14 * 864e5 })),
    })).catch(() => setSnapshot("none"));
  }, [offline, snapshot]);
  const fromSnapshot = offline && snapshot && snapshot !== "none";
  const d = q.data ?? (fromSnapshot ? (snapshot as GamePassList) : undefined);
  const notLive = !!q.stale || !!fromSnapshot;

  const games = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = (d?.games ?? []).filter((g) => (!s || g.title.toLowerCase().includes(s) || (g.category ?? "").toLowerCase().includes(s)) &&
      (show === "all" || (show === "installed" ? g.installed : g.isNew)));
    // Installed first, then new, then A–Z (the companion already sorts by title).
    return [...list.filter((g) => g.installed), ...list.filter((g) => !g.installed && g.isNew), ...list.filter((g) => !g.installed && !g.isNew)];
  }, [d, search, show]);

  const enable = async () => {
    setBusy("enable");
    try { await client.call("settings.save", { gamePassEnabled: true }); toast(t("Game Pass eingeschaltet – Katalog wird geladen"), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const sync = async () => {
    setBusy("sync");
    try { await client.call("gamepass.sync"); } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const tap = useTileAction();
  const play = (g: GamePassGame) => tap.run(g.id, async () => { if (g.itemId) { bumpUsage("item:" + g.itemId); await client.call("library.launch", { id: g.itemId }); } }, t("{name} wird gestartet", { name: g.title }));
  const install = (g: GamePassGame) => tap.run(g.id, () => client.call("gamepass.install", { id: g.id }), t("Xbox-App am PC geöffnet: „{n}“ installieren", { n: g.title }));
  /** Tap on the tile: installed → start, otherwise open it for installing in the Xbox app. */
  const primary = (g: GamePassGame) => void (g.installed && g.itemId ? play(g) : install(g));

  if (offline && snapshot === "none") return <OfflineState />;
  if (offline && !snapshot) return <div className="skeleton" style={{ height: 220 }} />;
  return (
    <Loadable loading={q.loading} error={fromSnapshot ? null : q.error} onRetry={q.reload}>
      {d && !d.enabled ? (
        <Card>
          <Empty icon={<Gamepad2 size={28} />} title={t("Game Pass einschalten")}
            text={t("Der PC liest dann alle 12 Stunden den öffentlichen PC-Game-Pass-Katalog von Microsoft. Du siehst hier alle Game-Pass-Spiele; installierte sind markiert und landen automatisch in deiner Bibliothek. Deinstallierte oder aus dem Game Pass entfernte Spiele verschwinden wieder.")}
            action={canManage ? <Button variant="primary" busy={busy === "enable"} onClick={enable}>{t("Einschalten")}</Button> : <span className="small muted">{t("Einschalten braucht die Berechtigung „Verwalten“.")}</span>} />
        </Card>
      ) : d && (
        <div className="stack">
          <div className="row between">
            <span className="small muted">
              {fromSnapshot ? t("{n} PC-Spiele im Game Pass", { n: d.games.length })
                : t("{n} PC-Spiele im Game Pass · {i} installiert", { n: d.games.length, i: d.games.filter((g) => g.installed).length })}
              {d.lastSync && !notLive ? " · " + t("aktualisiert {t}", { t: relTime(d.lastSync) }) : ""}
            </span>
            <div className="row nowrap">
              <Segmented<Show> value={show} onChange={(v) => { setShow(v); setLimit(PAGE); }} label={t("Anzeige")}
                options={[{ value: "all", label: t("Alle") }, ...(fromSnapshot ? [] : [{ value: "installed" as const, label: t("Installiert") }]), { value: "new", label: t("Neu") }]} />
              {canManage && !notLive && <Button size="sm" icon={<RefreshCw size={15} />} busy={busy === "sync" || d.syncing} onClick={sync} aria-label={t("Katalog aktualisieren")} />}
            </div>
          </div>
          {notLive && <Banner kind="info" title={fromSnapshot ? t("Game-Pass-Katalog (Stand {d})", { d: new Date(d.lastSync ?? "").toLocaleDateString() }) : t("Gespeicherte Liste (Stand {d})", { d: new Date(q.updatedAt ?? 0).toLocaleString() })}>
            {fromSnapshot ? t("Dein PC ist nicht verbunden. Ob ein Spiel installiert ist, siehst du – und spielen oder installieren kannst du –, sobald der PC verbunden ist.") : t("Dein PC ist gerade nicht verbunden. Spielen und Installieren geht, sobald er verbunden ist.")}
          </Banner>}
          {d.error && !notLive && <Banner kind="warn">{d.error}</Banner>}
          {!d.installScanSupported && !notLive && <Banner kind="info">{t("Welche Spiele installiert sind, erkennt nur der Nexus Gaming Hub unter Windows.")}</Banner>}
          {d.games.length === 0 ? (
            <Card><Empty icon={<RefreshCw size={26} />} title={d.syncing ? t("Katalog wird geladen …") : t("Noch kein Katalog")} text={d.syncing ? undefined : t("Auf „Aktualisieren“ tippen.")} /></Card>
          ) : games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} /></Card>
          ) : (
            <>
              <div className="lib-grid">
                {games.slice(0, limit).map((g) => (
                  <article key={g.id} className={`game-card tappable ${g.installed ? "" : "not-installed"} ${tap.busy.has(g.id) ? "busy" : ""}`}
                    {...tap.tile(g.id, g.installed && g.itemId ? t("{name} starten", { name: g.title }) : t("{name} installieren", { name: g.title }), () => primary(g))}>
                    {tap.busy.has(g.id) && <span className="tile-busy"><Loader2 size={28} className="spin" /></span>}
                    <div className="cover" style={{ background: gradientFor(g.title) }}>{g.cover && <img src={`${g.cover}?w=300`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
                    {!g.cover && <div className="initials">{initials(g.title)}</div>}
                    <div className="shade" />
                    <div className="top">
                      {g.installed ? <span className="badge ok">✓ {t("Installiert")}</span> : d.installScanSupported && !fromSnapshot && <span className="badge">{t("Nicht installiert")}</span>}
                      {g.isNew && <span className="badge info">{t("Neu")}</span>}
                    </div>
                    <div className="bottom">
                      <b>{g.title}</b>
                      {g.installed && g.itemId
                        ? <Button variant="primary" size="sm" className="play" icon={<Play size={14} />} onClick={(e) => { e.stopPropagation(); void play(g); }}>{t("Spielen")}</Button>
                        : <Button size="sm" className="play" icon={<Download size={14} />} onClick={(e) => { e.stopPropagation(); void install(g); }} style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}>{t("Installieren")}</Button>}
                    </div>
                  </article>
                ))}
              </div>
              {games.length > limit && <div style={{ textAlign: "center" }}><Button onClick={() => setLimit(limit + PAGE * 2)}>{t("Mehr anzeigen ({n} weitere)", { n: games.length - limit })}</Button></div>}
            </>
          )}
          <p className="tiny muted">{t("Quelle: öffentlicher PC-Game-Pass-Katalog von Microsoft (Markt {m}). Spiele, die über die EA app laufen, werden hier angezeigt, aber nicht automatisch als installiert erkannt.", { m: d.market })}</p>
        </div>
      )}
    </Loadable>
  );
}
