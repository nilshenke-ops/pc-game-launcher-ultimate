import { useState } from "react";
import { Check, Copy, Pencil, Plus, Undo2, X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { relTime } from "../lib/format";
import { ICONS, IconByName } from "../lib/nav";
import { BG_SCENES, usePrefs } from "../lib/prefs";
import type { Hotkey, Profile, ProfilesFile, QuickAction } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Field, Loadable, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { useStepRefs } from "../components/StepEditor";

const blank: Profile = { id: "", name: "", icon: "gamepad-2", color: "#22d3ee", gameIds: [], launchProgramIds: [], quickActionIds: [], hotkeyIds: [], quietNotifications: false };

export default function Profiles() {
  const q = useRpc<ProfilesFile>("profiles.list", {}, ["profiles"]);
  const canManage = useCan("manage");
  const [edit, setEdit] = useState<Profile | null>(null);
  const data = q.data;
  const activate = (p: Profile) => client.call("profiles.activate", { id: p.id }).then(() => toast(t("Profil „{n}“ aktiv", { n: p.name }), "success")).catch((e) => toast(e.message, "error"));
  const copy = (p: Profile) => client.call("profiles.copy", { id: p.id }).catch((e) => toast(e.message, "error"));
  const prev = data?.profiles.find((p) => p.id === data.previousProfileId);

  return (
    <>
      <PageHead eyebrow={t("Gaming")} title={t("Gaming-Profile")} text={t("Ein Profil bündelt Audio-Ausgabe, Soundboard-Sammlung, Programme, Quick Actions, Hotkeys und Dashboard-Layout.")}
        actions={<>
          {prev && <Button icon={<Undo2 size={16} />} onClick={() => client.call("profiles.revert").catch((e) => toast(e.message, "error"))}>{t("Zurück zu „{n}“", { n: prev.name })}</Button>}
          {canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit(structuredClone(blank))}>{t("Neues Profil")}</Button>}
        </>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {data && (
          <div className="stack">
            <Card className="flat">
              <Switch checked={data.autoSwitch} disabled={!canManage} onChange={(v) => client.call("profiles.save", { autoSwitch: v })}
                label={t("Automatischer Profilwechsel")} hint={t("Startet ein Spiel mit zugeordnetem Profil, wird das Profil aktiviert und beim Beenden zum vorherigen zurückgewechselt. Erkennung über Prozessname/Installationsordner.")} />
            </Card>
            <GameModeCard />
            <div className="grid-3">
              {data.profiles.map((p) => {
                const active = p.id === data.activeProfileId;
                return (
                  <Card key={p.id} className={`profile-card ${active ? "active" : ""}`} style={{ ["--pc" as string]: p.color }}>
                    <div className="row nowrap" style={{ marginBottom: 12 }}>
                      <div className="thumb" style={{ background: p.color, color: "#04121a" }}><IconByName name={p.icon} /></div>
                      <div className="grow"><h3 className="ellipsis">{p.name}</h3>{active && <div className="tiny muted">{data.activeReason} · {relTime(data.activeSince)}</div>}</div>
                      {active && <span className="badge ok"><Check size={12} />{t("Aktiv")}</span>}
                    </div>
                    <div className="row small muted" style={{ gap: 6 }}>
                      <span className="badge">{t("{n} Spiele", { n: p.gameIds.length })}</span>
                      <span className="badge">{t("{n} Programme", { n: p.launchProgramIds.length })}</span>
                      {p.soundboardVolume != null && <span className="badge">🔊 {p.soundboardVolume}%</span>}
                      {p.quietNotifications && <span className="badge">{t("Ruhig")}</span>}
                      {p.theme && <span className="badge"><span className="theme-swatch sm" aria-hidden style={{ background: p.theme.background }}><i style={{ background: p.theme.primary }} /></span>{t("Theme")}</span>}
                    </div>
                    <div className="card-foot">
                      <Button variant={active ? undefined : "primary"} size="sm" disabled={active} onClick={() => activate(p)}>{active ? t("Aktiv") : t("Aktivieren")}</Button>
                      {canManage && <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(structuredClone(p))}>{t("Bearbeiten")}</Button>}
                      {canManage && <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => copy(p)} aria-label={t("Kopieren")} />}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </Loadable>
      {edit && <ProfileEditor profile={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Multi({ options, value, onChange }: { options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return <span className="small muted">{t("Keine Einträge vorhanden")}</span>;
  return (
    <div className="chips" style={{ flexWrap: "wrap" }}>
      {options.map((o) => <button key={o.id} type="button" className={`chip ${value.includes(o.id) ? "on" : ""}`} onClick={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])}>{o.name}</button>)}
    </div>
  );
}

function ProfileEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [p, setP] = useState(profile);
  const refs = useStepRefs();
  const quick = useRpc<{ actions: QuickAction[] }>("quick.list");
  const hk = useRpc<{ hotkeys: { hotkey: Hotkey }[] }>("hotkeys.list");
  const prefs = usePrefs();
  const set = (x: Partial<Profile>) => setP((o) => ({ ...o, ...x }));
  const save = async () => {
    try { await client.call("profiles.save", { profile: p }); toast(t("Gespeichert"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Profil löschen?"), p.name, { danger: true, ok: t("Löschen") }))) return;
    try { await client.call("profiles.remove", { id: p.id }); onClose(); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal title={p.id ? t("Profil bearbeiten") : t("Neues Profil")} onClose={onClose} wide footer={<>
      {p.id && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!p.name.trim()} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="grid-2">
        <Field label={t("Name")}><input className="input" value={p.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t("Farbe")}><input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} /></Field>
      </div>
      <Field label={t("Icon")}><div className="icon-pick">{Object.entries(ICONS).map(([k, I]) => <button key={k} type="button" className={p.icon === k ? "on" : ""} onClick={() => set({ icon: k })} aria-label={k}><I size={19} /></button>)}</div></Field>
      <Field label={t("Zugeordnete Spiele (automatische Aktivierung)")}><Multi options={refs.items.filter((i) => i.kind === "game")} value={p.gameIds} onChange={(gameIds) => set({ gameIds })} /></Field>
      <Field label={t("Beim Aktivieren starten")} hint={t("Nur freigegebene Programme aus deiner Bibliothek.")}><Multi options={refs.items.filter((i) => i.kind === "program")} value={p.launchProgramIds} onChange={(launchProgramIds) => set({ launchProgramIds })} /></Field>
      <div className="grid-2">
        <Field label={t("Soundboard-Sammlung")}>
          <select className="input" value={p.soundCollectionId ?? ""} onChange={(e) => set({ soundCollectionId: e.target.value || null })}>
            <option value="">{t("Nicht ändern")}</option>
            {refs.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t("Soundboard-Ausgabe")}>
          <select className="input" value={p.audioOutputDeviceId ?? ""} onChange={(e) => set({ audioOutputDeviceId: e.target.value || null })}>
            <option value="">{t("Nicht ändern")}</option>
            {refs.outputs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label={p.soundboardVolume == null ? t("Soundboard-Lautstärke: nicht ändern") : t("Soundboard-Lautstärke: {v} %", { v: p.soundboardVolume })}>
          <div className="row nowrap">
            <input type="range" min={0} max={100} value={p.soundboardVolume ?? 80} onChange={(e) => set({ soundboardVolume: +e.target.value })} />
            {p.soundboardVolume != null && <Button size="sm" variant="ghost" onClick={() => set({ soundboardVolume: null })}>{t("Zurücksetzen")}</Button>}
          </div>
        </Field>
        <Field label={t("Dashboard-Layout")} hint={t("Layouts gehören zu jedem Gerät. Gespeichert wird der Name – auf anderen Geräten wird das Layout mit gleichem Namen genutzt, sonst bleibt deren Layout.")}>
          {/* Stored by name: layout ids differ per device, names can match across devices. Old profiles may still hold an id. */}
          <select className="input" value={prefs.layouts.find((l) => l.id === p.dashboardLayoutId)?.name ?? p.dashboardLayoutId ?? ""} onChange={(e) => set({ dashboardLayoutId: e.target.value || null })}>
            <option value="">{t("Nicht ändern")}</option>
            {p.dashboardLayoutId && !prefs.layouts.some((l) => l.id === p.dashboardLayoutId || l.name === p.dashboardLayoutId) && <option value={p.dashboardLayoutId}>{t("„{n}“ (auf diesem Gerät nicht vorhanden)", { n: p.dashboardLayoutId })}</option>}
            {[...new Set(prefs.layouts.map((l) => l.name))].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t("Quick Actions des Profils")}><Multi options={quick.data?.actions ?? []} value={p.quickActionIds} onChange={(quickActionIds) => set({ quickActionIds })} /></Field>
      <Field label={t("Hotkeys nur in diesem Profil aktiv")}><Multi options={(hk.data?.hotkeys ?? []).map((h) => ({ id: h.hotkey.id, name: h.hotkey.keys }))} value={p.hotkeyIds} onChange={(hotkeyIds) => set({ hotkeyIds })} /></Field>
      <Switch checked={p.quietNotifications} onChange={(quietNotifications) => set({ quietNotifications })} label={t("Benachrichtigungen reduzieren")} hint={t("Nur Warnungen und Fehler anzeigen, solange das Profil aktiv ist.")} />
      <Switch checked={!!p.theme} onChange={(v) => set({ theme: v ? { mode: prefs.theme.mode, primary: p.color, accent: prefs.theme.accent, background: prefs.theme.background, bgScene: null } : null })}
        label={t("Eigenes Theme für dieses Profil")} hint={t("Solange das Profil aktiv ist (z. B. automatisch beim Start eines zugeordneten Spiels), zeigen PC, Handy und iPad diese Farben. Danach kommt das eigene Design zurück. Auf jedem Gerät abschaltbar unter Einstellungen → Design.")} />
      {p.theme && (
        <div className="stack-sm" style={{ paddingLeft: 4 }}>
          <div className="row">
            <Segmented value={p.theme.mode} onChange={(mode) => set({ theme: { ...p.theme!, mode } })} label={t("Modus")} options={[{ value: "dark", label: t("Dunkel") }, { value: "light", label: t("Hell") }]} />
            <label className="row nowrap small">{t("Hauptfarbe")} <input type="color" value={p.theme.primary} onChange={(e) => set({ theme: { ...p.theme!, primary: e.target.value } })} /></label>
            <label className="row nowrap small">{t("Akzent")} <input type="color" value={p.theme.accent} onChange={(e) => set({ theme: { ...p.theme!, accent: e.target.value } })} /></label>
            <label className="row nowrap small">{t("Hintergrund")} <input type="color" value={p.theme.background} onChange={(e) => set({ theme: { ...p.theme!, background: e.target.value } })} /></label>
          </div>
          <div className="row">
            <select className="input" style={{ width: "auto" }} value={p.theme.bgScene ?? ""} onChange={(e) => set({ theme: { ...p.theme!, bgScene: e.target.value || null } })} aria-label={t("Hintergrundbild")}>
              <option value="">{t("Hintergrundbild: nicht ändern")}</option>
              {BG_SCENES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <Button size="sm" onClick={() => set({ theme: { mode: prefs.theme.mode, primary: prefs.theme.primary, accent: prefs.theme.accent, background: prefs.theme.background, bgScene: prefs.theme.bgScene ?? null } })}>{t("Aktuelles Design übernehmen")}</Button>
            <span className="theme-swatch" aria-hidden style={{ background: p.theme.background, borderColor: p.theme.accent }}><i style={{ background: p.theme.primary }} /><i style={{ background: p.theme.accent }} /></span>
          </div>
        </div>
      )}
      <Banner kind="info">{t("Profile ändern nur Einstellungen dieser App – keine Windows-Systemeinstellungen.")}</Banner>
    </Modal>
  );
}

type GameModeState = {
  enabled: boolean; restore: boolean; supported: boolean; waitingToReopen: number;
  programs: { name: string; label?: string | null }[];
  preview: { name: string; label?: string | null; running: number; protectedAsGame: boolean }[];
};

/** Game mode for other programs: close chosen programs while gaming, reopen them afterwards. */
function GameModeCard() {
  const q = useRpc<GameModeState>("gamemode.get", {}, ["gamemode", "library"]);
  const canAdmin = useCan("admin");
  const [name, setName] = useState("");
  const [cands, setCands] = useState<string[] | null>(null);
  const d = q.data;
  if (!d) return null;
  const save = (p: Partial<Pick<GameModeState, "enabled" | "restore" | "programs">>) => client.call("gamemode.save", p).then(q.reload, (e: Error) => toast(e.message, "error"));
  const add = () => {
    const n = name.trim().replace(/\.exe$/i, "");
    if (!n) return;
    if (d.programs.some((p) => p.name.toLowerCase() === n.toLowerCase())) { setName(""); return; }
    save({ programs: [...d.programs, { name: n }] }).then(() => setName(""));
  };
  const loadCands = () => { if (cands == null && canAdmin) client.call<{ names: string[] }>("gamemode.candidates").then((r) => setCands(r.names), () => setCands([])); };
  return (
    <Card title={t("Spielmodus: Programme schließen")}>
      {!d.supported && <Banner kind="warn">{t("Nur mit dem Windows-Begleiter möglich – auf diesem PC läuft eine Version ohne Fenster-Steuerung.")}</Banner>}
      <Switch checked={d.enabled} disabled={!canAdmin} onChange={(v) => save({ enabled: v })} label={t("Beim Spielstart Programme schließen")}
        hint={t("Die Programme werden gebeten, sich zu schließen – wie ein Klick auf ihr X. Nichts wird hart beendet: Fragt ein Programm z. B. nach dem Speichern, bleibt es offen und du bekommst eine Meldung.")} />
      <Switch checked={d.restore} disabled={!canAdmin} onChange={(v) => save({ restore: v })} label={t("Nach dem Spiel wieder öffnen")}
        hint={t("Wenn das letzte Spiel endet, werden die geschlossenen Programme neu gestartet. Offene Tabs oder Dokumente stellt das Programm nur selbst wieder her, falls es das kann.")} />
      {d.waitingToReopen > 0 && <div className="small muted" style={{ marginTop: 8 }}>{t("{n} Programm(e) warten darauf, nach dem Spiel wieder geöffnet zu werden.", { n: d.waitingToReopen })}</div>}
      <div className="list" style={{ marginTop: 12 }}>
        {d.preview.length === 0 && <div className="small muted">{t("Noch keine Programme gewählt.")}</div>}
        {d.preview.map((p) => (
          <div key={p.name} className="list-item">
            <div className="grow">
              <div className="title">{p.label ?? p.name}</div>
              <div className="sub">{p.protectedAsGame ? t("Ist ein Spiel aus der Bibliothek – wird nie geschlossen") : p.running > 0 ? p.running === 1 ? t("läuft gerade – würde jetzt geschlossen") : t("läuft gerade ({n} Prozesse) – würde jetzt geschlossen", { n: p.running }) : t("läuft gerade nicht")}</div>
            </div>
            {canAdmin && <Button size="sm" variant="ghost" icon={<X size={15} />} aria-label={t("Entfernen")} onClick={() => save({ programs: d.programs.filter((x) => x.name !== p.name) })} />}
          </div>
        ))}
      </div>
      {canAdmin && (
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input grow" value={name} list="gm-cands" placeholder={t("Programmname, z. B. chrome oder Discord")} aria-label={t("Programm hinzufügen")}
            onFocus={loadCands} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} maxLength={80} />
          <datalist id="gm-cands">{(cands ?? []).map((c) => <option key={c} value={c} />)}</datalist>
          <Button icon={<Plus size={16} />} onClick={add} disabled={!name.trim() || d.programs.length >= 30}>{t("Hinzufügen")}</Button>
        </div>
      )}
      <div className="tiny muted" style={{ marginTop: 8 }}>{t("Windows, Spiele-Launcher (Steam, Epic …), Anti-Cheat und der Begleiter selbst lassen sich nicht eintragen. Programme ohne Fenster (nur im Infobereich) werden nicht geschlossen.")}</div>
    </Card>
  );
}
