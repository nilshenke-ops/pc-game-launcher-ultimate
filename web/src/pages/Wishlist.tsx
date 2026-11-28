// Christmas wish list (3.68): add links with a price, see the sum, copy a single link or the whole list as one link to send on.
// Works without the PC (the list lives in the browser and in the account). The price is what was typed in – nothing is read from shops.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Gift, Loader2, Pencil, Plus, ScanSearch, Share2, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { client } from "../lib/rpc";
import { appBase, DEFAULT_APP_URL } from "../lib/island-shelf";
import { isLoopbackAddress } from "../lib/address";
import { Button, Card, confirmDialog, Empty, Field, PageHead } from "../components/ui";
import { applyLookup, encodeShare, formatPrice, type PriceLookup, hostOf, makeWish, MAX_ITEMS, normalizeUrl, parsePrice, shareLink, totalCents, withoutPrice, type Wish } from "../lib/xmas-list";
import { saveXmas, useXmas } from "../lib/xmas-store";

/** Copies text; where the browser refuses (older browsers, no secure connection) the text is selected in the given field instead. */
export async function copyText(text: string, field?: HTMLInputElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const el = field ?? Object.assign(document.createElement("textarea"), { value: text });
    if (!field) { el.style.position = "fixed"; el.style.opacity = "0"; document.body.appendChild(el); }
    el.focus(); el.select(); const ok = document.execCommand("copy");
    if (!field) el.remove();
    return ok;
  } catch { return false; }
}

/** The address the shared list opens on: the website this page was opened from (not a local PC address), else the fixed website. */
function shareBaseUrl() {
  const here = location.hostname;
  return (!isLoopbackAddress(here) && !/^(\d+\.){3}\d+$/.test(here) ? appBase(location.href) : null) ?? DEFAULT_APP_URL;
}

/** Asks the PC to read the price of a shop page; says what went wrong in words instead of failing silently. */
async function lookupPrice(url: string): Promise<{ ok: true; r: PriceLookup } | { ok: false; error: string }> {
  try { return { ok: true, r: await client.call<PriceLookup>("price.lookup", { url }) }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}
const readOn = (ms: number) => new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });

function PriceTotal({ items }: { items: Wish[] }) {
  const total = totalCents(items), open = withoutPrice(items);
  return (
    <p className="wl-total" aria-live="polite">
      <b>{t("{n} Wünsche", { n: items.length })}</b>
      <span>{t("Summe")}: <b>{formatPrice(total)}</b></span>
      {open > 0 && <span className="muted">{t("{n} ohne Preis nicht mitgerechnet", { n: open })}</span>}
    </p>
  );
}

function Row({ w, onChange, onDelete, canRead }: { w: Wish; onChange: (w: Wish) => void; onDelete: () => void; canRead: boolean }) {
  const [edit, setEdit] = useState(false);
  const [reading, setReading] = useState(false);
  const [title, setTitle] = useState(w.title);
  const [price, setPrice] = useState(w.priceCents == null ? "" : String(w.priceCents / 100).replace(".", ","));
  const [note, setNote] = useState(w.note);
  const [copied, setCopied] = useState(false);
  const save = () => {
    if (price.trim() && parsePrice(price) == null) { toast(t("Der Preis ist keine Zahl (zum Beispiel 29,99)."), "error"); return; }
    const cents = price.trim() ? parsePrice(price) : null;
    onChange({ ...w, title: title.trim() || w.title, priceCents: cents, note: note.trim(), priceAt: cents === w.priceCents ? w.priceAt : null });   // a typed-in price is no longer "read"
    setEdit(false);
  };
  const reread = async () => {
    setReading(true);
    const a = await lookupPrice(w.url);
    setReading(false);
    if (!a.ok) { toast(a.error, "error"); return; }
    const u = applyLookup(a.r);
    if (u.cents == null) { toast(u.message === "other-currency" ? t("Der Shop nennt {a} {c} – bitte selbst in Euro eintragen.", { a: u.amount ?? "", c: u.currency ?? "" }) : t("Auf der Seite wurde kein Preis gefunden – bitte selbst eintragen."), "error"); return; }
    onChange({ ...w, priceCents: u.cents, priceAt: Date.now() });
    toast(u.cents === w.priceCents ? t("Der Preis ist unverändert: {p}", { p: formatPrice(u.cents) }) : t("Neuer Preis gelesen: {p}", { p: formatPrice(u.cents) }), "success");
  };
  const copy = async () => { if (await copyText(w.url)) { setCopied(true); toast(t("Link kopiert"), "success"); window.setTimeout(() => setCopied(false), 1800); } else toast(t("Kopieren hat nicht geklappt – bitte den Link von Hand markieren."), "error"); };
  if (edit) {
    return (
      <li className="wl-item editing">
        <div className="wl-edit">
          <Field label={t("Titel")}><input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={t("Preis in Euro")}><input className="input" inputMode="decimal" value={price} placeholder="29,99" onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></Field>
          <Field label={t("Notiz")}><input className="input" value={note} maxLength={200} placeholder={t("Größe, Farbe …")} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></Field>
        </div>
        <div className="wl-actions">
          <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={save}>{t("Speichern")}</Button>
          <Button size="sm" icon={<X size={14} />} onClick={() => setEdit(false)}>{t("Abbrechen")}</Button>
        </div>
      </li>
    );
  }
  return (
    <li className="wl-item">
      <div className="wl-main">
        <a className="wl-title" href={w.url} target="_blank" rel="noopener noreferrer">{w.title}<ExternalLink size={12} aria-hidden /></a>
        <span className="wl-host">{hostOf(w.url)}</span>
        {w.note && <span className="wl-note">{w.note}</span>}
      </div>
      <b className={`wl-price${w.priceCents == null ? " none" : ""}`}>{w.priceCents == null ? t("Preis offen") : formatPrice(w.priceCents)}{w.priceAt != null && <small className="wl-read">{t("gelesen am {d}", { d: readOn(w.priceAt) })}</small>}</b>
      <div className="wl-actions">
        <button type="button" className="btn icon ghost" onClick={() => void reread()} disabled={!canRead || reading} aria-label={t("Preis von „{n}“ im Shop lesen", { n: w.title })} title={canRead ? t("Preis im Shop lesen") : t("Dafür muss der PC verbunden sein.")}>{reading ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />}</button>
        <button type="button" className="btn icon ghost" onClick={copy} aria-label={t("Link zu „{n}“ kopieren", { n: w.title })} title={t("Link kopieren")}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        <button type="button" className="btn icon ghost" onClick={() => setEdit(true)} aria-label={t("„{n}“ bearbeiten", { n: w.title })} title={t("Bearbeiten")}><Pencil size={16} /></button>
        <button type="button" className="btn icon ghost" onClick={onDelete} aria-label={t("„{n}“ entfernen", { n: w.title })} title={t("Entfernen")}><Trash2 size={16} /></button>
      </div>
    </li>
  );
}

