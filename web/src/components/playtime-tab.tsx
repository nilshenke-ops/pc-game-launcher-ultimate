// Spiele-Journal → Spielzeit: everything JARVIS uses for "Wie lange brauche ich noch?" – visible, changeable, deletable.
// Measured values come from the PC (Steam, measured sessions), averages from IGDB (own Twitch app, set at the PC only),
// progress and own figures from you. Each value shows its source and date.

import { useState } from "react";
import { Clock, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useConn, useRpc } from "../lib/hooks";
import { removeEntry, useJournal, type Entry } from "../lib/journal";
import { effectiveDurations, effectivePlayed, estimateRemaining, fmtHours, fmtMinutes, fmtRange, type PlaytimeEntry } from "../lib/playtime";
import { PLAYTIME_KIND, refreshPlaytime, savePlaytime } from "../lib/playtime-chat";
import { Banner, Button, Card, confirmDialog, Empty, Field } from "./ui";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
const num = (v: string) => { const n = Number(v.replace(",", ".")); return v.trim() === "" || !isFinite(n) || n < 0 ? null : n; };

export function PlaytimeTab({ focus }: { focus: string | null }) {
  const list = useJournal<PlaytimeEntry>(PLAYTIME_KIND);
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok" && !client.demo;
  const [name, setName] = useState("");
  const add = async () => {
    const g = name.trim();
    if (g.length < 2) return;
    savePlaytime(g, {});
    setName("");
    if (online) { const err = await refreshPlaytime(g); toast(err ? t("Gespeichert – {e}", { e: err }) : t("Vom PC aktualisiert"), err ? "info" : "success"); }
  };
  return (
    <div className="stack">
      {conn.me?.isLocal && <IgdbCard />}
      {!online && <Banner kind="info">{t("Der PC ist nicht verbunden – du siehst die gespeicherten Werte. Spielzeit und Durchschnittsdauern werden beim nächsten Verbinden aktualisiert; Fortschritt und eigene Angaben kannst du jetzt ändern.")}</Banner>}
      <Card title={t("Spielzeit & Fortschritt")} icon={<Clock size={18} />}>
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>{t("Frag JARVIS z. B. „Wie lange brauche ich noch für Hogwarts Legacy?“ oder sag „Ich bin bei 40 % in Hogwarts Legacy“. Hier siehst und änderst du alles, was er dafür nutzt.")}</p>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Spiel, z. B. Hogwarts Legacy")} aria-label={t("Spiel hinzufügen")} onKeyDown={(e) => e.key === "Enter" && void add()} />
            <Button variant="primary" onClick={() => void add()} disabled={name.trim().length < 2}>{t("Hinzufügen")}</Button>
          </div>
        </div>
      </Card>
      {list.length === 0 ? <Empty icon={<Clock size={26} />} title={t("Noch keine Spiele")} text={t("Füge ein Spiel hinzu oder frag JARVIS – die Werte erscheinen dann hier.")} />
        : list.map((e) => <PlaytimeCard key={e.id} e={e} online={online} focused={focus === e.id} />)}
    </div>
  );
}

