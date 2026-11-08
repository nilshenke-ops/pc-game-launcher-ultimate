// The folder of JARVIS MEMORY and its rules – set up in the account, so it can already be chosen on a phone without the
// PC and is handed to the PC as soon as it is connected. The notes themselves stay on the PC.
import { useState } from "react";
import { Brain, Save } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { Button, Card, Field, Switch } from "./ui";
import { memorySettings, setMemorySettings, type MemorySettings } from "../lib/memory-config";

const AUTO = [{ value: "off", label: "Nur was ich sage" }, { value: "suggest", label: "JARVIS fragt („Merk dir das“)" }, { value: "auto", label: "Klares gleich speichern" }] as const;

export function MemorySettingsCard({ pcPath, online, isPc, canAdmin, onChanged }: {
  /** Folder the PC reports right now (null while the PC is not reachable). */
  pcPath: string | null; online: boolean; isPc: boolean; canAdmin: boolean; onChanged: () => void;
}) {
  const [cfg, setCfg] = useState<MemorySettings>(() => memorySettings());
  const [path, setPath] = useState(() => memorySettings().path);
  const [busy, setBusy] = useState(false);
  const onPc = online && isPc && canAdmin;
  const different = !!cfg.path && cfg.path !== pcPath;

  const store = (patch: Partial<MemorySettings>) => { const next = setMemorySettings(patch); setCfg(next); return next; };
  const push = async (next: MemorySettings) => {
    setBusy(true);
    try {
      await client.call("memory.configure", { path: next.path, enabled: next.enabled, writeEnabled: next.writeEnabled, deleteEnabled: next.deleteEnabled, auto: next.auto });
      toast(t("Auf dem PC übernommen"), "success");
      onChanged();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const savePath = async () => {
    const next = store({ path: path.trim() });
    toast(t("Im Konto gespeichert"), "success");
    if (onPc) await push(next);
  };
  const change = (patch: Partial<MemorySettings>) => {
    const next = store(patch);
    toast(t("Im Konto gespeichert"), "success");
    if (onPc) void push(next);
  };

  return (
    <Card title={t("Gedächtnis im Konto")} icon={<Brain size={18} />}
      meta={<span className={`badge${cfg.path ? " ok" : ""}`}>{cfg.path ? t("Im Konto gespeichert") : t("Noch nicht eingerichtet")}</span>}>
      <div className="stack-sm">
        <p className="muted" style={{ margin: 0 }}>{t("Der Ordner und die Regeln reisen im Konto mit – du kannst sie hier auch ohne PC einstellen. Die Notizen selbst bleiben auf dem PC und werden übernommen, sobald er verbunden ist.")}</p>
        <Field label={t("Ordner des Gedächtnisses")}
          hint={isPc ? t("Zum Beispiel C:\\Users\\Name\\Documents\\JARVIS-MEMORY – der Ordner wird angelegt, falls es ihn nicht gibt. Ein vorhandener Obsidian-Vault geht auch.") : t("Der Ordner gilt für alle Geräte deines Kontos. Angelegt wird er auf dem PC, sobald er verbunden ist.")}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\Users\\…\\JARVIS-MEMORY" aria-label={t("Ordner des Gedächtnisses")} />
            <Button variant="primary" busy={busy} disabled={!path.trim() || path.trim() === cfg.path} onClick={() => void savePath()}>{t("Speichern")}</Button>
          </div>
        </Field>
        {onPc && different && <Button size="sm" icon={<Save size={14} />} busy={busy} onClick={() => void push(cfg)}>{t("Auf diesen PC übernehmen")}</Button>}
        <Switch checked={cfg.enabled} onChange={(v) => change({ enabled: v })} label={t("Gedächtnis benutzen")} hint={t("Aus: JARVIS antwortet wie vorher, ohne zu merken oder nachzuschlagen.")} />
        <Switch checked={cfg.writeEnabled} onChange={(v) => change({ writeEnabled: v })} label={t("JARVIS darf Notizen schreiben")} hint={t("Aus: nur Lesen und Suchen.")} />
        <Switch checked={cfg.deleteEnabled} onChange={(v) => change({ deleteEnabled: v })} label={t("Löschen erlauben")} hint={t("Gelöscht wird nie von selbst und nie endgültig: Notizen kommen in den Papierkorb des Vaults (.trash).")} />
        <Field label={t("Automatisch merken")}>
          <select className="input" value={cfg.auto} onChange={(e) => change({ auto: e.target.value as MemorySettings["auto"] })}>
            {AUTO.map((a) => <option key={a.value} value={a.value}>{t(a.label)}</option>)}
          </select>
        </Field>
        {!online && <p className="tiny muted" style={{ margin: 0 }}>{t("Ohne PC ist hier nur das Einrichten möglich – gemerkt und nachgeschlagen wird erst, wenn der PC verbunden ist.")}</p>}
      </div>
    </Card>
  );
}
