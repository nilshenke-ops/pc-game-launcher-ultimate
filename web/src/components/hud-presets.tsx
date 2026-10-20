// Several HUD arrangements of the large overlay (e.g. "Ranked", "Streaming", "Entspannt"): saved on the PC, put on the
// overlay with one tap. Without the PC the change waits in the queue like the overlay arrangement itself.
import { useState } from "react";
import { Check, LayoutTemplate, Save, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useRpc } from "../lib/hooks";
import type { OverlayLayout } from "../lib/overlay-layout";
import { Button, confirmDialog } from "./ui";

export interface HudPreset { id: string; name: string; layout: OverlayLayout }

/** Small drawing of where the widgets sit on a 16:9 screen. */
function Mini({ layout }: { layout: OverlayLayout }) {
  return (
    <span className="hud-mini" aria-hidden>
      {layout.widgets.filter((w) => w.visible).map((w) => <i key={w.id} style={{ left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${(w.w / 1920) * 100}%`, height: `${((w.h || 340) / 1080) * 100}%` }} />)}
    </span>
  );
}

const same = (a: OverlayLayout, b: OverlayLayout) => JSON.stringify(a.widgets.map((w) => [w.id, w.visible, w.x, w.y, w.w, w.h])) === JSON.stringify(b.widgets.map((w) => [w.id, w.visible, w.x, w.y, w.w, w.h])) && a.opacity === b.opacity;

export function HudPresets({ current, canManage, online }: { current: OverlayLayout; canManage: boolean; online: boolean }) {
  const q = useRpc<{ presets: HudPreset[] }>("overlay.presets", {}, ["overlay"]);
  const [name, setName] = useState("");
  const presets = q.data?.presets ?? [];
  const done = (msg: string) => toast(online ? msg : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");
  const fail = (e: Error) => toast(e.message, "error");
  const save = (id: string, n: string) => client.call("overlay.savePreset", { id, name: n, layout: current }).then(() => { done(t("HUD-Layout gespeichert")); q.reload(); setName(""); }, fail);
  return (
    <div className="stack-sm">
      <b className="small"><LayoutTemplate size={14} style={{ verticalAlign: -2 }} /> {t("HUD-Layouts")}</b>
      <p className="tiny muted" style={{ margin: 0 }}>{t("Speichere die aktuelle Anordnung unter einem Namen (z. B. „Ranked“ oder „Streaming“) und wechsle später mit einem Tipp. Bis zu 10.")}</p>
      {presets.length > 0 && (
        <div className="hud-list">
          {presets.map((p) => {
            const active = same(p.layout, current);
            return (
              <div key={p.id} className={`hud-item ${active ? "on" : ""}`}>
                <Mini layout={p.layout} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="small ellipsis">{p.name}</b>
                  <div className="tiny muted">{t("{n} Widgets", { n: p.layout.widgets.filter((w) => w.visible).length })}{active ? " · " + t("aktiv") : ""}</div>
                </div>
                <Button size="sm" variant={active ? undefined : "primary"} icon={<Check size={14} />} disabled={!canManage || active}
                  onClick={() => client.call("overlay.applyPreset", { id: p.id }).then(() => done(t("„{n}“ ist jetzt im Overlay", { n: p.name })), fail)}>{t("Anwenden")}</Button>
                <Button size="sm" variant="ghost" icon={<Save size={14} />} aria-label={t("„{n}“ mit der aktuellen Anordnung überschreiben", { n: p.name })} disabled={!canManage || active} onClick={() => save(p.id, p.name)} />
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("„{n}“ löschen", { n: p.name })} disabled={!canManage}
                  onClick={async () => { if (await confirmDialog(t("HUD-Layout löschen?"), t("„{n}“ wird gelöscht. Das Overlay bleibt, wie es ist.", { n: p.name }), { danger: true, ok: t("Löschen") })) client.call("overlay.removePreset", { id: p.id }).then(() => q.reload(), fail); }} />
              </div>
            );
          })}
        </div>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save("hud_" + Date.now().toString(36), name.trim()); }}>
        <input className="input grow" value={name} maxLength={40} placeholder={t("Name, z. B. Ranked")} aria-label={t("Name des HUD-Layouts")} disabled={!canManage || presets.length >= 10} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" icon={<Save size={15} />} disabled={!canManage || !name.trim() || presets.length >= 10}>{t("Aktuelle Anordnung speichern")}</Button>
      </form>
    </div>
  );
}
