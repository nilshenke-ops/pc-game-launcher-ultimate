// Savegame vault and configuration versions. The PC does all file work; this page shows places, rules and backups,
// prepares rules without the PC (queued) and always shows a preview before a restore.
import { useMemo, useState } from "react";
import { Archive, Check, FileCog, FolderSearch, GitCompare, History, Plus, RotateCcw, ShieldCheck, Trash2, Vault as VaultIcon } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { bytes, dateTime, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented } from "../components/ui";

interface Loc { id: string; itemId?: string | null; game?: string | null; name: string; kind: "saves" | "config"; path: string; auto: "off" | "afterPlay" | "daily"; keep: number; source: string; exists: boolean; backups: number; zipBytes: number; last?: string | null; running: boolean }
interface Backup { name: string; at: string; reason: string; bytes: number; zipBytes: number; files: number }
interface Suggestion { name: string; kind: string; path: string; source: string; hint: string }
interface Preview { backup: string; at: string; reason: string; same: number; changed: { path: string; current: string; backup: string; currentIsNewer: boolean }[]; back: string[]; removed: string[]; newerNow: number; running: boolean; cloud: boolean; note?: string | null }
type DiffResult = { mode: "keys"; same: number; changes: { kind: "added" | "removed" | "changed"; key: string; old?: string | null; new?: string | null }[] } | { mode: "lines"; lines: { kind: "same" | "add" | "del" | "skip" | "info"; text: string }[] };

const SOURCE: Record<string, string> = { "steam-cloud": "Steam-Cloud", "same-name": "Gleicher Name", manual: "Von Hand" };
const RULES = [{ value: "off", label: "Aus" }, { value: "afterPlay", label: "Nach dem Spielen" }, { value: "daily", label: "Täglich" }] as const;

