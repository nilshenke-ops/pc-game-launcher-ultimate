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
import { addWidget, layoutOrDefault, OVERLAY_BUILTINS, overlayBuiltinTitle, overlayPluginWidgets, removeWidget, type OverlayLayout } from "../lib/overlay-layout";
import { pluginWidgetId } from "../lib/plugins";
import { describeCombo } from "./hotkey-combo";
import { actionLabel, CAPTURE_PROVIDERS, effectiveKey, FUNCTIONS, providerFor, type CaptureAction, type CaptureFunction, type CaptureStatus } from "../lib/capture";

export const OVERLAY_PLUGIN_ID = "de.pgl.game-overlay";

/** The overlay shortcuts are ordinary hotkeys with these actions – also editable under "Hotkeys". */
function shortcuts(): { key: string; type: StepType; ref?: string; action?: CaptureAction; label: string; suggestion: string }[] {
  return [
    { key: "full", type: "toggleOverlay", ref: "full", action: "overlay", label: t("Overlay öffnen/schließen (groß, wie die Xbox Game Bar)"), suggestion: "Ctrl+Shift+G" },
    { key: "mini", type: "toggleOverlay", ref: "mini", label: t("Mini-Overlay mit CPU/RAM/GPU in der Ecke ein/aus"), suggestion: "Ctrl+Shift+H" },
    { key: "record", type: "obsRecordToggle", action: "record", label: t("Aufnahme starten/stoppen"), suggestion: "Ctrl+Shift+R" },
    { key: "replay", type: "obsReplaySave", action: "replay", label: t("Replay speichern (die letzten Sekunden)"), suggestion: "Ctrl+Shift+B" },
    { key: "buffer", type: "obsReplayBufferToggle", action: "buffer", label: t("Replay-Puffer an/aus"), suggestion: "" },
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
  const cap = useRpc<CaptureStatus>("capture.status", {}, ["capture", "settings", "obs"]);
  const usesObs = FUNCTIONS.some((a) => providerFor(cap.data?.provider ?? "obs", cap.data?.actionProviders, a) === "obs");
  const replayWithObs = providerFor(cap.data?.provider ?? "obs", cap.data?.actionProviders, "replay") === "obs";
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
        {cap.data && <CaptureCard cap={cap.data} online={online} canManage={canManage} canLaunch={canLaunch} run={run} />}

        <Card title={t("Tastenkürzel")} icon={<Keyboard size={18} />}>
          <ShortcutEditor hotkeys={hk.data?.hotkeys.map((x) => x.hotkey) ?? []} statuses={hk.data?.hotkeys.map((x) => x.status) ?? []} canManage={canManage} cap={cap.data} />
        </Card>

        <Card title={t("Overlay-Inhalt")} icon={<Puzzle size={18} />}>
          <OverlayWidgetPicker plugins={plugins.data} canManage={canManage} online={online} />
          {!overlayPlugin && <p className="tiny muted" style={{ marginTop: 8 }}>{t("Mehr Widgets gibt es als Plugins im Store – jedes aktive Plugin-Widget lässt sich hier hinzufügen.")} <Link to="/plugins?tab=store">{t("Zum Store")}</Link></p>}
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

        {usesObs && <ObsCard status={obs.data} online={online} canManage={canManage} canLaunch={canLaunch} run={run} replayWithObs={replayWithObs} />}
      </div>
    </>
  );
}

