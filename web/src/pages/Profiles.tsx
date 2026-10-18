import { useState } from "react";
import { Check, Copy, Pencil, Plus, Undo2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { relTime } from "../lib/format";
import { ICONS, IconByName } from "../lib/nav";
import { usePrefs } from "../lib/prefs";
import type { Hotkey, Profile, ProfilesFile, QuickAction } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";
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
      <Banner kind="info">{t("Profile ändern nur Einstellungen dieser App – keine Windows-Systemeinstellungen.")}</Banner>
    </Modal>
  );
}
