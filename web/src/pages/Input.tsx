import { useState } from "react";
import { Gamepad2, Keyboard, Mouse, Pause, Pencil, Play, Plus, Trash2, Usb, X } from "lucide-react";
import { Link } from "react-router-dom";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { clientId } from "../lib/quest-deal";
import type { LibraryItem } from "../lib/types";
import { buildTarget, describeTarget, KEYBOARD_ROWS, KEYBOARD_UNITS, keyCap, keyGroups, keyName, modLabel, MODIFIERS, type Modifier, MOUSE_BUTTONS, parseTarget } from "../lib/keys";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";

interface KeyMapping { from: string; to: string }
interface RemapProfile { id: string; name: string; enabled: boolean; processes: string[]; mappings: KeyMapping[]; updatedAt?: string }
interface InputList { profiles: RemapProfile[]; supported: boolean; paused: boolean; active: boolean; hookError?: string | null; maxMappings?: number }
interface InputDevices { supported: boolean; devices: { kind: string; name: string; manufacturer?: string | null; vid?: string | null; pid?: string | null; brand?: string | null }[] }

/** Key and mouse-button remapping on the PC (Royal Kludge, Attack Shark and every other keyboard/mouse), per game. */
export default function InputPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const canLaunch = useCan("launch");
  const q = useRpc<InputList>("input.list", {}, ["input"]);
  const [edit, setEdit] = useState<RemapProfile | null>(null);
  const d = q.data;
  const toggle = (p: RemapProfile, enabled: boolean) => client.call("input.setEnabled", { id: p.id, enabled }).catch((e: Error) => toast(e.message, "error"));
  const remove = async (p: RemapProfile) => {
    if (!(await confirmDialog(t("Profil löschen?"), p.name, { danger: true, ok: t("Löschen") }))) return;
    client.call("input.remove", { id: p.id }).catch((e: Error) => toast(e.message, "error"));
  };
  const pause = (paused: boolean) => client.call("input.pause", { paused }).catch((e: Error) => toast(e.message, "error"));
  const newProfile = () => setEdit({ id: clientId("rmp"), name: "", enabled: true, processes: [], mappings: [] });

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Tastatur & Maus belegen")}
        text={t("Leg Tasten und Maustasten am PC um – überall oder nur in bestimmten Spielen. Eine Taste wird zu einer anderen Taste, einer Tastenkombination, einer Maustaste oder wird gesperrt.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={newProfile}>{t("Neues Profil")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            {!d.supported && <Banner kind="info">{t("Die Belegung wirkt nur mit dem Windows-Begleiter. Profile kannst du hier trotzdem vorbereiten.")}</Banner>}
            {d.hookError && <Banner kind="error">{d.hookError}</Banner>}
            {d.supported && (
              <Card>
                <div className="row between" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{d.paused ? t("Pausiert – alle Tasten sind wieder normal") : d.active ? t("Aktiv") : t("Kein Profil eingeschaltet")}</b>
                    <div className="tiny muted">{t("Notaus am PC: Strg + Alt + F12 schaltet alle Belegungen sofort aus und wieder an.")}</div>
                  </div>
                  {canLaunch && d.active && <Button icon={d.paused ? <Play size={15} /> : <Pause size={15} />} disabled={!online} onClick={() => void pause(!d.paused)}>{d.paused ? t("Fortsetzen") : t("Pausieren")}</Button>}
                </div>
              </Card>
            )}
            {d.profiles.length === 0 ? (
              <Card><Empty icon={<Keyboard size={26} />} title={t("Noch keine Belegung")} text={t("Zum Beispiel: Caps Lock wird Strg, die Windows-Taste ist im Spiel gesperrt, die Seitentaste der Maus wird zu Push-to-Talk.")} /></Card>
            ) : (
              <div className="list">
                {d.profiles.map((p) => (
                  <div key={p.id} className="list-item">
                    <Switch checked={p.enabled} disabled={!canManage} onChange={(v) => void toggle(p, v)} label={<span className="sr-only">{p.enabled ? t("An") : t("Aus")}</span>} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{p.name}</div>
                      <div className="sub small ellipsis">{p.processes.length ? t("Nur in: {p}", { p: p.processes.join(", ") }) : t("Überall")} · {t("{n} Belegungen", { n: p.mappings.length })}</div>
                      {p.mappings.length > 0 && <div className="tiny muted ellipsis">{p.mappings.slice(0, 4).map((m) => `${keyName(m.from)} → ${describeTarget(m.to)}`).join(" · ")}{p.mappings.length > 4 ? " …" : ""}</div>}
                    </div>
                    {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("{n} bearbeiten", { n: p.name })} onClick={() => setEdit(p)} />}
                    {canManage && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Löschen")} onClick={() => void remove(p)} />}
                  </div>
                ))}
              </div>
            )}
            <Devices />
            <Card title={t("Controller")} icon={<Gamepad2 size={18} />}>
              <p className="small muted" style={{ margin: 0 }}>{t("Controller-Tasten lassen sich nur mit einem virtuellen Controller-Treiber umlegen – das macht Steam Input für jedes Spiel (Steam → Spiel → Controller-Layout). Testen kannst du deinen Controller unter")} <Link to="/peripherals">{t("Controller & RGB")}</Link>.</p>
            </Card>
            <p className="tiny muted">{t("Gut zu wissen: Die Belegung gilt für alle angeschlossenen Tastaturen und Mäuse gleichzeitig – Windows sagt dabei nicht, von welchem Gerät ein Tastendruck kommt. Spiele, die als Administrator laufen, sehen umgelegte Tasten nur, wenn der Begleiter auch als Administrator läuft. Manche Spiele mit Anti-Cheat ignorieren umgelegte Tasten. Makros (mehrere Tasten nacheinander, Wiederholungen) gibt es bewusst nicht.")}</p>
          </div>
        )}
      </Loadable>
      {edit && <ProfileEditor profile={edit} max={d?.maxMappings ?? 100} supported={!!d?.supported} onClose={() => setEdit(null)} />}
    </>
  );
}

