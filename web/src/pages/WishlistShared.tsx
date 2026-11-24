// What the shared link opens (#/w/<code>): the list, read-only, no account and no PC needed. The code comes from outside, so it is
// checked and cleaned first (only http/https links, limited lengths) and everything is shown as plain text.
import { useEffect, useState } from "react";
import { ExternalLink, Gift, Copy } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { copyText } from "./Wishlist";
import { decodeShare, formatPrice, hostOf, totalCents, withoutPrice, type XmasList } from "../lib/xmas-list";

export default function WishlistShared({ code }: { code: string }) {
  const [list, setList] = useState<XmasList | null | undefined>(undefined);
  useEffect(() => { let gone = false; void decodeShare(code).then((l) => { if (!gone) setList(l); }); return () => { gone = true; }; }, [code]);
  useEffect(() => { document.title = `${list?.title || t("Weihnachtswunschliste")} · Nexus Gaming Hub`; }, [list]);
  if (list === undefined) return <div className="center-screen" />;
  if (!list || !list.items.length) return (
    <div className="center-screen"><div className="center-card"><Gift size={28} aria-hidden /><h1>{t("Diese Wunschliste lässt sich nicht öffnen")}</h1><p className="muted">{t("Der Link ist unvollständig oder beschädigt – vielleicht wurde er beim Verschicken abgeschnitten. Bitte lass dir den Link noch einmal schicken.")}</p></div></div>
  );
  const open = withoutPrice(list.items);
  return (
    <main className="wl-public">
      <header>
        <Gift size={28} aria-hidden />
        <h1>{list.title || t("Weihnachtswunschliste")}</h1>
        <p className="wl-total"><b>{t("{n} Wünsche", { n: list.items.length })}</b><span>{t("Summe")}: <b>{formatPrice(totalCents(list.items))}</b></span>{open > 0 && <span className="muted">{t("{n} ohne Preis nicht mitgerechnet", { n: open })}</span>}</p>
      </header>
      <ul className="wl-list" aria-label={t("Wünsche")}>
        {list.items.map((w, i) => (
          <li key={i} className="wl-item">
            <div className="wl-main">
              <a className="wl-title" href={w.url} target="_blank" rel="noopener noreferrer nofollow">{w.title}<ExternalLink size={12} aria-hidden /></a>
              <span className="wl-host">{hostOf(w.url)}</span>
              {w.note && <span className="wl-note">{w.note}</span>}
            </div>
            <b className={`wl-price${w.priceCents == null ? " none" : ""}`}>{w.priceCents == null ? t("Preis offen") : formatPrice(w.priceCents)}</b>
            <div className="wl-actions">
              <button type="button" className="btn icon ghost" aria-label={t("Link zu „{n}“ kopieren", { n: w.title })} title={t("Link kopieren")} onClick={() => void copyText(w.url).then((ok) => toast(ok ? t("Link kopiert") : t("Kopieren hat nicht geklappt – bitte den Link von Hand markieren."), ok ? "success" : "error"))}><Copy size={16} /></button>
            </div>
          </li>
        ))}
      </ul>
      <p className="small muted">{t("Preise sind die Angaben der Person, die die Liste geschickt hat – im Shop kann der Preis abweichen.")}</p>
    </main>
  );
}
