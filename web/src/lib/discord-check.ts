// "Hören meine Freunde in Discord die Sounds?" – the parts of the way the PC can see, checked step by step from the
// current audio settings (also before saving). The setting inside Discord itself cannot be read by any app: said so.
import type { AudioDevice, AudioSettings } from "./types";

export interface DiscordStep { label: string; state: "ok" | "todo" | "unknown"; detail: string }

export function discordSteps(s: AudioSettings, devices: AudioDevice[]): DiscordStep[] {
  const outs = devices.filter((d) => d.flow === "render");
  const caps = devices.filter((d) => d.flow === "capture");
  const cables = outs.filter((d) => d.isVirtualCable);
  const out = outs.find((d) => d.id === s.outputDeviceId);
  const mic = s.micDeviceId ? caps.find((d) => d.id === s.micDeviceId) : caps.find((d) => d.isDefault);
  const monitor = s.monitorDeviceId ? outs.find((d) => d.id === s.monitorDeviceId) : outs.find((d) => d.isDefault);
  return [
    { label: "Virtuelles Audiokabel installiert", state: cables.length ? "ok" : "todo", detail: cables.length ? `Gefunden: ${cables.map((c) => c.name).join(", ")}` : "Kein virtuelles Kabel gefunden – z. B. VB-Audio Virtual Cable selbst installieren (kostenlos), danach „Geräte aktualisieren“." },
    { label: "Soundboard spielt auf das Kabel", state: out?.isVirtualCable ? "ok" : "todo", detail: out ? (out.isVirtualCable ? `Ausgabe: ${out.name}` : `Ausgabe ist „${out.name}“ – für Discord „CABLE Input“ wählen.`) : "Ausgabe ist das Windows-Standardgerät – für Discord „CABLE Input“ wählen." },
    { label: "Dein Mikrofon läuft mit ins Kabel", state: s.micPassthrough && mic && !mic.isVirtualCable ? "ok" : "todo", detail: !s.micPassthrough ? "Mikrofon-Durchleitung einschalten – sonst hören die anderen nur Sounds, nicht dich." : !mic ? "Gewähltes Mikrofon nicht gefunden." : mic.isVirtualCable ? "Als Mikrofon ist das Kabel selbst gewählt – dein Headset-Mikrofon wählen." : `Mikrofon: ${mic.name}` },
    { label: "Du hörst die Sounds selbst", state: s.monitorEnabled && monitor && !monitor.isVirtualCable ? "ok" : "todo", detail: s.monitorEnabled ? (monitor ? `Mithören auf: ${monitor.name}` : "Mithör-Gerät nicht gefunden.") : "Optional: Monitoring auf deine Kopfhörer stellen." },
    { label: "In Discord: Eingabegerät = „CABLE Output“", state: "unknown", detail: "Discord → Einstellungen → Sprache & Video. Das kann keine App von außen prüfen – mit dem Discord-Mikrofontest oder einem Freund kontrollieren." },
  ];
}
