import { locale, t } from "./i18n";

export function bytes(n?: number | null): string {
  if (n == null || !isFinite(n)) return t("Nicht verfügbar");
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString(locale(), { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

export function relTime(iso?: string | number | null): string {
  if (!iso) return t("nie");
  const d = typeof iso === "number" ? iso : Date.parse(iso);
  const diff = (Date.now() - d) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (Math.abs(diff) < 45) return t("gerade eben");
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function dateTime(iso?: string | null) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
}

export function clock(iso?: string | number | null) {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function duration(minutes: number) {
  if (minutes < 1) return t("< 1 Min.");
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function since(iso?: string | null) {
  if (!iso) return "";
  return duration((Date.now() - Date.parse(iso)) / 60000);
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/** Deterministic gradient for items without cover art. */
/** The background behind a picture or initials: one calm gradient made from the design's own colour – the same for every
 * game and area, so tiles never look like a patchwork. (The argument stays for callers; it no longer changes the colour.) */
export function gradientFor(_text?: string) {
  return "linear-gradient(135deg, color-mix(in srgb, var(--primary) 58%, #0c0a22), color-mix(in srgb, var(--primary) 24%, #06050f))";
}
