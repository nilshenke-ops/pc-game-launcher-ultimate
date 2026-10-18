import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Link2, Play, Plus, RefreshCw, Search, Unlink } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast, useCan } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials, relTime } from "../lib/format";
import { Banner, Button, Card, Empty, Field, Loadable, Segmented } from "../components/ui";

const REPO_SECRETS = "https://github.com/nilshenke-ops/pc-game-launcher-ultimate/settings/secrets/actions";

interface SteamGame { appId: string; name: string; cover: string; installed: boolean; itemId?: string; playtimeMinutes?: number; lastPlayed?: string }
interface SteamList {
  enabled: boolean; steamFound: boolean; linked: boolean; steamId?: string; persona?: string; keySet: boolean;
  localAccount?: { steamId: string; name?: string }; lastSync?: string; error?: string; syncing: boolean; games: SteamGame[];
}
type Show = "all" | "installed";
const PAGE = 60;

/** Steam cover: tall library art, falls back to the wide header picture, then to initials. */
function SteamCover({ g }: { g: SteamGame }) {
  const [src, setSrc] = useState(g.cover);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div className="cover" style={{ background: gradientFor(g.name) }}>
        {!failed && <img src={src} alt="" loading="lazy" onError={() => { if (src.includes("cdn.cloudflare.steamstatic.com") && src.endsWith("library_600x900.jpg")) setSrc(src.replace("library_600x900.jpg", "header.jpg")); else setFailed(true); }} />}
      </div>
      {failed && <div className="initials">{initials(g.name)}</div>}
    </>
  );
}

