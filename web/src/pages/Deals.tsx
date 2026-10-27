import { useEffect, useState } from "react";
import { BadgePercent, ExternalLink, Pencil, Plus, RefreshCw, Search, ShieldCheck, Tag } from "lucide-react";
import { BrandLogo } from "../components/brand-logo";
import { brandById } from "../lib/brands";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useAction, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, gradientFor, initials, relTime } from "../lib/format";
import { clientId, keyShopLinks, lowestSeen, money, parsePrice, priceInput } from "../lib/quest-deal";
import { CompatPanel } from "../components/compat-panel";
import { fetchMsPrice, phonePrices, savePhonePrice, type MsResult } from "../lib/ms-store";
import { loadCatalogPart, loadSteamIndex, lookup, shard, type SteamIndex } from "../lib/steam-index";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";
import { TagInput } from "../components/journal-ui";
import { allCategories, chartPoints, filterWishes, sortWishes, type WishFilter, type WishSort } from "../lib/wishlist";

interface Wish {
  id: string; title: string; steamAppId?: string | null; targetCents?: number | null; notes?: string | null; addedAt?: string;
  currency?: string | null; finalCents?: number | null; initialCents?: number | null; discountPercent?: number | null;
  checkedAt?: string | null; error?: string | null; history?: { at: string; final: number; initial: number }[];
  fromSteamWishlist?: boolean; msProductId?: string | null; msTitle?: string | null; msFinalCents?: number | null; msInitialCents?: number | null; msCurrency?: string | null; msError?: string | null; msImage?: string | null; msFromPhone?: number | null; steamFromList?: number | null; steamImage?: string | null;
  kind?: "game" | "dlc"; baseGame?: string | null; priority?: number; categories?: string[]; shopUrl?: string | null;
  ggKeyshopCents?: number | null; ggRetailCents?: number | null; ggKeyshopLowCents?: number | null; ggRetailLowCents?: number | null; ggCurrency?: string | null; ggUrl?: string | null; ggError?: string | null; ggCheckedAt?: string | null;
}
interface DealData {
  enabled: boolean; country: string; lastRunAt?: string | null; source: string; msSource?: string; intervalHours: number; items: Wish[];
  compareMicrosoft?: boolean; syncSteamWishlist?: boolean; wishlistSyncedAt?: string | null; wishlistError?: string | null; steamAccount?: boolean;
  ggKeySet?: boolean; ggSource?: string;
}
interface Hit { appId: string; name: string; finalCents?: number | null; initialCents?: number | null; currency?: string | null }

const COUNTRIES = ["de", "at", "ch", "fr", "nl", "be", "it", "es", "pl", "gb", "us"];
const saved = (online: boolean) => toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");

const PRIORITIES = ["Niedrig", "Normal", "Hoch"];

