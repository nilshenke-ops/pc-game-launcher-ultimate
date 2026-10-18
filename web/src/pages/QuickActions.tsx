import { useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus, Zap } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useRpc, toast, useCan } from "../lib/hooks";
import { ICONS, IconByName } from "../lib/nav";
import type { QuickAction } from "../lib/types";
import { Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";
import { describeStep, StepEditor, stepsValid, useStepRefs } from "../components/StepEditor";

const blank: QuickAction = { id: "", name: "", icon: "zap", category: "", favorite: false, showOnDashboard: true, requireConfirm: false, steps: [{ type: "launchItem", ref: null }] };

import { runQuickAction } from "../components/run-quick";

export default function QuickActions() {
  const q = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  const refs = useStepRefs();
  const canManage = useCan("manage");
  const [edit, setEdit] = useState<QuickAction | null>(null);
  const [cat, setCat] = useState("__all");
  const actions = q.data?.actions ?? [];
  const cats = [...new Set(actions.map((a) => a.category).filter(Boolean))] as string[];
  const shown = actions.filter((a) => cat === "__all" || (cat === "__fav" ? a.favorite : a.category === cat));

  const move = (id: string, d: number) => {
    const ids = actions.map((a) => a.id);
    const i = ids.indexOf(id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    client.call("quick.reorder", { ids }).catch((e) => toast(e.message, "error"));
  };

  return (
    <>
      <PageHead eyebrow={t("Start")} title={t("Quick Actions")} text={t("Eigene Ein-Tipp-Aktionen: mehrere Schritte wie „Discord öffnen + Profil Streaming + Sound“ auf einmal.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEdit(structuredClone(blank))}>{t("Neue Aktion")}</Button>} />
      {cats.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {[["__all", t("Alle")], ["__fav", "★ " + t("Favoriten")], ...cats.map((c) => [c, c])].map(([k, l]) => <button key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>)}
        </div>
      )}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {actions.length === 0 ? (
          <Card><Empty icon={<Zap size={28} />} title={t("Noch keine Quick Actions")} text={t("Beispiel: „Abendrunde“ startet Discord, aktiviert das Profil Competitive und spielt einen Sound.")} action={canManage && <Button variant="primary" onClick={() => setEdit(structuredClone(blank))}>{t("Erste Aktion erstellen")}</Button>} /></Card>
        ) : (
          <div className="qa-grid">
            {shown.map((a) => (
              <div key={a.id} className="card qa-tile" role="button" tabIndex={0} onClick={() => runQuickAction(a)} onKeyDown={(e) => { if (e.key === "Enter") runQuickAction(a); }}>
                <div className="row nowrap" style={{ width: "100%" }}>
                  <span className="ico"><IconByName name={a.icon} /></span>
                  <span className="grow" />
                  {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={(e) => { e.stopPropagation(); setEdit(structuredClone(a)); }} aria-label={t("Bearbeiten")} />}
                </div>
                <b>{a.favorite ? "★ " : ""}{a.name}</b>
                <span className="small muted" style={{ lineHeight: 1.3 }}>{a.steps.map((s) => describeStep(s, refs)).join(" → ")}</span>
                {canManage && (
                  <div className="row nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => move(a.id, -1)} aria-label={t("Nach vorne")} />
                    <Button size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => move(a.id, 1)} aria-label={t("Nach hinten")} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Loadable>
      {edit && <QuickEditor action={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function QuickEditor({ action, onClose }: { action: QuickAction; onClose: () => void }) {
  const [a, setA] = useState(action);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<QuickAction>) => setA((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try { await client.call("quick.save", { ...a, category: a.category || null }); toast(t("Gespeichert"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Quick Action löschen?"), a.name, { danger: true, ok: t("Löschen") }))) return;
    await client.call("quick.remove", { id: a.id });
    onClose();
  };
  return (
    <Modal title={a.id ? t("Quick Action bearbeiten") : t("Neue Quick Action")} onClose={onClose} wide footer={<>
      {a.id && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" busy={busy} disabled={!a.name.trim() || !stepsValid(a.steps)} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="grid-2">
        <Field label={t("Name")}><input className="input" value={a.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder={t("z. B. Abendrunde")} /></Field>
        <Field label={t("Kategorie")}><input className="input" value={a.category ?? ""} maxLength={30} onChange={(e) => set({ category: e.target.value })} /></Field>
      </div>
      <Field label={t("Icon")}>
        <div className="icon-pick">{Object.entries(ICONS).map(([k, I]) => <button key={k} type="button" className={a.icon === k ? "on" : ""} onClick={() => set({ icon: k })} aria-label={k}><I size={19} /></button>)}</div>
      </Field>
      <Field label={t("Schritte (werden der Reihe nach ausgeführt)")}><StepEditor steps={a.steps} onChange={(steps) => set({ steps })} /></Field>
      <div className="grid-2">
        <Switch checked={a.favorite} onChange={(favorite) => set({ favorite })} label={t("Favorit")} />
        <Switch checked={a.showOnDashboard} onChange={(showOnDashboard) => set({ showOnDashboard })} label={t("Auf dem Dashboard zeigen")} />
        <Switch checked={a.requireConfirm} onChange={(requireConfirm) => set({ requireConfirm })} label={t("Vor dem Ausführen nachfragen")} hint={t("Empfohlen für Aktionen, die mehrere Programme starten.")} />
      </div>
    </Modal>
  );
}
