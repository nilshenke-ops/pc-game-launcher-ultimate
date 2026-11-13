// "Discord hört mich nicht" (3.59): when the soundboard plays into the virtual cable, the own voice has to go into it too.
// This shows it plainly and offers two ways out: take the voice along again, or put everything back to normal in one tap
// (soundboard on the normal speakers, Windows' microphone/speakers back to real devices). The one thing no app can change is
// Discord's own input device – said every time.
import { useState } from "react";
import { LifeBuoy, Mic } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast } from "../lib/hooks";
import type { AudioSettings } from "../lib/types";

interface ResetResult { micRestored?: string | null; outRestored?: string | null; problems?: string[] }

export async function resetAudioRouting(): Promise<boolean> {
  try {
    const r = await client.call<ResetResult>("audio.resetRouting", {});
    const done = [t("Soundboard spielt wieder auf deinem normalen Gerät")];
    if (r.micRestored) done.push(t("Windows nimmt wieder über „{n}“ auf", { n: r.micRestored }));
    if (r.outRestored) done.push(t("Windows spielt wieder über „{n}“ ab", { n: r.outRestored }));
    toast(done.join(" · ") + ". " + t("In Discord unter Sprache & Video das Eingabegerät auf dein Mikrofon (oder „Standard“) stellen."), "success");
    for (const p of r.problems ?? []) toast(p, "error");
    return true;
  } catch (e) { toast((e as Error).message, "error"); return false; }
}

export async function takeVoiceAlong(settings: AudioSettings): Promise<boolean> {
  try {
    await client.call("audio.save", { ...settings, micFollowsSoundboard: true, micPassthrough: true });
    toast(t("Deine Stimme läuft wieder mit ins Kabel – Discord hört dich und die Sounds."), "success");
    return true;
  } catch (e) { toast((e as Error).message, "error"); return false; }
}

/** The two repair buttons; "compact" for the island. */
export function MicRescueActions({ settings, canManage, onDone, compact }: { settings: AudioSettings; canManage: boolean; onDone?: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState<"along" | "reset" | null>(null);
  const run = async (kind: "along" | "reset") => {
    setBusy(kind);
    const ok = kind === "along" ? await takeVoiceAlong(settings) : await resetAudioRouting();
    setBusy(null);
    if (ok) onDone?.();
  };
  const cls = compact ? "isl3-chipbtn" : "btn sm";
  return (
    <span className={compact ? "isl3-rescue" : "row wrap"}>
      <button type="button" className={`${cls}${compact ? "" : " primary"}`} disabled={!canManage || !!busy} onClick={() => void run("along")}>
        <Mic size={14} aria-hidden /> {busy === "along" ? t("Schaltet …") : t("Meine Stimme mitsenden")}
      </button>
      <button type="button" className={cls} disabled={!canManage || !!busy} onClick={() => void run("reset")}
        title={t("Soundboard zurück auf deine Lautsprecher, Mikrofon-Weg aus, Windows-Mikrofon wieder dein echtes Mikrofon")}>
        <LifeBuoy size={14} aria-hidden /> {busy === "reset" ? t("Stellt zurück …") : t("Alles zurück auf normal")}
      </button>
    </span>
  );
}
