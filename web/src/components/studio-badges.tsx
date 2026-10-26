// F7 website badges: built-in and own badges, earned only while the saved data really meets the condition.

import { useEffect, useMemo, useState } from "react";
import { Award, BookHeart, Camera, Flame, Frame, Gem, Grid3x3, Hammer, IdCard, Images, Landmark, Layers, Lock, NotebookPen, PanelTop, Plus, Star, Trash2, Trophy, Users, type LucideIcon } from "lucide-react";
import { t } from "../lib/i18n";
import { allEntries, getEntry, newId, useJournal, useJournalVersion } from "../lib/journal";
import { BADGES, COUNTERS, countAll, evaluate, sanitizeCustomBadge, TIER_COLOR, type BadgeDef, type BadgeTier, type Counter } from "../lib/badges";
import { dateTime } from "../lib/format";
import { removeWithLinks } from "./collection-view";
import { trySave } from "./journal-ui";
import { Button, confirmDialog, Field, Meter, Modal, Segmented } from "./ui";

export const BADGE_ICONS: Record<string, LucideIcon> = { Images, Hammer, NotebookPen, Grid3x3, IdCard, Layers, Frame, PanelTop, Landmark, Camera, BookHeart, Users, Award, Star, Trophy, Flame, Gem };
const DATES_ID = "j_badgedates";
const TIERS: BadgeTier[] = ["bronze", "silver", "gold", "diamond"];
const TIER_LABEL: Record<BadgeTier, string> = { bronze: "Bronze", silver: "Silber", gold: "Gold", diamond: "Diamant" };

export function BadgesView() {
  const v = useJournalVersion();
  const custom = useJournal<Record<string, unknown>>("badgegoal");
  const [make, setMake] = useState(false);
  const [show, setShow] = useState<"all" | "earned" | "open">("all");
  const defs = useMemo(() => [...BADGES, ...custom.map((c) => sanitizeCustomBadge(c.data, c.id)).filter((x): x is BadgeDef => !!x)], [custom]);
  const counts = useMemo(() => countAll(allEntries()), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const dates = (getEntry<Record<string, string>>(DATES_ID)?.data ?? {}) as Record<string, string>;
  const { states, newDates } = evaluate(defs, counts, dates);
  // Remember when a condition was first met (shown only; earning always comes from the data).
  useEffect(() => { if (Object.keys(newDates).length) trySave("badgedates", DATES_ID, { ...dates, ...newDates }); }, [JSON.stringify(newDates)]); // eslint-disable-line react-hooks/exhaustive-deps
  const earned = states.filter((s) => s.earned).length;
  const shown = states.filter((s) => show === "all" || (show === "earned" ? s.earned : !s.earned));
  return (
    <div className="stack">
      <p className="small muted">{t("Abzeichen für das, was du hier wirklich angelegt hast – gezählt aus deinen gespeicherten Einträgen. Löschst du die Einträge, ist auch das Abzeichen wieder offen. Die Stufen sind nur Optik.")}</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <b>{t("{a} von {b} Abzeichen", { a: earned, b: states.length })}</b>
        <span className="grow" />
        <Segmented value={show} onChange={setShow} label={t("Anzeigen")} options={[{ value: "all", label: t("Alle") }, { value: "earned", label: t("Erreicht") }, { value: "open", label: t("Offen") }]} />
        <Button icon={<Plus size={15} />} onClick={() => setMake(true)}>{t("Eigenes Abzeichen")}</Button>
      </div>
      <div className="studio-badges">
        {shown.map((s) => {
          const Icon = BADGE_ICONS[s.def.icon] ?? Award;
          return (
            <div key={s.def.id} className={`studio-badge ${s.earned ? "earned" : ""}`} style={{ ["--tier" as string]: TIER_COLOR[s.def.tier] }}>
              <div className="studio-badge-icon">{s.earned ? <Icon size={28} /> : <Lock size={24} />}</div>
              <div className="grow">
                <div className="row between" style={{ gap: 6 }}><b>{t(s.def.name)}</b><span className="tiny muted">{t(TIER_LABEL[s.def.tier])}{s.def.custom ? " · " + t("eigenes") : ""}</span></div>
                <div className="small muted">{t(s.def.description)}</div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <div className="grow"><Meter value={Math.min(s.have, s.def.need)} max={s.def.need} /></div>
                  <span className="tiny">{Math.min(s.have, s.def.need)} / {s.def.need}</span>
                </div>
                <div className="tiny muted">{t("Zählt: {c}", { c: t(COUNTERS[s.def.counter].label) })}{s.earned && s.since ? " · " + t("erreicht seit {d}", { d: dateTime(s.since) }) : ""}</div>
              </div>
              {s.def.custom && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Entfernen")} onClick={async () => { if (await confirmDialog(t("Eigenes Abzeichen entfernen?"), t(s.def.name), { danger: true })) removeWithLinks(s.def.id); }} />}
            </div>
          );
        })}
      </div>
      {make && <MakeBadge onClose={() => setMake(false)} />}
    </div>
  );
}

function MakeBadge({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [counter, setCounter] = useState<Counter>("photos");
  const [need, setNeed] = useState(10);
  const [icon, setIcon] = useState("Star");
  const [tier, setTier] = useState<BadgeTier>("silver");
  const def = sanitizeCustomBadge({ name, counter, need, icon, tier }, "preview");
  const save = () => { if (def && trySave("badgegoal", newId(), { name, counter, need, icon, tier })) onClose(); };
  return (
    <Modal title={t("Eigenes Abzeichen")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!def} onClick={save}>{t("Anlegen")}</Button></>}>
      <div className="stack-sm">
        <Field label={t("Name")}><input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("z. B. Foto-Profi")} /></Field>
        <Field label={t("Was gezählt wird")} hint={t("Nur echte Einträge zählen – ein Abzeichen lässt sich nicht von Hand abhaken.")}>
          <select className="input" value={counter} onChange={(e) => setCounter(e.target.value as Counter)}>{(Object.keys(COUNTERS) as Counter[]).map((c) => <option key={c} value={c}>{t(COUNTERS[c].label)}</option>)}</select>
        </Field>
        <Field label={t("Ziel (Anzahl)")}><input className="input" type="number" min={1} max={10000} value={need} onChange={(e) => setNeed(+e.target.value)} style={{ width: 120 }} /></Field>
        <Field label={t("Symbol")}>
          <div className="chips">{Object.entries(BADGE_ICONS).map(([k, I]) => <button key={k} type="button" className={`chip ${icon === k ? "on" : ""}`} onClick={() => setIcon(k)} aria-label={k}><I size={16} /></button>)}</div>
        </Field>
        <Segmented value={tier} onChange={setTier} label={t("Stufe (nur Optik)")} options={TIERS.map((x) => ({ value: x, label: t(TIER_LABEL[x]) }))} />
      </div>
    </Modal>
  );
}
