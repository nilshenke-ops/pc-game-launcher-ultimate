// The folder of JARVIS MEMORY and the rules for it – small settings that belong to the account, so they can already be
// chosen on a phone without the PC and simply travel along. The notes themselves never leave the PC.
import { readJson, writeJson } from "./rpc";

export const MEMORY_SETTINGS_KEY = "pgl.memory";
export type MemoryAuto = "off" | "suggest" | "auto";
export type MemorySettingField = "path" | "enabled" | "writeEnabled" | "deleteEnabled" | "auto";
export interface MemorySettings {
  path: string; enabled: boolean; writeEnabled: boolean; deleteEnabled: boolean; auto: MemoryAuto;
  /** When the PC last took the settings over – travels with the account, so every device sees it. */
  appliedAt?: number;
  /** What that took over (folder and/or rules). */
  appliedFields?: MemorySettingField[];
}
const FIELDS: MemorySettingField[] = ["path", "enabled", "writeEnabled", "deleteEnabled", "auto"];

export const EMPTY_MEMORY_SETTINGS: MemorySettings = { path: "", enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest" };

export function memorySettings(): MemorySettings {
  const raw = readJson<Partial<MemorySettings>>(MEMORY_SETTINGS_KEY);
  if (!raw || typeof raw !== "object") return { ...EMPTY_MEMORY_SETTINGS };
  return {
    path: typeof raw.path === "string" ? raw.path.slice(0, 400) : "",
    enabled: raw.enabled !== false,
    writeEnabled: raw.writeEnabled !== false,
    deleteEnabled: raw.deleteEnabled === true,
    auto: raw.auto === "off" || raw.auto === "auto" ? raw.auto : "suggest",
    ...(typeof raw.appliedAt === "number" && raw.appliedAt > 0 ? { appliedAt: raw.appliedAt } : {}),
    ...(Array.isArray(raw.appliedFields) ? { appliedFields: FIELDS.filter((f) => raw.appliedFields!.includes(f)) } : {}),
  };
}

export function setMemorySettings(patch: Partial<MemorySettings>): MemorySettings {
  const next = { ...memorySettings(), ...patch };
  writeJson(MEMORY_SETTINGS_KEY, next);
  return next;
}