function ShortcutEditor({ hotkeys, statuses, canManage, cap }: { hotkeys: Hotkey[]; statuses: HotkeyStatus[]; canManage: boolean; cap?: CaptureStatus }) {
  const programFor = (a: CaptureFunction) => CAPTURE_PROVIDERS.find((p) => p.id === providerFor(cap?.provider ?? "obs", cap?.actionProviders, a))!;
  const overlayProvider = CAPTURE_PROVIDERS.find((p) => p.id === cap?.overlayProvider);
  // Only actions the chosen programs can do (an existing hotkey is still shown so it can be removed).
  const rows = shortcuts().filter((r) => !r.action || r.key === "full" || programFor(r.action as CaptureFunction).actions.includes(r.action) || hotkeys.some((h) => matches(h, r)));
  /** The program reacts to its own key directly – the same key as launcher hotkey would never reach it. */
  const sameAsProgram = (r: (typeof rows)[number], keys: string) => {
    const fn = r.key === "full" ? undefined : programFor(r.action as CaptureFunction);
    const prog = r.key === "full" ? overlayProvider : fn?.id === "obs" ? undefined : fn;
    if (!prog || !r.action || !keys) return null;
    const k = effectiveKey(cap?.keys ?? {}, prog.id, r.action);
    return k && k.toLowerCase() === keys.trim().toLowerCase() ? prog.name : null;
  };
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
            {sameAsProgram(r, draft[r.key] ?? "") && <span className="tiny" style={{ color: "var(--warning)" }}>{t("Gleiche Taste wie in {p} – als Launcher-Hotkey würde {p} sie nie bekommen. Feld leer lassen: {p} reagiert direkt auf die Taste.", { p: sameAsProgram(r, draft[r.key] ?? "")! })}</span>}
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

function ObsCard({ status, online, canManage, canLaunch, run, replayWithObs }: { status?: ObsStatus; online: boolean; canManage: boolean; canLaunch: boolean; run: (m: string, p?: object) => Promise<void>; replayWithObs: boolean }) {
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
        {replayWithObs && <Switch checked={replay} onChange={setReplay} disabled={!canManage} label={t("Replay-Puffer automatisch, solange ein Spiel läuft")}
          hint={t("Dann kannst du jederzeit „Replay speichern“ drücken (wie „Letzte 30 Sekunden aufnehmen“ der Game Bar). Die Länge stellst du in OBS ein.")} />}
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

function CaptureCard({ cap, online, canManage, canLaunch, run }: { cap: CaptureStatus; online: boolean; canManage: boolean; canLaunch: boolean; run: (m: string, p?: object) => Promise<void> }) {
  const [provider, setProvider] = useState(cap.provider);
  const [overlayProvider, setOverlayProvider] = useState(cap.overlayProvider);
  const [perFunction, setPerFunction] = useState<Record<string, string>>(cap.actionProviders ?? {});
  const allKeys = () => Object.fromEntries(CAPTURE_PROVIDERS.flatMap((p) => p.actions.map((a) => [`${p.id}.${a}`, effectiveKey(cap.keys, p.id, a) ?? ""])));
  const [keys, setKeys] = useState<Record<string, string>>(allKeys);
  const capKey = JSON.stringify([cap.provider, cap.overlayProvider, cap.keys, cap.actionProviders]);
  useEffect(() => { setProvider(cap.provider); setOverlayProvider(cap.overlayProvider); setPerFunction(cap.actionProviders ?? {}); setKeys(allKeys()); }, [capKey]);
  const info = (id: string) => CAPTURE_PROVIDERS.find((p) => p.id === id)!;
  const main = info(provider);
  const programOf = (a: CaptureFunction) => providerFor(provider, perFunction, a);

  // Keys needed for the current choice, grouped by program (OBS needs none).
  const needed = new Map<string, CaptureAction[]>();
  for (const a of FUNCTIONS) { const p = programOf(a); if (p !== "obs" && info(p).actions.includes(a)) needed.set(p, [...(needed.get(p) ?? []), a]); }
  if (overlayProvider !== "own") needed.set(overlayProvider, [...(needed.get(overlayProvider) ?? []), "overlay"]);

  const save = async () => {
    // Back to the factory default when the field shows it (null), explicitly none when emptied ("").
    const diff: Record<string, string | null> = {};
    for (const [p, actions] of needed) for (const a of actions) { const v = (keys[`${p}.${a}`] ?? "").trim(); diff[`${p}.${a}`] = v === (info(p).defaults[a] ?? "") ? null : v; }
    const fn: Record<string, string | null> = Object.fromEntries(FUNCTIONS.map((a) => [a, perFunction[a] && perFunction[a] !== provider ? perFunction[a] : null]));
    try {
      await client.call("capture.configure", { provider, overlayProvider, keys: diff, actionProviders: fn });
      toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const saved = JSON.stringify([provider, perFunction]) === JSON.stringify([cap.provider, cap.actionProviders ?? {}]);

  return (
    <Card title={t("Aufnahme-Programm")} icon={<Clapperboard size={18} />}>
      <div className="stack-sm">
        <div className="chips" role="group" aria-label={t("Aufnahme-Programm")}>
          {CAPTURE_PROVIDERS.map((p) => <button key={p.id} type="button" className={`chip ${provider === p.id ? "on" : ""}`} aria-pressed={provider === p.id} disabled={!canManage} onClick={() => setProvider(p.id)}>{p.name}</button>)}
        </div>
        <p className="small muted">{t(main.note)}</p>
        <details open={Object.keys(perFunction).length > 0}>
          <summary className="small">{t("Pro Funktion ein anderes Programm (z. B. Aufnahme mit OBS, Replays als Discord-Clip)")}</summary>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            {FUNCTIONS.map((a) => (
              <Field key={a} label={actionLabel(a)}>
                <select className="input" value={perFunction[a] ?? ""} disabled={!canManage} aria-label={t("Programm für {a}", { a: actionLabel(a) })}
                  onChange={(e) => { const n = { ...perFunction }; if (e.target.value) n[a] = e.target.value; else delete n[a]; setPerFunction(n); }}>
                  <option value="">{t("Wie Hauptprogramm ({p})", { p: main.actions.includes(a) ? main.name : t("{p} kann das nicht", { p: main.name }) })}</option>
                  {CAPTURE_PROVIDERS.filter((p) => p.actions.includes(a)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </details>
        {[...needed.keys()].length > 0 && <Banner kind="info">{t("{p} hat keine Schnittstelle für andere Programme: Der Launcher drückt dessen Tastenkürzel für dich – vom Handy, aus dem Overlay oder per eigenem Hotkey (z. B. Maus-Seitentaste). Die Tasten müssen mit denen in {p} übereinstimmen.", { p: [...needed.keys()].map((p) => info(p).name).join(", ") })}</Banner>}
        {[...needed.entries()].map(([p, actions]) => actions.map((a) => {
          const k = `${p}.${a}`, d = info(p).defaults[a];
          return (
            <Field key={k} label={`${actionLabel(a)} – ${t("Taste in {p}", { p: info(p).name })}`} hint={d ? t("Werkseinstellung: {k}", { k: describeCombo(d, t) }) : t("Keine Werkseinstellung bekannt – so eintragen, wie in {p} eingestellt.", { p: info(p).name })}>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <div className="grow"><ComboInput value={keys[k] ?? ""} onChange={(v) => setKeys({ ...keys, [k]: v })} label={`${actionLabel(a)} – ${info(p).name}`} placeholder={t("nicht belegt")} /></div>
                {d && keys[k] !== d && <Button size="sm" variant="ghost" onClick={() => setKeys({ ...keys, [k]: d })}>{t("Standard")}</Button>}
              </div>
            </Field>
          );
        }))}
        <Field label={t("Großes Overlay (Tastenkürzel „Overlay öffnen“)")}>
          <select className="input" value={overlayProvider} disabled={!canManage} onChange={(e) => setOverlayProvider(e.target.value)}>
            <option value="own">{t("Eigenes Overlay des Launchers (Plugin-Widgets)")}</option>
            {CAPTURE_PROVIDERS.filter((p) => p.actions.includes("overlay")).map((p) => <option key={p.id} value={p.id}>{t("Overlay von {p}", { p: p.name })} ({describeCombo(effectiveKey(cap.keys, p.id, "overlay") ?? "–", t)})</option>)}
          </select>
        </Field>
        <div className="row">
          <Button variant="primary" icon={<Save size={16} />} disabled={!canManage} onClick={save}>{t("Speichern")}</Button>
          {online && saved && FUNCTIONS.filter((a) => programOf(a) !== "obs" && info(programOf(a)).actions.includes(a)).map((a) => (
            <Button key={a} disabled={!canLaunch} onClick={() => run(a === "record" ? "capture.recordToggle" : a === "replay" ? "capture.replaySave" : "capture.replayToggle")}>{t("Jetzt: {a}", { a: actionLabel(a) })}</Button>
          ))}
        </div>
        {online && cap.canSendKeys === false && needed.size > 0 && <p className="tiny muted">{t("Tastenkürzel an andere Programme senden geht nur im Windows-Begleiter.")}</p>}
      </div>
    </Card>
  );
}

/** Which widgets the large overlay shows (positions are changed in the overlay itself by dragging). Works without the PC too. */
function OverlayWidgetPicker({ plugins, canManage, online }: { plugins?: PluginList; canManage: boolean; online: boolean }) {
  const q = useRpc<{ layout?: OverlayLayout }>("overlay.layout", {}, ["overlay"]);
  const layout = layoutOrDefault(q.data?.layout, overlayPluginWidgets(plugins));
  const all = [
    ...OVERLAY_BUILTINS.map((id) => ({ id: id as string, title: overlayBuiltinTitle(id) })),
    ...(plugins?.plugins ?? []).filter((p) => p.enabled && p.manifest?.platforms.includes("web"))
      .flatMap((p) => p.manifest!.contributes.widgets.map((w) => ({ id: pluginWidgetId(p.id, w.id), title: `${w.title} (${t("Plugin")})` }))),
  ];
  const save = (l: OverlayLayout | null) => client.call("overlay.saveLayout", { layout: l })
    .then(() => toast(online ? t("Gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"), (e: Error) => toast(e.message, "error"));
  return (
    <div className="stack-sm" style={{ marginBottom: 12 }}>
      <p className="small muted">{t("Widgets im großen Overlay (wie in der Xbox Game Bar): ankreuzen zum Hinzufügen. Verschieben und Größe ändern im Overlay selbst – am Titel ziehen bzw. an der Ecke unten rechts.")}</p>
      <div className="chips" role="group" aria-label={t("Overlay-Widgets")}>
        {all.map((w) => {
          const on = layout.widgets.some((x) => x.id === w.id);
          return <button key={w.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!canManage}
            onClick={() => save(on ? removeWidget(layout, w.id) : addWidget(layout, w.id))}>{on ? "✓ " : "+ "}{w.title}</button>;
        })}
      </div>
      <Field label={t("Deckkraft der Widgets: {p} %", { p: Math.round(layout.opacity * 100) })}>
        <input type="range" min={50} max={100} step={5} value={Math.round(layout.opacity * 100)} disabled={!canManage} aria-label={t("Deckkraft")}
          onChange={(e) => save({ ...layout, opacity: Number(e.target.value) / 100 })} />
      </Field>
      <div><Button size="sm" variant="ghost" disabled={!canManage || !q.data?.layout} onClick={() => save(null)}>{t("Anordnung zurücksetzen")}</Button></div>
    </div>
  );
}
