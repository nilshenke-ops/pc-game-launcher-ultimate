import { useState } from "react";
import { BadgePercent, ExternalLink, Pencil, Plus, RefreshCw, Search, ShieldCheck, Tag } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useAction, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import { clientId, lowestSeen, money, parsePrice, priceInput } from "../lib/quest-deal";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Sparkline, Switch } from "../components/ui";

interface Wish {
  id: string; title: string; steamAppId?: string | null; targetCents?: number | null; notes?: string | null; addedAt?: string;
  currency?: string | null; finalCents?: number | null; initialCents?: number | null; discountPercent?: number | null;
  checkedAt?: string | null; error?: string | null; history?: { at: string; final: number; initial: number }[];
}
interface DealData { enabled: boolean; country: string; lastRunAt?: string | null; source: string; intervalHours: number; items: Wish[] }
interface Hit { appId: string; name: string; finalCents?: number | null; initialCents?: number | null; currency?: string | null }

const COUNTRIES = ["de", "at", "ch", "fr", "nl", "be", "it", "es", "pl", "gb", "us"];
const saved = (online: boolean) => toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");

function WishEditor({ wish, onClose }: { wish: Wish; onClose: () => void }) {
  const conn = useConn();
  const [title, setTitle] = useState(wish.title);
  const [appId, setAppId] = useState(wish.steamAppId ?? "");
  const [target, setTarget] = useState(priceInput(wish.targetCents));
  const [notes, setNotes] = useState(wish.notes ?? "");
  const [busy, setBusy] = useState(false);
  const cents = parsePrice(target);
  const badId = appId.trim() !== "" && !/^\d{1,10}$/.test(appId.trim());
  const save = async () => {
    setBusy(true);
    try {
      await client.call("deals.save", { id: wish.id, title: title.trim(), steamAppId: appId.trim() || null, targetCents: cents, notes: notes.trim() || null });
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
      <Button variant="primary" busy={busy} disabled={!title.trim() || Number.isNaN(cents) || badId} onClick={save}>{t("Speichern")}</Button>
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
      <Field label={t("Notiz")}><input className="input" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
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
    <Card title={t("Spiel hinzufügen")} icon={<Search size={18} />}>
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
    </Card>
  );
}

/** Deal Radar: wish list with target prices. Prices only from the Steam store, only when switched on, with time and source. */
export default function Deals() {
  const q = useRpc<DealData>("deals.list", {}, ["deals"]);
  const canManage = useCan("manage");
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [edit, setEdit] = useState<Wish | null>(null);
  const [refresh, refreshing] = useAction(() => client.call("deals.refresh"), { success: t("Preise geprüft") });
  const d = q.data;
  const configure = (p: { enabled?: boolean; country?: string }) => client.call("deals.configure", p).then(() => saved(conn.auth === "ok"), (e: Error) => toast(e.message, "error"));
  return (
    <>
      <PageHead eyebrow={t("Erweiterungen")} title={t("Deal Radar")}
        text={t("Wunschliste mit Zielpreis. Der PC prüft die Preise im Steam-Shop und meldet sich, wenn ein Spiel dein Ziel erreicht.")}
        actions={canManage && <Button icon={<Plus size={16} />} onClick={() => setEdit({ id: clientId("wish"), title: "" })}>{t("Von Hand eintragen")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            <Card title={t("Preisabfrage")} icon={<ShieldCheck size={18} />}>
              <div className="stack-sm">
                <Switch checked={d.enabled} disabled={!canManage} onChange={(enabled) => configure({ enabled })} label={t("Preise im Steam-Shop abfragen")}
                  hint={t("Aus = keine einzige Anfrage. An = der PC fragt höchstens alle {h} Stunden (nie während eines Spiels) bei store.steampowered.com nach – Steam sieht dabei die IP-Adresse des PCs und die App-IDs.", { h: d.intervalHours })} />
                <div className="row between">
                  <Field label={t("Shop-Land (Preis und Währung)")}>
                    <select className="input" value={d.country} disabled={!canManage} onChange={(e) => configure({ country: e.target.value })}>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </Field>
                  <div className="stack-xs" style={{ alignItems: "flex-end" }}>
                    <span className="tiny muted">{d.lastRunAt ? t("Zuletzt geprüft {d}", { d: relTime(d.lastRunAt) }) : t("Noch nie geprüft")}</span>
                    <Button size="sm" icon={<RefreshCw size={15} />} busy={refreshing} disabled={!canManage || !d.enabled || !online || d.items.every((i) => !i.steamAppId)} onClick={() => refresh()}>{t("Jetzt prüfen")}</Button>
                  </div>
                </div>
                <p className="tiny muted">{t("Quelle: {s}. Das ist der öffentliche Endpunkt des Steam-Webshops, keine offizielle Preis-API – er kann sich ändern. Verlauf = nur Preise, die dieser PC selbst gesehen hat.", { s: d.source })}</p>
              </div>
            </Card>

            <SearchCard data={d} disabled={!canManage} />

            <Card title={t("Wunschliste")} icon={<Tag size={18} />} meta={<span className="tiny">{d.items.length}/100</span>}>
              {d.items.length === 0 ? (
                <Empty icon={<Tag size={26} />} title={t("Die Wunschliste ist leer")} text={t("Suche ein Spiel im Steam-Shop oder trage es von Hand ein.")} />
              ) : (
                <div className="stack-sm">
                  {d.items.map((w) => {
                    const hit = w.targetCents != null && w.finalCents != null && w.finalCents <= w.targetCents;
                    const low = lowestSeen(w.history ?? []);
                    return (
                      <div key={w.id} className={`deal ${hit ? "hit" : ""}`}>
                        <div className="row between">
                          <span className="row">
                            <b>{w.title}</b>
                            {hit && <span className="badge ok"><BadgePercent size={13} />{t("Zielpreis erreicht")}</span>}
                            {!!w.discountPercent && <span className="badge accent">−{w.discountPercent} %</span>}
                          </span>
                          <span className="row">
                            {w.steamAppId && <a className="btn sm ghost icon" href={`https://store.steampowered.com/app/${w.steamAppId}`} target="_blank" rel="noreferrer noopener" aria-label={t("Im Steam-Shop öffnen")}><ExternalLink size={15} /></a>}
                            {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label={t("{n} bearbeiten", { n: w.title })} onClick={() => setEdit(w)} />}
                          </span>
                        </div>
                        <div className="deal-prices">
                          <span className="deal-now">{w.finalCents != null ? money(w.finalCents, w.currency) : "–"}</span>
                          {!!w.discountPercent && w.initialCents != null && <s className="muted">{money(w.initialCents, w.currency)}</s>}
                          <span className="tiny muted">{w.targetCents != null ? t("Ziel {p}", { p: money(w.targetCents, w.currency) }) : t("kein Zielpreis")}</span>
                          {low != null && (w.history?.length ?? 0) > 1 && <span className="tiny muted">{t("niedrigster selbst gesehener Preis {p}", { p: money(low, w.currency) })}</span>}
                        </div>
                        {(w.history?.length ?? 0) > 1 && <div className="deal-spark" title={t("Preisverlauf (eigene Messungen)")}><Sparkline values={w.history!.map((p) => p.final)} max={Math.max(...w.history!.map((p) => p.initial), 1)} /></div>}
                        <div className="tiny muted">
                          {!w.steamAppId ? t("Ohne Steam-App-ID – keine Preisabfrage.")
                            : w.checkedAt ? t("Geprüft {d} · {s}", { d: dateTime(w.checkedAt), s: "Steam" })
                            : d.enabled ? t("Noch nicht geprüft – kommt mit der nächsten Prüfung.") : t("Preisabfrage ist aus.")}
                        </div>
                        {w.error && <Banner kind="warn">{w.error}</Banner>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </Loadable>
      {edit && <WishEditor wish={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
