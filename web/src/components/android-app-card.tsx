// The Android app: download for browsers, version + update check inside the app (through window.JarvisApp).
// The update itself is done by the app (download, SHA-256 check, Android installer) – this card only asks.
import { useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { Button, Card } from "./ui";
import { t } from "../lib/i18n";

export const APK = "https://github.com/nilshenke-ops/pc-game-launcher-ultimate/releases/download/android-latest/jarvis-android.apk";
const LATEST = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/android/latest.json";

interface Bridge { version(): string; versionCode(): number; checkForUpdates(): void; install(): void }
declare global { interface Window { JarvisApp?: Bridge; __jarvisUpdate?: (json: string) => void } }

export function AndroidAppCard() {
  const [installed, setInstalled] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const app = window.JarvisApp;
    if (app) { try { setInstalled(app.version()); } catch { /* bridge answers nothing */ } }
    window.__jarvisUpdate = (json) => {
      setChecking(false);
      try {
        const o = JSON.parse(json) as { installed: string; latest: string; update: boolean };
        setInstalled(o.installed);
        setText(o.update
          ? t("Version {v} ist verfügbar – in der App oben auf „Installieren“ tippen.", { v: o.latest })
          : t("Die App ist auf dem neuesten Stand ({v}).", { v: o.installed }));
      } catch { setText(t("Prüfung nicht möglich.")); }
    };
    return () => { window.__jarvisUpdate = undefined; };
  }, []);

  const check = async () => {
    setChecking(true);
    setText(null);
    const app = window.JarvisApp;
    if (app) { try { app.checkForUpdates(); return; } catch { setChecking(false); } }
    try {
      const r = await fetch(`${LATEST}?t=${Date.now()}`, { cache: "no-store" });
      const o = (await r.json()) as { versionName?: string };
      setChecking(false);
      setText(o.versionName
        ? t("Neueste Version: {v}. Im Browser wird nichts installiert – die App aktualisiert sich selbst.", { v: o.versionName })
        : t("Prüfung nicht möglich."));
    } catch {
      setChecking(false);
      setText(t("Prüfung nicht möglich."));
    }
  };

  return (
    <Card title={t("Android-App")} icon={<Smartphone size={18} />}
      meta={installed ? <span className="badge ok">{t("Installiert")}</span> : undefined}>
      <div className="stack-sm">
        <p className="muted" style={{ margin: 0 }}>{t("Dieselbe Seite als App fürs Handy – eigener Speicher, bleibt angemeldet und prüft selbst auf Updates wie am PC.")}</p>
        {installed && <p className="tiny muted" style={{ margin: 0 }}>{t("Installiert: Version {v}", { v: installed })}</p>}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" icon={<RefreshCw size={14} />} busy={checking} onClick={() => void check()}>{t("Nach Updates suchen")}</Button>
          <a className="btn sm" href={APK} target="_blank" rel="noreferrer">{t("APK herunterladen")}</a>
        </div>
        {text && <p className="tiny muted" style={{ margin: 0 }}>{text}</p>}
        <p className="tiny muted" style={{ margin: 0 }}>{t("Android fragt beim Installieren einmal nach – ein stilles Selbst-Update erlaubt Android ohne Systemrechte nicht.")}</p>
      </div>
    </Card>
  );
}
