import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Expand, Loader2, Move, Pencil, Plus, Settings2, Shrink, Sun, Trash2, Upload, Wand2 } from "lucide-react";
import { IconWorkshop } from "../components/icon-workshop";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { useAppState, usePlaying } from "../lib/state";
import { navItems } from "../lib/nav";
import { BG_SCENES } from "../lib/prefs";
import { ACTION_TYPES, gridFor, keyImage, MEDIA_KEYS, POWER_KEYS, moveKey, newId, resize, slots, starterDeck, textOn, type Deck, type DeckAction, type DeckKey, type DeckPage } from "../lib/deck";
import type { LibraryItem, Profile, QuickAction, SoundsFile } from "../lib/types";
import { DECK_ICONS, DeckIcon, KeyFace } from "../components/deck-icons";
import { BrandLogo } from "../components/brand-logo";
import { BRANDS, brandBg, brandFor, isGameBrand, type Brand } from "../lib/brands";
import { runDeckAction } from "../lib/deck-run";
import { Banner, Button, confirmDialog, Empty, Field, Loadable, Modal, Segmented } from "../components/ui";

const DECK_KEY = "pgl.deck.selected";

/** Key size in px so that the whole grid fits the free space (width and height). */
function useKeySize(el: HTMLDivElement | null, cols: number, rows: number, gap: number) {
  const [size, setSize] = useState(72);
  useEffect(() => {
    if (!el) return; // measured as soon as the grid area exists (the deck may still be loading on first render)
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setSize(Math.max(40, Math.floor(Math.min((w - (cols - 1) * gap) / cols, (h - (rows - 1) * gap) / rows))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, cols, rows, gap]);
  return size;
}

function useLandscape() {
  const q = () => typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches;
  const [l, setL] = useState(q);
  useEffect(() => {
    const m = window.matchMedia("(orientation: landscape)");
    const on = () => setL(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return l;
}

/** Nexus Deck: big, freely designed keys – like a Stream Deck on the phone. */
export default function DeckPage() {
  const decks = useRpc<{ decks: Deck[] }>("deck.list", {}, ["deck"]);
  const lib = useRpc<{ items: LibraryItem[]; running: string[] }>("library.list", {}, ["library"]);
  const quick = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  const sounds = useRpc<{ data: SoundsFile }>("sounds.list", {}, ["sounds"]);
  const profiles = useRpc<{ profiles: Profile[]; activeProfileId?: string }>("profiles.list", {}, ["profiles"]);
  const { state } = useAppState();
  const playing = usePlaying();
  const conn = useConn();
  const canManage = useCan("manage");
  const navigate = useNavigate();
  const landscape = useLandscape();
  const rootRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<HTMLDivElement | null>(null);

  const list = decks.data?.decks ?? [];
  const [picked, setPicked] = useState<string | null>(() => { try { return localStorage.getItem(DECK_KEY); } catch { return null; } });
  // Profile switching: a deck linked to the active profile is shown automatically, unless one was picked by hand in this visit.
  const [manual, setManual] = useState(false);
  const activeProfile = state?.activeProfile?.id;
  const deck = (!manual && list.find((d) => d.profileId && d.profileId === activeProfile)) || list.find((d) => d.id === picked) || list[0];
  const [pageStack, setPageStack] = useState<string[]>([]);
  const pageId = pageStack[pageStack.length - 1] ?? deck?.pages[0]?.id;
  const page = deck?.pages.find((p) => p.id === pageId) ?? deck?.pages[0];
  useEffect(() => { setPageStack([]); }, [deck?.id]);

  const [edit, setEdit] = useState(false);
  const [editing, setEditing] = useState<{ key: DeckKey; isNew: boolean } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [wake, setWake] = useState<WakeLockSentinel | null>(null);

  const grid = deck ? gridFor(deck, landscape) : { cols: 3, rows: 5 };
  const cells = slots(page, grid.cols, grid.rows);
  const gap = Math.max(6, Math.min(14, Math.round(window.innerWidth / 60)));
  const keySize = useKeySize(area, grid.cols, grid.rows, gap);
  const items = lib.data?.items ?? [];
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const save = (d: Deck) => client.call("deck.save", d).catch((e: Error) => toast(e.message, "error"));
  const choose = (id: string) => { setPicked(id); setManual(true); try { localStorage.setItem(DECK_KEY, id); } catch { /* private mode */ } };

  // Leaving the focus view or the page releases the screen lock.
  useEffect(() => () => { void wake?.release().catch(() => {}); }, [wake]);
  useEffect(() => {
    if (!focus) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [focus]);

  const toggleFocus = async () => {
    const next = !focus;
    setFocus(next);
    try {
      if (next && rootRef.current?.requestFullscreen && !document.fullscreenElement) await rootRef.current.requestFullscreen();
      if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* not supported (e.g. iPhone) – the focus view still hides everything else */ }
  };
  const toggleWake = async () => {
    if (wake) { await wake.release().catch(() => {}); setWake(null); return; }
    try { setWake(await navigator.wakeLock.request("screen")); toast(t("Bildschirm bleibt an, solange das Deck offen ist"), "info"); }
    catch { toast(t("Dieser Browser kann den Bildschirm nicht wach halten."), "error"); }
  };

  const press = async (k: DeckKey) => {
    if (edit) {
      if (moving) { if (deck && page) { save({ ...deck, pages: deck.pages.map((p) => (p.id === page.id ? moveKey(p, moving, k.slot) : p)) }); } setMoving(null); return; }
      setEditing({ key: structuredClone(k), isNew: false });
      return;
    }
    const a = k.action;
    if (a.type === "none") return;
    if (a.type === "folder") { if (a.ref) setPageStack((s) => [...s, a.ref!]); return; }
    if (a.type === "back") { setPageStack((s) => s.slice(0, -1)); return; }
    if (a.type === "open") { if (a.ref) { setFocus(false); navigate(a.ref); } return; }
    if (busy.has(k.id)) return; // no double press while the PC is still answering
    navigator.vibrate?.(12);
    setBusy((b) => new Set(b).add(k.id));
    try { await runDeckAction(a, itemById.get(a.ref ?? "")?.name ?? k.label ?? ""); }
    finally { setBusy((b) => { const n = new Set(b); n.delete(k.id); return n; }); }
  };

  const pressEmpty = (slot: number) => {
    if (!edit) return;
    if (moving && deck && page) { save({ ...deck, pages: deck.pages.map((p) => (p.id === page.id ? moveKey(p, moving, slot) : p)) }); setMoving(null); return; }
    setEditing({ key: { id: newId("key"), slot, label: "", icon: "icon:zap", color: "#1e293b", action: { type: "launch", ref: items[0]?.id ?? null } }, isNew: true });
  };

  const createStarter = () => {
    const d = starterDeck(items, quick.data?.actions ?? [], sounds.data?.data.sounds ?? [], profiles.data?.profiles ?? []);
    save(d).then(() => choose(d.id));
  };
  const createEmpty = () => {
    const d: Deck = { id: newId("deck"), name: t("Neues Deck"), cols: 3, rows: 5, pages: [{ id: newId("page"), name: t("Start"), keys: [] }] };
    save(d).then(() => { choose(d.id); setEdit(true); });
  };

  const active = (k: DeckKey) => {
    const a = k.action;
    if (a.type === "launch") return lib.data?.running.includes(a.ref ?? "") ?? false;
    if (a.type === "sound") return playing?.playing.some((p) => p.soundId === a.ref) ?? false;
    if (a.type === "profile") return activeProfile === a.ref;
    return false;
  };

  const bg = deck?.background;
  const bgStyle = bg?.startsWith("#") ? { background: bg } : bg && BG_SCENES.some((s) => s.id === bg)
    ? { backgroundImage: `url("${new URL(`backgrounds/${bg}.svg`, location.href.split("#")[0]).href}")`, backgroundSize: "cover", backgroundPosition: "center bottom" } : undefined;

  return (
    <div ref={rootRef} className={`deck-root ${focus ? "focus" : ""} ${edit ? "editing" : ""}`} style={bgStyle}>
      <Loadable loading={decks.loading} error={decks.error} onRetry={decks.reload}>
        {!deck ? (
          <Empty icon={<LayoutGridIcon />} title={t("Noch kein Deck")} text={t("Ein Deck ist ein Raster großer Tasten zum Antippen – wie ein Stream Deck auf dem Handy: Spiele starten, Sounds, Profile, Lautstärke, Ordner. Erstellen geht auch ohne PC; gespeichert wird es auf dem PC, gleich auf allen Geräten.")}
            action={canManage ? <div className="row" style={{ justifyContent: "center" }}>
              <Button variant="primary" icon={<Wand2 size={16} />} onClick={createStarter}>{t("Deck aus meinen Sachen erstellen")}</Button>
              <Button icon={<Plus size={16} />} onClick={createEmpty}>{t("Leeres Deck")}</Button>
            </div> : undefined} />
        ) : (
          <>
            <div className="deck-bar">
              {pageStack.length > 0 && <Button size="sm" variant="ghost" icon={<ArrowLeft size={18} />} aria-label={t("Zurück")} onClick={() => setPageStack((s) => s.slice(0, -1))} />}
              {list.length > 1 ? (
                <select className="input deck-select" value={deck.id} onChange={(e) => choose(e.target.value)} aria-label={t("Deck wählen")}>
                  {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : <b className="ellipsis">{deck.name}</b>}
              {page && deck.pages[0]?.id !== page.id && <span className="muted small ellipsis">· {page.name}</span>}
              <span className="grow" />
              {conn.auth !== "ok" && <span className="badge warn">{t("PC nicht verbunden")}</span>}
              {"wakeLock" in navigator && <Button size="sm" variant={wake ? "primary" : "ghost"} icon={<Sun size={17} />} aria-label={t("Bildschirm anlassen")} aria-pressed={!!wake} onClick={toggleWake} />}
              <Button size="sm" variant="ghost" icon={focus ? <Shrink size={17} /> : <Expand size={17} />} aria-label={focus ? t("Vollbild beenden") : t("Vollbild")} onClick={toggleFocus} />
              {canManage && <Button size="sm" variant={edit ? "primary" : "ghost"} icon={edit ? <Check size={17} /> : <Pencil size={17} />} aria-label={edit ? t("Bearbeiten beenden") : t("Bearbeiten")} onClick={() => { setEdit(!edit); setMoving(null); }} />}
              {canManage && edit && <Button size="sm" variant="ghost" icon={<Settings2 size={17} />} aria-label={t("Deck-Einstellungen")} onClick={() => setSettings(true)} />}
            </div>
            {edit && <div className="deck-hint small">{moving ? t("Tippe auf den neuen Platz.") : t("Taste antippen zum Ändern, leeren Platz antippen für eine neue Taste.")}</div>}
            <div className="deck-area" ref={setArea}>
            <div className="deck-grid" style={{ gap, gridTemplateColumns: `repeat(${grid.cols}, ${keySize}px)`, gridAutoRows: `${keySize}px`, ["--key" as string]: `${keySize}px` }} role="grid" aria-label={deck.name}>
              {cells.map((k, slot) => k ? (
                <button key={k.id} type="button" className={`deck-key ${active(k) ? "on" : ""} ${moving === k.id ? "moving" : ""}`} style={{ background: k.color ?? undefined, color: k.textColor ?? textOn(k.color) }}
                  onClick={() => press(k)} aria-label={k.label || ACTION_TYPES.find((x) => x.type === k.action.type)?.label()} aria-busy={busy.has(k.id)}>
                  <KeyFace k={k} item={itemById.get(k.action.ref ?? "")} />
                  {busy.has(k.id) && <Loader2 className="deck-spin" size={18} aria-hidden />}
                  {active(k) && <span className="deck-dot" aria-label={t("aktiv")} />}
                </button>
              ) : (
                <button key={`e${slot}`} type="button" className="deck-key empty" tabIndex={edit ? 0 : -1} aria-label={edit ? t("Neue Taste auf Platz {n}", { n: slot + 1 }) : undefined} onClick={() => pressEmpty(slot)}>
                  {edit && <Plus size={22} aria-hidden />}
                </button>
              ))}
            </div>
            </div>
            {deck.pages.length > 1 && !edit && (
              <div className="deck-pages" role="tablist" aria-label={t("Seiten")}>
                {deck.pages.map((p) => <button key={p.id} type="button" role="tab" aria-selected={p.id === page?.id} aria-label={p.name} className={p.id === page?.id ? "on" : ""} onClick={() => setPageStack(p.id === deck.pages[0].id ? [] : [p.id])} />)}
              </div>
            )}
          </>
        )}
      </Loadable>
      {editing && deck && page && (
        <KeyEditor value={editing.key} isNew={editing.isNew} deck={deck} page={page} items={items} libLoaded={!!lib.data} quick={quick.data?.actions ?? []} sounds={sounds.data?.data.sounds ?? []} profiles={profiles.data?.profiles ?? []}
          onClose={() => setEditing(null)}
          onMove={() => { setMoving(editing.key.id); setEditing(null); }}
          onSave={(k) => { save({ ...deck, pages: deck.pages.map((p) => (p.id === page.id ? { ...p, keys: [...p.keys.filter((x) => x.id !== k.id), k] } : p)) }); setEditing(null); }}
          onDelete={() => { save({ ...deck, pages: deck.pages.map((p) => (p.id === page.id ? { ...p, keys: p.keys.filter((x) => x.id !== editing.key.id) } : p)) }); setEditing(null); }}
          onNewFolder={(name) => {
            const np: DeckPage = { id: newId("page"), name, keys: [{ id: newId("key"), slot: 0, label: t("Zurück"), icon: "icon:arrow-left", color: "#334155", action: { type: "back" } }] };
            return { deck: { ...deck, pages: [...deck.pages, np] }, pageId: np.id };
          }} />
      )}
      {settings && deck && (
        <DeckSettings deck={deck} profiles={profiles.data?.profiles ?? []} onClose={() => setSettings(false)} onSave={(d) => { save(d); setSettings(false); }}
          onDelete={async () => { if (await confirmDialog(t("Deck löschen?"), deck.name, { danger: true, ok: t("Löschen") })) { client.call("deck.remove", { id: deck.id }).catch((e: Error) => toast(e.message, "error")); setSettings(false); setEdit(false); } }}
          onNew={() => { setSettings(false); createEmpty(); }} onStarter={() => { setSettings(false); createStarter(); }} />
      )}
    </div>
  );
}

function LayoutGridIcon() { return <DeckIcon name="layout-grid" size={28} />; }

const APP_PAGES = () => navItems().map((n) => ({ path: n.path, label: n.label }));

function KeyEditor({ value, isNew, deck, page, items, libLoaded, quick, sounds, profiles, onClose, onSave, onDelete, onMove, onNewFolder }: {
  value: DeckKey; isNew: boolean; deck: Deck; page: DeckPage; items: LibraryItem[]; libLoaded: boolean; quick: QuickAction[]; sounds: { id: string; name: string }[]; profiles: Profile[];
  onClose: () => void; onSave: (k: DeckKey) => void; onDelete: () => void; onMove: () => void; onNewFolder: (name: string) => { deck: Deck; pageId: string };
}) {
  const [k, setK] = useState<DeckKey>(value);
  const [iconTab, setIconTab] = useState<"symbol" | "logo" | "emoji" | "cover" | "image">(k.icon?.startsWith("emoji:") ? "emoji" : k.icon?.startsWith("brand:") ? "logo" : k.icon === "cover" ? "cover" : k.icon?.startsWith("data:") ? "image" : "symbol");
  const [pendingDeck, setPendingDeck] = useState<Deck | null>(null);
  const [logoSearch, setLogoSearch] = useState("");
  // Choosing a game or program gives the key its logo (or the game's picture) – unless a look was chosen by hand.
  const autoIcon = useRef<string | null>(null);
  const pickLaunch = (ref: string) => {
    const it = items.find((i) => i.id === ref);
    const auto = k.icon == null || k.icon === "icon:zap" || k.icon === autoIcon.current;
    if (!it || !auto) { setAction({ ...k.action, ref }); return; }
    const b = brandFor(it);
    const look = b && (it.kind === "program" || !(it.coverUrl || it.iconData)) ? { icon: `brand:${b.id}`, color: brandBg(b), textColor: null }
      : it.coverUrl || it.iconData ? { icon: "cover", color: "#1e293b", textColor: null } : null;
    if (look) autoIcon.current = look.icon;
    setK((o) => ({ ...o, ...(look ?? {}), action: { ...o.action, ref } }));
  };
  const set = (x: Partial<DeckKey>) => setK((o) => ({ ...o, ...x }));
  const setAction = (a: DeckAction) => set({ action: a });
  const targetName = (a: DeckAction) => a.type === "launch" ? items.find((i) => i.id === a.ref)?.name : a.type === "sound" ? sounds.find((s) => s.id === a.ref)?.name
    : a.type === "profile" ? profiles.find((p) => p.id === a.ref)?.name : a.type === "quick" ? quick.find((q) => q.id === a.ref)?.name : undefined;
  const pages = (pendingDeck ?? deck).pages.filter((p) => p.id !== page.id);
  const item = items.find((i) => i.id === k.action.ref);
  const pickType = (type: DeckAction["type"]) => {
    const first = type === "launch" ? items[0]?.id : type === "quick" ? quick[0]?.id : type === "sound" ? sounds[0]?.id : type === "profile" ? profiles[0]?.id
      : type === "folder" ? pages[0]?.id : type === "media" ? "playpause" : type === "power" ? "lock" : type === "open" ? "/" : null;
    setAction({ type, ref: first ?? null });
  };
  const submit = () => {
    if (["launch", "quick", "sound", "profile", "folder"].includes(k.action.type) && !k.action.ref) { toast(t("Bitte ein Ziel wählen."), "error"); return; }
    const label = k.label?.trim() || targetName(k.action) || (k.action.type === "media" ? MEDIA_KEYS.find((m) => m[0] === k.action.ref)?.[1] : k.action.type === "power" ? t(POWER_KEYS.find((m) => m[0] === k.action.ref)?.[1] ?? "") : k.action.type === "privacy" ? t("Datenschutz") : undefined) || "";
    const key = { ...k, label: label.slice(0, 24) };
    if (pendingDeck) {
      // A new folder page was created here: save deck with the page and the key together.
      client.call("deck.save", { ...pendingDeck, pages: pendingDeck.pages.map((p) => (p.id === page.id ? { ...p, keys: [...p.keys.filter((x) => x.id !== key.id), key] } : p)) })
        .then(onClose, (e: Error) => toast(e.message, "error"));
      return;
    }
    onSave(key);
  };
  const upload = async (f: File) => { try { set({ icon: await keyImage(f) }); } catch (e) { toast((e as Error).message, "error"); } };
  const [workshop, setWorkshop] = useState(false);

  return (
    <Modal title={isNew ? t("Neue Taste") : t("Taste bearbeiten")} onClose={onClose} wide footer={<>
      {!isNew && <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      {!isNew && <Button icon={<Move size={15} />} onClick={onMove}>{t("Verschieben")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={submit}>{t("Speichern")}</Button>
    </>}>
      <div className="deck-editor">
        <div className="stack">
          <Field label={t("Aktion")}>
            <select className="input" value={k.action.type} onChange={(e) => pickType(e.target.value as DeckAction["type"])}>
              {ACTION_TYPES.map((a) => <option key={a.type} value={a.type}>{a.label()}</option>)}
            </select>
          </Field>
          {k.action.type === "launch" && <Field label={t("Spiel oder Programm")} hint={items.length === 0 && libLoaded ? <>{t("Die Bibliothek am PC ist noch leer.")} <Link to="/games">{t("Unter „Spiele“ → „Hinzufügen“")}</Link> {t("findest du Steam- und Epic-Spiele; andere Spiele und Programme gibst du dort als Datei frei.")}</> : undefined}><select className="input" value={k.action.ref ?? ""} onChange={(e) => pickLaunch(e.target.value)}>
            {items.length === 0 && <option value="">{libLoaded ? t("Noch keine Spiele in der Bibliothek") : t("Noch keine Spiele – sie erscheinen, sobald der PC einmal verbunden war")}</option>}
            {[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>}
          {k.action.type === "quick" && <Field label={t("Quick Action")}><select className="input" value={k.action.ref ?? ""} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {quick.length === 0 && <option value="">{t("Noch keine Quick Actions")}</option>}
            {quick.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></Field>}
          {k.action.type === "sound" && <Field label={t("Sound")}><select className="input" value={k.action.ref ?? ""} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {sounds.length === 0 && <option value="">{t("Noch keine Sounds")}</option>}
            {sounds.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
          {k.action.type === "profile" && <Field label={t("Profil")}><select className="input" value={k.action.ref ?? ""} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
          {k.action.type === "media" && <Field label={t("Taste")} hint={t("Wirkt wie die Medientaste der Tastatur (Windows-Begleiter).")}><select className="input" value={k.action.ref ?? ""} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {MEDIA_KEYS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></Field>}
          {k.action.type === "power" && <Field label={t("Was soll passieren?")} hint={t("Sperren geht sofort. Energiesparen, Neustart und Herunterfahren fragen vorher; Neustart/Herunterfahren nach 60 s, bis dahin abbrechbar. Braucht am PC das Recht „PC ausschalten“ für dieses Gerät.")}><select className="input" value={k.action.ref ?? "lock"} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {POWER_KEYS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></Field>}
          {k.action.type === "open" && <Field label={t("Seite")}><select className="input" value={k.action.ref ?? "/"} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
            {APP_PAGES().map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}</select></Field>}
          {k.action.type === "folder" && (
            <Field label={t("Ordner (Seite)")} hint={t("Ein Ordner ist eine weitere Seite dieses Decks. Dort bringt eine „Zurück“-Taste wieder hierher.")}>
              <div className="row nowrap">
                <select className="input grow" value={k.action.ref ?? ""} onChange={(e) => setAction({ ...k.action, ref: e.target.value })}>
                  {pages.length === 0 && <option value="">{t("Noch kein Ordner")}</option>}
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button size="sm" icon={<Plus size={15} />} onClick={() => { const r = onNewFolder(k.label?.trim() || t("Ordner")); setPendingDeck(r.deck); setAction({ type: "folder", ref: r.pageId }); }}>{t("Neuer Ordner")}</Button>
              </div>
            </Field>
          )}
          {["record", "replay", "overlay"].includes(k.action.type) && <Banner kind="info">{t("Nutzt das unter „Overlay & Aufnahme“ gewählte Programm auf dem PC.")}</Banner>}
          <Field label={t("Beschriftung")} hint={t("Leer = Name des Ziels")}><input className="input" value={k.label ?? ""} maxLength={24} onChange={(e) => set({ label: e.target.value })} /></Field>
          <div className="row">
            <label className="row nowrap small">{t("Farbe")} <input type="color" value={k.color ?? "#1e293b"} onChange={(e) => set({ color: e.target.value })} /></label>
            <label className="row nowrap small">{t("Schrift")} <input type="color" value={k.textColor ?? textOn(k.color)} onChange={(e) => set({ textColor: e.target.value })} /></label>
            {k.textColor && <Button size="sm" variant="ghost" onClick={() => set({ textColor: null })}>{t("Automatisch")}</Button>}
          </div>
        </div>
        <div className="stack">
          <div className="deck-preview"><span className="deck-key" style={{ background: k.color ?? undefined, color: k.textColor ?? textOn(k.color) }}><KeyFace k={{ ...k, label: k.label || targetName(k.action) || "" }} item={item} /></span></div>
          <Segmented value={iconTab} onChange={setIconTab} label={t("Symbol")} options={[{ value: "symbol", label: t("Symbol") }, { value: "logo", label: t("Logo") }, { value: "emoji", label: "Emoji" }, ...(item && (item.coverUrl || item.iconData || brandFor(item)) ? [{ value: "cover" as const, label: t("Cover") }] : []), { value: "image", label: t("Bild") }]} />
          {iconTab === "symbol" && (
            <div className="deck-icon-pick">
              {Object.keys(DECK_ICONS).map((n) => <button key={n} type="button" className={k.icon === `icon:${n}` ? "on" : ""} aria-label={n} onClick={() => set({ icon: `icon:${n}` })}><DeckIcon name={n} size={20} /></button>)}
            </div>
          )}
          {iconTab === "logo" && (() => {
            const q = logoSearch.trim().toLowerCase();
            const shown = BRANDS.filter((b) => !q || b.name.toLowerCase().includes(q));
            const pick = (b: Brand) => <button key={b.id} type="button" className={k.icon === `brand:${b.id}` ? "on" : ""} aria-label={b.name} title={b.name} style={{ background: brandBg(b) }} onClick={() => set({ icon: `brand:${b.id}`, color: brandBg(b), textColor: null })}><BrandLogo brand={b} size={22} /></button>;
            const games = shown.filter(isGameBrand), apps = shown.filter((b) => !isGameBrand(b));
            return (
              <div className="stack-sm">
                <input className="input" type="search" value={logoSearch} onChange={(e) => setLogoSearch(e.target.value)} placeholder={t("Logo suchen, z. B. Minecraft")} aria-label={t("Logo suchen")} />
                <div className="deck-icon-pick logos">
                  {games.length > 0 && <div className="pick-head">{t("Spiele")}</div>}
                  {games.map(pick)}
                  {apps.length > 0 && <div className="pick-head">{t("Programme & Plattformen")}</div>}
                  {apps.map(pick)}
                  {!shown.length && <div className="pick-head">{t("Kein Logo gefunden – für andere Spiele das Cover nehmen (Spiel als Aktion wählen).")}</div>}
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{t("Logos: simple-icons (CC0) und Arcticons (CC BY-SA 4.0). Marken gehören ihren Inhabern.")}</p>
              </div>
            );
          })()}
          {iconTab === "emoji" && <Field label={t("Emoji")}><input className="input" value={k.icon?.startsWith("emoji:") ? k.icon.slice(6) : ""} maxLength={8} placeholder="🎮" onChange={(e) => set({ icon: e.target.value ? `emoji:${e.target.value}` : "icon:zap" })} /></Field>}
          {iconTab === "cover" && <Button onClick={() => set({ icon: "cover" })} variant={k.icon === "cover" ? "primary" : undefined}>{item?.kind === "program" ? t("Logo bzw. Bild des Programms verwenden") : t("Bild des Spiels verwenden")}</Button>}
          {iconTab === "image" && (
            <label className="btn"><Upload size={15} />{t("Bild hochladen")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} /></label>
          )}
          {iconTab === "image" && <Button icon={<Wand2 size={15} />} onClick={() => setWorkshop(true)}>{t("In der Icon-Werkstatt gestalten")}</Button>}
          {iconTab === "image" && <p className="tiny muted">{t("Wird auf 144×144 Pixel verkleinert und auf dem PC gespeichert.")}</p>}
          {workshop && <IconWorkshop name={k.label || "Deck"} format="icon" applyLabel={t("Für die Taste übernehmen")} onClose={() => setWorkshop(false)}
            onApply={async (url: string) => { const blob = await (await fetch(url)).blob(); await upload(new File([blob], "icon.png", { type: blob.type })); }} />}
        </div>
      </div>
    </Modal>
  );
}

function DeckSettings({ deck, profiles, onClose, onSave, onDelete, onNew, onStarter }: { deck: Deck; profiles: Profile[]; onClose: () => void; onSave: (d: Deck) => void; onDelete: () => void; onNew: () => void; onStarter: () => void }) {
  const [d, setD] = useState(deck);
  const [warn, setWarn] = useState<string | null>(null);
  const setGrid = (cols: number, rows: number) => {
    const r = resize(d, cols, rows);
    setD(r.deck);
    setWarn(r.dropped ? t("{n} Tasten passen nicht mehr ins Raster und werden beim Speichern entfernt.", { n: r.dropped }) : null);
  };
  const removePage = async (p: DeckPage) => {
    if (d.pages.length <= 1) return;
    if (!(await confirmDialog(t("Seite „{n}“ löschen?", { n: p.name }), t("Tasten, die diesen Ordner öffnen, werden leer."), { danger: true, ok: t("Löschen") }))) return;
    setD({ ...d, pages: d.pages.filter((x) => x.id !== p.id).map((x) => ({ ...x, keys: x.keys.map((k) => (k.action.type === "folder" && k.action.ref === p.id ? { ...k, action: { type: "none" as const } } : k)) })) });
  };
  return (
    <Modal title={t("Deck-Einstellungen")} onClose={onClose} footer={<>
      <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete} style={{ marginRight: "auto" }}>{t("Deck löschen")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={() => onSave(d)}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" value={d.name} maxLength={30} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <div className="row">
          <Field label={t("Spalten (Hochformat)")}><select className="input" value={d.cols} onChange={(e) => setGrid(+e.target.value, d.rows)}>{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Field label={t("Zeilen (Hochformat)")}><select className="input" value={d.rows} onChange={(e) => setGrid(d.cols, +e.target.value)}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n}>{n}</option>)}</select></Field>
        </div>
        <p className="tiny muted">{t("Im Querformat werden Spalten und Zeilen getauscht.")}</p>
        {warn && <Banner kind="warn">{warn}</Banner>}
        <Field label={t("Hintergrund")}>
          <div className="row nowrap">
            <select className="input grow" value={d.background && !d.background.startsWith("#") ? d.background : d.background ? "#color" : ""} onChange={(e) => setD({ ...d, background: e.target.value === "#color" ? "#0b1220" : e.target.value || null })}>
              <option value="">{t("Design der App")}</option>
              <option value="#color">{t("Eigene Farbe")}</option>
              {BG_SCENES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {d.background?.startsWith("#") && <input type="color" value={d.background} onChange={(e) => setD({ ...d, background: e.target.value })} aria-label={t("Hintergrundfarbe")} />}
          </div>
        </Field>
        <Field label={t("Automatisch zeigen bei Profil")} hint={t("Ist dieses Gaming-Profil aktiv (z. B. weil ein Spiel läuft), zeigt das Handy dieses Deck.")}>
          <select className="input" value={d.profileId ?? ""} onChange={(e) => setD({ ...d, profileId: e.target.value || null })}>
            <option value="">{t("Nie")}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("Seiten")}>
          <div className="list">
            {d.pages.map((p, i) => (
              <div key={p.id} className="list-item">
                <input className="input grow" value={p.name} maxLength={30} aria-label={t("Name der Seite")} onChange={(e) => setD({ ...d, pages: d.pages.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} />
                <span className="tiny muted nowrap">{i === 0 ? t("Startseite") : t("{n} Tasten", { n: p.keys.length })}</span>
                {i > 0 && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={t("Seite löschen")} onClick={() => removePage(p)} />}
              </div>
            ))}
          </div>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setD({ ...d, pages: [...d.pages, { id: newId("page"), name: t("Seite {n}", { n: d.pages.length + 1 }), keys: [] }] })}>{t("Seite hinzufügen")}</Button>
        </Field>
        <div className="row">
          <Button size="sm" icon={<Plus size={15} />} onClick={onNew}>{t("Weiteres leeres Deck")}</Button>
          <Button size="sm" icon={<Wand2 size={15} />} onClick={onStarter}>{t("Deck aus meinen Sachen erstellen")}</Button>
        </div>
      </div>
    </Modal>
  );
}
