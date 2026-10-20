// Collection & progress (trophy room tab): progress tree, reward boxes and the collectible shelf.
// Launcher collectibles are cosmetic and clearly kept apart from the achievements from your real game data.
import { useState, useSyncExternalStore } from "react";
import { Check, Gift, Lock, Sparkles, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import {
  boxesEarned, boxesLeft, boxRemaining, collectible, COLLECTIBLES, getRoom, openBox, openNodes, owned, RARITY_COLOR, RARITY_NAME, ROOM_STYLES, setRoom, SHELF_SLOTS,
  subscribeRoom, TREE, type Progress,
} from "../lib/room";
import { Banner, Button, Card, Modal } from "./ui";

const BRANCH = { level: { title: "Level", unit: "Level {n}" }, trophies: { title: "Trophäen", unit: "{n} Trophäen" }, hours: { title: "Spielzeit", unit: "{n} Stunden" } } as const;

function Item({ id, small }: { id: string; small?: boolean }) {
  const c = collectible(id);
  if (!c) return null;
  return (
    <span className={`coll-item ${small ? "small" : ""}`} style={{ ["--rar" as string]: RARITY_COLOR[c.rarity] }}>
      <span className="coll-emoji" aria-hidden>{c.emoji}</span>
      <span className="coll-name">{t(c.name)}</span>
      <span className="coll-rar">{t(RARITY_NAME[c.rarity])}</span>
    </span>
  );
}

export function CollectionTab({ progress }: { progress: Progress }) {
  const room = useSyncExternalStore(subscribeRoom, getRoom);
  const open = openNodes(progress);
  const mine = owned(progress, room);
  const left = boxesLeft(progress, room);
  const pool = boxRemaining(room);
  const [won, setWon] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [sel, setSel] = useState<{ from: "slot"; i: number } | { from: "item"; id: string } | null>(null);

  const placeAt = (i: number) => {
    const shelf = [...room.shelf];
    if (sel?.from === "item") { const old = shelf.indexOf(sel.id); if (old >= 0) shelf[old] = null; shelf[i] = sel.id; }
    else if (sel?.from === "slot") { [shelf[i], shelf[sel.i]] = [shelf[sel.i], shelf[i]]; }
    else { if (shelf[i]) setSel({ from: "slot", i }); return; }
    setRoom({ ...room, shelf }); setSel(null);
  };

  return (
    <div className="stack">
      <Banner kind="info">{t("Sammelstücke sind nur Deko für Raum und Regal – ohne Echtgeld, ohne Vorteile, ohne Zeitdruck. Du bekommst sie fürs Spielen: aus dem Fortschrittsbaum und einer Belohnungskiste pro erreichtem Level. Sie sind getrennt von den Erfolgen aus deinen echten Spieldaten.")}</Banner>

      <Card title={t("Fortschrittsbaum")} icon={<Sparkles size={18} />}>
        <div className="tree">
          {(["level", "trophies", "hours"] as const).map((b) => (
            <div key={b} className="tree-branch">
              <b className="small">{t(BRANCH[b].title)} <span className="muted">· {t("jetzt: {n}", { n: progress[b] })}</span></b>
              {TREE.filter((n) => n.branch === b).map((n) => {
                const on = open.has(n.id);
                const style = n.reward.style ? ROOM_STYLES.find((s) => s.id === n.reward.style) : null;
                return (
                  <div key={n.id} className={`tree-node ${on ? "on" : ""}`}>
                    <span className="tree-dot" aria-hidden>{on ? <Check size={14} /> : <Lock size={12} />}</span>
                    <div className="stack-xs" style={{ minWidth: 0 }}>
                      <span className="small"><b>{t(BRANCH[b].unit, { n: n.need })}</b> {on ? <span className="badge ok">{t("Freigeschaltet")}</span> : <span className="tiny muted">{t("noch {n}", { n: Math.max(0, n.need - progress[b]) })}</span>}</span>
                      <span className="tiny">
                        {n.reward.collectible && <>{collectible(n.reward.collectible)!.emoji} {t(collectible(n.reward.collectible)!.name)}</>}
                        {n.reward.collectible && style && " · "}
                        {style && <>{t("Raum-Stil „{s}“", { s: t(style.name) })}</>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("Belohnungskisten")} icon={<Gift size={18} />}>
        <div className="stack-sm">
          <p className="small" style={{ margin: 0 }}>{t("Eine Kiste pro erreichtem Level ab Level 2 – verdient: {e}, geöffnet: {o}, offen: {l}.", { e: boxesEarned(progress), o: room.fromBoxes.length, l: left })}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" icon={<Gift size={15} />} disabled={left <= 0 || !pool.length} onClick={() => setPreview(true)}>{t("Kiste ansehen und öffnen")}</Button>
            {!pool.length && <span className="small muted">{t("Alles aus den Kisten gesammelt.")}</span>}
            {pool.length > 0 && left <= 0 && <span className="small muted">{t("Nächste Kiste mit Level {n}.", { n: progress.level + 1 })}</span>}
          </div>
        </div>
      </Card>

      <Card title={t("Regal: Launcher-Sammelstücke")} meta={<span className="badge">{t("kosmetisch")}</span>}>
        <div className="stack-sm">
          <div className="coll-shelf" role="grid" aria-label={t("Regal")}>
            {Array.from({ length: SHELF_SLOTS }, (_, i) => {
              const id = room.shelf[i] && mine.includes(room.shelf[i]!) ? room.shelf[i]! : null;
              const active = sel?.from === "slot" && sel.i === i;
              return (
                <button key={i} type="button" className={`coll-slot ${active ? "sel" : ""} ${id ? "full" : ""}`} aria-label={id ? t("Platz {n}: {c}", { n: i + 1, c: t(collectible(id)!.name) }) : t("Platz {n}: leer", { n: i + 1 })}
                  onClick={() => (active ? setSel(null) : placeAt(i))}>{id ? <span aria-hidden>{collectible(id)!.emoji}</span> : null}</button>
              );
            })}
          </div>
          {sel?.from === "slot" && room.shelf[sel.i] && (
            <div className="row" style={{ gap: 8 }}>
              <span className="small">{t("Jetzt einen anderen Platz antippen zum Verschieben.")}</span>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => { const shelf = [...room.shelf]; shelf[sel.i] = null; setRoom({ ...room, shelf }); setSel(null); }}>{t("Vom Regal nehmen")}</Button>
            </div>
          )}
          {sel?.from === "item" && <span className="small">{t("Jetzt einen Platz im Regal antippen.")}</span>}
          <span className="small"><b>{t("Deine Sammelstücke ({n} von {m})", { n: mine.length, m: COLLECTIBLES.length })}</b></span>
          {mine.length === 0 ? <span className="tiny muted">{t("Noch keine – das erste gibt es mit Level 1 im Fortschrittsbaum.")}</span> : (
            <div className="coll-list">
              {mine.map((id) => (
                <button key={id} type="button" className={`coll-pick ${sel?.from === "item" && sel.id === id ? "sel" : ""}`} aria-pressed={sel?.from === "item" && sel.id === id} onClick={() => setSel(sel?.from === "item" && sel.id === id ? null : { from: "item", id })}>
                  <Item id={id} small />{room.shelf.includes(id) && <span className="tiny muted">{t("im Regal")}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {preview && (
        <Modal title={t("Belohnungskiste")} onClose={() => setPreview(false)}>
          <div className="stack-sm">
            <p className="small" style={{ margin: 0 }}>{t("Darin ist genau eines dieser {n} Sammelstücke – jedes gleich wahrscheinlich (1 zu {n}). Du bekommst nie etwas doppelt. Kostenlos, nur Deko.", { n: pool.length })}</p>
            <div className="coll-list">{pool.map((id) => <Item key={id} id={id} small />)}</div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setPreview(false)}>{t("Später")}</Button>
              <Button variant="primary" icon={<Gift size={15} />} onClick={() => { const r = openBox(progress, room); if (r) { setRoom(r.state); setWon(r.item); } setPreview(false); }}>{t("Öffnen")}</Button>
            </div>
          </div>
        </Modal>
      )}
      {won && (
        <Modal title={t("Neu in deiner Sammlung")} onClose={() => setWon(null)}>
          <div className="coll-won"><Item id={won} /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}><Button variant="primary" onClick={() => setWon(null)}>{t("Super")}</Button></div>
        </Modal>
      )}
    </div>
  );
}
