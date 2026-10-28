import { useEffect, useState } from "react";
import { discordSteps } from "../lib/discord-check";
import { Cable, ExternalLink, Headphones, Mic, RefreshCw, Speaker, Stethoscope, Volume2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useEvent, useLiveSubscription, useRpc, toast } from "../lib/hooks";
import type { AudioDevice, AudioSettings, CheckResult } from "../lib/types";
import { Banner, Button, Card, CheckList, Field, Loadable, Meter, PageHead, Segmented, Switch } from "../components/ui";

interface MicTestResult { device?: string; peak: number; average: number; verdict: "silent" | "quiet" | "ok" | "clipping" }
const VERDICT: Record<MicTestResult["verdict"], { kind: "ok" | "warn" | "error"; text: () => string }> = {
  ok: { kind: "ok", text: () => t("Mikrofon funktioniert – Pegel im guten Bereich.") },
  quiet: { kind: "warn", text: () => t("Sehr leise. Näher ans Mikrofon gehen oder die Eingangslautstärke in Windows erhöhen.") },
  silent: { kind: "error", text: () => t("Kein Signal. Stummschaltung, Kabel und Windows-Datenschutz (Mikrofonzugriff für Desktop-Apps) prüfen.") },
  clipping: { kind: "warn", text: () => t("Übersteuert. Eingangslautstärke in Windows etwas senken.") },
};

interface AudioState { supported: boolean; unsupportedReason?: string; settings: AudioSettings; devices: AudioDevice[]; virtualCable?: AudioDevice; micPassthroughActive: boolean; missing: string[] }