function Devices() {
  const q = useRpc<InputDevices>("input.devices", {}, []);
  if (!q.data?.supported) return null;
  const list = q.data.devices;
  return (
    <Card title={t("Erkannte Geräte")} icon={<Usb size={18} />} actions={<Button size="sm" variant="ghost" onClick={q.reload}>{t("Neu suchen")}</Button>}>
      {list.length === 0 ? <p className="small muted">{t("Keine Tastatur oder Maus gefunden.")}</p> : (
        <div className="list">
          {list.map((x, i) => (
            <div key={i} className="list-item">
              {x.kind === "mouse" ? <Mouse size={18} className="muted" /> : <Keyboard size={18} className="muted" />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title small ellipsis">{x.name}</div>
                <div className="sub tiny">{[x.manufacturer, x.vid && x.pid ? `VID ${x.vid} · PID ${x.pid}` : null].filter(Boolean).join(" · ")}</div>
              </div>
              {x.brand && <span className="badge ok">{x.brand}</span>}
            </div>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 8 }}>{t("Royal Kludge und Attack Shark erkennt die App am Gerätenamen. Die Belegung funktioniert aber mit jedem Gerät. Was die Hersteller-Software direkt im Gerät speichert (z. B. Fn-Ebenen, DPI), bleibt davon unberührt.")}</p>
    </Card>
  );
}

function ProfileEditor({ profile, max, supported, onClose }: { profile: RemapProfile; max: number; supported: boolean; onClose: () => void }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, []);
  const [name, setName] = useState(profile.name);
  const [procs, setProcs] = useState<string[]>(profile.processes);
  const [procText, setProcText] = useState("");
  const [maps, setMaps] = useState<KeyMapping[]>(profile.mappings);
  const [selected, setSelected] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const games = (lib.data?.items ?? []).filter((i) => i.kind === "game" && i.processNames.length > 0);

  const pick = (key: string) => {
    if (key === "MouseLeft") { toast(t("Die linke Maustaste lässt sich nicht umlegen – sonst kommst du nicht mehr an die Einstellungen."), "error"); return; }
    if (!maps.some((m) => m.from === key)) {
      if (maps.length >= max) { toast(t("Höchstens {n} Belegungen pro Profil.", { n: max }), "error"); return; }
      setMaps([...maps, { from: key, to: "None" }]);
    }
    setSelected(key);
  };
  const capture = async () => {
    setCapturing(true);
    try { const r = await client.call<{ key: string; known: boolean }>("input.capture"); if (r.known) pick(r.key); else toast(t("Diese Taste kennt die App nicht."), "error"); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setCapturing(false); }
  };
  const setTo = (from: string, to: string) => setMaps(maps.map((m) => (m.from === from ? { ...m, to } : m)));
  const addProc = (p: string) => { const v = p.trim().replace(/\.exe$/i, ""); if (v && !procs.some((x) => x.toLowerCase() === v.toLowerCase())) setProcs([...procs, v].slice(0, 10)); };
  const save = async () => {
    if (!name.trim()) { toast(t("Bitte einen Namen eingeben."), "error"); return; }
    setBusy(true);
    try {
      await client.call("input.save", { id: profile.id, name: name.trim(), enabled: profile.enabled, processes: procs, mappings: maps });
      toast(online ? t("Gespeichert – gilt sofort") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success"); onClose();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const mapped = new Set(maps.map((m) => m.from));
  const sel = maps.find((m) => m.from === selected);

  return (
    <Modal wide title={profile.name ? t("Profil bearbeiten") : t("Neues Profil")} onClose={onClose}
      footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" busy={busy} onClick={save}>{t("Speichern")}</Button></>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" value={name} maxLength={40} autoFocus placeholder={t("z. B. Shooter oder Arbeit")} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="stack-xs">
          <b className="small">{t("Gilt für")}</b>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button type="button" className={`chip ${procs.length === 0 ? "on" : ""}`} onClick={() => setProcs([])}>{t("Überall")}</button>
            {procs.map((p) => <span key={p} className="chip on">{p}<button type="button" className="chip-x" aria-label={t("{n} entfernen", { n: p })} onClick={() => setProcs(procs.filter((x) => x !== p))}><X size={12} /></button></span>)}
          </div>
          {games.length > 0 && <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {games.filter((g) => !g.processNames.every((n) => procs.some((p) => p.toLowerCase() === n.replace(/\.exe$/i, "").toLowerCase()))).slice(0, 12).map((g) => (
              <button key={g.id} type="button" className="chip" onClick={() => g.processNames.forEach(addProc)}>+ {g.name}</button>
            ))}
          </div>}
          <form className="row nowrap" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); addProc(procText); setProcText(""); }}>
            <input className="input mono" value={procText} maxLength={80} placeholder={t("Programmname, z. B. cs2")} aria-label={t("Programmname")} onChange={(e) => setProcText(e.target.value)} />
            <Button type="submit" disabled={!procText.trim()}>{t("Hinzufügen")}</Button>
          </form>
        </div>

        <div className="stack-xs">
          <div className="row between"><b className="small">{t("Taste antippen, die du umlegen willst")}</b>
            {supported && <Button size="sm" busy={capturing} disabled={!online} onClick={() => void capture()} title={online ? undefined : t("Braucht den PC")}>{capturing ? t("Jetzt Taste am PC drücken …") : t("Am PC drücken")}</Button>}
          </div>
          <div className="kb-wrap">
            <div className="kb" role="group" aria-label={t("Tastatur")}>
              {KEYBOARD_ROWS.map((row, r) => (
                <div key={r} className="kb-row">
                  {row.map((k, i) => k.id ? (
                    <button key={i} type="button" className={`kb-key ${mapped.has(k.id) ? "mapped" : ""} ${selected === k.id ? "sel" : ""}`} style={{ width: `${((k.w ?? 1) / KEYBOARD_UNITS) * 100}%` }}
                      aria-label={keyName(k.id)} aria-pressed={selected === k.id} onClick={() => pick(k.id!)}>{keyCap(k.id)}</button>
                  ) : <span key={i} style={{ width: `${((k.w ?? 1) / KEYBOARD_UNITS) * 100}%` }} />)}
                </div>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Mouse size={16} className="muted" />
            {MOUSE_BUTTONS.filter((b) => b !== "MouseLeft").map((b) => <button key={b} type="button" className={`chip ${mapped.has(b) ? "on" : ""} ${selected === b ? "sel" : ""}`} onClick={() => pick(b)}>{keyName(b)}</button>)}
            <select className="input" style={{ maxWidth: 200 }} value="" aria-label={t("Weitere Taste")} onChange={(e) => e.target.value && pick(e.target.value)}>
              <option value="">{t("Weitere Taste …")}</option>
              {keyGroups().map((g) => <optgroup key={g.label} label={g.label}>{g.keys.filter((k) => k !== "MouseLeft").map((k) => <option key={k} value={k}>{keyName(k)}</option>)}</optgroup>)}
            </select>
          </div>
        </div>

        {sel && <TargetEditor m={sel} onChange={(to) => setTo(sel.from, to)} />}

        <div className="stack-xs">
          <b className="small">{t("Belegungen ({n})", { n: maps.length })}</b>
          {maps.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Noch keine – tippe oben eine Taste an.")}</p> : maps.map((m) => (
            <div key={m.from} className={`row nowrap remap-row ${selected === m.from ? "sel" : ""}`}>
              <button type="button" className="grow remap-desc" onClick={() => setSelected(m.from)}><b>{keyName(m.from)}</b> → {describeTarget(m.to)}</button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("{n} entfernen", { n: keyName(m.from) })} onClick={() => { setMaps(maps.filter((x) => x.from !== m.from)); if (selected === m.from) setSelected(null); }} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TargetEditor({ m, onChange }: { m: KeyMapping; onChange: (to: string) => void }) {
  const { mods, key } = parseTarget(m.to);
  const toggleMod = (x: Modifier) => onChange(buildTarget(mods.includes(x) ? mods.filter((y) => y !== x) : [...mods, x], key ?? "A"));
  return (
    <div className="remap-target">
      <b>{t("{k} wird zu:", { k: keyName(m.from) })}</b>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button type="button" className={`chip ${!key ? "on" : ""}`} onClick={() => onChange("None")}>{t("Aus (sperren)")}</button>
        <select className="input" style={{ maxWidth: 240 }} value={key ?? ""} aria-label={t("Neue Taste")} onChange={(e) => onChange(e.target.value ? buildTarget(mods, e.target.value) : "None")}>
          <option value="">{t("Taste wählen …")}</option>
          {keyGroups().map((g) => <optgroup key={g.label} label={g.label}>{g.keys.map((k) => <option key={k} value={k}>{keyName(k)}</option>)}</optgroup>)}
        </select>
      </div>
      {key && <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span className="tiny muted">{t("Dazu gedrückt halten:")}</span>
        {MODIFIERS.map((x) => <button key={x} type="button" className={`chip ${mods.includes(x) ? "on" : ""}`} aria-pressed={mods.includes(x)} onClick={() => toggleMod(x)}>{modLabel(x)}</button>)}
      </div>}
      <span className="small">{t("Ergebnis: {d}", { d: describeTarget(m.to) })}</span>
    </div>
  );
}
