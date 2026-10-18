// Programs that can record games. Same list as CaptureProviders in the companion (Services/CaptureService.cs); kept here
// so the choice can be made on the phone before the PC was ever connected. The PC checks every change again.
import { t } from "./i18n";
import type { ObsStatus } from "./types";

export type CaptureAction = "record" | "replay" | "buffer" | "overlay";
export interface CaptureProviderInfo { id: string; name: string; actions: CaptureAction[]; note: string; defaults: Partial<Record<CaptureAction, string>>; effective?: Partial<Record<CaptureAction, string | null>> }
export interface CaptureStatus {
  provider: string; overlayProvider: string; keys: Record<string, string>; canSendKeys?: boolean;
  providers: CaptureProviderInfo[]; obs?: ObsStatus | null;
}

export const CAPTURE_PROVIDERS: CaptureProviderInfo[] = [
  { id: "obs", name: "OBS Studio", actions: ["record", "replay", "buffer"], defaults: {}, note: "Steuerung über die OBS-WebSocket-Schnittstelle, mit Rückmeldung (Aufnahme läuft, Replay gespeichert)." },
  { id: "nvidia", name: "NVIDIA App / GeForce Experience", actions: ["record", "replay", "buffer", "overlay"], defaults: { record: "Alt+F9", replay: "Alt+F10", buffer: "Alt+Shift+F10", overlay: "Alt+Z" },
    note: "Der Launcher drückt die Tastenkürzel der NVIDIA-App. Ob die Aufnahme läuft, zeigt NVIDIA selbst an." },
  { id: "xbox", name: "Xbox Game Bar", actions: ["record", "replay", "overlay"], defaults: { record: "Alt+Win+R", replay: "Alt+Win+G", overlay: "Win+G" },
    note: "Der Launcher drückt die Tastenkürzel der Game Bar. „Replay speichern“ braucht „Im Hintergrund aufzeichnen“ in den Windows-Einstellungen (Spielen → Aufzeichnungen)." },
  { id: "steam", name: "Steam (Spielaufnahme)", actions: ["record", "replay", "overlay"], defaults: { overlay: "Shift+Tab" },
    note: "Funktioniert in Spielen, die über Steam laufen. Die Tasten für Aufnahme und Clip wie in Steam → Einstellungen → Spielaufnahme eintragen." },
  { id: "discord", name: "Discord", actions: ["replay", "overlay"], defaults: {},
    note: "Discord kann keine durchgehende Aufnahme, nur Clips (die letzten Sekunden). Die Tasten wie in Discord → Einstellungen → Clips bzw. Overlay eintragen." },
];

export const actionLabel = (a: CaptureAction) =>
  ({ record: t("Aufnahme starten/stoppen"), replay: t("Replay speichern"), buffer: t("Replay-Puffer an/aus"), overlay: t("Overlay öffnen") })[a];

/** Key that will be pressed: own entry, else factory default; "" = none. */
export function effectiveKey(keys: Record<string, string>, provider: string, action: CaptureAction): string | null {
  const own = keys[`${provider}.${action}`];
  if (own !== undefined) return own || null;
  return CAPTURE_PROVIDERS.find((p) => p.id === provider)?.defaults[action] ?? null;
}

export function offlineCaptureStatus(provider = "obs", overlayProvider = "own", keys: Record<string, string> = {}): CaptureStatus {
  return {
    provider, overlayProvider, keys,
    providers: CAPTURE_PROVIDERS.map((p) => ({ ...p, effective: Object.fromEntries(p.actions.map((a) => [a, effectiveKey(keys, p.id, a)])) })),
  };
}
