// An error a person can act on: what happened, in plain words, and what to do next. The PC's own messages are already German and specific
// (for example "Der KI-Router lehnt den Schlüssel ab …") – those are kept; only the bare codes and technical leftovers get a sentence and a next step.

import { t } from "./i18n";

const BY_CODE: Record<string, () => string> = {
  forbidden: () => t("Dafür hat dieses Gerät keine Berechtigung. Am PC unter „Geräte“ das Recht „Verwalten“ geben."),
  unauthenticated: () => t("Dieses Gerät ist gerade nicht angemeldet. Die App meldet sich selbst neu an – wenn nicht, die Seite neu laden oder neu koppeln."),
  "session-expired": () => t("Die Sitzung ist abgelaufen. Die App meldet sich gleich selbst neu an – bitte noch einmal versuchen."),
  "auth-failed": () => t("Dieses Gerät ist nicht (mehr) gekoppelt. Bitte neu koppeln."),
  "rate-limited": () => t("Zu viele Anfragen in kurzer Zeit. Bitte ein paar Sekunden warten."),
  "needs-pc": () => t("Dafür muss der PC verbunden sein. Ist er an? Unter „Verbinden“ steht, was fehlt."),
  offline: () => t("Keine Verbindung zum PC. Ist er an und im selben Netz? Die App verbindet sich von selbst wieder."),
  "relay-companion-offline": () => t("Der PC ist gerade nicht mit dem Relay verbunden. Ist er an und hat er Internet?"),
  timeout: () => t("Der PC hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen – hilft das nicht, unter „Verbinden“ → „Diagnose“ nachsehen."),
  "unknown-method": () => t("Der PC kennt diese Funktion noch nicht – vermutlich ist der Begleiter älter als diese Seite. Am PC unter „Updates“ aktualisieren."),
  "invalid-params": () => t("Die Eingabe passt nicht. Bitte prüfen und noch einmal versuchen."),
  cancelled: () => t("Abgebrochen."),
};

/** Technical leftovers that mean nothing to a person. */
const TECHNICAL = /^(?:HTTP \d+|Failed to fetch|NetworkError|Load failed|TypeError|undefined|null|\[object Object\]|The operation was aborted)/i;

/** These codes always get the sentence with the next step (their own text says what, but not what to do). */
const ALWAYS_GENERIC = new Set(["unauthenticated", "session-expired", "unknown-method", "timeout", "offline", "needs-pc", "relay-companion-offline", "rate-limited"]);

export function friendlyError(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const msg = (e as { message?: unknown })?.message;
  const m = typeof msg === "string" ? msg.trim() : "";
  const c = typeof code === "string" ? code : "";
  const bare = !m || m === c || TECHNICAL.test(m);
  if (c && BY_CODE[c] && (ALWAYS_GENERIC.has(c) || bare)) return BY_CODE[c]();
  if (!bare) return m;                                    // the PC's own message is specific – keep it
  if (m && TECHNICAL.test(m)) return t("Es ist etwas schiefgelaufen (technische Meldung: {m}). Bitte noch einmal versuchen; hilft das nicht, unter „Verbinden“ → „Diagnose“ nachsehen.", { m: m.slice(0, 80) });
  return t("Es ist etwas schiefgelaufen. Bitte noch einmal versuchen.");
}