/** "Steam" category in the games library. */
export function SteamView({ search }: { search: string }) {
  const q = useRpc<SteamList>("steam.list", {}, ["steam", "library", "settings"]);
  const conn = useConn();
  const canManage = useCan("manage");
  const isAdmin = conn.me?.permissions.includes("admin");
  const [show, setShow] = useState<Show>("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [profile, setProfile] = useState("");
  const [key, setKey] = useState("");
  // Without a PC: the last list from the PC (q.stale), otherwise the copy GitHub publishes with the website (steam.json).
  const offline = !!q.error && q.error.code === "offline" && !q.data;
  const [web, setWeb] = useState<SteamList | null | "none">(null);
  useEffect(() => {
    if (!offline || web) return;
    fetch("steam.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((s: { fetchedAt: string; persona?: string; games: (Omit<SteamGame, "cover" | "installed"> & { cover?: string })[] }) => setWeb({
      enabled: true, steamFound: true, linked: true, persona: s.persona, keySet: true, lastSync: s.fetchedAt, syncing: false,
      games: s.games.map((g) => ({ ...g, installed: false, cover: g.cover ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/library_600x900.jpg` })),
    })).catch(() => setWeb("none"));
  }, [offline, web]);
  const fromWeb = offline && web && web !== "none";
  const d = q.data ?? (fromWeb ? (web as SteamList) : undefined);
  const notLive = !!q.stale || !!fromWeb;

  const games = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (d?.games ?? []).filter((g) => (!s || g.name.toLowerCase().includes(s)) && (show === "all" || g.installed));
  }, [d, search, show]);

  const act = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name);
    try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  // Games already in the library (also ones picked here without the PC) – the rest can be added, even before the PC is connected.
  const lib = useRpc<{ items: { source: string; target: string }[] }>("library.list", {}, ["library"]);
  const inLibrary = new Set((lib.data?.items ?? []).filter((i) => i.source === "steam").map((i) => i.target));
  const addToLibrary = (g: SteamGame) => act("add:" + g.appId, () => client.call("library.addSteam", { appId: g.appId, name: g.name }), t("„{n}“ zur Bibliothek hinzugefügt", { n: g.name }));
  const play = (g: SteamGame) => act("play", async () => { bumpUsage("item:" + g.itemId); await client.call("library.launch", { id: g.itemId }); }, t("{name} wird gestartet", { name: g.name }));
  const install = (g: SteamGame) => act("install", () => client.call("steam.install", { appId: g.appId }), t("Steam am PC geöffnet: „{n}“ installieren", { n: g.name }));
  const link = () => act("link", async () => { await client.call("steam.link", { profile: profile || d?.localAccount?.steamId || "", apiKey: key }); setKey(""); setLinkOpen(false); }, t("Steam-Bibliothek verbunden"));

  if (offline && !web) return <div className="skeleton" style={{ height: 220 }} />;
  if (offline && web === "none") return <SteamWithoutPc />;
  return (
    <Loadable loading={q.loading} error={fromWeb ? null : q.error} onRetry={q.reload}>
      {d && !d.enabled ? (
        <Card>
          <Empty icon={<Link2 size={28} />} title={t("Steam verknüpfen")}
            text={t("Deine installierten Steam-Spiele erscheinen dann automatisch in der Bibliothek – deinstallierte verschwinden wieder. Dafür wird kein Steam-Passwort gebraucht; der PC liest nur die Steam-Ordner auf deinem PC.")}
            action={canManage ? <Button variant="primary" busy={busy === "enable"} onClick={() => act("enable", () => client.call("settings.save", { steamEnabled: true }), t("Steam verknüpft"))}>{t("Verknüpfen")}</Button>
              : <span className="small muted">{t("Verknüpfen braucht die Berechtigung „Verwalten“.")}</span>} />
        </Card>
      ) : d && (
        <div className="stack">
          {fromWeb && <Banner kind="info" title={t("Steam-Bibliothek{p} (Stand {d})", { p: d.persona ? ` von ${d.persona}` : "", d: new Date(d.lastSync ?? "").toLocaleString() })}>{t("Dein PC ist nicht verbunden. Welche Spiele installiert sind, siehst du – und spielen oder installieren kannst du –, sobald der PC verbunden ist.")}</Banner>}
          {q.stale && q.updatedAt && <Banner kind="info" title={t("Gespeicherte Liste (Stand {d})", { d: new Date(q.updatedAt).toLocaleString() })}>{t("Dein PC ist gerade nicht verbunden. Spielen und Installieren geht, sobald er verbunden ist.")}</Banner>}
          <div className="row between">
            <span className="small muted">
              {fromWeb ? t("{n} Steam-Spiele", { n: d.games.length }) : t("{n} Steam-Spiele · {i} installiert", { n: d.games.length, i: d.games.filter((g) => g.installed).length })}
              {d.linked && d.persona ? " · " + d.persona : ""}
              {d.lastSync && !notLive ? " · " + t("aktualisiert {t}", { t: relTime(d.lastSync) }) : ""}
            </span>
            <div className="row nowrap">
              {!fromWeb && <Segmented<Show> value={show} onChange={(v) => { setShow(v); setLimit(PAGE); }} label={t("Anzeige")} options={[{ value: "all", label: t("Alle") }, { value: "installed", label: t("Installiert") }]} />}
              {canManage && !notLive && <Button size="sm" icon={<RefreshCw size={15} />} busy={busy === "sync" || d.syncing} onClick={() => act("sync", () => client.call("steam.sync"))} aria-label={t("Aktualisieren")} />}
            </div>
          </div>
          {!d.steamFound && !notLive && <Banner kind="warn" title={t("Steam wurde auf dem PC nicht gefunden")}>{t("Ist Steam installiert? Der PC sucht im Steam-Ordner (Standard: C:\\Program Files (x86)\\Steam).")}</Banner>}
          {d.error && !notLive && <Banner kind="warn">{d.error}</Banner>}

          {!notLive && (d.linked ? (
            <div className="row small muted">
              <span>{t("Ganze Steam-Bibliothek verbunden{p}", { p: d.persona ? ` (${d.persona})` : "" })}</span>
              {isAdmin && <Button size="sm" variant="ghost" icon={<Unlink size={14} />} onClick={() => act("unlink", () => client.call("steam.unlink"), t("Steam-Bibliothek getrennt"))}>{t("Trennen")}</Button>}
            </div>
          ) : !linkOpen ? (
            <Card className="flat">
              <div className="row between">
                <span className="small">{t("Auch nicht installierte Steam-Spiele anzeigen?")}</span>
                <Button size="sm" onClick={() => { setLinkOpen(true); setProfile(d.localAccount?.steamId ?? ""); }}>{t("Ganze Bibliothek verbinden")}</Button>
              </div>
            </Card>
          ) : (
            <Card title={t("Ganze Steam-Bibliothek verbinden")}>
              <div className="stack">
                <ol className="steps small">
                  <li>{t("Öffne steamcommunity.com/dev/apikey, melde dich bei Steam an, trage als Domain z. B. „localhost“ ein und kopiere den Schlüssel (32 Zeichen).")} <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">{t("Öffnen")} <ExternalLink size={12} /></a></li>
                  <li>{t("Stelle in Steam unter Profil → Privatsphäre-Einstellungen „Spieldetails“ auf „Öffentlich“.")}</li>
                  <li>{t("Trage Schlüssel und Profil hier ein. Der Schlüssel wird verschlüsselt nur auf dem PC gespeichert; dein Steam-Passwort wird nie gebraucht.")}</li>
                </ol>
                <Field label={t("Steam-Profil")} hint={d.localAccount ? t("Erkannt auf dem PC: {n}", { n: d.localAccount.name ?? d.localAccount.steamId }) : t("Profillink (steamcommunity.com/id/…) oder 17-stellige Steam-ID")}>
                  <input className="input mono" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="https://steamcommunity.com/id/…" autoCapitalize="off" spellCheck={false} />
                </Field>
                <Field label={t("Steam-Web-API-Schlüssel")}>
                  <input className="input mono" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" autoCapitalize="characters" spellCheck={false} autoComplete="off" />
                </Field>
                {isAdmin ? (
                  <div className="row">
                    <Button variant="primary" busy={busy === "link"} disabled={key.length !== 32 || !(profile || d.localAccount)} onClick={link}>{t("Verbinden")}</Button>
                    <Button variant="ghost" onClick={() => setLinkOpen(false)}>{t("Abbrechen")}</Button>
                  </div>
                ) : <Banner kind="info">{t("Das Verbinden geht direkt am PC oder mit einem Gerät mit Admin-Berechtigung, weil dabei ein Schlüssel gespeichert wird.")}</Banner>}
              </div>
            </Card>
          ))}

          {d.games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Steam-Spiele gefunden")} text={d.steamFound ? t("Installiere ein Spiel in Steam oder verbinde die ganze Bibliothek.") : undefined} /></Card>
          ) : games.length === 0 ? (
            <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} /></Card>
          ) : (
            <>
              <div className="lib-grid">
                {games.slice(0, limit).map((g) => (
                  <article key={g.appId} className={`game-card ${g.installed ? "" : "not-installed"}`}>
                    <SteamCover g={g} />
                    <div className="shade" />
                    <div className="top">
                      {g.installed ? <span className="badge ok">✓ {t("Installiert")}</span> : !fromWeb && <span className="badge">{t("Nicht installiert")}</span>}
                      {!!g.playtimeMinutes && <span className="badge">{t("{h} Std.", { h: Math.round(g.playtimeMinutes / 60) })}</span>}
                    </div>
                    <div className="bottom">
                      <b>{g.name}</b>
                      {g.installed && g.itemId
                        ? <Button variant="primary" size="sm" className="play" icon={<Play size={14} />} onClick={() => play(g)}>{t("Spielen")}</Button>
                        : <div className="row nowrap" style={{ gap: 6 }}>
                            <Button size="sm" className="play grow" icon={<Download size={14} />} onClick={() => install(g)} style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}>{t("Installieren")}</Button>
                            {canManage && !g.itemId && (inLibrary.has(g.appId)
                              ? <span className="badge ok" title={t("In der Bibliothek")}>✓</span>
                              : <Button size="sm" busy={busy === "add:" + g.appId} icon={<Plus size={14} />} aria-label={t("„{n}“ zur Bibliothek hinzufügen", { n: g.name })} onClick={() => addToLibrary(g)} style={{ background: "rgba(0,0,0,.55)", color: "#fff" }} />)}
                          </div>}
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

/** No PC and no published Steam list yet: explains both ways to see the Steam games. */
function SteamWithoutPc() {
  return (
    <Card title={t("Steam-Spiele ohne PC sehen")}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{t("Steam erlaubt Webseiten nicht, deine Spieleliste direkt abzurufen. Es gibt zwei Wege:")}</p>
        <div className="stack-sm">
          <b className="small">{t("A) Einmal mit dem PC verbinden")}</b>
          <span className="small muted">{t("Spiele → Steam → „Verknüpfen“ (und optional „Ganze Bibliothek verbinden“). Danach merkt sich dieses Gerät die Liste und zeigt sie auch ohne PC.")}</span>
        </div>
        <div className="stack-sm">
          <b className="small">{t("B) Ganz ohne PC – über GitHub (alle 6 Stunden aktuell)")}</b>
          <ol className="steps small">
            <li>{t("Steam-Web-API-Schlüssel erstellen: steamcommunity.com/dev/apikey (Domain z. B. „localhost“).")} <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">{t("Öffnen")} <ExternalLink size={12} /></a></li>
            <li>{t("In Steam unter Profil → Privatsphäre-Einstellungen „Spieldetails“ auf „Öffentlich“ stellen.")}</li>
            <li>{t("In deinem GitHub-Projekt unter Settings → Secrets and variables → Actions zwei Secrets anlegen: STEAM_API_KEY (der Schlüssel) und STEAM_ID (dein Profillink oder deine Steam-ID).")} <a href={`${REPO_SECRETS}/new`} target="_blank" rel="noreferrer">{t("Öffnen")} <ExternalLink size={12} /></a></li>
          </ol>
          <span className="tiny muted">{t("Der Schlüssel bleibt geheim bei GitHub. Veröffentlicht werden nur Spielnamen und Spielzeit – dieselben Angaben, die bei „Spieldetails: Öffentlich“ ohnehin auf deinem Steam-Profil sichtbar sind.")}</span>
        </div>
      </div>
    </Card>
  );
}
