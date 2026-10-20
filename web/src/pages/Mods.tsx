import { useEffect, useState } from "react";
import { Archive, FileArchive, Folder, Package, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, PageHead, Switch } from "../components/ui";
import type { FilesList } from "../lib/transfer";

interface ModEntry { name: string; folder: boolean; size: number; modified: string; enabled: boolean }
interface ModBackup { name: string; size: number; at: string; reason: string }
interface ModList { itemId: string; game: string; modsPath: string; exists: boolean; running: boolean; mods: ModEntry[]; backups: ModBackup[] }
interface Overview { games: { itemId: string; name: string; modsPath?: string | null; installed: boolean }[] }

/** Folder-based mods per game: on/off, install from a ZIP, remove – with a backup before every change. */
export default function ModsPage() {
  const ov = useRpc<Overview>("mods.overview", {}, ["mods", "library"]);
  const [itemId, setItemId] = useState<string>("");
  const games = ov.data?.games ?? [];
  useEffect(() => { if (!itemId && games.length) setItemId((games.find((g) => g.modsPath) ?? games[0]).itemId); }, [games, itemId]);
  const game = games.find((g) => g.itemId === itemId);
  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Mods")}
        text={t("Mods eines Spiels an- und ausschalten, aus einer ZIP-Datei installieren und entfernen. Vor jeder Änderung sichert der PC den Mod-Ordner – du kannst jederzeit zurück.")} />
      <Loadable loading={ov.loading} error={ov.error} onRetry={ov.reload}>
        {games.length === 0 ? <Card><Empty icon={<Package size={26} />} title={t("Keine Spiele mit Installationsordner")} text={t("Mods gehen für Spiele, deren Ordner der PC kennt (Steam, Epic, eigene Spiele mit Ordner).")} /></Card> : (
          <div className="stack">
            <Field label={t("Spiel")}>
              <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {games.map((g) => <option key={g.itemId} value={g.itemId}>{g.name}{g.modsPath ? ` (${g.modsPath})` : ""}</option>)}
              </select>
            </Field>
            {game && (game.modsPath ? <GameMods itemId={game.itemId} /> : <Configure itemId={game.itemId} />)}
          </div>
        )}
      </Loadable>
    </>
  );
}

function Configure({ itemId, current }: { itemId: string; current?: string }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const sug = useRpc<{ folders: string[] }>("mods.suggest", { itemId }, []);
  const [path, setPath] = useState(current ?? "");
  useEffect(() => { if (!current && sug.data?.folders[0]) setPath(sug.data.folders[0]); }, [sug.data, current]);
  const save = () => client.call("mods.configure", { itemId, modsPath: path.trim() }).then(() => toast(t("Mod-Ordner gespeichert"), "success"), (e: Error) => toast(e.message, "error"));
  return (
    <Card title={t("Mod-Ordner einstellen")} icon={<Folder size={18} />}>
      <div className="stack-sm">
        <p className="small muted" style={{ margin: 0 }}>{t("Unterordner im Spiel, in dem die Mods liegen – z. B. „Mods“ (Stardew Valley, The Sims), „BepInEx/plugins“ (Unity-Spiele) oder „Content/Paks/~mods“ (Unreal).")}</p>
        {!!sug.data?.folders.length && <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{sug.data.folders.map((f) => <button key={f} type="button" className={`chip ${path === f ? "on" : ""}`} onClick={() => setPath(f)}>{f}</button>)}</div>}
        <div className="row nowrap" style={{ gap: 8 }}>
          <input className="input mono" value={path} maxLength={200} placeholder="Mods" aria-label={t("Mod-Ordner")} onChange={(e) => setPath(e.target.value)} />
          <Button variant="primary" disabled={!canManage || !online || !path.trim()} onClick={save}>{t("Speichern")}</Button>
        </div>
        {!online && <p className="tiny muted">{t("Braucht den PC (der Ordner wird dort geprüft).")}</p>}
      </div>
    </Card>
  );
}

