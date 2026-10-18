import { useEffect, useState } from "react";
import { Circle, Clapperboard, Keyboard, Layers, Puzzle, Save, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import type { Hotkey, HotkeyStatus, ObsStatus, OverlayCorner, OverlayStatus, Settings, StepType } from "../lib/types";
import type { PluginList } from "../lib/plugins";
import { Banner, Button, Card, Field, PageHead, Switch } from "../components/ui";
import { ComboInput } from "../components/ComboInput";
import { describeCombo } from "./hotkey-combo";

export const OVERLAY_PLUGIN_ID = "de.pgl.game-overlay";

/** The overlay shortcuts are ordinary hotkeys with these actions – also editable under "Hotkeys". */
function shortcuts(): { key: string; type: StepType; ref?: string; label: string; suggestion: string }[] {
  return [
    { key: "full", type: "toggleOverlay", ref: "full", label: t("Overlay öffnen/schließen (groß, wie die Xbox Game Bar)"), suggestion: "Ctrl+Shift+G" },
    { key: "mini", type: "toggleOverlay", ref: "mini", label: t("Mini-Overlay mit CPU/RAM/GPU in der Ecke ein/aus"), suggestion: "Ctrl+Shift+H" },
    { key: "record", type: "obsRecordToggle", label: t("Aufnahme starten/stoppen"), suggestion: "Ctrl+Shift+R" },
    { key: "replay", type: "obsReplaySave", label: t("Replay speichern (die letzten Sekunden)"), suggestion: "Ctrl+Shift+B" },
    { key: "buffer", type: "obsReplayBufferToggle", label: t("Replay-Puffer an/aus"), suggestion: "" },
  ];
}

const matches = (h: Hotkey, s: { type: StepType; ref?: string }) =>
  !h.quickActionId && h.action.type === s.type && (s.type !== "toggleOverlay" || (h.action.ref === "mini") === (s.ref === "mini"));

export default function OverlaySettings() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canManage = useCan("manage");
  const canLaunch = useCan("launch");
  const hk = useRpc<{ supported: boolean; hotkeys: { hotkey: Hotkey; status: HotkeyStatus }[] }>("hotkeys.list", {}, ["hotkeys"]);
  const obs = useRpc<ObsStatus>("obs.status", {}, ["obs", "settings"]);
  const ov = useRpc<OverlayStatus>("overlay.status", {}, ["overlay"]);
  const set = useRpc<{ settings: Settings }>("settings.get", {}, ["settings"]);
  const plugins = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  const overlayPlugin = plugins.data?.plugins.find((p) => p.id === OVERLAY_PLUGIN_ID);

  const run = async (method: string, params?: object) => {
    try {
      const r = await client.call<{ message?: string }>(method, params);
      if (r?.message) toast(t(r.message), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Overlay & Aufnahme")}
        text={t("Overlay im Spiel wie die Xbox Game Bar: Leistungswerte, Aufnahme und Replays per Tastenkürzel. Aufgenommen wird mit OBS Studio (kostenlos). Alles lässt sich schon auf dem Handy einstellen und wird beim Verbinden auf den PC übertragen.")} />
      {!online && <div style={{ marginBottom: 16 }}><Banner kind="info">{t("PC nicht verbunden: Tastenkürzel, OBS-Verbindung und Overlay-Ecke werden auf diesem Gerät gespeichert und beim nächsten Verbinden auf den PC übertragen.")}</Banner></div>}
      <div className="stack">
        <Card title={t("Tastenkürzel")} icon={<Keyboard size={18} />}>
          <ShortcutEditor hotkeys={hk.data?.hotkeys.map((x) => x.hotkey) ?? []} statuses={hk.data?.hotkeys.map((x) => x.status) ?? []} canManage={canManage} />
        </Card>

        <Card title={t("Overlay-Inhalt")} icon={<Puzzle size={18} />}>
          {overlayPlugin?.enabled ? <Banner kind="ok">{t("Plugin „Game-Overlay“ ist aktiv – seine Widgets erscheinen im großen Overlay.")}</Banner>
            : overlayPlugin ? <Banner kind="warn" actions={<Link className="btn sm" to="/plugins">{t("Plugin Center")}</Link>}>{t("Plugin „Game-Overlay“ ist installiert, aber noch nicht aktiviert (Plugin Center → Details → Aktivieren).")}</Banner>
            : <Banner kind="info" actions={<Link className="btn sm primary" to="/plugins?tab=store">{t("Zum Store")}</Link>}>{t("Was im großen Overlay steht, kommt aus Plugins. Installiere das offizielle Plugin „Game-Overlay“ (Leistungswerte, Aufnahme, Replay). Weitere Plugins mit Overlay-Widgets erscheinen dort ebenfalls.")}</Banner>}
          <p className="tiny muted" style={{ marginTop: 8 }}>{t("Das Mini-Overlay zeigt CPU, RAM, GPU und „● REC“ während einer Aufnahme. Es lässt Mausklicks zum Spiel durch und braucht keinen Browser im Hintergrund.")}</p>
          <Field label={t("Ecke für das Mini-Overlay")}>
            <select className="input" value={set.data?.settings.overlayCorner ?? "top-right"} disabled={!canManage}
              onChange={(e) => client.call("settings.save", { overlayCorner: e.target.value as OverlayCorner }).then(() => toast(t("Gespeichert"), "success"), (er) => toast((er as Error).message, "error"))}>
              <option value="top-left">{t("Oben links")}</option>
              <option value="top-right">{t("Oben rechts")}</option>
              <option value="bottom-left">{t("Unten links")}</option>
              <option value="bottom-right">{t("Unten rechts")}</option>
            </select>
          </Field>
          {online && ov.data && (ov.data.supported
            ? <div className="row" style={{ marginTop: 8 }}>
                <Button icon={<Layers size={16} />} disabled={!canLaunch} onClick={() => run("overlay.toggle", { mode: "full" })}>{t("Overlay jetzt zeigen")}</Button>
                <Button disabled={!canLaunch} onClick={() => run("overlay.toggle", { mode: "mini" })}>{t("Mini-Overlay ein/aus")}</Button>
              </div>
            : <p className="small muted" style={{ marginTop: 8 }}>{t(ov.data.reason ?? "Das Overlay gibt es nur im Windows-Begleiter.")}</p>)}
          <p className="tiny muted" style={{ marginTop: 8 }}>{t("Funktioniert über Spielen im Fenster- oder randlosen Vollbildmodus. Im exklusiven Vollbild verdeckt Windows andere Fenster – dann im Spiel „Randlos“ bzw. „Borderless“ wählen. Es wird nichts in Spiele eingeschleust (sicher für Anti-Cheat).")}</p>
        </Card>

        <ObsCard status={obs.data} online={online} canManage={canManage} canLaunch={canLaunch} run={run} />
      </div>
    </>
  );
}

function ShortcutEditor({ hotkeys, statuses, canManage }: { hotkeys: Hotkey[]; statuses: HotkeyStatus[]; canManage: boolean }) {
  const rows = shortcuts();
  const current = Object.fromEntries(rows.map((r) => [r.key, hotkeys.find((h) => matches(h, r))]));
  const fromPc = () => Object.fromEntries(rows.map((r) => [r.key, current[r.key]?.keys ?? ""]));
  const [draft, setDraft] = useState<Record<string, string>>(fromPc);
  const pcKey = JSON.stringify(fromPc());
  useEffect(() => { setDraft(JSON.parse(pcKey)); }, [pcKey]);
  const changed = rows.some((r) => (draft[r.key] ?? "") !== (current[r.key]?.keys ?? ""));

  const save = async () => {
    const used = draft;
    const mine = new Set(rows.map((r) => current[r.key]?.id).filter(Boolean));
    const others = hotkeys.filter((h) => !mine.has(h.id) && h.enabled).map((h) => h.keys.toLowerCase());
    const chosen = rows.map((r) => used[r.key]?.trim()).filter(Boolean).map((k) => k!.toLowerCase());
    if (new Set(chosen).size !== chosen.length) { toast(t("Zwei Aktionen haben dieselbe Tastenkombination."), "error"); return; }
    const clash = chosen.find((k) => others.includes(k));
    if (clash) { toast(t("{k} ist schon einem anderen Hotkey zugeordnet.", { k: clash }), "error"); return; }
    try {
      for (const r of rows) {
        const keys = used[r.key]?.trim() ?? "";
        const existing = current[r.key];
        if (!keys && existing) await client.call("hotkeys.remove", { id: existing.id });
        else if (keys && keys !== existing?.keys)
          await client.call("hotkeys.save", { id: existing?.id ?? "", keys, enabled: true, action: { type: r.type, ref: r.ref ?? null }, quickActionId: null });
      }
      toast(t("Tastenkürzel gespeichert"), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="stack-sm">
      {rows.map((r) => {
        const st = current[r.key] && statuses.find((s) => s.id === current[r.key]!.id);
        return (
          <Field key={r.key} label={r.label} hint={st?.state === "error" ? <span style={{ color: "var(--danger)" }}>{t(st.message ?? "Fehler")}</span> : st?.state === "pending" ? t("Wartet auf PC") : undefined}>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <div className="grow"><ComboInput value={draft[r.key] ?? ""} onChange={(v) => setDraft({ ...draft, [r.key]: v })} label={r.label} placeholder={r.suggestion || t("nicht belegt")} /></div>
              {draft[r.key] && <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, [r.key]: "" })} aria-label={t("Entfernen")}>✕</Button>}
            </div>
            {draft[r.key] && <span className="tiny muted">{describeCombo(draft[r.key], t)}</span>}
          </Field>
        );
      })}
      <div className="row">
        <Button variant="primary" icon={<Save size={16} />} disabled={!canManage || !changed} onClick={save}>{t("Tastenkürzel speichern")}</Button>
        <Button disabled={!canManage} onClick={() => setDraft(Object.fromEntries(rows.map((r) => [r.key, draft[r.key] || r.suggestion])))}>{t("Vorschläge einsetzen")}</Button>
      </div>
      <p className="tiny muted">{t("Ins Feld tippen und die Kombination drücken – auch Maus-Seitentasten. Die Kürzel sind normale Hotkeys und stehen auch unter „Hotkeys“. Vorschläge funktionieren auf 60-%-Tastaturen ohne F-Tasten.")}</p>
    </div>
  );
}

function ObsCard({ status, online, canManage, canLaunch, run }: { status?: ObsStatus; online: boolean; canManage: boolean; canLaunch: boolean; run: (m: string, p?: object) => Promise<void> }) {
  const [url, setUrl] = useState(status?.url ?? "ws://127.0.0.1:4455");
  const [password, setPassword] = useState("");
  const [replay, setReplay] = useState(!!status?.replayWhilePlaying);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (status) { setUrl(status.url ?? "ws://127.0.0.1:4455"); setReplay(!!status.replayWhilePlaying); } }, [status?.url, status?.replayWhilePlaying]);

  const save = async (params: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await client.call<ObsStatus | undefined>("obs.configure", params);
      setPassword("");
      toast(!online ? t("Gespeichert – wird beim Verbinden auf den PC übertragen") : r?.connected ? t("Mit OBS verbunden") : t("Gespeichert, aber OBS ist nicht erreichbar: {e}", { e: r?.error ?? "" }), !online || r?.connected ? "success" : "warning");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <Card title={t("Aufnahme mit OBS Studio")} icon={<Video size={18} />}
      meta={online && status ? (status.connected ? <span className="badge ok">{t("Verbunden")}{status.version ? ` · obs-websocket ${status.version}` : ""}</span> : <span className="badge warn">{t("Nicht verbunden")}</span>) : undefined}>
      <div className="stack-sm">
        {online && status && !status.connected && status.error && <Banner kind="warn">{t(status.error)}</Banner>}
        {online && status?.connected && (
          <div className="row">
            <Button icon={<Circle size={14} fill={status.recording ? "currentColor" : "none"} />} variant={status.recording ? "danger" : "primary"} disabled={!canLaunch} onClick={() => run("obs.recordToggle")}>
              {status.recording ? t("Aufnahme stoppen") : t("Aufnahme starten")}
            </Button>
            <Button disabled={!canLaunch} onClick={() => run("obs.replayToggle")}>{status.replayBuffer ? t("Replay-Puffer stoppen") : t("Replay-Puffer starten")}</Button>
            <Button icon={<Clapperboard size={16} />} disabled={!canLaunch || !status.replayBuffer} onClick={() => run("obs.replaySave")}>{t("Replay speichern")}</Button>
          </div>
        )}
        <Field label={t("OBS-WebSocket-Adresse")} hint={t("Läuft OBS auf diesem PC: ws://127.0.0.1:4455 (Standard).")}>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!canManage} />
        </Field>
        <Field label={t("OBS-WebSocket-Passwort")} hint={status?.passwordSet ? t("Ein Passwort ist gespeichert. Leer lassen = unverändert.") : t("Steht in OBS unter Werkzeuge → WebSocket-Servereinstellungen → „Verbindungsinformationen anzeigen“.")}>
          <input className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!canManage}
            placeholder={status?.passwordSet ? "••••••••" : ""} />
        </Field>
        <Switch checked={replay} onChange={setReplay} disabled={!canManage} label={t("Replay-Puffer automatisch, solange ein Spiel läuft")}
          hint={t("Dann kannst du jederzeit „Replay speichern“ drücken (wie „Letzte 30 Sekunden aufnehmen“ der Game Bar). Die Länge stellst du in OBS ein.")} />
        <div className="row">
          <Button variant="primary" busy={busy} disabled={!canManage} onClick={() => save({ url: url.trim(), replayWhilePlaying: replay, ...(password ? { password } : {}) })}>{online ? t("Speichern und verbinden") : t("Speichern")}</Button>
          {status?.passwordSet && <Button variant="ghost" disabled={!canManage} onClick={() => save({ password: "" })}>{t("Passwort entfernen")}</Button>}
        </div>
        <details>
          <summary className="small">{t("OBS einrichten (einmalig, ca. 3 Minuten)")}</summary>
          <ol className="small" style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>{t("OBS Studio von obsproject.com installieren und starten (Version 28 oder neuer).")}</li>
            <li>{t("Werkzeuge → WebSocket-Servereinstellungen → „WebSocket-Server aktivieren“ anhaken. „Verbindungsinformationen anzeigen“ → Passwort hier eintragen.")}</li>
            <li>{t("Für Replays: Einstellungen → Ausgabe → „Replay-Puffer aktivieren“ und die gewünschte Länge (z. B. 30 Sekunden) wählen.")}</li>
            <li>{t("Eine Quelle „Spielaufnahme“ oder „Bildschirmaufnahme“ anlegen. Videos landen im Aufnahmeordner von OBS.")}</li>
          </ol>
        </details>
      </div>
    </Card>
  );
}