export default function AudioCenter() {
  const q = useRpc<AudioState>("audio.state", {}, ["audio"]);
  const [s, setS] = useState<AudioSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<number | null>(null);
  const [diag, setDiag] = useState<{ at: string; checks: CheckResult[] } | null>(null);
  useEffect(() => { if (q.data && !dirty) setS(q.data.settings); }, [q.data, dirty]);
  // The live mic level is only sent while this page is open and visible.
  useLiveSubscription("audio");
  useEvent<{ mic: number }>("audio.level", (d) => setMic(d.mic));
  const [testing, setTesting] = useState(false);
  const [testLevel, setTestLevel] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<MicTestResult | null>(null);
  useEvent<{ level: number }>("audio.micTest", (d) => setTestLevel(d.level));
  const micTest = async () => {
    if (!s) return;
    setTesting(true); setTestResult(null); setTestLevel(0);
    try { setTestResult(await client.call<MicTestResult>("audio.micTest", { deviceId: s.micDeviceId ?? "" })); }
    catch (e) { toast((e as Error).message, "error"); }
    setTesting(false); setTestLevel(null);
  };

  const set = (p: Partial<AudioSettings>) => { setS((x) => (x ? { ...x, ...p } : x)); setDirty(true); };
  const save = async () => {
    if (!s) return;
    setBusy(true);
    try { await client.call("audio.save", s); toast(t("Audio-Einstellungen gespeichert"), "success"); setDirty(false); }
    catch (e) { toast((e as Error).message, "error"); setDirty(false); }
    setBusy(false);
  };
  const runDiag = async () => { try { setDiag(await client.call("audio.diagnose")); } catch (e) { toast((e as Error).message, "error"); } };
  // Uses the device and volume currently chosen in the form, even before "Speichern".
  const tone = (target: "output" | "monitor") => client.call("audio.testTone", target === "monitor"
    ? { target, deviceId: s?.monitorDeviceId ?? "", volume: s?.monitorVolume }
    : { target, deviceId: s?.outputDeviceId ?? "", volume: s?.soundboardVolume }).then(() => toast(t("Testton wird abgespielt"), "info")).catch((e) => toast(e.message, "error"));

  const outs = q.data?.devices.filter((d) => d.flow === "render") ?? [];
  const caps = q.data?.devices.filter((d) => d.flow === "capture") ?? [];
  const cable = q.data?.virtualCable;
  const name = (d: AudioDevice) => `${d.name}${d.isDefault ? " (" + t("Standard") + ")" : ""}${d.isVirtualCable ? " · " + t("virtuell") : ""}`;

  return (
    <>
      <PageHead eyebrow={t("Audio")} title={t("Audio Center")} text={t("Ausgabegeräte, Monitoring, Mikrofon-Durchleitung und der Discord-Workflow.")}
        actions={<>
          <Button icon={<RefreshCw size={16} />} onClick={() => { setDirty(false); q.reload(); }}>{t("Geräte aktualisieren")}</Button>
          <Button variant="primary" disabled={!dirty} busy={busy} onClick={save}>{t("Speichern")}</Button>
        </>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && !q.data.supported ? <Banner kind="warn" title={t("Nicht unterstützt")}>{q.data.unsupportedReason}</Banner> : s && q.data && (
          <div className="stack">
            {q.stale && <Banner kind="info" title={t("PC nicht verbunden")}>{t("Lautstärken, Wiedergabe-Modus, Monitoring und Mikrofon-Durchleitung kannst du schon einstellen – übertragen werden nur die Werte, die du hier änderst. Audiogeräte (z. B. das virtuelle Kabel) kennt nur der PC; sie erscheinen nach dem Verbinden. Testton und Mikrofon-Test brauchen den PC.")}</Banner>}
            {q.data.missing.length > 0 && <Banner kind="error" title={t("Gerät fehlt")}>{t("Nicht gefunden: {x}. Gerät anschließen oder anderes wählen.", { x: q.data.missing.join(", ") })}</Banner>}
            <div className="grid-2">
              <Card title={t("Soundboard-Ausgabe")} icon={<Speaker size={18} />}>
                <div className="stack">
                  <Field label={t("Ausgabegerät")} hint={t("Für Discord: das virtuelle Kabel (z. B. „CABLE Input“).")}>
                    <select className="input" value={s.outputDeviceId ?? ""} onChange={(e) => set({ outputDeviceId: e.target.value || null })}>
                      <option value="">{t("Windows-Standardgerät")}</option>
                      {outs.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
                    </select>
                  </Field>
                  <Field label={t("Lautstärke Soundboard: {v} %", { v: s.soundboardVolume })}><input type="range" min={0} max={100} value={s.soundboardVolume} onChange={(e) => set({ soundboardVolume: +e.target.value })} /></Field>
                  <Field label={t("Wiedergabe-Modus")}>
                    <Segmented value={s.playMode} onChange={(playMode) => set({ playMode })} options={[{ value: "overlap", label: t("Überlagern") }, { value: "replace", label: t("Ersetzen") }, { value: "queue", label: t("Warteschlange") }]} />
                  </Field>
                  <Button icon={<Volume2 size={16} />} onClick={() => tone("output")}>{t("Testton Soundboard")}</Button>
                </div>
              </Card>
              <Card title={t("Monitoring (selbst mithören)")} icon={<Headphones size={18} />}>
                <div className="stack">
                  <Switch checked={s.monitorEnabled} onChange={(monitorEnabled) => set({ monitorEnabled })} label={t("Sounds zusätzlich auf einem zweiten Gerät abspielen")} hint={t("Damit du hörst, was die anderen hören.")} />
                  <Field label={t("Monitoring-Gerät")}>
                    <select className="input" disabled={!s.monitorEnabled} value={s.monitorDeviceId ?? ""} onChange={(e) => set({ monitorDeviceId: e.target.value || null })}>
                      <option value="">{t("Windows-Standardgerät")}</option>
                      {outs.filter((d) => !d.isVirtualCable).map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
                    </select>
                  </Field>
                  <Field label={t("Lautstärke Monitoring: {v} %", { v: s.monitorVolume })}><input type="range" min={0} max={100} value={s.monitorVolume} disabled={!s.monitorEnabled} onChange={(e) => set({ monitorVolume: +e.target.value })} /></Field>
                  <Button icon={<Volume2 size={16} />} disabled={!s.monitorEnabled} onClick={() => tone("monitor")}>{t("Testton Monitoring")}</Button>
                </div>
              </Card>
              <Card title={t("Mikrofon-Durchleitung")} icon={<Mic size={18} />}>
                <div className="stack">
                  <Switch checked={s.micPassthrough} onChange={(micPassthrough) => set({ micPassthrough })} label={t("Mikrofon in die Soundboard-Ausgabe mischen")} hint={t("Nötig, wenn Discord das virtuelle Kabel als Mikrofon nutzt – sonst hört man dich nicht mehr.")} />
                  <Field label={t("Mikrofon")}>
                    <select className="input" value={s.micDeviceId ?? ""} onChange={(e) => set({ micDeviceId: e.target.value || null })}>
                      <option value="">{t("Windows-Standardmikrofon")}</option>
                      {caps.filter((d) => !d.isVirtualCable).map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
                    </select>
                  </Field>
                  <Field label={t("Mikrofon-Lautstärke: {v} %", { v: s.micVolume })}><input type="range" min={0} max={200} value={s.micVolume} onChange={(e) => set({ micVolume: +e.target.value })} /></Field>
                  <div className="stack-sm">
                    <span className="label">{t("Mikrofonpegel")}</span>
                    {testing ? <Meter value={(testLevel ?? 0) * 100} /> : q.data.micPassthroughActive ? <Meter value={(mic ?? 0) * 100} /> : <span className="small muted">{t("Live nur bei aktiver Durchleitung – oder den Mikrofon-Test starten.")}</span>}
                  </div>
                  <Button icon={<Mic size={16} />} busy={testing} onClick={micTest}>{testing ? t("Sprich jetzt … (4 s)") : t("Mikrofon testen")}</Button>
                  {testResult && <Banner kind={VERDICT[testResult.verdict].kind} title={testResult.device ?? undefined}>
                    {VERDICT[testResult.verdict].text()} {t("Spitze {p} %, Mittel {a} %", { p: Math.round(testResult.peak * 100), a: Math.round(testResult.average * 100) })}
                  </Banner>}
                  <p className="tiny muted">{t("Der Test nimmt 4 Sekunden am PC auf und zeigt nur den Pegel. Es wird nichts gespeichert oder übertragen.")}</p>
                </div>
              </Card>
              <Card title={t("Discord einrichten")} icon={<Cable size={18} />} meta={cable ? <span className="badge ok">{t("Kabel gefunden")}</span> : <span className="badge warn">{t("Kein virtuelles Kabel")}</span>}>
                <div className="stack">
                  <ol className="steps small">
                    <li>{t("Virtuelles Audiokabel installieren (z. B. VB-Audio Virtual Cable, kostenlos). Dieses Programm installiert keine Treiber.")}</li>
                    <li>{t("Hier: Soundboard-Ausgabe = „CABLE Input“ und Mikrofon-Durchleitung einschalten.")}</li>
                    <li>{t("In Discord → Sprache & Video: Eingabegerät = „CABLE Output“.")}</li>
                    <li>{t("Monitoring auf deine Kopfhörer stellen, um selbst mitzuhören.")}</li>
                  </ol>
                  <ul className="discord-check small" aria-label={t("Discord-Check")}>
                    {discordSteps(s, q.data.devices).map((x) => (
                      <li key={x.label} className={x.state}><b>{x.state === "ok" ? "✓" : x.state === "todo" ? "✗" : "?"} {t(x.label)}</b><div className="tiny muted">{x.detail}</div></li>
                    ))}
                  </ul>
                  {dirty && <p className="tiny muted">{t("Der Check zeigt deine Auswahl – zum Übernehmen oben „Speichern“.")}</p>}
                  <Button size="sm" icon={<Volume2 size={15} />} disabled={!q.data.devices.find((d) => d.id === s.outputDeviceId)?.isVirtualCable} onClick={() => tone("output")}>{t("Testton ins Kabel (Freunde sollten ihn hören)")}</Button>
                  <Banner kind="info">{t("Ob andere Teilnehmer den Sound wirklich hören, kann die App nicht prüfen – am besten mit einem Freund oder dem Discord-Mikrofontest kontrollieren.")}</Banner>
                  <a className="btn" href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer"><ExternalLink size={16} />{t("VB-Audio Virtual Cable (offizielle Seite)")}</a>
                </div>
              </Card>
            </div>
            <Card title={t("Audio-Diagnose")} icon={<Stethoscope size={18} />} actions={<Button variant="primary" size="sm" onClick={runDiag}>{t("Diagnose ausführen")}</Button>}>
              {diag ? <CheckList checks={diag.checks} /> : <p className="muted small">{t("Prüft Geräte, virtuelles Kabel, Ausgabe-Routing und den Discord-Weg.")}</p>}
            </Card>
          </div>
        )}
      </Loadable>
    </>
  );
}
