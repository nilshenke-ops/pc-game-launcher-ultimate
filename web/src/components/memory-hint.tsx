// "Wo war ich noch mal?" right after starting a game: what you noted last time (only that – nothing is guessed).
// Shown once per start, stays until closed, and only when there is a note for this game.

import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Flag, History as HistoryIcon, MapPin, X } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { listKind, ready } from "../lib/journal";
import { memorySummary, type GameRef, type Memory } from "../lib/journal-logic";

let current: { game: GameRef; name: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showMemoryHint(game: GameRef, name: string) {
  void ready.then(() => {
    if (!memorySummary(listKind<Memory>("memory"), game)) return;
    current = { game, name }; emit();
  });
}
const close = () => { current = null; emit(); };

export function MemoryHint() {
  const h = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => current);
  if (!h) return null;
  const s = memorySummary(listKind<Memory>("memory"), h.game);
  if (!s) return null;
  return (
    <aside className="memory-hint fade-in" role="status" aria-label={t("Wo war ich noch mal?")}>
      <div className="row between nowrap">
        <b className="small"><HistoryIcon size={15} /> {t("Wo war ich noch mal? – {g}", { g: h.name })}</b>
        <button type="button" className="chip-x" aria-label={t("Schließen")} onClick={close}><X size={16} /></button>
      </div>
      <div className="tiny muted">{t("Deine Notiz vom {d}", { d: dateTime(s.lastAt) })}</div>
      <div className="small">{s.lastDid}</div>
      {s.where && <div className="small"><MapPin size={13} /> {s.where}</div>}
      {s.next && <div className="small"><Flag size={13} /> {t("Als Nächstes")}: {s.next}</div>}
      <div className="row" style={{ gap: 6 }}>
        <Link className="btn sm" to={`/journal?tab=memory&id=${s.latestId}`} onClick={close}>{t("Verlauf")}</Link>
        {h.game.gameId && <Link className="btn sm ghost" to={`/journal?tab=memory&new=${h.game.gameId}`} onClick={close}>{t("Neuer Eintrag")}</Link>}
      </div>
    </aside>
  );
}