function WishEditor({ wish, onClose, allCats = [] }: { wish: Wish; onClose: () => void; allCats?: string[] }) {
  const conn = useConn();
  const [title, setTitle] = useState(wish.title);
  const [appId, setAppId] = useState(wish.steamAppId ?? "");
  const [target, setTarget] = useState(priceInput(wish.targetCents));
  const [notes, setNotes] = useState(wish.notes ?? "");
  const [kind, setKind] = useState<"game" | "dlc">(wish.kind ?? "game");
  const [baseGame, setBaseGame] = useState(wish.baseGame ?? "");
  const [priority, setPriority] = useState(wish.priority ?? 1);
  const [cats, setCats] = useState<string[]>(wish.categories ?? []);
  const [shopUrl, setShopUrl] = useState(wish.shopUrl ?? "");
  const [busy, setBusy] = useState(false);
  const cents = parsePrice(target);
  const badId = appId.trim() !== "" && !/^\d{1,10}$/.test(appId.trim());
  const badUrl = shopUrl.trim() !== "" && !/^https:\/\/[^\s]+\.[^\s]+/.test(shopUrl.trim());
  const save = async () => {
    setBusy(true);
    try {
      await client.call("deals.save", { id: wish.id, title: title.trim(), steamAppId: appId.trim() || null, targetCents: cents, notes: notes.trim() || null,
        kind, baseGame: kind === "dlc" ? baseGame.trim() || null : null, priority, categories: cats.slice(0, 8), shopUrl: shopUrl.trim() || null });
      saved(conn.auth === "ok"); onClose();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Von der Wunschliste entfernen?"), wish.title, { danger: true, ok: t("Entfernen") }))) return;
    client.call("deals.remove", { id: wish.id }).then(onClose, (e: Error) => toast(e.message, "error"));
  };
  return (
    <Modal title={wish.title ? t("Eintrag bearbeiten") : t("Spiel von Hand eintragen")} onClose={onClose} footer={<>
      {wish.title && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Entfernen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" busy={busy} disabled={!title.trim() || Number.isNaN(cents) || badId || badUrl || cats.length > 8} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <Field label={t("Spiel")}><input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid-2">
        <Field label={t("Zielpreis")} hint={t("Leer = kein Ziel, nur beobachten.")} error={Number.isNaN(cents) ? t("Bitte als Betrag, z. B. 19,99") : undefined}>
          <input className="input" inputMode="decimal" value={target} placeholder="19,99" onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label={t("Steam-App-ID (optional)")} hint={t("Steht in der Adresse der Shop-Seite: store.steampowered.com/app/<ID>. Ohne ID gibt es keinen Preis.")} error={badId ? t("Nur Ziffern") : undefined}>
          <input className="input mono" inputMode="numeric" value={appId} maxLength={10} onChange={(e) => setAppId(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label={t("Art")}><select className="input" value={kind} onChange={(e) => setKind(e.target.value as "game" | "dlc")}><option value="game">{t("Spiel")}</option><option value="dlc">{t("DLC / Erweiterung")}</option></select></Field>
        <Field label={t("Priorität")}><select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>{PRIORITIES.map((p, i) => <option key={i} value={i}>{t(p)}</option>)}</select></Field>
      </div>
      {kind === "dlc" && <Field label={t("Gehört zu Spiel")}><input className="input" value={baseGame} maxLength={80} onChange={(e) => setBaseGame(e.target.value)} /></Field>}
      <Field label={t("Shop-Link oder offizielle Seite (optional)")} hint={t("Nur ein Link zum Öffnen – der PC liest diese Seite nicht aus.")} error={badUrl ? t("Bitte mit https:// beginnen") : undefined}>
        <input className="input" inputMode="url" placeholder="https://" value={shopUrl} maxLength={500} onChange={(e) => setShopUrl(e.target.value)} />
      </Field>
      <div className="stack-xs"><b className="small">{t("Kategorien")}</b><TagInput value={cats} onChange={setCats} suggestions={allCats} />{cats.length > 8 && <span className="tiny" style={{ color: "var(--danger)" }}>{t("Höchstens 8 Kategorien.")}</span>}</div>
      <Field label={t("Notiz")}><input className="input" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}

/** "Just type the name": with the PC the game is found right away (Steam and Microsoft Store); without the PC the name
 * is kept and the PC finds the game at the next check. */
function QuickAdd({ data, disabled, onQueued }: { data: DealData; disabled: boolean; onQueued?: (id: string, title: string) => void }) {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const name = title.trim();
    if (name.length < 2) return;
    setBusy(true);
    try {
      if (online) {
        const w = await client.call<Wish>("deals.addByName", { title: name, targetCents: null });
        toast(w.steamAppId ? t("„{n}“ gefunden und hinzugefügt", { n: w.title }) : t("„{n}“ hinzugefügt – das Spiel wird bei der nächsten Prüfung gesucht", { n: w.title }), "success");
      } else {
        // The outbox confirms with its own "saved – sent when the PC is connected" note.
        const id = clientId("wish");
        await client.call("deals.save", { id, title: name, steamAppId: null, targetCents: null });
        onQueued?.(id, name);
      }
      setTitle("");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <form className="stack-xs" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <div className="row nowrap" style={{ gap: 8 }}>
        <input className="input" value={title} maxLength={80} placeholder={t("Spielname, z. B. Hades II")} aria-label={t("Name des Spiels")} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Plus size={16} />} busy={busy} disabled={disabled || title.trim().length < 2}>{t("Hinzufügen")}</Button>
      </div>
      {(!data.enabled || !online) && <p className="tiny muted" style={{ margin: 0 }}>{!data.enabled ? t("Die Preisabfrage ist aus – der Name wird gespeichert, gesucht wird nach dem Einschalten.") : t("Ohne PC wird der Name vorgemerkt; der PC sucht das Spiel beim Verbinden.")}</p>}
    </form>
  );
}

const steamArt = (appId: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;

/** The game's original store picture (Steam header, else the Microsoft Store art), initials if there is none. */
function DealArt({ w }: { w: Wish }) {
  // Real picture from Steam (newer games only under their own path), then the old Steam path, then the Microsoft Store.
  const sources = [w.steamImage, w.steamAppId ? steamArt(w.steamAppId) : null, w.msImage].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const [n, setN] = useState(0);
  const src = sources[n];
  return (
    <div className="deal-art" style={{ background: gradientFor(w.title) }}>
      {src ? <img key={src} src={src} alt="" loading="lazy" onError={() => setN(n + 1)} /> : <span className="initials">{initials(w.title)}</span>}
    </div>
  );
}

/** Which store is cheaper right now – only when both have a price in the same currency. */
/** The key shop price (GG.deals) is below both store prices that are known. */
function keyshopBest(w: Wish) {
  const k = w.ggKeyshopCents;
  if (k == null) return false;
  const others = [w.finalCents, w.msFinalCents].filter((x): x is number => x != null);
  return others.length > 0 && others.every((x) => k < x);
}

function cheaper(w: Wish): "steam" | "xbox" | null {
  if (w.finalCents == null || w.msFinalCents == null || w.currency !== w.msCurrency || w.finalCents === w.msFinalCents) return null;
  return w.finalCents < w.msFinalCents ? "steam" : "xbox";
}

const isHit = (w: Wish) => {
  const cur = w.currency ?? w.msCurrency ?? w.ggCurrency;
  const best = Math.min(w.finalCents ?? Infinity, w.currency === w.msCurrency || w.finalCents == null ? w.msFinalCents ?? Infinity : Infinity,
    w.ggCurrency === cur ? w.ggKeyshopCents ?? Infinity : Infinity);
  return w.targetCents != null && best <= w.targetCents;
};

function PriceRow({ store, cents, currency, best }: { store: "xbox" | "steam"; cents?: number | null; currency?: string | null; best: boolean }) {
  const brand = brandById(store);
  return (
    <div className={`deal-row ${best ? "best" : ""}`}>
      <span className="deal-store">{brand && <BrandLogo brand={brand} size={13} />}{store === "xbox" ? "Xbox" : "Steam"}</span>
      <b>{cents != null ? money(cents, currency) : "–"}</b>
    </div>
  );
}

function DealTile({ w, onOpen }: { w: Wish; onOpen: () => void }) {
  const c = cheaper(w);
  return (
    <button type="button" className={`deal-tile ${isHit(w) ? "hit" : ""}`} onClick={onOpen} aria-label={t("{n} – Details und Preisverlauf", { n: w.title })}>
      <DealArt w={w} />
      {(!!w.discountPercent || isHit(w)) && <span className="deal-flags">
        {isHit(w) && <span className="badge ok"><BadgePercent size={12} />{t("Ziel")}</span>}
        {!!w.discountPercent && <span className="badge accent">−{w.discountPercent} %</span>}
      </span>}
      <span className="deal-name ellipsis">{w.title}</span>
      {(w.kind === "dlc" || (w.priority ?? 1) === 2) && <span className="row" style={{ gap: 4, padding: "0 10px" }}>{w.kind === "dlc" && <span className="badge">DLC</span>}{(w.priority ?? 1) === 2 && <span className="badge warn">{t("Hohe Priorität")}</span>}</span>}
      <PriceRow store="xbox" cents={w.msFinalCents} currency={w.msCurrency} best={c === "xbox"} />
      <PriceRow store="steam" cents={w.finalCents} currency={w.currency} best={c === "steam"} />
    </button>
  );
}

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/** Own price measurements over time, with dates and lowest/highest price – only what was really seen. */
function PriceChart({ history, currency }: { history: { at: string; final: number; initial: number }[]; currency?: string | null }) {
  const c = chartPoints(history);
  if (!c) return null;
  const W = 300, H = 90, P = 6;
  const pts = c.points.map((p) => [P + p.x * (W - 2 * P), P + (1 - p.y) * (H - 2 * P)] as const);
  // A step line: a price stays until the next measurement.
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `H${x}V${y}`)).join("");
  return (
    <figure className="price-chart" aria-label={t("Preisverlauf von {a} bis {b}", { a: money(c.min, currency), b: money(c.max, currency) })}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="var(--primary)"><title>{`${dateTime(c.points[i].at)}: ${money(c.points[i].cents, currency)}`}</title></circle>)}
      </svg>
      <figcaption className="row between tiny muted"><span>{dateTime(c.from)}</span><span>{t("höchster {a} · niedrigster {b}", { a: money(c.max, currency), b: money(c.min, currency) })}</span><span>{dateTime(c.to)}</span></figcaption>
    </figure>
  );
}

/** Everything about one game: both prices, target, own price history, links, compatibility. */
function DealDetail({ w, data, canManage, onEdit, onClose }: { w: Wish; data: DealData; canManage: boolean; onEdit: () => void; onClose: () => void }) {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const c = cheaper(w);
  const low = lowestSeen(w.history ?? []);
  return (
    <Modal title={w.title} onClose={onClose} footer={<>
      {canManage && <Button icon={<Pencil size={15} />} onClick={onEdit} style={{ marginRight: "auto" }}>{t("Bearbeiten")}</Button>}
      <Button variant="primary" onClick={onClose}>{t("Schließen")}</Button>
    </>}>
      <div className="stack">
        <DealArt w={w} />
        <div className="deal-compare">
          <div className={`deal-store-box ${c === "xbox" ? "best" : ""}`}>
            <span className="deal-store">{brandById("xbox") && <BrandLogo brand={brandById("xbox")!} size={15} />}Microsoft Store (Xbox)</span>
            {w.msFinalCents != null ? <>
              <span className="deal-now">{money(w.msFinalCents, w.msCurrency)}</span>
              {w.msInitialCents != null && w.msInitialCents > w.msFinalCents && <s className="muted small">{money(w.msInitialCents, w.msCurrency)}</s>}
              {w.msTitle && w.msTitle !== w.title && <span className="tiny muted">{w.msTitle}</span>}
            </> : <span className="small muted">{w.msError ?? (data.compareMicrosoft === false ? t("Vergleich ist aus") : t("Noch nicht geprüft"))}</span>}
            {w.msFromPhone && <span className="tiny muted">{t("vom Handy geprüft {d}", { d: relTime(w.msFromPhone) })}</span>}
            {w.msProductId && <a className="btn sm" href={`https://www.xbox.com/de-DE/games/store/p/${w.msProductId}`} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Im Microsoft Store öffnen")}</a>}
          </div>
          <div className={`deal-store-box ${c === "steam" ? "best" : ""}`}>
            <span className="deal-store">{brandById("steam") && <BrandLogo brand={brandById("steam")!} size={15} />}Steam</span>
            {w.finalCents != null ? <>
              <span className="deal-now">{money(w.finalCents, w.currency)}</span>
              {!!w.discountPercent && w.initialCents != null && <s className="muted small">{money(w.initialCents, w.currency)} · −{w.discountPercent} %</s>}
              {w.steamFromList && <span className="tiny muted">{t("aus der Steam-Preisliste der Website, Stand {d}", { d: relTime(w.steamFromList) })}</span>}
            </> : <span className="small muted">{!w.steamAppId ? (w.error ?? (online ? t("Noch keinem Steam-Spiel zugeordnet – der PC sucht es bei der nächsten Prüfung über den Namen.") : t("Nicht in der Steam-Preisliste der Website (sie enthält nur die rund 3000 beliebtesten Spiele) – Steam erlaubt keine Abfrage direkt vom Handy. Beim nächsten Verbinden prüft der PC den Preis."))) : data.enabled ? t("Noch nicht geprüft – kommt mit der nächsten Prüfung.") : t("Preisabfrage ist aus.")}</span>}
            {w.steamAppId && <a className="btn sm" href={`https://store.steampowered.com/app/${w.steamAppId}`} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Im Steam-Shop öffnen")}</a>}
          </div>
        </div>
        <div className={`deal-store-box ${keyshopBest(w) ? "best" : ""}`}>
          <span className="deal-store"><Tag size={15} />{t("Key-Shops ({c})", { c: data.country.toUpperCase() })}</span>
          {w.ggKeyshopCents != null ? <>
            <span className="deal-now">{t("ab {p}", { p: money(w.ggKeyshopCents, w.ggCurrency) })}</span>
            <span className="tiny muted">{[w.ggKeyshopLowCents != null && t("Tiefstpreis {p}", { p: money(w.ggKeyshopLowCents, w.ggCurrency) }), w.ggRetailCents != null && t("offizielle Shops ab {p}", { p: money(w.ggRetailCents, w.ggCurrency) })].filter(Boolean).join(" · ")}</span>
            <span className="tiny muted">{t("günstigster Key-Shop laut GG.deals (Instant Gaming, Eneba und viele mehr), geprüft {d} – nicht jeder Key ist ein Steam-Key, Region und Plattform im Shop prüfen", { d: w.ggCheckedAt ? relTime(w.ggCheckedAt) : "–" })}</span>
          </> : <span className="small muted">{w.ggError ?? (!data.ggKeySet ? t("Preise mit kostenlosem GG.deals-Schlüssel (Einstellungen unten). Ohne Schlüssel: Links zum Nachschauen.") : !w.steamAppId ? t("Braucht die Steam-App-ID des Spiels.") : data.enabled ? t("Noch nicht geprüft – kommt mit der nächsten Prüfung.") : t("Preisabfrage ist aus."))}</span>}
          <div className="row" style={{ gap: 6 }}>
            {w.ggUrl && <a className="btn sm" href={w.ggUrl} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Alle Angebote bei GG.deals")}</a>}
            {keyShopLinks(w.title).map((l) => <a key={l.shop} className="btn sm" href={l.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Bei {s} ansehen", { s: l.name })}</a>)}
          </div>
        </div>
        {keyshopBest(w) ? <p className="small" style={{ margin: 0 }}>{t("In einem Key-Shop gerade am günstigsten (laut GG.deals).")}</p>
          : c && <p className="small" style={{ margin: 0 }}>{c === "xbox" ? t("Im Microsoft Store gerade günstiger.") : t("Bei Steam gerade günstiger.")}</p>}
        <div className="row between">
          <span className="small">{w.targetCents != null ? t("Zielpreis {p}", { p: money(w.targetCents, w.currency ?? w.msCurrency) }) : t("kein Zielpreis")}</span>
          {isHit(w) && <span className="badge ok"><BadgePercent size={13} />{t("Zielpreis erreicht")}</span>}
        </div>
        <div className="stack-xs">
          <b className="small">{t("Preisverlauf bei Steam (eigene Messungen)")}</b>
          {(w.history?.length ?? 0) > 1 ? <>
            <PriceChart history={w.history!} currency={w.currency} />
            <span className="tiny muted">{t("{n} Messungen seit {d}", { n: w.history!.length, d: dateTime(w.history![0].at) })}{low != null ? " · " + t("niedrigster selbst gesehener Preis {p}", { p: money(low, w.currency) }) : ""}</span>
          </> : <span className="tiny muted">{t("Erscheint ab der zweiten Prüfung – gezeigt werden nur Preise, die dieser PC selbst gesehen hat.")}</span>}
        </div>
        <div className="stack-xs small">
          <span>{[w.kind === "dlc" ? t("DLC") + (w.baseGame ? ` · ${t("zu {g}", { g: w.baseGame })}` : "") : t("Spiel"), t("Priorität: {p}", { p: t(PRIORITIES[w.priority ?? 1]) }), ...(w.categories ?? [])].join(" · ")}</span>
          <span className="tiny muted">{w.targetCents == null ? t("Benachrichtigung bei Zielpreis: aus (kein Zielpreis)") : !data.enabled ? t("Benachrichtigung bei Zielpreis: aus (Preisabfrage ist aus)") : t("Benachrichtigung bei Zielpreis: aktiv")}</span>
          {w.shopUrl && <a className="btn sm" style={{ alignSelf: "flex-start" }} href={w.shopUrl} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Eigener Shop-Link: {h}", { h: hostOf(w.shopUrl) })}</a>}
        </div>
        <div className="tiny muted">
          {w.fromSteamWishlist && <span className="badge" style={{ marginRight: 6 }}>{t("von deiner Steam-Wunschliste")}</span>}
          {w.checkedAt && t("Geprüft {d}", { d: dateTime(w.checkedAt) })}
          {w.notes && <div>{w.notes}</div>}
        </div>
        {w.error && w.steamAppId && <Banner kind="warn">{w.error}</Banner>}
        {w.steamAppId && <details className="compat-details"><summary className="small">{t("Läuft das auf meinem PC?")}</summary><CompatPanel appId={w.steamAppId} /></details>}
      </div>
    </Modal>
  );
}

function Settings({ d, canManage, online }: { d: DealData; canManage: boolean; online: boolean }) {
  const conn = useConn();
  const [refresh, refreshing] = useAction(() => client.call("deals.refresh"), { success: t("Preise geprüft") });
  const [sync, syncing] = useAction(async () => { const r = await client.call<{ added: number; removed: number; total: number }>("deals.syncWishlist"); toast(t("Steam-Wunschliste: {a} neu, {r} entfernt ({n} Spiele)", { a: r.added, r: r.removed, n: r.total }), "success"); });
  const configure = (p: { enabled?: boolean; country?: string; compareMicrosoft?: boolean; syncSteamWishlist?: boolean }) => client.call("deals.configure", p).then(() => saved(conn.auth === "ok"), (e: Error) => toast(e.message, "error"));
  const state = [d.enabled ? t("Preisabfrage an") : t("Preisabfrage aus"), d.enabled && d.compareMicrosoft !== false && "Xbox", d.enabled && d.syncSteamWishlist !== false && t("Steam-Wunschliste"), d.country.toUpperCase()].filter(Boolean).join(" · ");
  return (
    <details className="card deal-settings">
      <summary><ShieldCheck size={17} /><b>{t("Einstellungen")}</b><span className="tiny muted grow ellipsis">{state}</span></summary>
      <div className="stack-sm" style={{ marginTop: 12 }}>
        <Switch checked={d.enabled} disabled={!canManage} onChange={(enabled) => configure({ enabled })} label={t("Preise im Steam-Shop abfragen")}
          hint={t("Aus = keine einzige Anfrage. An = der PC fragt höchstens alle {h} Stunden (nie während eines Spiels) bei store.steampowered.com nach – Steam sieht dabei die IP-Adresse des PCs und die App-IDs.", { h: d.intervalHours })} />
        <Switch checked={d.compareMicrosoft !== false} disabled={!canManage || !d.enabled} onChange={(compareMicrosoft) => configure({ compareMicrosoft })} label={t("Auch im Microsoft Store (Xbox) vergleichen")}
          hint={t("Fragt zusätzlich displaycatalog.mp.microsoft.com – den Katalog, aus dem auch die Xbox-App ihre Preise zeigt. Gezeigt wird die günstigste kaufbare Edition mit passendem Namen.")} />
        <Switch checked={d.syncSteamWishlist !== false} disabled={!canManage || !d.enabled} onChange={(syncSteamWishlist) => configure({ syncSteamWishlist })} label={t("Steam-Wunschliste automatisch übernehmen")}
          hint={d.steamAccount ? t("Bei jeder Prüfung abgeglichen. Deine Steam-Wunschliste muss öffentlich sein (Steam → Profil → Privatsphäre → Spieldetails).") : t("Dafür unter Spiele → Steam die Bibliothek verbinden oder am PC bei Steam angemeldet sein.")} />
        <div className="row between" style={{ gap: 8 }}>
          <Field label={t("Shop-Land (Preis und Währung)")}>
            <select className="input" value={d.country} disabled={!canManage} onChange={(e) => configure({ country: e.target.value })}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </Field>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" icon={<RefreshCw size={15} />} busy={refreshing} disabled={!canManage || !d.enabled || !online || d.items.length === 0} onClick={() => refresh()}>{t("Jetzt prüfen")}</Button>
            {d.enabled && d.syncSteamWishlist !== false && <Button size="sm" icon={<RefreshCw size={15} />} busy={syncing} disabled={!canManage || !online || !d.steamAccount} onClick={() => sync()}>{t("Wunschliste holen")}</Button>}
          </div>
        </div>
        <span className="tiny muted">{[d.lastRunAt ? t("Zuletzt geprüft {d}", { d: relTime(d.lastRunAt) }) : t("Noch nie geprüft"), d.enabled && d.syncSteamWishlist !== false && (d.wishlistSyncedAt ? t("Wunschliste abgeglichen {d}", { d: relTime(d.wishlistSyncedAt) }) : t("Wunschliste noch nicht abgeglichen"))].filter(Boolean).join(" · ")}</span>
        <GgKey d={d} canManage={canManage} online={online} />
        <p className="tiny muted" style={{ margin: 0 }}>{t("Quelle: {s}. Das ist der öffentliche Endpunkt des Steam-Webshops, keine offizielle Preis-API – er kann sich ändern. Verlauf = nur Preise, die dieser PC selbst gesehen hat.", { s: d.source })}</p>
      </div>
    </details>
  );
}

/** GG.deals API key: typed only at the PC side (admin), checked once with a real request, stored encrypted on the PC. */
function GgKey({ d, canManage, online }: { d: DealData; canManage: boolean; online: boolean }) {
  const isAdmin = useCan("admin");
  const [key, setKey] = useState("");
  const [save, saving] = useAction(async () => { await client.call("deals.ggKey", { key }); setKey(""); }, { success: t("GG.deals-Schlüssel gespeichert – Preise kommen mit der nächsten Prüfung") });
  const [remove, removing] = useAction(() => client.call("deals.ggKey", { key: "" }), { success: t("GG.deals-Schlüssel entfernt") });
  return (
    <div className="stack-sm">
      <b className="small">{t("Key-Shop-Preise (GG.deals)")}</b>
      <span className="tiny muted">{t("Mit einem kostenlosen API-Schlüssel von GG.deals zeigt der Deal Radar den günstigsten Key-Shop-Preis (Instant Gaming, Eneba und viele mehr) und den Tiefstpreis. Schlüssel: bei gg.deals anmelden und in deinem Konto einen API-Schlüssel erstellen (gg.deals/api). Er bleibt verschlüsselt auf dem PC; der PC fragt bei jeder Prüfung api.gg.deals mit den Steam-App-IDs deiner Wunschliste.")}</span>
      {d.ggKeySet ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="badge ok">{t("Schlüssel gespeichert")}</span>
          {isAdmin && <Button size="sm" variant="ghost" busy={removing} disabled={!online} onClick={() => remove()}>{t("Entfernen")}</Button>}
        </div>
      ) : isAdmin && canManage ? (
        <form className="row nowrap" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (key.trim()) void save(); }}>
          <input className="input mono" type="password" autoComplete="off" value={key} maxLength={200} placeholder={t("GG.deals-API-Schlüssel")} aria-label={t("GG.deals-API-Schlüssel")} onChange={(e) => setKey(e.target.value)} />
          <Button type="submit" busy={saving} disabled={!key.trim() || !online}>{t("Prüfen & speichern")}</Button>
        </form>
      ) : <span className="tiny muted">{t("Eintragen geht am PC (dort hat die App Admin-Rechte).")}</span>}
    </div>
  );
}

function SearchCard({ data, disabled }: { data: DealData; disabled: boolean }) {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [target, setTarget] = useState("");
  const [search, searching] = useAction(async () => { setHits(null); setHits((await client.call<{ items: Hit[] }>("deals.search", { term: term.trim() })).items); });
  const cents = parsePrice(target);
  const add = (h: Hit) => client.call("deals.save", { id: clientId("wish"), title: h.name, steamAppId: h.appId, targetCents: Number.isNaN(cents) ? null : cents })
    .then(() => toast(t("{n} hinzugefügt", { n: h.name }), "success"), (e: Error) => toast(e.message, "error"));
  const have = new Set(data.items.map((i) => i.steamAppId));
  return (
    <div>
      <div className="stack-sm">
        {!data.enabled && <p className="small muted">{t("Die Suche fragt den Steam-Shop – dafür oben die Preisabfrage einschalten. Von Hand eintragen geht immer.")}</p>}
        {data.enabled && !online && <p className="small muted">{t("Die Suche läuft über den PC – ohne Verbindung nur von Hand eintragen.")}</p>}
        <form className="grid-2" onSubmit={(e) => { e.preventDefault(); if (term.trim().length >= 2) search(); }}>
          <Field label={t("Im Steam-Shop suchen")}><input className="input" value={term} maxLength={80} placeholder={t("z. B. Hades")} onChange={(e) => setTerm(e.target.value)} /></Field>
          <Field label={t("Zielpreis für neue Einträge (optional)")} error={Number.isNaN(cents) ? t("Bitte als Betrag, z. B. 19,99") : undefined}>
            <input className="input" inputMode="decimal" value={target} placeholder="19,99" onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <div><Button type="submit" icon={<Search size={16} />} busy={searching} disabled={disabled || !data.enabled || !online || term.trim().length < 2}>{t("Suchen")}</Button></div>
        </form>
        {hits && hits.length === 0 && <p className="small muted">{t("Nichts gefunden.")}</p>}
        {hits?.map((h) => (
          <div key={h.appId} className="row between">
            <span><b>{h.name}</b> <span className="tiny muted">{h.finalCents != null ? money(h.finalCents, h.currency) : t("kein Preis")} · ID {h.appId}</span></span>
            <Button size="sm" icon={<Plus size={15} />} disabled={disabled || have.has(h.appId)} onClick={() => add(h)}>{have.has(h.appId) ? t("Auf der Liste") : t("Hinzufügen")}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Overlays the Steam price list of the website if it is newer than the PC's last check (only without the PC). */
function withSteamList(w: Wish, idx: SteamIndex | null, catalog: Record<string, SteamIndex | null>, prices: boolean): Wish {
  const h = (idx && lookup(idx, w)) || (catalog[shard(w.title)] ? lookup(catalog[shard(w.title)]!, w) : null);
  if (!h) return w;
  const withPic = { ...w, steamAppId: w.steamAppId ?? h.appId, steamImage: w.steamImage ?? h.image, error: w.steamAppId ? w.error : null };
  const pcAt = w.checkedAt ? Date.parse(w.checkedAt) : 0;
  if (!prices || h.finalCents == null || (h.at <= pcAt && w.finalCents != null)) return withPic;
  return { ...withPic, finalCents: h.finalCents, initialCents: h.initialCents, discountPercent: h.discountPercent, currency: h.currency, steamFromList: h.at };
}

/** Overlays a price the phone fetched itself if it is newer than the PC's last check. */
function withPhone(w: Wish, r?: MsResult): Wish {
  if (!r) return w;
  const pcAt = w.checkedAt ? Date.parse(w.checkedAt) : 0;
  if (r.at <= pcAt && w.msFinalCents != null) return w;
  if ("error" in r) return w.msFinalCents != null ? w : { ...w, msError: r.error, msFromPhone: r.at };
  return { ...w, msProductId: r.productId, msTitle: r.title, msFinalCents: r.finalCents, msInitialCents: r.initialCents, msCurrency: r.currency, msImage: w.msImage ?? r.image ?? null, msError: null, msFromPhone: r.at };
}

/** Deal Radar: wish list as tiles (store picture, Xbox and Steam price); a tap shows the details and the price history. */
export default function Deals() {
  const q = useRpc<DealData>("deals.list", {}, ["deals"]);
  const canManage = useCan("manage");
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [edit, setEdit] = useState<Wish | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const raw = q.data;
  // Without the PC the phone asks the Microsoft Store itself; its newer prices are shown instead of the PC's older ones.
  const [phone, setPhone] = useState<Record<string, MsResult>>(phonePrices);
  const [checking, setChecking] = useState<{ done: number; of: number } | null>(null);
  // Without the PC: Steam prices from the price list next to the website (Steam does not answer browsers directly).
  const [steamIdx, setSteamIdx] = useState<SteamIndex | null>(null);
  const country = raw?.country;
  useEffect(() => { if (!online && raw?.enabled && country) void loadSteamIndex(country).then(setSteamIdx); }, [online, raw?.enabled, country]);
  // Games outside the popular list (and pictures for all): the daily catalog of every Steam game, one letter at a time.
  const [catalog, setCatalog] = useState<Record<string, SteamIndex | null>>({});
  const missing = (raw?.items ?? []).filter((w) => (!online && raw?.enabled && country === "de" && !(steamIdx && lookup(steamIdx, w))) || (!w.steamImage && !w.msImage && !w.steamAppId)).map((w) => shard(w.title));
  const missingKey = [...new Set(missing)].sort().join("");
  useEffect(() => {
    for (const k of missingKey) if (!(k in catalog)) void loadCatalogPart(k).then((p) => setCatalog((c) => ({ ...c, [k]: p })));
  }, [missingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = raw && { ...raw, items: raw.items.map((w) => withSteamList(withPhone(w, phone[w.id]), online ? null : steamIdx, catalog, !online)) };
  const msAllowed = !!raw?.enabled && raw.compareMicrosoft !== false;
  const checkFromPhone = async (only?: { id: string; title: string }[]) => {
    if (!raw || checking) return;
    const list = (only ?? raw.items.map((w) => ({ id: w.id, title: w.title }))).slice(0, 60);
    setChecking({ done: 0, of: list.length });
    for (let i = 0; i < list.length; i++) {
      const r = await fetchMsPrice(list[i].title, raw.country);
      savePhonePrice(list[i].id, r);
      setPhone(phonePrices());
      setChecking({ done: i + 1, of: list.length });
      if (i < list.length - 1) await new Promise((res) => setTimeout(res, 350)); // gently, one after the other
    }
    setChecking(null);
  };
  const lastPhone = Math.max(0, ...Object.values(phone).map((v) => v.at));
  const configure = (p: { enabled?: boolean }) => client.call("deals.configure", p).then(() => saved(conn.auth === "ok"), (e: Error) => toast(e.message, "error"));
  const [f, setF] = useState<WishFilter>({});
  const [sortBy, setSortBy] = useState<WishSort>("smart");
  const [maxPrice, setMaxPrice] = useState("");
  const maxCents = maxPrice.trim() ? parsePrice(maxPrice) : null;
  const filtered = filterWishes(d?.items ?? [], { ...f, maxCents: maxCents != null && !Number.isNaN(maxCents) ? maxCents : null });
  const items = sortWishes(filtered.shown, sortBy);
  const cats = allCategories(d?.items ?? []);
  const open = d?.items.find((w) => w.id === openId);
  return (
    <>
      <PageHead eyebrow={t("Erweiterungen")} title={t("Deal Radar")}
        text={t("Deine Wunschliste mit den Preisen bei Xbox und Steam. Antippen zeigt Preisverlauf und Details.")}
        actions={canManage && <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => setEdit({ id: clientId("wish"), title: "" })}>{t("Von Hand eintragen")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            <QuickAdd data={d} disabled={!canManage} onQueued={(id, title) => { if (msAllowed) void checkFromPhone([{ id, title }]); }} />
            {!online && msAllowed && d.items.length > 0 && (
              <div className="deal-phone">
                <span className="small">{checking ? t("Prüfe Xbox-Preise … {n}/{m}", { n: checking.done, m: checking.of }) : t("Ohne PC: Xbox-Preise prüft das Handy selbst beim Microsoft Store{x}. Steam-Preise kommen aus der Steam-Preisliste der Website{s}.", { x: lastPhone ? " (" + t("zuletzt {d}", { d: relTime(lastPhone) }) + ")" : "", s: steamIdx ? " (" + t("Stand {d}", { d: relTime(steamIdx.updatedAt) }) + ")" : "" })}</span>
                <Button size="sm" icon={<RefreshCw size={15} />} busy={!!checking} onClick={() => void checkFromPhone()}>{t("Xbox-Preise prüfen")}</Button>
              </div>
            )}
            {!d.enabled && <Banner kind="info">{t("Die Preisabfrage ist aus – deshalb gibt es noch keine Preise.")} {canManage && <Button size="sm" variant="primary" onClick={() => configure({ enabled: true })}>{t("Einschalten")}</Button>}</Banner>}
            {d.wishlistError && <Banner kind="warn">{d.wishlistError}</Banner>}
            {d.items.length === 0 ? (
              <Card><Empty icon={<Tag size={26} />} title={t("Die Wunschliste ist leer")} text={t("Tippe oben einfach den Namen eines Spiels ein – oder lass deine Steam-Wunschliste übernehmen.")} /></Card>
            ) : (
              <>
                <div className="row between"><b>{t("Wunschliste")}</b><span className="tiny muted">{d.items.length}/300</span></div>
                <div className="row deal-filters" style={{ gap: 8, flexWrap: "wrap" }}>
                  <input className="input" style={{ maxWidth: 200 }} placeholder={t("Suchen …")} aria-label={t("Suchen")} value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value })} />
                  <select className="input" style={{ maxWidth: 150 }} aria-label={t("Art")} value={f.kind ?? ""} onChange={(e) => setF({ ...f, kind: e.target.value as WishFilter["kind"] })}><option value="">{t("Art")}: {t("alle")}</option><option value="game">{t("Spiele")}</option><option value="dlc">{t("DLCs")}</option></select>
                  <select className="input" style={{ maxWidth: 170 }} aria-label={t("Priorität")} value={f.priority ?? ""} onChange={(e) => setF({ ...f, priority: e.target.value === "" ? null : Number(e.target.value) })}><option value="">{t("Priorität")}: {t("alle")}</option>{PRIORITIES.map((p, i) => <option key={i} value={i}>{t(p)}</option>)}</select>
                  {cats.length > 0 && <select className="input" style={{ maxWidth: 180 }} aria-label={t("Kategorie")} value={f.category ?? ""} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">{t("Kategorie")}: {t("alle")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
                  <input className="input" style={{ maxWidth: 130 }} inputMode="decimal" placeholder={t("bis … €")} aria-label={t("Höchstpreis")} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                  <select className="input" style={{ maxWidth: 190 }} aria-label={t("Sortierung")} value={sortBy} onChange={(e) => setSortBy(e.target.value as WishSort)}>
                    <option value="smart">{t("Ziel erreicht & Rabatt")}</option><option value="priority">{t("Priorität")}</option><option value="price">{t("Preis (günstigste zuerst)")}</option><option value="title">{t("Name A–Z")}</option><option value="added">{t("Zuletzt hinzugefügt")}</option>
                  </select>
                  <button type="button" className={`chip ${f.onlyTarget ? "on" : ""}`} onClick={() => setF({ ...f, onlyTarget: !f.onlyTarget })}><BadgePercent size={13} />{t("Ziel erreicht")}</button>
                </div>
                {filtered.withoutPrice > 0 && <span className="tiny muted">{t("{n} Einträge ohne gemessenen Preis sind beim Höchstpreis ausgeblendet.", { n: filtered.withoutPrice })}</span>}
                {items.length === 0 && <span className="small muted">{t("Nichts passt zum Filter.")}</span>}
                <div className="deal-grid">{items.map((w) => <DealTile key={w.id} w={w} onOpen={() => setOpenId(w.id)} />)}</div>
              </>
            )}
            <Settings d={d} canManage={canManage} online={online} />
            <details className="card deal-settings">
              <summary><Search size={17} /><b>{t("Nicht gefunden? Genauer suchen")}</b></summary>
              <div style={{ marginTop: 12 }}><SearchCard data={d} disabled={!canManage} /></div>
            </details>
          </div>
        )}
      </Loadable>
      {open && !edit && d && <DealDetail w={open} data={d} canManage={canManage} onEdit={() => setEdit(open)} onClose={() => setOpenId(null)} />}
      {edit && <WishEditor wish={edit} onClose={() => setEdit(null)} allCats={allCategories(d?.items ?? [])} />}
    </>
  );
}
