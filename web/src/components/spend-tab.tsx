// Spiele-Journal → Ausgaben: what you told JARVIS you spent on games – only your own entries, no shop account is read.
// Kept on this device and compared through the PC like the other journal entries.

import { useMemo, useState } from "react";
import { Euro, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { newId, removeEntry, saveEntry, useJournal } from "../lib/journal";
import { SPEND_KIND, type Spend } from "../lib/gaming-intel";
import { Button, Card, confirmDialog, Empty, Field } from "./ui";

const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function SpendTab({ focus }: { focus: string | null }) {
  const list = useJournal<Spend>(SPEND_KIND);
  const [amount, setAmount] = useState("");
  const [game, setGame] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const value = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && isFinite(value) && value > 0 && value < 100000;
  const add = () => {
    if (!valid) return;
    saveEntry<Spend>(SPEND_KIND, newId(), { amount: Math.round(value * 100) / 100, game: game.trim() || null, at: new Date(date + "T12:00:00").toISOString() });
    setAmount(""); setGame("");
  };
  const months = useMemo(() => {
    const m = new Map<string, { label: string; total: number; items: typeof list }>();
    for (const e of [...list].sort((a, b) => b.data.at.localeCompare(a.data.at))) {
      const d = new Date(e.data.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const g = m.get(key) ?? { label: d.toLocaleDateString("de-DE", { month: "long", year: "numeric" }), total: 0, items: [] };
      g.total += e.data.amount; g.items.push(e); m.set(key, g);
    }
    return [...m.values()];
  }, [list]);
  return (
    <div className="stack">
      <Card title={t("Ausgaben für Spiele")} icon={<Euro size={18} />}>
        <div className="stack-sm">
          <p className="small muted" style={{ margin: 0 }}>{t("Sag JARVIS z. B. „Ich habe 19,99 € für Hades ausgegeben“ oder trag es hier ein. Gerechnet wird nur mit deinen Angaben – Shop-Konten werden nicht ausgelesen.")}</p>
          <div className="grid-3">
            <Field label={t("Betrag in €")}><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="19,99" /></Field>
            <Field label={t("Spiel (optional)")}><input className="input" value={game} maxLength={100} onChange={(e) => setGame(e.target.value)} /></Field>
            <Field label={t("Datum")}><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div><Button variant="primary" disabled={!valid} onClick={add}>{t("Eintragen")}</Button></div>
        </div>
      </Card>
      {months.length === 0 ? <Empty icon={<Euro size={26} />} title={t("Noch keine Ausgaben")} text={t("Einträge erscheinen hier – du kannst jeden wieder löschen.")} />
        : months.map((m) => (
          <Card key={m.label} title={`${m.label} · ${euro(m.total)}`}>
            <div className="stack-sm">
              {m.items.map((e) => (
                <div key={e.id} className={"row" + (focus === e.id ? " glow" : "")} style={{ justifyContent: "space-between", gap: 8 }}>
                  <span>{new Date(e.data.at).toLocaleDateString("de-DE")} · <b>{euro(e.data.amount)}</b>{e.data.game ? ` · ${e.data.game}` : ""}</span>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={t("Ausgabe vom {d} löschen", { d: new Date(e.data.at).toLocaleDateString("de-DE") })}
                    onClick={async () => { if (await confirmDialog(t("Eintrag löschen?"), t("Der Eintrag wird auf diesem Gerät und beim nächsten Abgleich auf dem PC gelöscht."), { danger: true, ok: t("Löschen") })) removeEntry(e.id); }} />
                </div>
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
