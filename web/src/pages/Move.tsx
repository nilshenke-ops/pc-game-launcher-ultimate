// Move games to another drive. Steam games: checked copy (SHA-256) into a Steam library on the other drive, switch with
// Steam closed, delete the original only after you confirm it starts – undo possible until then. Other launchers: only
// their official way is explained. Without the PC a move can be prepared; it runs later only after checking again.
import { useEffect, useMemo, useState } from "react";
import { HardDriveDownload, Pause, Play, RotateCcw, Trash2, Undo2, Check, ArrowRightLeft } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useEvent, useRpc } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Banner, Button, Card, CheckList, confirmDialog, Empty, Field, Loadable, Meter, PageHead } from "../components/ui";

interface Target { library: string; drive: string; freeBytes?: number | null; fits: boolean }
interface Options { itemId: string; game: string; supported: boolean; official: string; reason?: string; source?: string; sourceDrive?: string; sizeBytes?: number; files?: number; checks?: { label: string; status: string; detail: string }[]; targets: Target[]; noTarget?: string | null }
export interface MoveJob { id: string; itemId: string; game: string; source: string; targetLibrary: string; target: string; phase: string; totalBytes: number; totalFiles: number; doneBytes: number; doneFiles: number; error?: string | null; by: string; createdAt: string; log: string[]; pending?: boolean }

const PHASE: Record<string, [string, string]> = {
  planned: ["Vorbereitet", ""], copying: ["Kopiert …", "info"], interrupted: ["Angehalten", "warn"], failed: ["Fehler", "error"],
  copied: ["Kopiert und geprüft", "ok"], switched: ["Umgestellt – bitte prüfen", "warn"], done: ["Fertig", "ok"], cancelled: ["Abgebrochen", ""],
};

export default function MovePage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const jobs = useRpc<{ jobs: MoveJob[] }>("moves.list", {}, ["moves"]);
  const games = useMemo(() => (lib.data?.items ?? []).filter((i) => i.kind === "game" && i.installDir).sort((a, b) => a.name.localeCompare(b.name)), [lib.data]);
  const [game, setGame] = useState("");
  const [live, setLive] = useState<Record<string, { doneBytes: number; totalBytes: number; doneFiles: number; totalFiles: number }>>({});
  useEvent<{ id: string; doneBytes: number; totalBytes: number; doneFiles: number; totalFiles: number }>("move.progress", (p) => setLive((l) => ({ ...l, [p.id]: p })));
  const list = jobs.data?.jobs ?? [];

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Spiele verschieben")}
        text={t("Ein Spiel auf ein anderes Laufwerk umziehen – mit Platzprüfung, geprüfter Kopie und Rückweg. Das Original wird erst gelöscht, wenn du bestätigst, dass das Spiel am neuen Ort startet.")} />
      <div className="stack">
        {!online && <Banner kind="info">{t("Ohne PC: Umzüge kannst du vorbereiten (mit dem zuletzt bekannten Stand). Kopiert wird erst mit dem PC – nach einer neuen Prüfung.")}</Banner>}
        <Card title={t("Spiel wählen")} icon={<HardDriveDownload size={18} />}>
          <Field label={t("Spiel")}>
            <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">{t("Spiel wählen …")}</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          {game && <OptionsView itemId={game} canManage={canManage} onPlanned={() => { setGame(""); jobs.reload(); }} />}
        </Card>
        <Loadable loading={jobs.loading} error={jobs.error} onRetry={jobs.reload}>
          {list.length === 0 ? <Card><Empty icon={<ArrowRightLeft size={28} />} title={t("Keine Umzüge")} text={t("Wähle oben ein Spiel. Der Begleiter zeigt zuerst den offiziellen Weg des Launchers.")} /></Card>
            : list.map((j) => <JobCard key={j.id} j={j} live={live[j.id]} online={online} canManage={canManage} reload={jobs.reload} />)}
        </Loadable>
      </div>
    </>
  );
}

