// "Hören meine Freunde in Discord die Sounds?" – the parts of the way the PC can see, checked step by step from the
// current audio settings (also before saving). The setting inside Discord itself cannot be read by any app: said so.
import type { AudioDevice, AudioSettings } from "./types";

export interface DiscordStep { label: string; state: "ok" | "todo" | "unknown"; detail: string }

/** The soundboard plays into a virtual cable – the way Discord then takes as its microphone. */
export const outputIsCable = (s: AudioSettings, devices: AudioDevice[]) =>
  !!s.outputDeviceId && devices.some((d) => d.id === s.outputDeviceId && d.flow === "render" && d.isVirtualCable);

/** Whether the own voice goes along: switched on, or automatically while the soundboard plays into the cable (same rule as the PC). */
export const micGoesAlong = (s: AudioSettings, devices: AudioDevice[]) => s.micPassthrough || (s.micFollowsSoundboard !== false && outputIsCable(s, devices));

/**
 * "Discord hört dich nicht": the soundboard plays into the cable, but the voice is not in it (switched off, or the passthrough
 * does not run). Then the one button that puts everything back is offered.
 */
export const voiceMissing = (s: AudioSettings, devices: AudioDevice[], passthroughActive: boolean) =>
  outputIsCable(s, devices) && (!micGoesAlong(s, devices) || !passthroughActive);

export function discordSteps(s: AudioSettings, devices: AudioDevice[]): DiscordStep[] {
  const outs = devices.filter((d) => d.flow === "render");
  const caps = devices.filter((d) => d.flow === "capture");
  const cables = outs.filter((d) => d.isVirtualCable);
  const out = outs.find((d) => d.id === s.outputDeviceId);
  const mic = s.micDeviceId ? caps.find((d) => d.id === s.micDeviceId) : caps.find((d) => d.isDefault);
  // The PC never takes the cable itself as microphone: the chosen one if real, else the default if real, else the first real one.
  const realMic = mic && !mic.isVirtualCable ? mic : caps.find((d) => d.isDefault && !d.isVirtualCable) ?? caps.find((d) => !d.isVirtualCable);
  const monitor = s.monitorDeviceId ? outs.find((d) => d.id === s.monitorDeviceId) : outs.find((d) => d.isDefault);
  return [
    { label: "Virtuelles Audiokabel installiert", state: cables.length ? "ok" : "todo", detail: cables.length ? `Gefunden: ${cables.map((c) => c.name).join(", ")}` : "Kein virtuelles Kabel gefunden – z. B. VB-Audio Virtual Cable selbst installieren (kostenlos), danach „Geräte aktualisieren“." },
    { label: "Soundboard spielt auf das Kabel", state: out?.isVirtualCable ? "ok" : "todo", detail: out ? (out.isVirtualCable ? `Ausgabe: ${out.name}` : `Ausgabe ist „${out.name}“ – für Discord „CABLE Input“ wählen.`) : "Ausgabe ist das Windows-Standardgerät – für Discord „CABLE Input“ wählen." },
    { label: "Dein Mikrofon läuft mit ins Kabel", state: micGoesAlong(s, devices) && realMic ? "ok" : "todo", detail: !micGoesAlong(s, devices) ? "Mikrofon-Durchleitung einschalten (oder „automatisch mitsenden“) – sonst hören die anderen nur Sounds, nicht dich." : !realMic ? "Kein echtes Mikrofon gefunden – Headset anschließen." : `Mikrofon: ${realMic.name}${mic?.isVirtualCable ? " (statt des Kabels – das Kabel hört sich sonst nur selbst)" : ""}${!s.micPassthrough ? " · automatisch, weil das Soundboard ins Kabel spielt" : ""}` },
    { label: "Du hörst die Sounds selbst", state: s.monitorEnabled && monitor && !monitor.isVirtualCable ? "ok" : "todo", detail: s.monitorEnabled ? (monitor ? `Mithören auf: ${monitor.name}` : "Mithör-Gerät nicht gefunden.") : "Optional: Monitoring auf deine Kopfhörer stellen." },
    { label: "In Discord: Eingabegerät = „CABLE Output“", state: "unknown", detail: "Discord → Einstellungen → Sprache & Video. Das kann keine App von außen prüfen – mit dem Discord-Mikrofontest oder einem Freund kontrollieren." },
  ];
}
