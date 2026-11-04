// "Nachricht schreiben" from the phone or tablet: the text is prepared here and handed to the messenger (WhatsApp, Telegram,
// Messages/SMS, e-mail or the system share sheet). The messenger opens with the text already in it – the recipient is chosen and
// "send" is tapped THERE. Nothing is sent by this app, no contact list is read, nothing leaves the device before that tap.

export type Messenger = "whatsapp" | "telegram" | "sms" | "mail";

export const MESSENGERS: { id: Messenger; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "sms", label: "Nachrichten (SMS)" },
  { id: "mail", label: "E-Mail" },
];

export const MESSAGE_MAX = 1000;

/** Only digits count as a number (with an optional leading +); 7 to 15 digits (E.164). */
export function cleanPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** The link that opens the messenger with the text filled in. `phone` (digits) only goes into a link when it was named explicitly. */
export function messageLink(app: Messenger, text: string, phone?: string | null): string {
  const body = encodeURIComponent(text.trim().slice(0, MESSAGE_MAX));
  const p = cleanPhone(phone);
  switch (app) {
    case "whatsapp": return p ? `https://wa.me/${p}?text=${body}` : `https://wa.me/?text=${body}`;
    case "telegram": return `https://t.me/share/url?url=%20&text=${body}`;
    case "sms": return `sms:${p ? "+" + p : ""}?&body=${body}`;
    case "mail": return `mailto:?body=${body}`;
  }
}

export interface MessageCommand { app: Messenger | null; body: string; phone: string | null }

const APP_WORDS: [RegExp, Messenger][] = [
  [/whats\s?app|watsapp|wazzap/i, "whatsapp"],
  [/telegram/i, "telegram"],
  [/\bsms\b|imessage|textnachricht/i, "sms"],
  [/e-?mail|mail\b/i, "mail"],
];

/**
 * "Schreib bei WhatsApp: Bin gleich da", "Schick eine Nachricht: Komme später", "Sende per Telegram: Hallo", "Schreib +49 170 1234567 bei WhatsApp: Hi".
 * Without a verb for writing/sending there is no command (so "Wie schreibe ich eine Mail?" or "Starte WhatsApp" stay normal questions/commands).
 * A recipient NAME is not resolved (no contact list) – only a number that is written out.
 */
export function parseMessageCommand(input: string): MessageCommand | null {
  const text = input.trim();
  const verb = /^(?:jarvis,?\s*)?(?:bitte\s+)?(schreib(?:e)?|schick(?:e)?|send(?:e)?|sag|tipp(?:e)?|verfass(?:e)?)\b/i.exec(text);
  if (!verb) return null;
  const rest = text.slice(verb[0].length);
  const colon = rest.indexOf(":");
  const head = colon >= 0 ? rest.slice(0, colon) : rest;
  const tail = colon >= 0 ? rest.slice(colon + 1).trim() : "";
  const app = APP_WORDS.find(([re]) => re.test(head))?.[1] ?? null;
  const mentionsMessage = /nachricht|message|sms|mail|whats\s?app|telegram|imessage/i.test(head);
  if (!app && !mentionsMessage) return null;
  const phoneMatch = /(\+?\d[\d\s/().-]{5,18}\d)/.exec(head);
  const phone = cleanPhone(phoneMatch?.[1]);
  // "… dass ich später komme" / "… mit dem Text: …" without a colon: the body follows "dass" / "mit dem text".
  let body = tail;
  if (!body) {
    const m = /\b(?:dass|mit dem text|mit dem inhalt|und sag(?:e)?(?: ihm| ihr| ihnen)?)\s+(.+)$/i.exec(head);
    if (m) body = m[1].trim();
  }
  // Without a text only an explicitly named messenger (not e-mail) makes it a command: "Schreib eine E-Mail an meinen Chef" stays a normal request.
  if (!body && (!app || app === "mail")) return null;
  return { app, body: body.replace(/^["„“']|["“”']$/g, "").slice(0, MESSAGE_MAX), phone };
}

/** The system share sheet (iPhone, iPad, Android): any app the person has can take the text. */
export const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
export async function shareText(text: string): Promise<boolean> {
  if (!canShare()) return false;
  try { await navigator.share({ text: text.slice(0, MESSAGE_MAX) }); return true; } catch { return false; /* cancelled */ }
}