function OptionsView({ itemId, canManage, onPlanned }: { itemId: string; canManage: boolean; onPlanned: () => void }) {
  const q = useRpc<Options>("moves.options", { itemId });
  const [target, setTarget] = useState("");
  const o = q.data;
  useEffect(() => { setTarget(o?.targets.find((x) => x.fits)?.library ?? ""); }, [o]);
  const plan = () => client.call("moves.plan", { itemId, targetLibrary: target }).then(() => { toast(t("Umzug vorbereitet"), "success"); onPlanned(); }, (e: Error) => toast(e.message, "error"));
  return (
    <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
      {o && (
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {q.stale && <p className="tiny muted" style={{ margin: 0 }}>{t("Zuletzt bekannter Stand – der PC prüft beim Kopieren alles neu.")}</p>}
          <Banner kind="info" title={t("Offizieller Weg")}>{o.official}</Banner>
          {!o.supported ? <p className="small muted" style={{ margin: 0 }}>{o.reason}</p> : (
            <>
              {(o.sizeBytes ?? 0) > 0 && <p className="small" style={{ margin: 0 }}>{t("Oder mit dem Assistenten: {s} in {n} Dateien, jetzt auf {d}", { s: bytes(o.sizeBytes ?? 0), n: o.files ?? 0, d: o.sourceDrive ?? "?" })}</p>}
              {o.checks && <CheckList checks={o.checks} />}
              {o.noTarget ? <Banner kind="warn">{o.noTarget}</Banner> : (
                <Field label={t("Ziel (Steam-Bibliothek auf einem anderen Laufwerk)")}>
                  <div className="stack-sm">
                    {o.targets.map((x) => (
                      <label key={x.library} className="checkbox">
                        <input type="radio" name="target" checked={target === x.library} disabled={!x.fits} onChange={() => setTarget(x.library)} />
                        {x.drive} – {x.library} <span className="tiny muted">{x.freeBytes != null ? t("{f} frei", { f: bytes(x.freeBytes) }) : ""}{!x.fits && " – " + t("zu wenig Platz (1 GB bleibt frei)")}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              )}
              {canManage && <div><Button variant="primary" disabled={!target || o.checks?.some((c) => c.status === "error")} onClick={() => void plan()}>{t("Umzug vorbereiten")}</Button></div>}
            </>
          )}
        </div>
      )}
    </Loadable>
  );
}

function JobCard({ j, live, online, canManage, reload }: { j: MoveJob; live?: { doneBytes: number; totalBytes: number; doneFiles: number }; online: boolean; canManage: boolean; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (m: string, p: Record<string, unknown> = {}, ok?: string) => {
    setBusy(m);
    try { await client.call(m, { id: j.id, ...p }); if (ok) toast(ok, "success"); reload(); } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const done = live?.doneBytes ?? j.doneBytes, total = live?.totalBytes ?? j.totalBytes;
  const [label, kind] = PHASE[j.phase] ?? [j.phase, ""];
  const can = online && canManage && !j.pending;
  return (
    <Card title={j.game} icon={<ArrowRightLeft size={18} />} meta={<span className={`badge ${kind}`}>{t(label)}</span>}>
      <div className="stack-sm">
        <div className="tiny muted" style={{ wordBreak: "break-all" }}>{j.source} → {j.target}</div>
        {j.pending && <Banner kind="info">{t("Wartet auf den PC – wird beim Verbinden angelegt und geprüft.")}</Banner>}
        {(j.phase === "copying" || j.phase === "interrupted" || j.phase === "failed" || j.phase === "copied") && total > 0 && (
          <div className="stack-sm"><Meter value={(done / total) * 100} /><span className="tiny muted">{bytes(done)} / {bytes(total)} · {live?.doneFiles ?? j.doneFiles}/{j.totalFiles} {t("Dateien")}</span></div>
        )}
        {j.error && <Banner kind="error">{j.error}</Banner>}
        {j.phase === "copied" && <Banner kind="warn" title={t("Nächster Schritt")}>{t("Steam ganz schließen (Infobereich: Rechtsklick → Beenden), dann „Umstellen“.")}</Banner>}
        {j.phase === "switched" && <Banner kind="warn" title={t("Bitte prüfen")}>{t("Steam öffnen und das Spiel einmal starten. Startet es? Dann „Funktioniert – Original löschen“. Sonst „Rückgängig“.")}</Banner>}
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {j.phase === "planned" && <Button size="sm" variant="primary" icon={<Play size={14} />} busy={busy === "moves.start"} disabled={!can} onClick={() => void act("moves.start", {}, t("Kopieren gestartet"))}>{t("Kopieren starten")}</Button>}
          {j.phase === "copying" && <Button size="sm" icon={<Pause size={14} />} disabled={!can} onClick={() => void act("moves.pause")}>{t("Anhalten")}</Button>}
          {(j.phase === "interrupted" || j.phase === "failed") && <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} disabled={!can} onClick={() => void act("moves.start", {}, t("Fortgesetzt"))}>{t("Fortsetzen")}</Button>}
          {j.phase === "copied" && <Button size="sm" variant="primary" icon={<ArrowRightLeft size={14} />} busy={busy === "moves.switch"} disabled={!can} onClick={() => void act("moves.switch", {}, t("Umgestellt"))}>{t("Umstellen")}</Button>}
          {j.phase === "switched" && (
            <Button size="sm" variant="danger" icon={<Check size={14} />} disabled={!can} onClick={async () => {
              if (await confirmDialog(t("Original löschen?"), t("Startet {g} am neuen Ort? Dann wird der alte Ordner {s} gelöscht. Das lässt sich nicht rückgängig machen.", { g: j.game, s: j.source }), { danger: true, ok: t("Ja, Original löschen") }))
                void act("moves.finish", { confirmed: true }, t("Fertig – Platz freigegeben"));
            }}>{t("Funktioniert – Original löschen")}</Button>
          )}
          {["planned", "interrupted", "failed", "copied", "switched"].includes(j.phase) && j.phase !== "planned" && (
            <Button size="sm" icon={<Undo2 size={14} />} disabled={!can} onClick={async () => { if (await confirmDialog(t("Umzug abbrechen?"), t("Alles wird wie vorher, die Kopie am Ziel wird gelöscht. Das Original bleibt."), { ok: t("Abbrechen und aufräumen") })) void act("moves.undo", {}, t("Rückgängig gemacht")); }}>{j.phase === "switched" ? t("Rückgängig") : t("Abbrechen")}</Button>
          )}
          {["planned", "done", "cancelled"].includes(j.phase) && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={!can} onClick={() => void act("moves.remove")}>{t("Aus Liste entfernen")}</Button>}
        </div>
        {j.log.length > 0 && (
          <details className="small"><summary>{t("Verlauf")}</summary><ul className="tiny muted" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{j.log.slice(-8).map((l, i) => <li key={i}>{l.replace(/^(\S+ \S+) /, (_, d: string) => `${dateTime(d.replace(" ", "T"))} – `)}</li>)}</ul></details>
        )}
      </div>
    </Card>
  );
}
