// "ElevenLabs-Stimme" for JARVIS – optional, off until switched on. The key is typed in at the PC itself only (never on a phone) and
// stays on the PC; only stock voices of the service can be chosen; the PC counts the characters against a monthly limit.
import { useState, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useConn } from "../lib/hooks";
import { elevenStatus, refreshEleven, subscribeEleven, type ElevenStatus, type ElevenVoice } from "../lib/voice-eleven";
import { Button, Switch } from "./ui";

export function ElevenSettings() {
  const st = useSyncExternalStore(subscribeEleven, elevenStatus);
  const conn = useConn();
  const canAdmin = useCan("admin");
  const atPc = !!conn.me?.isLocal && canAdmin;
  const [key, setKey] = useState("");
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null);
  const [busy, setBusy] = useState("");
  const online = conn.phase === "online" && conn.auth === "ok";
  if (!st && online) void refreshEleven();

  const save = async (c: Record<string, unknown>, ok?: string) => {
    setBusy("save");
    try { await client.call<ElevenStatus>("voice.configure", c); await refreshEleven(); if (ok) toast(ok, "success"); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(""); }
  };
  const loadVoices = async () => {
    setBusy("voices");
    try { const r = await client.call<{ voices: ElevenVoice[] }>("voice.voices"); setVoices(r.voices); if (!r.voices.length) toast(t("ElevenLabs hat keine Standardstimmen geliefert."), "warning"); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(""); }
  };

  return (
    <section className="stack-sm eleven" aria-label={t("ElevenLabs-Stimme")}>
      <b>{t("ElevenLabs-Stimme (optional)")}</b>
      <span className="muted tiny">{t("Eine besonders natürliche Stimme von ElevenLabs. Sie ist aus, solange du sie nicht einschaltest. Der Text, den JARVIS spricht, geht dann über deinen PC an ElevenLabs (ein Dienst in den USA, nach deren Preisen); der Schlüssel bleibt auf dem PC. Nur Standardstimmen, Monatslimit einstellbar. Klappt etwas nicht, spricht JARVIS mit der Browser-Stimme.")}</span>
      {!st ? <span className="muted small">{online ? t("Lädt …") : t("Erst sichtbar, wenn der PC verbunden ist.")}</span> : (
        <>
          <span className="small">{st.enabled ? t("An – Stimme: {n}", { n: st.voiceName || "–" }) : st.keySet ? t("Schlüssel gespeichert, Stimme aus") : t("Noch kein Schlüssel")} · {t("Diesen Monat {u} von {m} Zeichen", { u: st.used, m: st.monthlyChars })}</span>
          {!st.keySet && (atPc ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input className="input grow" type="password" autoComplete="off" spellCheck={false} placeholder={t("ElevenLabs-Schlüssel")} aria-label={t("ElevenLabs-Schlüssel")} value={key} onChange={(e) => setKey(e.target.value)} />
              <Button variant="primary" busy={busy === "save"} disabled={key.trim().length < 16} onClick={async () => { await save({ key: key.trim() }, t("Schlüssel gespeichert")); setKey(""); }}>{t("Schlüssel speichern")}</Button>
            </div>
          ) : <span className="muted small">{t("Den Schlüssel trägst du am PC selbst ein (hier, im Fenster des Begleiters) – nicht vom Handy aus.")}</span>)}
          {st.keySet && canAdmin && (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" busy={busy === "voices"} onClick={loadVoices}>{t("Standardstimmen laden")}</Button>
                {voices && voices.length > 0 && (
                  <select className="input" aria-label={t("Stimme von ElevenLabs")} value={st.voiceId ?? ""} onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); if (v) void save({ voiceId: v.id, voiceName: v.name }); }}>
                    <option value="" disabled>{t("Stimme wählen …")}</option>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${v.gender}` : ""}{v.accent ? ` · ${v.accent}` : ""}</option>)}
                  </select>
                )}
              </div>
              <label className="row" style={{ gap: 8 }}><span style={{ minWidth: 90 }}>{t("Lautstärke")}</span>
                <input type="range" min={0} max={100} step={5} value={st.volume} className="grow" aria-label={t("Lautstärke der ElevenLabs-Stimme")} onChange={(e) => void save({ volume: Number(e.target.value) })} /><span>{st.volume} %</span></label>
              <label className="row" style={{ gap: 8 }}><span style={{ minWidth: 90 }}>{t("Monatslimit")}</span>
                <input className="input" type="number" min={1000} max={200000} step={1000} value={st.monthlyChars} aria-label={t("Monatslimit in Zeichen")} style={{ maxWidth: 140 }} onChange={(e) => { const n = Number(e.target.value); if (n >= 1000 && n <= 200000) void save({ monthlyChars: n }); }} /><span className="muted">{t("Zeichen")}</span></label>
              <Switch checked={st.enabled} disabled={!st.voiceId || busy === "save"} onChange={(v) => void save({ enabled: v })} label={t("ElevenLabs-Stimme benutzen")}
                hint={st.voiceId ? t("Mit „Probe hören“ kannst du sie ausprobieren.") : t("Erst eine Stimme wählen.")} />
              {atPc && <Button size="sm" variant="ghost" onClick={() => void save({ key: "" }, t("Schlüssel entfernt"))}>{t("Schlüssel entfernen")}</Button>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