function GameMods({ itemId }: { itemId: string }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<ModList>("mods.list", { itemId }, ["mods"]);
  const files = useRpc<FilesList>("files.list", {}, ["files"]);
  const [edit, setEdit] = useState(false);
  const zips = (files.data?.files ?? []).filter((f) => f.name.toLowerCase().endsWith(".zip"));
  const d = q.data;
  const can = canManage && online && !d?.running;

  const toggle = (m: ModEntry, enabled: boolean) => client.call("mods.toggle", { itemId, name: m.name, enabled }).catch((e: Error) => toast(e.message, "error"));
  const remove = async (m: ModEntry) => {
    if (!(await confirmDialog(t("Mod entfernen?"), t("„{n}“ wird gelöscht. Vorher sichert der PC den Mod-Ordner.", { n: m.name }), { danger: true, ok: t("Entfernen") }))) return;
    client.call("mods.remove", { itemId, name: m.name }).then(() => toast(t("Entfernt – Sicherung angelegt"), "success"), (e: Error) => toast(e.message, "error"));
  };
  const install = async (zip: string) => {
    try {
      const p = await client.call<{ files: number; bytes: number; overwrite: string[] }>("mods.preview", { itemId, zip });
      const msg = p.overwrite.length
        ? t("{n} Dateien ({s}). Diese werden überschrieben: {o}", { n: p.files, s: bytes(p.bytes), o: p.overwrite.slice(0, 8).join(", ") + (p.overwrite.length > 8 ? " …" : "") })
        : t("{n} Dateien ({s}), nichts wird überschrieben.", { n: p.files, s: bytes(p.bytes) });
      if (!(await confirmDialog(t("„{z}“ installieren?", { z: zip }), msg + " " + t("Vorher sichert der PC den Mod-Ordner."), { ok: t("Installieren") }))) return;
      const r = await client.call<{ installed: number }>("mods.install", { itemId, zip, overwrite: p.overwrite.length > 0 });
      toast(t("{n} Dateien installiert – Sicherung angelegt", { n: r.installed }), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const restore = async (b: ModBackup) => {
    if (!(await confirmDialog(t("Sicherung zurückholen?"), t("Der Mod-Ordner wird auf den Stand vom {d} gesetzt ({r}). Der jetzige Stand wird vorher gesichert.", { d: dateTime(b.at), r: b.reason }), { ok: t("Zurückholen") }))) return;
    client.call("mods.restore", { itemId, backup: b.name }).then(() => toast(t("Sicherung zurückgeholt"), "success"), (e: Error) => toast(e.message, "error"));
  };

  return (
    <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
      {d && (
        <div className="stack">
          {q.stale && <Banner kind="info">{t("Ohne PC: Stand vom {d}. Ändern geht erst mit dem PC.", { d: dateTime(q.updatedAt ? new Date(q.updatedAt).toISOString() : null) })}</Banner>}
          {d.running && <Banner kind="warn">{t("{n} läuft gerade – Mods lassen sich erst nach dem Beenden ändern.", { n: d.game })}</Banner>}
          <Card title={t("Mods in „{p}“", { p: d.modsPath })} icon={<Package size={18} />} actions={canManage && <Button size="sm" variant="ghost" onClick={() => setEdit((x) => !x)}>{t("Ordner ändern")}</Button>}>
            {edit && <Configure itemId={itemId} current={d.modsPath} />}
            {!d.exists && <p className="small muted">{t("Der Ordner existiert noch nicht – er entsteht bei der ersten Installation.")}</p>}
            {d.mods.length === 0 ? <p className="small muted">{t("Noch keine Mods in diesem Ordner.")}</p> : (
              <div className="list">
                {d.mods.map((m) => (
                  <div key={m.name + m.enabled} className="list-item">
                    {m.folder ? <Folder size={18} className="muted" /> : <Package size={18} className="muted" />}
                    <div className="grow" style={{ minWidth: 0 }}><div className="title small ellipsis">{m.name}</div><div className="sub tiny">{bytes(m.size)} · {dateTime(m.modified)}</div></div>
                    <Switch checked={m.enabled} disabled={!can} onChange={(v) => void toggle(m, v)} label={<span className="sr-only">{m.enabled ? t("An") : t("Aus")}</span>} />
                    {can && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Entfernen")} onClick={() => void remove(m)} />}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title={t("Aus ZIP installieren")} icon={<FileArchive size={18} />}>
            {zips.length === 0 ? <p className="small muted">{t("Lege die Mod als ZIP in den Austausch-Ordner – am Handy unter")} <Link to="/files">{t("Dateien")}</Link> {t("senden oder am PC hineinkopieren.")}</p> : (
              <div className="list">{zips.map((z) => (
                <div key={z.name} className="list-item">
                  <FileArchive size={18} className="muted" /><div className="grow" style={{ minWidth: 0 }}><div className="title small ellipsis">{z.name}</div><div className="sub tiny">{bytes(z.size)}</div></div>
                  <Button size="sm" disabled={!can} onClick={() => void install(z.name)}>{t("Installieren")}</Button>
                </div>
              ))}</div>
            )}
            <p className="tiny muted" style={{ marginTop: 8 }}>{t("Der PC prüft jede Datei der ZIP: nichts darf außerhalb des Mod-Ordners landen. Ausgeführt wird nichts.")}</p>
          </Card>
          <Card title={t("Sicherungen ({n})", { n: d.backups.length })} icon={<Archive size={18} />}>
            {d.backups.length === 0 ? <p className="small muted">{t("Noch keine – sie entstehen automatisch vor dem Installieren, Entfernen und Zurückholen (die letzten 5 bleiben).")}</p> : (
              <div className="list">{d.backups.map((b) => (
                <div key={b.name} className="list-item">
                  <div className="grow" style={{ minWidth: 0 }}><div className="title small">{dateTime(b.at)}</div><div className="sub tiny ellipsis">{b.reason} · {bytes(b.size)}</div></div>
                  <Button size="sm" icon={<RotateCcw size={14} />} disabled={!can} onClick={() => void restore(b)}>{t("Zurückholen")}</Button>
                </div>
              ))}</div>
            )}
          </Card>
        </div>
      )}
    </Loadable>
  );
}