function PlaytimeCard({ e, online, focused }: { e: Entry<PlaytimeEntry>; online: boolean; focused: boolean }) {
  const d = e.data;
  const [busy, setBusy] = useState(false);
  const played = effectivePlayed(d);
  const dur = effectiveDurations(d);
  const est = estimateRemaining(d, "main");
  const set = (patch: Partial<PlaytimeEntry>) => savePlaytime(d.gameName, patch);
  const refresh = async () => { setBusy(true); const err = await refreshPlaytime(d.gameName); setBusy(false); toast(err ? t("Aktualisiert – {e}", { e: err }) : t("Vom PC aktualisiert"), err ? "info" : "success"); };
  const del = async () => { if (await confirmDialog(t("„{n}“ löschen?", { n: d.gameName }), t("Fortschritt, eigene Angaben und gespeicherte Werte zu diesem Spiel werden auf diesem Gerät und – beim nächsten Abgleich – auf dem PC gelöscht."), { danger: true, ok: t("Löschen") })) removeEntry(e.id); };
  return (
    <Card title={d.gameName} className={focused ? "glow" : ""}
      actions={<>
        <Button size="sm" icon={<RefreshCw size={15} />} busy={busy} disabled={!online} onClick={() => void refresh()} title={online ? undefined : t("Nur mit verbundenem PC")}>{t("Vom PC aktualisieren")}</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => void del()} aria-label={t("„{n}“ löschen", { n: d.gameName })} />
      </>}>
      <div className="stack-sm small">
        <div><b>{t("Bisher gespielt")}:</b> {played ? <>{fmtMinutes(played.minutes)} <span className="muted">· {played.source === "deine Angabe" ? t("deine Angabe") : <>{t("gemessen")} · {played.source}</>}{played.updatedAt ? ` · ${t("Stand")} ${day(played.updatedAt)}` : ""}</span></> : <span className="muted">{t("nicht bekannt")}</span>}</div>
        <div><b>{t("Durchschnitt")}:</b> {dur ? <>{[dur.mainHours ? `${t("Hauptstory")} ${fmtHours(dur.mainHours)}` : "", dur.extraHours ? `${t("mit Nebenaufgaben")} ${fmtHours(dur.extraHours)}` : "", dur.completeHours ? `100 % ${fmtHours(dur.completeHours)}` : ""].filter(Boolean).join(" · ")} <span className="muted">· {dur.own ? t("deine Angabe") : <>{t("recherchiert")} · {dur.url ? <a href={dur.url} target="_blank" rel="noreferrer noopener">{dur.source}</a> : dur.source}{dur.count ? ` · ${dur.count} ${t("Spieler")}` : ""}{dur.fetchedAt ? ` · ${t("Stand")} ${day(dur.fetchedAt)}` : ""}</>}</span></> : <span className="muted">{t("nicht bekannt")}</span>}</div>
        <div><b>{t("Geschätzt noch (Hauptstory)")}:</b> {est.range && est.kind !== "done" ? <>{fmtRange(est.range)} <span className="muted">· {t("Schätzung")}{est.kind === "rough" ? ` (${t("grob, ohne Fortschritt")})` : est.kind === "total" ? ` (${t("Gesamtdauer")})` : ""}</span></> : est.kind === "done" ? t("geschafft") : <span className="muted">{t("nicht seriös möglich – es fehlen Angaben")}</span>}</div>
        <div className="grid-3" style={{ marginTop: 6 }}>
          <Field label={t("Fortschritt in % (deine Angabe)")}>
            <input className="input" type="number" min={0} max={100} defaultValue={d.progress?.percent ?? ""} onBlur={(ev) => { const v = num(ev.target.value); if (v == null) { if (d.progress) set({ progress: null }); return; } if (v <= 100 && v !== d.progress?.percent) set({ progress: { percent: Math.round(v), at: new Date().toISOString() } }); }} />
          </Field>
          <Field label={t("Eigene Spielzeit in Std. (z. B. Konsole)")}>
            <input className="input" inputMode="decimal" defaultValue={d.manualMinutes ? String(Math.round((d.manualMinutes / 60) * 10) / 10) : ""} onBlur={(ev) => { const v = num(ev.target.value); set({ manualMinutes: v == null ? null : Math.round(v * 60) }); }} />
          </Field>
          <Field label={t("Eigene Dauer Hauptstory in Std.")}>
            <input className="input" inputMode="decimal" defaultValue={d.ownDurations?.mainHours ?? ""} onBlur={(ev) => { const v = num(ev.target.value); set({ ownDurations: { ...(d.ownDurations ?? {}), mainHours: v } }); }} />
          </Field>
        </div>
        {d.progress && <span className="tiny muted">{t("Fortschritt angegeben am {d}", { d: day(d.progress.at) })}</span>}
      </div>
    </Card>
  );
}

/** At the PC only: the free Twitch app for IGDB "Time to Beat". The secret is stored encrypted on the PC and never shown again. */
function IgdbCard() {
  const st = useRpc<{ igdb: boolean; clientId?: string | null }>("playtime.status", {}, [], true);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const save = (clientId: string, clientSecret: string) => client.call("playtime.configure", { clientId, clientSecret }).then(() => { setSecret(""); setId(""); st.reload(); toast(clientId ? t("IGDB-Zugang gespeichert") : t("IGDB-Zugang entfernt"), "success"); }, (e: Error) => toast(e.message, "error"));
  return (
    <Card title={t("Durchschnittsdauern (IGDB)")} icon={<KeyRound size={18} />}>
      <div className="stack-sm small">
        {st.data?.igdb ? <p style={{ margin: 0 }}>✓ {t("IGDB-Zugang eingerichtet (Client-ID {c}). Das Geheimnis liegt verschlüsselt nur auf diesem PC.", { c: st.data.clientId ?? "" })}</p>
          : <p className="muted" style={{ margin: 0 }}>{t("Für Durchschnittsdauern (Hauptstory, mit Nebenaufgaben, 100 %) nutzt JARVIS die offizielle IGDB-Schnittstelle. Dafür brauchst du eine kostenlose Twitch-Anwendung: dev.twitch.tv → Konsole → Anwendung registrieren (Kategorie „Application Integration“, OAuth-Weiterleitung http://localhost) → Client-ID und neues Geheimnis hier eintragen. Ohne Zugang kannst du eigene Dauern eintragen.")}</p>}
        <div className="grid-3">
          <Field label={t("Client-ID")}><input className="input mono" autoComplete="off" value={id} onChange={(e) => setId(e.target.value.trim())} /></Field>
          <Field label={t("Client-Geheimnis")}><input className="input mono" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value.trim())} /></Field>
          <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
            <Button variant="primary" disabled={!id || !secret} onClick={() => void save(id, secret)}>{t("Speichern")}</Button>
            {st.data?.igdb && <Button variant="ghost" onClick={() => void save("", "")}>{t("Entfernen")}</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}
