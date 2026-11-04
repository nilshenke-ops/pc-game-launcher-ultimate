// "Nachricht schreiben": the text is written (or said) here and handed to WhatsApp, Telegram, Messages or e-mail with one tap.
// The link opens the messenger with the text already in it; the recipient and "send" are chosen THERE – this app sends nothing.
import { Send, Share2 } from "lucide-react";
import { t } from "../lib/i18n";
import { canShare, MESSAGE_MAX, messageLink, MESSENGERS, shareText, type Messenger } from "../lib/messaging";

export function MessageCompose({ text, onText, app, onApp, phone }: { text: string; onText: (v: string) => void; app: Messenger; onApp: (a: Messenger) => void; phone?: string | null }) {
  const ready = text.trim().length > 0;
  const href = ready ? messageLink(app, text, phone) : undefined;
  const label = MESSENGERS.find((m) => m.id === app)?.label ?? "WhatsApp";
  return (
    <section className="isl2-compose" aria-label={t("Nachricht schreiben")}>
      <b className="isl2-composetitle">{t("Nachricht schreiben")}</b>
      <textarea className="input isl2-composetext" rows={2} maxLength={MESSAGE_MAX} value={text} onChange={(e) => onText(e.target.value)}
        placeholder={t("Dein Text …")} aria-label={t("Text der Nachricht")} />
      <div className="isl2-composeapps" role="radiogroup" aria-label={t("Womit senden")}>
        {MESSENGERS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={app === m.id} className={`isl2-chip${app === m.id ? " on" : ""}`} onClick={() => onApp(m.id)}>{t(m.label)}</button>
        ))}
      </div>
      <div className="isl2-composego">
        <a className={`isl2-chip done${ready ? "" : " off"}`} href={href} target="_blank" rel="noopener noreferrer" aria-disabled={!ready} role="button"
          onClick={(e) => { if (!ready) e.preventDefault(); }}><Send size={13} /> {t("In {a} öffnen", { a: t(label) })}</a>
        {canShare() && <button type="button" className="isl2-chip" disabled={!ready} onClick={() => void shareText(text)}><Share2 size={13} /> {t("Teilen …")}</button>}
      </div>
      <p className="tiny muted">{t("Die App öffnet sich mit deinem Text. Empfänger wählst du dort, gesendet wird erst mit deinem Tipp – diese App schickt nichts selbst.")}</p>
    </section>
  );
}
