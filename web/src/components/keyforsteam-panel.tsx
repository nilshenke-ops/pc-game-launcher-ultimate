// Keyforsteam price comparison in the Deal Radar: loaded by the PC only when asked (one page, at most every 5 s,
// kept 6 h there). Key-shop offers come with an honest warning; account offers are hidden unless asked for.

import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Tag } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { relTime } from "../lib/format";
import { money } from "../lib/quest-deal";
import { choices, DEFAULT_KFS_FILTER, filterOffers, payPrice, summary, type KfsFilter, type KfsOffer, type KfsResult } from "../lib/keyforsteam";
import { Banner, Button, Field, Switch } from "./ui";

const eur = (v: number) => money(Math.round(v * 100), "EUR");

export function KeyforsteamPanel({ title }: { title: string }) {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const [res, setRes] = useState<KfsResult | null>(null);
  const [err, setErr] = useState<{ code?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [f, setF] = useState<KfsFilter>(DEFAULT_KFS_FILTER);
  const [all, setAll] = useState(false);
  const load = async (url?: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await client.call<KfsResult>("deals.keyforsteam", url ? { url } : { name: title });
      setRes(r);
      const eds = choices(r.offers, "edition");
      setF({ ...DEFAULT_KFS_FILTER, edition: eds.includes("Standard") ? "Standard" : eds[0] ?? "" });
    } catch (e) { setErr(e as { code?: string; message: string }); }
    setBusy(false);
  };
  const shown = useMemo(() => (res ? filterOffers(res.offers, f) : []), [res, f]);
  const sum = res && f.edition ? summary(res.offers, f.edition) : null;
  const accounts = res?.offers.filter((o) => o.account).length ?? 0;
  return (
    <div className="deal-store-box kfs">
      <span className="deal-store"><Tag size={15} />{t("Preisvergleich (Keyforsteam)")}</span>
      {!res && <span className="tiny muted">{t("Dein PC ruft dafür einmal die Seite dieses Spiels auf keyforsteam.de ab – nur auf Knopfdruck, höchstens alle 5 Sekunden, 6 Stunden gespeichert.")}</span>}
      {err && <Banner kind={err.code === "not-found" ? "info" : "warn"}>{err.message}</Banner>}
      {err?.code === "not-found" && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label={t("Link der Spieleseite auf keyforsteam.de")}><input className="input" inputMode="url" value={link} maxLength={400} placeholder="https://www.keyforsteam.de/…-key-kaufen-preisvergleich/" onChange={(e) => setLink(e.target.value)} /></Field>
          <Button size="sm" disabled={!link.trim() || busy} busy={busy} onClick={() => void load(link.trim())}>{t("Mit Link laden")}</Button>
        </div>
      )}
      {!res && <Button size="sm" icon={<RefreshCw size={14} />} busy={busy} disabled={!online} onClick={() => void load()} style={{ alignSelf: "flex-start" }}>{online ? t("Preise laden") : t("Braucht die Verbindung zum PC")}</Button>}
      {res && (
        <>
          {sum && (sum.official || sum.keyshop) && (
            <div className="kfs-sum">
              <span><span className="tiny muted">{t("Offizielle Shops")}</span><b>{sum.official ? eur(payPrice(sum.official)) : "–"}</b><span className="tiny muted">{sum.official?.shop ?? t("kein Angebot")}</span></span>
              <span><span className="tiny muted">{t("Key-Shops")}</span><b>{sum.keyshop ? eur(payPrice(sum.keyshop)) : "–"}</b><span className="tiny muted">{sum.keyshop?.shop ?? t("kein Angebot")}</span></span>
            </div>
          )}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Field label={t("Edition")}>
              <select className="input" value={f.edition} onChange={(e) => setF({ ...f, edition: e.target.value })}>
                <option value="">{t("Alle Editionen")}</option>
                {choices(res.offers, "edition").map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label={t("Region")}>
              <select className="input" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
                <option value="">{t("Alle Regionen")}</option>
                {choices(res.offers, "region").filter((r) => r !== "KONTO").map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          </div>
          <Switch checked={f.officialOnly} onChange={(v) => setF({ ...f, officialOnly: v })} label={t("Nur offizielle Shops")} />
          {accounts > 0 && <Switch checked={!f.keysOnly} onChange={(v) => setF({ ...f, keysOnly: !v })} label={t("Konto-Angebote zeigen ({n})", { n: accounts })} hint={t("Ein fremdes Spielkonto statt eines Keys – kann gesperrt werden.")} />}
          {shown.length === 0 ? <span className="small muted">{t("Kein Angebot mit diesen Filtern.")}</span> : (
            <ul className="kfs-list">
              {(all ? shown : shown.slice(0, 12)).map((o, i) => <OfferRow key={i} o={o} />)}
            </ul>
          )}
          {shown.length > 12 && <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? t("Weniger zeigen") : t("Alle {n} zeigen", { n: shown.length })}</Button>}
          {!f.officialOnly && <span className="tiny muted">{t("Key-Shops sind Marktplätze: Keys stammen nicht immer aus offiziellen Quellen und können vom Anbieter gesperrt werden. Region und Plattform vor dem Kauf prüfen.")}</span>}
          <span className="tiny muted">{t("Quelle: {s}, abgerufen {d}. Preise inklusive der günstigsten Zahlungsgebühr, falls der Shop eine nennt.", { s: res.source, d: relTime(res.fetchedAt) })}</span>
          <div className="row" style={{ gap: 6 }}>
            <a className="btn sm" href={res.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />{t("Alle Angebote auf Keyforsteam")}</a>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={busy} disabled={!online} onClick={() => void load(res.url.startsWith("https://www.keyforsteam.de/") ? res.url : undefined)}>{t("Neu laden")}</Button>
          </div>
        </>
      )}
    </div>
  );
}

function OfferRow({ o }: { o: KfsOffer }) {
  return (
    <li>
      <span className="grow">
        <b>{o.shop}</b> <span className={`badge ${o.official ? "ok" : ""}`}>{o.official ? t("offiziell") : t("Key-Shop")}</span>{o.account && <span className="badge warn">{t("Konto")}</span>}
        <span className="tiny muted" style={{ display: "block" }}>
          {[o.edition, o.region, o.platform && o.platform[0].toUpperCase() + o.platform.slice(1), o.shopRating != null && `★ ${o.shopRating.toFixed(1)} (${o.shopRatings})`].filter(Boolean).join(" · ")}
        </span>
        {o.regionNote && <details className="kfs-note"><summary className="tiny muted">{o.regionNote}</summary><span className="tiny muted">{o.regionNote}</span></details>}
      </span>
      <span className="kfs-price">
        <b>{money(Math.round(payPrice(o) * 100), "EUR")}</b>
        {o.priceBeforeVoucher != null && <s className="tiny muted">{money(Math.round(o.priceBeforeVoucher * 100), "EUR")}</s>}
        {o.voucher && <span className="tiny">{t("Gutschein: {c}", { c: o.voucher })}</span>}
      </span>
    </li>
  );
}