export default function Wishlist() {
  const list = useXmas();
  const conn = useConn();
  const canRead = conn.phase === "online" && conn.auth === "ok";
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<{ kind: "ok" | "check" | "none"; text: string } | null>(null);
  const [fromShop, setFromShop] = useState(false);
  const [url, setUrl] = useState(""), [title, setTitle] = useState(""), [price, setPrice] = useState("");
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const linkRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const readFromShop = async () => {
    const u = normalizeUrl(url); if (!u) return;
    setReading(true); setReadMsg(null);
    const a = await lookupPrice(u);
    setReading(false);
    if (!a.ok) { setReadMsg({ kind: "none", text: a.error }); return; }
    const r = applyLookup(a.r);
    if (r.title && !title.trim()) setTitle(r.title);
    if (r.cents != null) { setPrice(String(r.cents / 100).replace(".", ",")); setFromShop(true); }
    setReadMsg({ kind: r.kind, text: r.message === "found" ? t("Preis von {h} gelesen: {p}. Bitte im Shop prüfen – dort kann er abweichen.", { h: r.host, p: formatPrice(r.cents) })
      : r.message === "multiple" ? t("Die Seite von {h} nennt mehrere Preise (zum Beispiel Varianten). Eingetragen ist der niedrigste: {p}. Bitte im Shop prüfen.", { h: r.host, p: formatPrice(r.cents) })
      : r.message === "other-currency" ? t("Der Shop nennt {a} {c} – bitte selbst in Euro eintragen.", { a: r.amount ?? "", c: r.currency ?? "" })
      : t("Auf der Seite von {h} wurde kein Preis gefunden. Viele Shops bauen die Seite erst im Browser auf oder erlauben keine automatischen Abrufe – dann bitte selbst eintragen.", { h: r.host }) });
  };
  const add = () => {
    setErr("");
    if (list.items.length >= MAX_ITEMS) { setErr(t("Die Liste ist voll ({n} Wünsche).", { n: MAX_ITEMS })); return; }
    const w = makeWish(url, title, price);
    if ("error" in w) { setErr(w.error === "url" ? t("Das ist kein gültiger Link (nur http und https, zum Beispiel https://shop.de/artikel).") : t("Der Preis ist keine Zahl (zum Beispiel 29,99).")); return; }
    saveXmas({ ...list, items: [...list.items, fromShop && w.priceCents != null ? { ...w, priceAt: Date.now() } : w] });
    setUrl(""); setTitle(""); setPrice(""); setReadMsg(null); setFromShop(false); urlRef.current?.focus();
  };
  const change = (w: Wish) => saveXmas({ ...list, items: list.items.map((x) => (x.id === w.id ? w : x)) });
  const remove = async (w: Wish) => { if (await confirmDialog(t("Wunsch entfernen?"), t("„{n}“ wird aus der Liste gelöscht.", { n: w.title }), { danger: true, ok: t("Entfernen") })) saveXmas({ ...list, items: list.items.filter((x) => x.id !== w.id) }); };

  // The link always matches the list as it is now (a changed list gives a new link).
  const key = useMemo(() => JSON.stringify([list.title, list.items.map((w) => [w.title, w.url, w.priceCents, w.note])]), [list]);
  useEffect(() => {
    let gone = false;
    if (!list.items.length) { setLink(""); return; }
    void encodeShare(list).then((c) => { if (!gone) setLink(shareLink(shareBaseUrl(), c)); });
    return () => { gone = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyList = async () => { if (await copyText(link, linkRef.current)) toast(t("Link zur Liste kopiert – jetzt einfach einfügen und abschicken."), "success"); else toast(t("Kopieren hat nicht geklappt – der Link ist markiert, bitte mit Strg+C kopieren."), "error"); };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const nativeShare = () => navigator.share({ title: list.title || t("Meine Weihnachtswunschliste"), url: link }).catch(() => undefined);
  const tooLong = link.length > 1900;

  return (
    <>
      <PageHead eyebrow={t("Weihnachten")} title={t("Weihnachtswunschliste")} text={t("Links zu deinen Wünschen sammeln, Preise im Blick behalten und die ganze Liste als einen Link verschicken.")} />
      <div className="wl-layout">
        <Card title={t("Wunsch hinzufügen")} icon={<Gift size={16} />}>
          <form className="wl-form" noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Field label={t("Link zum Wunsch")} error={err || undefined}><input ref={urlRef} className="input" type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} value={url} placeholder="https://…" onChange={(e) => { setUrl(e.target.value); setErr(""); setReadMsg(null); setFromShop(false); }} aria-invalid={!!err} /></Field>
            <div className="wl-two">
              <Field label={t("Titel (optional)")} hint={t("Ohne Titel wird er aus dem Link gemacht.")}><input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label={t("Preis in Euro (optional)")}><input className="input" inputMode="decimal" value={price} placeholder="29,99" onChange={(e) => { setPrice(e.target.value); setErr(""); setFromShop(false); }} /></Field>
            </div>
            <div className="wl-read-row">
              <Button type="button" icon={reading ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />} disabled={!normalizeUrl(url) || !canRead || reading} onClick={() => void readFromShop()}
                title={canRead ? undefined : t("Dafür muss der PC verbunden sein.")}>{t("Preis vom Shop lesen")}</Button>
              {!canRead && <span className="small muted">{t("Dafür muss der PC verbunden sein – sonst den Preis selbst eintragen.")}</span>}
            </div>
            {readMsg && <p className={`small wl-readmsg ${readMsg.kind}`} role="status" aria-live="polite">{readMsg.text}</p>}
            <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!normalizeUrl(url)}>{t("Hinzufügen")}</Button>
          </form>
          <p className="small muted">{t("Der Preis kann vom PC aus der Produktseite des Shops gelesen werden (nur wenn die Seite ihn dafür angibt) oder von dir eingetragen werden. Im Shop kann er sich jederzeit ändern.")}</p>
        </Card>

        <Card title={t("Meine Wünsche")} icon={<Gift size={16} />}>
          {list.items.length === 0
            ? <Empty icon={<Gift size={22} />} title={t("Noch nichts auf der Liste")} text={t("Füge oben den ersten Link ein.")} />
            : (
              <>
                <PriceTotal items={list.items} />
                <ul className="wl-list" aria-label={t("Meine Wünsche")}>
                  {list.items.map((w) => <Row key={w.id} w={w} onChange={change} onDelete={() => void remove(w)} canRead={canRead} />)}
                </ul>
              </>
            )}
        </Card>

        <Card title={t("Liste weiterschicken")} icon={<Share2 size={16} />}>
          <Field label={t("Name der Liste (optional)")}><input className="input" value={list.title} maxLength={60} placeholder={t("Weihnachten 2026")} onChange={(e) => saveXmas({ ...list, title: e.target.value })} /></Field>
          {link ? (
            <>
              <Field label={t("Link zur Liste")}><input ref={linkRef} className="input wl-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></Field>
              <div className="wl-share">
                <Button variant="primary" icon={<Copy size={16} />} onClick={() => void copyList()}>{t("Link kopieren")}</Button>
                {canShare && <Button icon={<Share2 size={16} />} onClick={() => void nativeShare()}>{t("Teilen …")}</Button>}
              </div>
              {tooLong && <p className="small wl-warn">{t("Der Link ist lang geworden. Manche Chat-Apps kürzen so lange Links – dann lieber zwei Listen machen.")}</p>}
            </>
          ) : <p className="small muted">{t("Sobald ein Wunsch auf der Liste steht, gibt es hier den Link zum Verschicken.")}</p>}
          <p className="small muted">{t("Die Wünsche stecken im Link selbst, es wird nichts hochgeladen und es gibt keine öffentliche Seite. Wer den Link hat, sieht die Liste so, wie sie jetzt ist – nach Änderungen schickst du den neuen Link.")}</p>
        </Card>
      </div>
    </>
  );
}
