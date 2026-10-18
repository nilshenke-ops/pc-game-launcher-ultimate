import { useMemo, useState } from "react";
import { FolderOpen, Gamepad2, LayoutGrid, MoreVertical, Pencil, Play, Plus, Radar, Search, Star, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials } from "../lib/format";
import type { DetectedItem, ItemKind, LibraryItem, ProfilesFile } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented, Thumb } from "../components/ui";
import { GamePassView } from "./GamePass";

type Sort = "name" | "recent" | "added";
const SOURCE_LABEL: Record<string, string> = { steam: "Steam", epic: "Epic Games", appsFolder: "Store / Startmenü", exe: "Datei" };

interface ListResult { items: LibraryItem[]; installed: Record<string, boolean | null>; running: string[]; coversFromCdn: boolean }

export default function Library({ kind }: { kind: ItemKind }) {
  const q = useRpc<ListResult>("library.list", {}, ["library"]);
  const hist = useRpc<{ launches: { itemId: string; at: string }[] }>("history.get", {}, ["history"]);
  const conn = useConn();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("__all");
  const [sort, setSort] = useState<Sort>("name");
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const canManage = conn.me?.permissions.includes("manage");
  const isGame = kind === "game";

  const items = useMemo(() => (q.data?.items ?? []).filter((i) => i.kind === kind), [q.data, kind]);
  // "Game Pass" has its own chip (whole catalog), so it is not repeated as a normal category.
  const categories = useMemo(() => [...new Set(items.flatMap((i) => i.categories))].filter((c) => c !== "Game Pass").sort(), [items]);
  const lastLaunch = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of hist.data?.launches ?? []) if (!m.has(l.itemId)) m.set(l.itemId, Date.parse(l.at));
    return m;
  }, [hist.data]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = items.filter((i) => (!s || i.name.toLowerCase().includes(s) || i.categories.some((c) => c.toLowerCase().includes(s))) &&
      (cat === "__all" || (cat === "__fav" ? i.favorite : cat === "__running" ? q.data?.running.includes(i.id) : cat.startsWith("src:") ? i.source === cat.slice(4) : i.categories.includes(cat))));
    list = [...list].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "recent" ? (lastLaunch.get(b.id) ?? 0) - (lastLaunch.get(a.id) ?? 0) : Date.parse(b.addedAt) - Date.parse(a.addedAt));
    return [...list.filter((i) => i.favorite), ...list.filter((i) => !i.favorite)];
  }, [items, search, cat, sort, lastLaunch, q.data]);

  const launch = async (i: LibraryItem) => {
    bumpUsage("item:" + i.id);
    try { await client.call("library.launch", { id: i.id }); toast(t("{name} wird gestartet", { name: i.name }), "success"); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const fav = (i: LibraryItem) => client.call("library.update", { id: i.id, favorite: !i.favorite }).catch((e) => toast(e.message, "error"));
  const sources = [...new Set(items.map((i) => i.source))];

  return (
    <>
      <PageHead eyebrow={t("Bibliothek")} title={isGame ? t("Spiele") : t("Programme")}
        text={isGame ? t("Starte Spiele von Steam, Epic, Xbox/Microsoft Store und eigene EXE-Dateien – direkt vom Handy.") : t("Freigegebene Windows-Programme wie Discord, Browser oder OBS mit einem Tipp starten.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setAdding(true)}>{t("Hinzufügen")}</Button>} />

      <div className="stack" style={{ marginBottom: 18 }}>
        <div className="row">
          <div className="input-icon grow" style={{ minWidth: 200 }}>
            <Search size={17} />
            <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isGame ? t("Spiele durchsuchen …") : t("Programme durchsuchen …")} aria-label={t("Suche")} />
          </div>
          <Segmented<Sort> value={sort} onChange={setSort} label={t("Sortierung")} options={[{ value: "name", label: t("A–Z") }, { value: "recent", label: t("Zuletzt") }, { value: "added", label: t("Neu") }]} />
        </div>
        <div className="chips" role="toolbar" aria-label={t("Filter")}>
          {[["__all", t("Alle")], ["__fav", "★ " + t("Favoriten")], ["__running", t("Läuft")], ...(isGame ? [["__gamepass", "Game Pass"]] : []), ...sources.map((s) => ["src:" + s, SOURCE_LABEL[s] ?? s]), ...categories.map((c) => [c, c])].map(([k, label]) => (
            <button key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{label}</button>
          ))}
        </div>
      </div>

      {cat === "__gamepass" ? <GamePassView search={search} /> : (
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {items.length === 0 ? (
          <Card><Empty icon={isGame ? <Gamepad2 size={28} /> : <LayoutGrid size={28} />} title={isGame ? t("Noch keine Spiele") : t("Noch keine Programme")}
            text={t("Lass den PC nach installierten Spielen und Apps suchen oder gib eine EXE-Datei frei.")}
            action={canManage && <Button variant="primary" icon={<Radar size={17} />} onClick={() => setAdding(true)}>{t("Jetzt suchen")}</Button>} /></Card>
        ) : shown.length === 0 ? (
          <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} text={t("Filter oder Suchbegriff anpassen.")} /></Card>
        ) : isGame ? (
          <div className="lib-grid">
            {shown.map((i) => {
              const running = q.data?.running.includes(i.id);
              const installed = q.data?.installed[i.id];
              const cover = i.coverUrl && (q.data?.coversFromCdn || !i.coverUrl.includes("steamstatic")) ? i.coverUrl : undefined;
              return (
                <article key={i.id} className="game-card">
                  <div className="cover" style={{ background: gradientFor(i.name) }}>{cover && <img src={cover} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
                  {!cover && <div className="initials">{initials(i.name)}</div>}
                  <div className="shade" />
                  <div className="top">
                    {running && <span className="badge ok">● {t("Läuft")}</span>}
                    {installed === false && <span className="badge error">{t("Nicht gefunden")}</span>}
                    {i.gamePassId && <span className="badge gp">Game Pass</span>}
                    <button className={`btn icon sm fav ${i.favorite ? "on" : ""}`} onClick={() => fav(i)} aria-label={i.favorite ? t("Favorit entfernen") : t("Als Favorit markieren")} aria-pressed={i.favorite}><Star size={15} fill={i.favorite ? "currentColor" : "none"} /></button>
                  </div>
                  <div className="bottom">
                    <b>{i.name}</b>
                    <div className="row nowrap">
                      <Button variant="primary" size="sm" className="play grow" icon={<Play size={14} />} onClick={() => launch(i)}>{t("Spielen")}</Button>
                      {canManage && <Button size="sm" icon={<MoreVertical size={15} />} onClick={() => setEditing(i)} aria-label={t("Bearbeiten")} style={{ background: "rgba(0,0,0,.45)", color: "#fff" }} />}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="prog-grid">
            {shown.map((i) => (
              <div key={i.id} className="card prog-card">
                <Thumb name={i.name} icon={i.iconData} cover={i.coverUrl} gradient={gradientFor(i.name)} />
                <div className="grow">
                  <div className="row nowrap"><b className="ellipsis">{i.name}</b>{i.favorite && <Star size={13} fill="currentColor" color="#fde047" />}</div>
                  <div className="small muted ellipsis">{SOURCE_LABEL[i.source]}{q.data?.running.includes(i.id) ? " · " + t("läuft") : ""}{q.data?.installed[i.id] === false ? " · " + t("Datei fehlt") : ""}</div>
                </div>
                {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditing(i)} aria-label={t("Bearbeiten")} />}
                <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => launch(i)} aria-label={t("{name} starten", { name: i.name })} />
              </div>
            ))}
          </div>
        )}
      </Loadable>
      )}

      {editing && <EditItem item={editing} onClose={() => setEditing(null)} />}
      {adding && <AddItems kind={kind} onClose={() => setAdding(false)} />}
    </>
  );
}

function EditItem({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const profiles = useRpc<ProfilesFile>("profiles.list");
  const [f, setF] = useState({ ...item, categoriesText: item.categories.join(", "), processText: item.processNames.join(", ") });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await client.call("library.update", {
        id: item.id, name: f.name, kind: f.kind, favorite: f.favorite, coverUrl: f.coverUrl ?? "", profileId: f.profileId ?? "", notes: f.notes ?? "",
        categories: f.categoriesText.split(",").map((s) => s.trim()).filter(Boolean),
        processNames: f.processText.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (isLocal && (f.target !== item.target || f.args !== item.args || (f.workingDir ?? "") !== (item.workingDir ?? "")))
        await client.call("library.updateTarget", { id: item.id, target: f.target, args: f.args, workingDir: f.workingDir ?? "" });
      toast(t("Gespeichert"), "success");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Eintrag entfernen?"), t("„{n}“ wird aus der Bibliothek entfernt. Das Programm selbst bleibt installiert.", { n: item.name }), { danger: true, ok: t("Entfernen") }))) return;
    await client.call("library.remove", { id: item.id }).catch((e) => toast(e.message, "error"));
    onClose();
  };
  const uploadCover = (file?: File) => {
    if (!file) return;
    if (file.size > 500_000) { toast(t("Bild ist zu groß (max. 500 KB)."), "error"); return; }
    const r = new FileReader();
    r.onload = () => set({ coverUrl: String(r.result) });
    r.readAsDataURL(file);
  };

  return (
    <Modal title={t("„{n}“ bearbeiten", { n: item.name })} onClose={onClose} wide footer={<>
      <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove} style={{ marginRight: "auto" }}>{t("Entfernen")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" busy={busy} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="grid-2">
        <Field label={t("Name")}><input className="input" value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t("Typ")}>
          <Segmented<ItemKind> value={f.kind} onChange={(kind) => set({ kind })} options={[{ value: "game", label: t("Spiel") }, { value: "program", label: t("Programm") }]} />
        </Field>
        <Field label={t("Kategorien")} hint={t("Kommagetrennt, z. B. Shooter, Koop")}><input className="input" value={f.categoriesText} onChange={(e) => set({ categoriesText: e.target.value })} /></Field>
        <Field label={t("Gaming-Profil beim Start")} hint={t("Wird automatisch aktiviert, solange das Spiel läuft.")}>
          <select className="input" value={f.profileId ?? ""} onChange={(e) => set({ profileId: e.target.value || undefined })}>
            <option value="">{t("Keins")}</option>
            {profiles.data?.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("Cover-Bild")} hint={t("https-Adresse oder eigenes Bild hochladen")}>
          <div className="row nowrap">
            <input className="input" value={f.coverUrl?.startsWith("data:") ? t("(eigenes Bild)") : f.coverUrl ?? ""} onChange={(e) => set({ coverUrl: e.target.value })} placeholder="https://…" />
            <label className="btn icon" aria-label={t("Bild hochladen")}><FolderOpen size={16} /><input type="file" accept="image/*" hidden onChange={(e) => uploadCover(e.target.files?.[0])} /></label>
          </div>
        </Field>
        <Field label={t("Prozessnamen zur Erkennung")} hint={t("Ohne .exe, kommagetrennt. Leer = Erkennung über Installationsordner.")}><input className="input mono" value={f.processText} onChange={(e) => set({ processText: e.target.value })} /></Field>
      </div>
      <div className="divider" />
      <h3>{t("Start")}</h3>
      {!isLocal && <Banner kind="info">{t("Startziel und Startparameter können aus Sicherheitsgründen nur direkt am PC geändert werden.")}</Banner>}
      <div className="grid-2">
        <Field label={t("Startziel")} hint={SOURCE_LABEL[item.source]}><input className="input mono" value={f.target} disabled={!isLocal || item.source !== "exe"} onChange={(e) => set({ target: e.target.value })} /></Field>
        <Field label={t("Startparameter")}><input className="input mono" value={f.args} disabled={!isLocal || item.source !== "exe"} maxLength={500} onChange={(e) => set({ args: e.target.value })} placeholder="-fullscreen" /></Field>
      </div>
      <Field label={t("Notizen")}><textarea className="input" value={f.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

function AddItems({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const [tab, setTab] = useState<"detect" | "file">("detect");
  const det = useRpc<{ items: DetectedItem[]; detectors: string[] }>("library.detect");
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (d: DetectedItem, k: ItemKind) => {
    setBusy(d.key);
    try { await client.call("library.addDetected", { key: d.key, kind: k }); toast(t("„{n}“ hinzugefügt", { n: d.name }), "success"); det.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const addPath = async () => {
    setBusy("path");
    try { await client.call("library.addPath", { path, kind, name: name || undefined, args: args || undefined }); toast(t("Freigegeben"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const pick = async () => {
    try { const r = await client.call<{ path: string | null }>("library.pickFile"); if (r.path) setPath(r.path); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const list = (det.data?.items ?? []).filter((d) => (kind === "game" ? d.kind === "game" || d.origin !== "Startmenü" : true) && d.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Modal title={kind === "game" ? t("Spiele hinzufügen") : t("Programme hinzufügen")} onClose={onClose} wide>
      <Segmented value={tab} onChange={setTab} options={[{ value: "detect", label: t("Auf dem PC gefunden") }, { value: "file", label: t("Datei freigeben") }]} />
      {tab === "detect" ? (
        <Loadable loading={det.loading} error={det.error} onRetry={det.reload}>
          <div className="stack">
            <p className="small muted">{t("Durchsucht: {d}. Es wird nur angezeigt, was tatsächlich installiert ist.", { d: det.data?.detectors.join(", ") ?? "" })}</p>
            <div className="input-icon"><Search size={17} /><input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("Filtern …")} /></div>
            {list.length === 0 ? <Empty icon={<Radar size={26} />} title={t("Nichts gefunden")} text={t("Keine passenden Einträge. Du kannst eine EXE-Datei direkt am PC freigeben.")} /> : (
              <div className="list" style={{ maxHeight: "50vh", overflow: "auto" }}>
                {list.slice(0, 300).map((d) => (
                  <div key={d.key} className="list-item">
                    <Thumb name={d.name} cover={d.coverUrl} gradient={gradientFor(d.name)} />
                    <div className="grow"><div className="title ellipsis">{d.name}</div><div className="sub">{d.origin}</div></div>
                    {d.alreadyAdded ? <span className="badge ok">{t("Hinzugefügt")}</span> : (
                      <div className="row nowrap">
                        <Button size="sm" variant={kind === "game" ? "primary" : undefined} busy={busy === d.key} onClick={() => add(d, "game")}>{t("Als Spiel")}</Button>
                        <Button size="sm" variant={kind === "program" ? "primary" : undefined} busy={busy === d.key} onClick={() => add(d, "program")}>{t("Als Programm")}</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Loadable>
      ) : !isLocal ? (
        <Banner kind="info" title={t("Nur direkt am PC möglich")}>{t("Neue ausführbare Dateien freizugeben ist aus Sicherheitsgründen nur im Companion am PC erlaubt. So kann niemand über das Internet beliebige Programme auf deinem PC hinterlegen.")}</Banner>
      ) : (
        <div className="stack">
          <Field label={t("Datei (.exe oder .lnk)")}>
            <div className="row nowrap">
              <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\Program Files\\…\\app.exe" />
              {conn.hello?.info.features.pickFile && <Button icon={<FolderOpen size={16} />} onClick={pick}>{t("Durchsuchen")}</Button>}
            </div>
          </Field>
          <div className="grid-2">
            <Field label={t("Anzeigename (optional)")}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t("Startparameter (optional)")}><input className="input mono" value={args} onChange={(e) => setArgs(e.target.value)} /></Field>
          </div>
          <Banner kind="info">{t("Kommandozeilen und Skript-Hosts (cmd, PowerShell …) können nicht freigegeben werden.")}</Banner>
          <div><Button variant="primary" busy={busy === "path"} disabled={!path} onClick={addPath}>{t("Freigeben")}</Button></div>
        </div>
      )}
    </Modal>
  );
}
