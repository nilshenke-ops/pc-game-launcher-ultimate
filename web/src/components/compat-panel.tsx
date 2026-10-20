import { useState } from "react";
import { Check, Cpu, HelpCircle, RefreshCw, X } from "lucide-react";
import { client, readJson, writeJson } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Banner, Button } from "./ui";

interface Check { what: string; needGb?: number | null; haveGb?: number | null; verdict: "ok" | "low" | "unknown"; detail: string }
interface Side { lines: { label: string; text: string }[]; checks: Check[] }
export interface CompatResult {
  appId: string; name?: string | null; verdict: "recommended" | "minimum" | "below-minimum" | "unknown"; fetchedAt: string; fromCache: boolean;
  minimum: Side; recommended: Side; pc: { cpu?: string | null; ramGb?: number | null; gpu?: string | null; vramGb?: number | null; freeGb?: number | null; drive?: string | null }; note: string;
}

const key = (appId: string) => `pgl.compat.${appId}`;
const VERDICT: Record<CompatResult["verdict"], { kind: "ok" | "warn" | "error" | "info"; text: () => string }> = {
  recommended: { kind: "ok", text: () => t("Erfüllt die empfohlenen Anforderungen (soweit prüfbar)") },
  minimum: { kind: "info", text: () => t("Erfüllt die Mindestanforderungen (soweit prüfbar), nicht alle empfohlenen") },
  "below-minimum": { kind: "error", text: () => t("Unter den Mindestanforderungen") },
  unknown: { kind: "warn", text: () => t("Nicht automatisch prüfbar – bitte die Angaben vergleichen") },
};

/** "Läuft das auf meinem PC?" – Steam's requirements next to this PC's real values. The last answer is kept on this device. */
export function CompatPanel({ appId, itemId }: { appId: string; itemId?: string }) {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const [r, setR] = useState<CompatResult | null>(() => readJson<CompatResult>(key(appId)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = async (refresh: boolean) => {
    setBusy(true); setErr(null);
    try { const x = await client.call<CompatResult>("compat.check", { appId, itemId, refresh }); setR(x); writeJson(key(appId), x); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack-sm compat">
      {!r && <Button icon={<Cpu size={15} />} busy={busy} disabled={!online} onClick={() => void check(false)}>{t("Läuft das auf meinem PC?")}</Button>}
      {!r && !online && <p className="tiny muted">{t("Braucht den PC: er fragt einmal den Steam-Shop nach den Anforderungen und vergleicht mit deiner Hardware.")}</p>}
      {err && <Banner kind="error">{err}</Banner>}
      {r && <>
        <Banner kind={VERDICT[r.verdict].kind}>{r.verdict === "minimum" && r.recommended.lines.length === 0 ? t("Erfüllt die Mindestanforderungen (soweit prüfbar) – Steam nennt keine empfohlenen") : VERDICT[r.verdict].text()}</Banner>
        <div className="grid-2">
          {([["minimum", t("Mindestens")], ["recommended", t("Empfohlen")]] as const).map(([k, title]) => (
            <div key={k} className="compat-side">
              <b className="small">{title}</b>
              {r[k].checks.map((c) => (
                <div key={c.what} className="row nowrap small" style={{ gap: 6 }}>
                  {c.verdict === "ok" ? <Check size={14} className="ok-ico" /> : c.verdict === "low" ? <X size={14} className="bad-ico" /> : <HelpCircle size={14} className="muted" />}
                  <span className="grow">{c.what}{c.needGb != null ? ` ≥ ${c.needGb.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB` : ""}</span>
                  <span className="tiny muted">{c.detail}</span>
                </div>
              ))}
              {r[k].lines.length === 0 ? <p className="tiny muted">{t("Keine Angaben im Steam-Shop.")}</p> : (
                <ul className="compat-lines">{r[k].lines.map((l, i) => <li key={i}>{l.label && <b>{l.label}: </b>}{l.text}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
        <p className="tiny muted">{t("Dein PC: {c} · {g} · {r} GB RAM", { c: r.pc.cpu ?? t("Prozessor unbekannt"), g: r.pc.gpu ?? t("Grafik unbekannt"), r: r.pc.ramGb != null ? r.pc.ramGb.toFixed(1) : "?" })}</p>
        <p className="tiny muted">{t("Prozessor und Grafikkarte bitte selbst vergleichen – ihre Namen lassen sich nicht zuverlässig automatisch einstufen.")} {t("Anforderungen vom Steam-Shop, Stand {d}.", { d: dateTime(r.fetchedAt) })}</p>
        {online && <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} busy={busy} onClick={() => void check(true)}>{t("Neu prüfen")}</Button>}
      </>}
    </div>
  );
}