export default function VaultPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const q = useRpc<{ locations: Loc[] }>("vault.list", {}, ["vault"]);
  const [adding, setAdding] = useState(false);
  const locs = q.data?.locations ?? [];
  const byGame = useMemo(() => {
    const m = new Map<string, Loc[]>();
    for (const l of locs) { const k = l.game ?? t("Ohne Spiel"); m.set(k, [...(m.get(k) ?? []), l]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [locs]);

  return (
    <>
      <PageHead eyebrow={t("Spiele")} title={t("Savegame-Tresor")}
        text={t("Sichert Spielstände und Konfigurationsdateien deiner Spiele – mit Prüfsumme, Verlauf und Vorschau vor dem Zurückholen. Gesichert wird auf dem PC; ohne PC kannst du Regeln vorbereiten.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={16} />} disabled={!online} onClick={() => setAdding(true)}>{t("Ort hinzufügen")}</Button>} />
      {!online && <div style={{ marginBottom: 14 }}><Banner kind="info">{t("Ohne PC: Regeln (automatisch sichern, wie viele behalten) kannst du ändern – sie werden beim Verbinden übertragen. Sichern, Prüfen und Zurückholen gehen nur mit dem PC.")}</Banner></div>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {locs.length === 0 ? (
          <Card><Empty icon={<VaultIcon size={28} />} title={t("Noch keine Orte")} text={t("Wähle ein Spiel – der PC schlägt nur sichere Orte vor (Steam-Cloud-Ordner des Spiels oder Ordner mit genau dem Namen des Spiels). Nichts wird automatisch eingetragen.")}
            action={canManage && online && <Button variant="primary" icon={<FolderSearch size={16} />} onClick={() => setAdding(true)}>{t("Orte suchen")}</Button>} /></Card>
        ) : byGame.map(([game, list]) => (
          <div key={game} className="stack" style={{ marginBottom: 16 }}>
            <h2 className="section-title">{game}</h2>
            {list.map((l) => <LocationCard key={l.id} l={l} online={online} canManage={canManage} onChanged={q.reload} />)}
          </div>
        ))}
      </Loadable>
      {adding && <AddPlace isPc={!!conn.me?.isLocal} onClose={() => { setAdding(false); q.reload(); }} />}
    </>
  );
}

function LocationCard({ l, online, canManage, onChanged }: { l: Loc; online: boolean; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const configure = (p: Partial<Pick<Loc, "auto" | "keep">>) => client.call("vault.configure", { id: l.id, ...p })
    .then(() => { toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"); onChanged(); }, (e: Error) => toast(e.message, "error"));
  const backupNow = async () => {
    setBusy(true);
    try { const r = await client.call<Backup | null>("vault.backup", { id: l.id }); toast(r ? t("Gesichert: {n} Dateien, {s}", { n: r.files, s: bytes(r.zipBytes) }) : t("Gesichert"), "success"); onChanged(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Card title={l.name} icon={l.kind === "config" ? <FileCog size={18} /> : <Archive size={18} />}
      meta={<span className="row" style={{ gap: 6 }}><span className="badge">{l.kind === "config" ? t("Konfiguration") : t("Spielstände")}</span><span className="badge">{t(SOURCE[l.source] ?? l.source)}</span></span>}>
      <div className="stack-sm">
        <code className="tiny muted ellipsis" title={l.path}>{l.path}</code>
        {!l.exists && <Banner kind="warn">{t("Der Ort existiert gerade nicht (mehr) auf dem PC.")}</Banner>}
        {l.running && <Banner kind="info">{t("Das Spiel läuft – gesichert und zurückgeholt wird erst nach dem Beenden.")}</Banner>}
        <div className="row small muted" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>{t("{n} Sicherungen", { n: l.backups })}</span><span>{bytes(l.zipBytes)}</span><span>{l.last ? t("zuletzt {d}", { d: relTime(l.last) }) : t("noch nie gesichert")}</span>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented value={l.auto} onChange={(auto) => void configure({ auto })} label={t("Automatisch sichern")} options={RULES.map((r) => ({ value: r.value, label: t(r.label) }))} />
          <label className="row small" style={{ gap: 6 }}>{t("Behalten")}
            <select className="input" style={{ width: 80 }} value={l.keep} disabled={!canManage} onChange={(e) => void configure({ keep: +e.target.value })}>{[1, 3, 5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" variant="primary" icon={<ShieldCheck size={14} />} busy={busy} disabled={!online || !canManage || l.running || !l.exists} onClick={() => void backupNow()}>{t("Jetzt sichern")}</Button>
          <Button size="sm" icon={<History size={14} />} disabled={!online} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("Sicherungen ausblenden") : t("Sicherungen")}</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={!online || !canManage}
            onClick={async () => { if (await confirmDialog(t("Ort entfernen?"), t("„{n}“ wird nicht mehr gesichert. Die vorhandenen Sicherungen bleiben auf dem PC.", { n: l.name }), { ok: t("Entfernen") })) client.call("vault.remove", { id: l.id }).then(onChanged, (e: Error) => toast(e.message, "error")); }}>{t("Entfernen")}</Button>
        </div>
        {open && online && <Backups l={l} canManage={canManage} onChanged={onChanged} />}
      </div>
    </Card>
  );
}

function Backups({ l, canManage, onChanged }: { l: Loc; canManage: boolean; onChanged: () => void }) {
  const q = useRpc<{ backups: Backup[] }>("vault.backups", { id: l.id }, ["vault"]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [diff, setDiff] = useState<{ title: string; d: DiffResult } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = q.data?.backups ?? [];
  const verify = async (b: Backup) => {
    setBusy("v" + b.name);
    try { const r = await client.call<{ ok: boolean; files: number; problems: string[] }>("vault.verify", { id: l.id, backup: b.name }); toast(r.ok ? t("In Ordnung: alle {n} Dateien unverändert", { n: r.files }) : t("Beschädigt: {p}", { p: r.problems.slice(0, 3).join(", ") }), r.ok ? "success" : "error"); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const compare = async (b: Backup, other: Backup | "current") => {
    try {
      const d = await client.call<DiffResult>("vault.diff", { id: l.id, a: b.name, b: other === "current" ? "current" : other.name });
      setDiff({ title: other === "current" ? t("{d} → jetzt", { d: dateTime(b.at) }) : t("{a} → {b}", { a: dateTime(b.at), b: dateTime(other.at) }), d });
    }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
      {list.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Noch keine Sicherungen.")}</p> : (
        <div className="list">
          {list.map((b, i) => (
            <div key={b.name} className="list-item vault-backup">
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="small">{dateTime(b.at)}</b>
                <div className="tiny muted">{b.reason} · {t("{n} Dateien", { n: b.files })} · {bytes(b.bytes)}</div>
              </div>
              <div className="row" style={{ gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button size="sm" variant="ghost" icon={<Check size={14} />} busy={busy === "v" + b.name} onClick={() => void verify(b)}>{t("Prüfen")}</Button>
                {l.kind === "config" && <Button size="sm" variant="ghost" icon={<GitCompare size={14} />} onClick={() => void compare(b, "current")}>{t("Mit jetzt vergleichen")}</Button>}
                {l.kind === "config" && list[i + 1] && <Button size="sm" variant="ghost" icon={<GitCompare size={14} />} onClick={() => void compare(list[i + 1], b)}>{t("Mit vorheriger")}</Button>}
                {canManage && <Button size="sm" icon={<RotateCcw size={14} />} disabled={l.running} onClick={async () => { try { setPreview(await client.call<Preview>("vault.preview", { id: l.id, backup: b.name })); } catch (e) { toast((e as Error).message, "error"); } }}>{t("Zurückholen …")}</Button>}
                {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Sicherung löschen")}
                  onClick={async () => { if (await confirmDialog(t("Sicherung löschen?"), t("Die Sicherung vom {d} wird gelöscht.", { d: dateTime(b.at) }), { danger: true, ok: t("Löschen") })) client.call("vault.deleteBackup", { id: l.id, backup: b.name }).then(() => { q.reload(); onChanged(); }, (e: Error) => toast(e.message, "error")); }} />}
              </div>
            </div>
          ))}
        </div>
      )}
      {preview && <RestorePreview l={l} p={preview} onClose={() => setPreview(null)} onDone={() => { setPreview(null); q.reload(); onChanged(); }} />}
      {diff && <DiffView title={diff.title} d={diff.d} onClose={() => setDiff(null)} />}
    </Loadable>
  );
}

function RestorePreview({ l, p, onClose, onDone }: { l: Loc; p: Preview; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const nothing = p.changed.length === 0 && p.back.length === 0 && p.removed.length === 0;
  const listOf = (title: string, items: string[]) => items.length > 0 && (
    <div><b className="small">{title} ({items.length})</b><ul className="tiny vault-files">{items.slice(0, 15).map((x) => <li key={x}><code>{x}</code></li>)}{items.length > 15 && <li>{t("… und {n} weitere", { n: items.length - 15 })}</li>}</ul></div>
  );
  return (
    <Modal title={t("„{n}“ zurückholen?", { n: l.name })} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="danger" busy={busy} disabled={p.running || nothing} onClick={async () => {
        setBusy(true);
        try { const r = await client.call<{ safety?: string | null }>("vault.restore", { id: l.id, backup: p.backup }); toast(r.safety ? t("Zurückgeholt – der vorherige Stand ist als eigene Sicherung erhalten.") : t("Zurückgeholt"), "success"); onDone(); }
        catch (e) { toast((e as Error).message, "error"); setBusy(false); }
      }}>{t("Jetzt zurückholen")}</Button>
    </>}>
      <div className="stack-sm">
        <p className="small" style={{ margin: 0 }}>{t("Sicherung vom {d} ({r}).", { d: dateTime(p.at), r: p.reason })} {t("Der jetzige Stand wird vorher automatisch gesichert.")}</p>
        {nothing && <Banner kind="ok">{t("Der jetzige Stand ist schon genau diese Sicherung – nichts zu tun.")}</Banner>}
        {p.newerNow > 0 && <Banner kind="warn">{t("{n} Dateien sind jetzt neuer als in der Sicherung – dieser Fortschritt würde ersetzt (bleibt aber in der automatischen Sicherung davor erhalten).", { n: p.newerNow })}</Banner>}
        {p.cloud && p.note && <Banner kind="info">{p.note}</Banner>}
        {listOf(t("Wird ersetzt"), p.changed.map((c) => c.path + (c.currentIsNewer ? "  ⚠ " + t("jetzt neuer") : "")))}
        {listOf(t("Kommt zurück"), p.back)}
        {listOf(t("Wird entfernt (gab es damals nicht)"), p.removed)}
        <p className="tiny muted" style={{ margin: 0 }}>{t("{n} Dateien sind gleich.", { n: p.same })}</p>
      </div>
    </Modal>
  );
}

function DiffView({ title, d, onClose }: { title: string; d: DiffResult; onClose: () => void }) {
  return (
    <Modal title={t("Vergleich: {t}", { t: title })} onClose={onClose} wide>
      {d.mode === "keys" ? (
        d.changes.length === 0 ? <p className="small">{t("Keine Unterschiede.")}</p> : (
          <div className="stack-sm">
            <p className="tiny muted" style={{ margin: 0 }}>{t("{n} Einstellungen geändert, {s} gleich.", { n: d.changes.length, s: d.same })}</p>
            <table className="vault-diff"><thead><tr><th>{t("Einstellung")}</th><th>{t("Vorher")}</th><th>{t("Nachher")}</th></tr></thead>
              <tbody>{d.changes.map((c) => (
                <tr key={c.key} className={c.kind}><td><code>{c.key}</code><span className="tiny muted"> {c.kind === "added" ? t("neu") : c.kind === "removed" ? t("entfernt") : t("geändert")}</span></td><td><code>{c.old ?? "–"}</code></td><td><code>{c.new ?? "–"}</code></td></tr>
              ))}</tbody></table>
          </div>
        )
      ) : (
        <pre className="vault-lines">{d.lines.map((x, i) => <div key={i} className={x.kind}>{x.kind === "add" ? "+ " : x.kind === "del" ? "− " : x.kind === "skip" ? "… " : "  "}{x.text}</div>)}</pre>
      )}
    </Modal>
  );
}

function AddPlace({ isPc, onClose }: { isPc: boolean; onClose: () => void }) {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const games = (lib.data?.items ?? []).filter((i) => i.kind === "game").sort((a, b) => a.name.localeCompare(b.name));
  const [game, setGame] = useState("");
  const [sug, setSug] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"saves" | "config">("saves");
  const [path, setPath] = useState("");
  const search = async (id: string) => {
    setGame(id); setSug(null);
    if (!id) return;
    try { setSug((await client.call<{ suggestions: Suggestion[] }>("vault.suggest", { itemId: id })).suggestions); } catch (e) { toast((e as Error).message, "error"); }
  };
  const add = async (p: { kind: string; path: string }) => {
    setBusy(true);
    try { await client.call("vault.add", { itemId: game || undefined, kind: p.kind, path: p.path }); toast(t("Ort eingetragen"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Modal title={t("Ort hinzufügen")} onClose={onClose}>
      <div className="stack">
        <Field label={t("Spiel")}>
          <select className="input" value={game} onChange={(e) => void search(e.target.value)}>
            <option value="">{t("Spiel wählen …")}</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        {sug && (sug.length === 0 ? <Banner kind="info">{t("Kein sicherer Ort gefunden. Der PC rät nicht – den Ordner kannst du direkt am PC eintragen.")}</Banner> : (
          <div className="list">
            {sug.map((s) => (
              <div key={s.path} className="list-item">
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="small">{t(SOURCE[s.source] ?? s.source)}</b>
                  <div className="tiny"><code className="ellipsis" title={s.path}>{s.path}</code></div>
                  <div className="tiny muted">{t(s.hint)}</div>
                </div>
                <Button size="sm" variant="primary" busy={busy} onClick={() => void add({ kind: "saves", path: s.path })}>{t("Übernehmen")}</Button>
              </div>
            ))}
          </div>
        ))}
        {isPc ? (
          <details>
            <summary className="small">{t("Eigenen Ordner oder Konfigurationsdatei eintragen (nur am PC)")}</summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <Segmented value={kind} onChange={setKind} label={t("Art")} options={[{ value: "saves", label: t("Ordner mit Spielständen") }, { value: "config", label: t("Konfigurationsdatei") }]} />
              <input className="input mono" value={path} placeholder={kind === "saves" ? "C:\\Users\\…\\Saved Games\\…" : "C:\\Users\\…\\Documents\\My Games\\…\\settings.ini"} onChange={(e) => setPath(e.target.value)} aria-label={t("Pfad")} />
              <p className="tiny muted" style={{ margin: 0 }}>{t("Erlaubt: Dokumente, Gespeicherte Spiele, AppData, Steams Cloud-Ordner und Spielordner – keine Browser-, Windows- oder Anmeldedaten. Konfigurationsdateien: ini, cfg, json, xml, txt … bis 2 MB.")}</p>
              <Button busy={busy} disabled={!path.trim()} onClick={() => void add({ kind, path: path.trim() })}>{t("Eintragen")}</Button>
            </div>
          </details>
        ) : <p className="tiny muted" style={{ margin: 0 }}>{t("Eigene Ordner und Konfigurationsdateien lassen sich aus Sicherheitsgründen nur direkt am PC eintragen.")}</p>}
      </div>
    </Modal>
  );
}
