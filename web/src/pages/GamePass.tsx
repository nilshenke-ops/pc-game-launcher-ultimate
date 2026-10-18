import { useMemo, useState } from "react";
import { Download, Gamepad2, Play, RefreshCw, Search } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials, relTime } from "../lib/format";
import { Banner, Button, Card, Empty, Loadable, Segmented } from "../components/ui";

interface GamePassGame { id: string; title: string; cover?: string; category?: string; installed: boolean; launchable: boolean; itemId?: string; isNew: boolean }
interface GamePassList { enabled: boolean; market: string; lastSync?: string; error?: string; syncing: boolean; installScanSupported: boolean; games: GamePassGame[] }
type Show = "all" | "installed" | "new";
const PAGE = 60;

/** "Game Pass" category in the games library: the whole PC Game Pass catalog, installed games marked and playable. */
export function GamePassView({ search }: { search: string }) {
  const q = useRpc<GamePassList>("gamepass.list", {}, ["gamepass", "library", "settings"]);
  const conn = useConn();
  const canManage = conn.me?.permissions.includes("manage");
  const [show, setShow] = useState<Show>("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;

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
  const play = async (g: GamePassGame) => {
    if (!g.itemId) return;
    bumpUsage("item:" + g.itemId);
    try { await client.call("library.launch", { id: g.itemId }); toast(t("{name} wird gestartet", { name: g.title }), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const install = async (g: GamePassGame) => {
    try { await client.call("gamepass.install", { id: g.id }); toast(t("Xbox-App am PC geöffnet: „{n}“ installieren", { n: g.title }), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
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
              {t("{n} PC-Spiele im Game Pass · {i} installiert", { n: d.games.length, i: d.games.filter((g) => g.installed).length })}
              {d.lastSync ? " · " + t("aktualisiert {t}", { t: relTime(d.lastSync) }) : ""}
            </span>
            <div className="row nowrap">
              <Segmented<Show> value={show} onChange={(v) => { setShow(v); setLimit(PAGE); }} label={t("Anzeige")} options={[{ value: "all", label: t("Alle") }, { value: "installed", label: t("Installiert") }, { value: "new", label: t("Neu") }]} />
              {canManage && <Button size="sm" icon={<RefreshCw size={15} />} busy={busy === "sync" || d.syncing} onClick={sync} aria-label={t("Katalog aktualisieren")} />}
            </div>
          </div>
          {d.error && <Banner kind="warn">{d.error}</Banner>}
          {!d.installScanSupported && <Banner kind="info">{t("Welche Spiele installiert sind, erkennt nur der PC Game Launcher unter Windows.")}</Banner>}
          {d.games.length === 0 ? (
            <Card><Empty icon={<RefreshCw size={26} />} title={d.syncing ? t("Katalog wird geladen …") : t("Noch kein Katalog")} text={d.syncing ? undefined : t("Auf „Aktualisieren“ tippen.")} /></Card>
          ) : games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} /></Card>
          ) : (
            <>
              <div className="lib-grid">
                {games.slice(0, limit).map((g) => (
                  <article key={g.id} className={`game-card ${g.installed ? "" : "not-installed"}`}>
                    <div className="cover" style={{ background: gradientFor(g.title) }}>{g.cover && <img src={`${g.cover}?w=300`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
                    {!g.cover && <div className="initials">{initials(g.title)}</div>}
                    <div className="shade" />
                    <div className="top">
                      {g.installed ? <span className="badge ok">✓ {t("Installiert")}</span> : d.installScanSupported && <span className="badge">{t("Nicht installiert")}</span>}
                      {g.isNew && <span className="badge info">{t("Neu")}</span>}
                    </div>
                    <div className="bottom">
                      <b>{g.title}</b>
                      {g.installed && g.itemId
                        ? <Button variant="primary" size="sm" className="play" icon={<Play size={14} />} onClick={() => play(g)}>{t("Spielen")}</Button>
                        : <Button size="sm" className="play" icon={<Download size={14} />} onClick={() => install(g)} style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}>{t("Installieren")}</Button>}
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
