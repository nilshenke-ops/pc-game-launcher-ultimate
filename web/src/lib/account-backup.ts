// The readable export of the account data. It uses the same whitelist as the encrypted account blob: AI keys are
// deliberately NOT part of it – they stay sealed on the device (pgl.localai) and are only handed to the PC when it connects.
import type { Prefs } from "./prefs-core";

/** Data of this device that travels with the account (and into a backup). */
export const ACCOUNT_KEYS = ["pgl.gamerpass", "pgl.widget.counters", "pgl.widget.break", "pgl.deals.ms", "pgl.room", "pgl.memory", "pgl.homePlace", "pgl.aiChoice"] as const;

/** Sealed key stores of the device. They must never appear in an account blob or a backup. */
export const DEVICE_KEY_STORES = ["pgl.localai", "pgl.localai.session", "pgl.localsearch.session", "pgl.localeleven.session"] as const;

export interface AccountBackup {
  format: "nexus-account-backup";
  version: 1;
  user: string;
  exportedAt: string;
  /** Last successful save of the account, if known. */
  savedAt?: number;
  prefs: Prefs;
  local: Record<string, unknown>;
}

/**
 * Builds a backup from the given data. Only the whitelisted account keys are kept, so even a caller that passes
 * everything from the browser storage cannot leak an AI key into the file.
 */
export function buildAccountBackup(
  user: string,
  prefs: Prefs,
  local: Record<string, unknown>,
  o: { exportedAt?: string; savedAt?: number } = {},
): AccountBackup {
  const kept: Record<string, unknown> = {};
  for (const key of ACCOUNT_KEYS) if (key in local) kept[key] = local[key];
  return {
    format: "nexus-account-backup",
    version: 1,
    user,
    exportedAt: o.exportedAt ?? new Date().toISOString(),
    ...(typeof o.savedAt === "number" ? { savedAt: o.savedAt } : {}),
    prefs,
    local: kept,
  };
}
