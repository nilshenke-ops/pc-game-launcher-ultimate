// Activity status: your own status plus the game running on the PC. Only shown to your paired devices – devices with
// view rights only see it when sharing is on. Set on the phone also without the PC (queued, the latest one counts).
import { t } from "./i18n";

export type Status = "available" | "busy" | "away" | "dnd" | "invisible";
export interface ActivityView {
  /** false: the owner did not share the status with view-only devices. */
  shared: boolean;
  status?: Status;
  text?: string | null;
  until?: string | null;
  showGame?: boolean;
  /** Only for devices that may change it. */
  share?: boolean | null;
  playing?: { itemId: string; name: string; since: string } | null;
  updatedAt?: string;
}

export const STATUSES: { id: Status; label: () => string; color: string }[] = [
  { id: "available", label: () => t("Verfügbar"), color: "#22c55e" },
  { id: "busy", label: () => t("Beschäftigt"), color: "#f59e0b" },
  { id: "away", label: () => t("Abwesend"), color: "#94a3b8" },
  { id: "dnd", label: () => t("Nicht stören"), color: "#ef4444" },
  { id: "invisible", label: () => t("Unsichtbar"), color: "#64748b" },
];
export const statusInfo = (s: Status | undefined) => STATUSES.find((x) => x.id === s) ?? STATUSES[0];

/** Durations for a status; null = until changed. */
export const DURATIONS: [number | null, () => string][] = [[null, () => t("Bis ich es ändere")], [30, () => t("30 Minuten")], [60, () => t("1 Stunde")],
  [120, () => t("2 Stunden")], [240, () => t("4 Stunden")]];

/** The status that applies now – a timed status that ran out is "available" again (also on a device without the PC). */
export function effective(a: ActivityView | undefined, now = Date.now()): { status: Status; text: string | null; until: Date | null } {
  if (!a?.shared) return { status: "available", text: null, until: null };
  const until = a.until ? new Date(a.until) : null;
  if (until && until.getTime() <= now) return { status: "available", text: null, until: null };
  return { status: a.status ?? "available", text: a.text ?? null, until };
}
