// Games and apps as tiles: tap = start on the PC (like app icons on a phone). One launch path for the library page and
// the home widgets.
import { useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Pencil, Star } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { bumpUsage } from "../lib/prefs";
import { gradientFor, initials } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { brandBg, brandFor } from "../lib/brands";
import { BrandLogo } from "./brand-logo";

/** Starts an item; while the PC answers the tile shows a spinner and further taps are ignored. */
export function useLaunch() {
  const [launching, setLaunching] = useState<Set<string>>(new Set());
  const launch = async (i: LibraryItem) => {
    if (launching.has(i.id)) return;
    navigator.vibrate?.(10);
    bumpUsage("item:" + i.id);
    setLaunching((s) => new Set(s).add(i.id));
    try {
      const r = await client.call<{ ok?: boolean; message?: string }>("library.launch", { id: i.id });
      if (r && r.ok === false) toast(r.message ?? t("Start fehlgeschlagen"), "error");
      else toast(t("{name} wird gestartet", { name: i.name }), "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { window.setTimeout(() => setLaunching((s) => { const n = new Set(s); n.delete(i.id); return n; }), 900); }
  };
  return { launch, launching };
}

const tileBg = (item: LibraryItem, coverAllowed: boolean) => { const b = tileArt(item, coverAllowed).brand; return b ? brandBg(b) : gradientFor(item.name); };

const onKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

/** What a tile shows: programs prefer the real brand logo (Discord, OBS …), games their cover; otherwise the PC's icon,
 * and only as a last resort colourful initials (never a grey box). */
export function tileArt(item: LibraryItem, coverAllowed = true) {
  const brand = brandFor(item);
  const cover = coverAllowed ? item.coverUrl : undefined;
  if (item.kind === "program" && brand) return { brand };
  if (item.iconData) return { pic: item.iconData };
  if (brand && !cover) return { brand };
  return cover ? { pic: cover } : {};
}

function Art({ item, coverAllowed }: { item: LibraryItem; coverAllowed: boolean }) {
  const [broken, setBroken] = useState(false);
  const art = tileArt(item, coverAllowed);
  if (art.brand) return <span className="tile-brand"><BrandLogo brand={art.brand} size="56%" /></span>;
  if (art.pic && !broken) return <img src={art.pic} alt="" loading="lazy" onError={() => setBroken(true)} />;
  // Picture not loadable: the logo if there is one, otherwise the initials.
  const b = broken ? brandFor(item) : undefined;
  if (b) return <span className="tile-brand"><BrandLogo brand={b} size="56%" /></span>;
  return <span className="tile-initials">{initials(item.name)}</span>;
}

/** App-icon style: rounded picture with the name below. Tap = start. Like on a phone's home screen, a long press
 * (or right click) opens the settings; in edit mode (`editing`) a tap does, and the tile shows a pencil. */
export function AppTile({ item, running, busy, onLaunch, onEdit, editing, coverAllowed = true }: { item: LibraryItem; running?: boolean; busy?: boolean; onLaunch: () => void; onEdit?: () => void; editing?: boolean; coverAllowed?: boolean }) {
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const cancel = () => { if (press.current) { clearTimeout(press.current.timer); } };
  const down = () => {
    if (!onEdit || editing) return;
    cancel();
    press.current = { fired: false, timer: window.setTimeout(() => { if (press.current) press.current.fired = true; navigator.vibrate?.(15); onEdit(); }, 550) };
  };
  const tap = () => {
    if (press.current?.fired) { press.current = null; return; } // the long press already opened the settings
    cancel();
    if (editing && onEdit) onEdit(); else onLaunch();
  };
  return (
    <div className={`app-tile ${busy ? "busy" : ""} ${editing ? "editing" : ""}`} role="button" tabIndex={0}
      aria-label={editing ? t("{n} bearbeiten", { n: item.name }) : t("{name} starten", { name: item.name })} aria-busy={busy}
      onClick={tap} onKeyDown={onKey(tap)} onPointerDown={down} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={onEdit ? (e) => { e.preventDefault(); cancel(); onEdit(); } : undefined}>
      <span className="app-icon" style={{ background: tileBg(item, coverAllowed) }}>
        <Art item={item} coverAllowed={coverAllowed} />
        {busy && <span className="tile-busy"><Loader2 size={22} className="spin" /></span>}
        {running && <span className="tile-dot" aria-label={t("läuft")} />}
        {item.favorite && <Star className="tile-star" size={12} fill="currentColor" aria-hidden />}
        {editing && <span className="tile-edit" aria-hidden><Pencil size={13} /></span>}
      </span>
      <span className="app-name">{item.name}</span>
    </div>
  );
}

/** Small row of tiles (home widgets): favourites or recently started. */
export function TileRow({ items, running }: { items: LibraryItem[]; running: string[] }) {
  const { launch, launching } = useLaunch();
  return (
    <div className="tile-row">
      {items.map((i) => <AppTile key={i.id} item={i} running={running.includes(i.id)} busy={launching.has(i.id)} onLaunch={() => launch(i)} />)}
    </div>
  );
}
