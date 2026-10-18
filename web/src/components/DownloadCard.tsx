import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { t } from "../lib/i18n";
import { bytes } from "../lib/format";
import { sha256, toHex } from "../lib/sha256";
import { Banner, Button, Card } from "./ui";

interface Info { available: boolean; fileName?: string; size?: number; sha256?: string; version?: string; url?: string; reason?: string; message?: string }
type Phase = "loading" | "ready" | "unavailable" | "not-built" | "unreachable" | "downloading" | "verifying" | "done" | "failed";

/**
 * Downloads exactly the file the server announces in /download/info (served by the companion itself
 * or by a relay). Size and checksum come from the server; nothing is guessed.
 */
export function DownloadCard({ compact }: { compact?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("download/info", { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) { setPhase("unavailable"); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const i = (await r.json()) as Info;
        setInfo(i);
        setPhase(i.available ? "ready" : i.reason === "not-built" ? "not-built" : "unavailable");
      })
      .catch((e) => { if (!ctrl.signal.aborted) { setPhase("unreachable"); setMsg(String(e.message ?? e)); } });
    return () => ctrl.abort();
  }, []);

  const start = async () => {
    if (!info?.url) return;
    // Phones, very old browsers and files on another server (GitHub Releases – not readable by this page):
    // plain download link (no progress; the checksum is shown for checking).
    const crossOrigin = new URL(info.url, location.href).origin !== location.origin;
    if (crossOrigin || !("ReadableStream" in window) || /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      setPhase("done");
      setMsg(t("Download wurde im Browser gestartet."));
      location.href = info.url;
      return;
    }
    setPhase("downloading");
    setProgress(0);
    try {
      const res = await fetch(info.url, { cache: "no-store" });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("Content-Length")) || info.size || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) setProgress(got / total);
      }
      if (info.size && got !== info.size) throw new Error(t("Dateigröße stimmt nicht ({a} statt {b})", { a: got, b: info.size }));
      setPhase("verifying");
      const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
      let hash: string;
      if (window.crypto?.subtle) hash = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())));
      else hash = toHex(sha256(new Uint8Array(await blob.arrayBuffer())));
      if (info.sha256 && hash !== info.sha256) throw new Error(t("Prüfsumme stimmt nicht – Datei wurde verworfen."));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = info.fileName ?? "PCGameLauncherCompanion.exe";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      setPhase("done");
      setMsg(t("Heruntergeladen und Prüfsumme bestätigt."));
    } catch (e) {
      setPhase("failed");
      setMsg((e as Error).message);
    }
  };

  const statusText: Record<Phase, string> = {
    loading: t("Prüfe Verfügbarkeit …"),
    ready: t("Bereit"),
    unavailable: t("Datei nicht verfügbar"),
    "not-built": t("Companion noch nicht gebaut"),
    unreachable: t("Server nicht erreichbar"),
    downloading: t("Download läuft … {p} %", { p: Math.round(progress * 100) }),
    verifying: t("Prüfe Dateiintegrität …"),
    done: t("Fertig"),
    failed: t("Download fehlgeschlagen"),
  };
  const kind = phase === "ready" || phase === "done" ? "ok" : phase === "failed" || phase === "unreachable" ? "error" : phase === "loading" || phase === "downloading" || phase === "verifying" ? "info" : "warn";

  return (
    <Card title={t("Begleiter herunterladen")} icon={<Download size={18} />} meta={<span className={`badge ${kind}`}>{statusText[phase]}</span>}>
      <div className="stack">
        {!compact && <p className="muted small">{t("Der Windows-Companion führt die Aktionen auf deinem PC aus und liefert diese Web-App im WLAN aus. Einfach starten – keine Installation, keine Administratorrechte.")}</p>}
        {info?.available && (
          <div className="small muted">
            <div><b className="mono">{info.fileName}</b> · {bytes(info.size)} · v{info.version}</div>
            {!compact && <div className="mono tiny" style={{ wordBreak: "break-all", marginTop: 4 }}>SHA-256: {info.sha256}</div>}
          </div>
        )}
        {phase === "downloading" && <div className="progress-bar"><i style={{ width: `${progress * 100}%` }} /></div>}
        {phase === "not-built" && <Banner kind="warn">{info?.message}</Banner>}
        {phase === "unavailable" && <Banner kind="warn">{t("Dieser Server stellt keine Companion-Datei bereit. Lade die EXE dort herunter, wo du das Projekt bezogen hast (Release-Seite).")}</Banner>}
        {phase === "unreachable" && <Banner kind="error">{t("Download-Information konnte nicht geladen werden: {m}", { m: msg })}</Banner>}
        {(phase === "failed" || phase === "done") && <Banner kind={phase === "done" ? "ok" : "error"}>{msg}</Banner>}
        <div className="row">
          <Button variant="primary" icon={<Download size={17} />} disabled={!info?.available || phase === "downloading" || phase === "verifying"} onClick={start}>{t("Begleiter herunterladen")}</Button>
        </div>
        {info?.available && !compact && (
          <p className="tiny muted"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> {t("Manuelle Prüfung unter Windows:")} <code>certutil -hashfile PCGameLauncherCompanion.exe SHA256</code></p>
        )}
      </div>
    </Card>
  );
}
