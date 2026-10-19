import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { CheckCircle2, Clock, Eye, KeyRound, Link2, LogOut, MonitorSmartphone, Palette, QrCode, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { client, enterDemo, HOSTED, readJson, RpcError, serverConfigured, serverUrl, setServerUrl, writeJson } from "../lib/rpc";
import { pcAddressToWs, wsToPcAddress, isLoopbackAddress } from "../lib/address";
import { t } from "../lib/i18n";
import { useConn, useEvent, useNow, toast } from "../lib/hooks";
import { Banner, Button, Card, Field, PageHead } from "../components/ui";

const PENDING_KEY = "pgl.pairing";

function guessDeviceName() {
  const ua = navigator.userAgent;
  const dev = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows-PC" : /Mac/.test(ua) ? "Mac" : t("Browser");
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return `${dev}${br ? " · " + br : ""}`;
}

type PairState = { step: "form" } | { step: "sending" } | { step: "waiting"; requestId: string } | { step: "approved" } | { step: "denied" };

/** Pairing on a new device (phone, tablet, other browser). */
export function DevicePairScreen({ embedded = false }: { embedded?: boolean }) {
  const conn = useConn();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [name, setName] = useState(guessDeviceName());
  const [state, setState] = useState<PairState>(() => {
    const p = readJson<{ requestId: string }>(PENDING_KEY, "session");
    return p ? { step: "waiting", requestId: p.requestId } : { step: "form" };
  });
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  // A newly scanned QR code (same tab, new URL) replaces whatever was typed before.
  const urlCode = params.get("code");
  useEffect(() => { if (urlCode) { setCode(urlCode); setError(null); } }, [urlCode]);
  // Hosted web app: the PC address comes from the QR code ("pc" parameter) or is typed in.
  const [address, setAddress] = useState(params.get("pc") ?? (HOSTED && serverConfigured() ? wsToPcAddress(serverUrl()) : ""));
  const urlPc = params.get("pc");
  useEffect(() => { if (urlPc) setAddress(urlPc); }, [urlPc]);
  const [connecting, setConnecting] = useState(false);

  const navigate = useNavigate();
  const finish = useCallback(async (token: string, deviceId: string) => {
    writeJson(PENDING_KEY, null, "session");
    setState({ step: "approved" });
    navigate("/", { replace: true }); // after pairing, land on the dashboard instead of the pairing page
    await client.savePairing(token, deviceId);
  }, [navigate]);

  useEvent<{ approved: boolean; token?: string; deviceId?: string }>("pairing.result", (r) => {
    if (r.approved && r.token && r.deviceId) finish(r.token, r.deviceId);
    else { writeJson(PENDING_KEY, null, "session"); setState({ step: "denied" }); }
  });

  // After a reconnect (or page reload) the decision is fetched with the one-time claim secret.
  useEffect(() => {
    if (state.step !== "waiting" || conn.phase !== "online") return;
    const p = readJson<{ requestId: string; claimSecret: string }>(PENDING_KEY, "session");
    if (!p) return;
    const poll = async () => {
      try {
        const r = await client.call<{ state: string; token?: string; deviceId?: string }>("pairing.claim", p);
        if (r.state === "approved" && r.token && r.deviceId) finish(r.token, r.deviceId);
        else if (r.state === "denied") { writeJson(PENDING_KEY, null, "session"); setState({ step: "denied" }); }
        else if (r.state === "unknown") { writeJson(PENDING_KEY, null, "session"); setState({ step: "form" }); setError({ code: "expired", message: t("Die Anfrage ist abgelaufen. Bitte erneut koppeln.") }); }
      } catch { /* retry */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [state.step, conn.phase, finish]);

  const request = useCallback(async () => {
    setState({ step: "sending" });
    try {
      const r = await client.call<{ requestId: string; claimSecret: string }>("pairing.request", { code, deviceName: name, platform: navigator.platform || "web" });
      writeJson(PENDING_KEY, { requestId: r.requestId, claimSecret: r.claimSecret }, "session");
      setState({ step: "waiting", requestId: r.requestId });
    } catch (err) {
      const x = err as RpcError;
      setError({ code: x.code, message: x.message });
      setState({ step: "form" });
    }
  }, [code, name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (HOSTED) {
      const ws = pcAddressToWs(address, location.protocol === "https:");
      if (!ws) { setError({ code: "address", message: t("Bitte eine gültige PC-Adresse eingeben, z. B. gaming-pc.tail1234.ts.net") }); return; }
      if (isLoopbackAddress(ws) && !isLoopbackAddress(location.hostname)) { setError({ code: "address", message: t("127.0.0.1 und localhost bedeuten immer „dieses Gerät“ – damit sucht das iPad sich selbst, nicht deinen PC. Nimm die Adresse aus dem Nexus Gaming Hub unter „Gerät koppeln“ (z. B. https://gaming-pc.tail1234.ts.net) oder scanne den QR-Code.") }); return; }
      if (location.protocol === "https:" && ws.startsWith("ws:")) { setError({ code: "address", message: t("Diese Seite braucht eine https-Adresse des PCs (z. B. den Tailscale-Funnel-Link).") }); return; }
      if (ws !== serverUrl() || conn.phase !== "online") {
        setServerUrl(ws);
        setConnecting(true);
        setState({ step: "sending" });
        client.restart();
        return; // the effect below sends the request once the PC answers
      }
    }
    await request();
  };

  // Hosted: continue as soon as the connection to the entered PC address is up – or explain why it failed.
  useEffect(() => {
    if (!connecting) return;
    if (conn.phase === "online" && conn.hello) { setConnecting(false); request(); }
    else if (conn.phase === "offline" && conn.lastError) {
      setConnecting(false);
      setState({ step: "form" });
      setError({ code: "unreachable", message: t("Der PC ist unter dieser Adresse nicht erreichbar. Prüfe: Ist der PC an und läuft der Nexus Gaming Hub? Ist der Tailscale-Funnel aktiv („tailscale funnel --bg 8787“)? Stimmt die Adresse mit der im Nexus Gaming Hub unter „Gerät koppeln“ überein? Im selben WLAN geht es auch ohne Tailscale: QR-Code am PC scannen.") });
    }
  }, [connecting, conn.phase, conn.hello, conn.lastError, request]);

  const pc = conn.hello?.info.pcName;
  return (
    <div className={embedded ? "" : "center-screen"}>
      <div className={embedded ? "stack fade-in connect-panel" : "center-card stack fade-in"}>
        <div style={{ textAlign: "center" }} className="stack-sm">
          <div className="state-icon">{HOSTED ? <MonitorSmartphone size={34} /> : <Link2 size={34} />}</div>
          <h1>{HOSTED ? t("PC verbinden") : t("Gerät koppeln")}</h1>
          <p className="muted">{HOSTED
            ? t("Öffne am PC den Nexus Gaming Hub → „Gerät koppeln“ → „Neuen Code erzeugen“. Scanne den QR-Code mit der Kamera oder gib Code und PC-Adresse hier ein.")
            : pc ? t("Verbunden mit „{pc}“. Gib den Code ein, der im Companion am PC angezeigt wird.", { pc }) : t("Gib den Code ein, der im Companion am PC angezeigt wird.")}</p>
        </div>
        {conn.auth === "revoked" && <Banner kind="warn" title={t("Kopplung wurde aufgehoben")}>{conn.authError ?? t("Dieses Gerät wurde am PC entfernt.")}</Banner>}
        {conn.auth === "failed" && <Banner kind="warn" title={t("Anmeldung nicht mehr gültig")}>{conn.authError}</Banner>}
        {conn.relayCompanion === "offline" && <Banner kind="error" title={t("Relay erreichbar – PC nicht verbunden")}>{t("Starte den Companion auf dem PC und prüfe die Relay-Einstellungen.")}</Banner>}

        <Card>
          {(state.step === "form" || state.step === "sending") && (
            <form className="stack" onSubmit={submit}>
              <Field label={t("Kopplungscode")} error={error?.message}>
                <input className="input code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" maxLength={9} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required aria-invalid={!!error} />
              </Field>
              {HOSTED && (
                <Field label={t("PC-Adresse")} hint={t("Steht im Nexus Gaming Hub unter dem QR-Code. Beim Scannen wird sie automatisch ausgefüllt.")}>
                  <input className="input mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="gaming-pc.tail1234.ts.net" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
                </Field>
              )}
              <Field label={t("Name dieses Geräts")} hint={t("So erscheint das Gerät später in der Geräteliste am PC.")}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </Field>
              <Button variant="primary" size="lg" block busy={state.step === "sending"} disabled={code.replace(/[^A-Z0-9]/gi, "").length < 8 || (HOSTED && !address.trim())} type="submit" icon={HOSTED ? <MonitorSmartphone size={18} /> : <KeyRound size={18} />}>{HOSTED ? t("PC verbinden") : t("Koppeln")}</Button>
              {state.step === "sending" && connecting && <p className="small muted" style={{ textAlign: "center" }}>{t("Verbinde mit deinem PC …")}</p>}
            </form>
          )}
          {state.step === "waiting" && (
            <div className="stack" style={{ textAlign: "center" }}>
              <div className="state-icon"><Clock size={32} className="dot pulse" style={{ background: "none", boxShadow: "none", width: "auto", height: "auto" }} /></div>
              <h2>{t("Bestätigung am PC ausstehend")}</h2>
              <p className="muted">{t("Am PC ist jetzt ein Fenster „Neue Kopplungsanfrage“ geöffnet. Klicke dort auf „Erlauben“.")}</p>
              <Button onClick={() => { writeJson(PENDING_KEY, null, "session"); setState({ step: "form" }); }}>{t("Abbrechen")}</Button>
            </div>
          )}
          {state.step === "approved" && (
            <div className="stack" style={{ textAlign: "center" }}>
              <div className="state-icon"><CheckCircle2 size={34} /></div>
              <h2>{t("Kopplung erfolgreich")}</h2>
              <p className="muted">{t("Anmeldung läuft …")}</p>
            </div>
          )}
          {state.step === "denied" && (
            <div className="stack" style={{ textAlign: "center" }}>
              <div className="state-icon error"><XCircle size={34} /></div>
              <h2>{t("Anfrage abgelehnt")}</h2>
              <p className="muted">{t("Die Kopplung wurde am PC abgelehnt.")}</p>
              <Button onClick={() => setState({ step: "form" })}>{t("Neuer Versuch")}</Button>
            </div>
          )}
        </Card>
        {HOSTED && !embedded && (state.step === "form" || state.step === "denied") && (
          <div className="row" style={{ justifyContent: "center" }}>
            <Button size="sm" icon={<Palette size={15} />} onClick={() => client.openOffline()}>{t("Erst Design & Layout einstellen")}</Button>
            <Button size="sm" variant="ghost" icon={<Eye size={15} />} onClick={enterDemo}>{t("Demo ansehen")}</Button>
          </div>
        )}
        <p className="tiny muted" style={{ textAlign: "center" }}>
          <ShieldCheck size={13} style={{ verticalAlign: -2 }} /> {t("Der Code ist 5 Minuten gültig und nur einmal verwendbar. Ohne Bestätigung am PC erhält kein Gerät Zugriff.")}
        </p>
      </div>
    </div>
  );
}

/** Pairing page inside the app: generates codes on the PC, explains the process on other devices. */
export function PairPage() {
  const conn = useConn();
  const now = useNow(1000);
  const [code, setCode] = useState<{ code: string; expiresAt: string; urls: string[]; pcAddress?: string } | null>(null);
  const [qr, setQr] = useState<string>("");
  const [urlIndex, setUrlIndex] = useState(0);
  const isLocal = !!conn.me?.isLocal;

  const load = useCallback(() => {
    if (!isLocal) return;
    client.call<{ code?: string; expiresAt?: string; urls?: string[]; pcAddress?: string }>("pairing.pending").then((r) => setCode(r.code ? { code: r.code, expiresAt: r.expiresAt!, urls: r.urls ?? [], pcAddress: r.pcAddress } : null)).catch(() => {});
  }, [isLocal]);
  useEffect(load, [load]);
  useEvent<{ topic: string }>("changed", (d) => { if (d.topic === "pairing") load(); });
  useEvent("pairing.pending", load);

  const url = code?.urls[urlIndex] ?? code?.urls[0];
  useEffect(() => {
    if (!url) { setQr(""); return; }
    QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [url]);

  const create = async () => {
    try { setCode(await client.call("pairing.create")); setUrlIndex(0); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const left = code ? Math.max(0, Math.floor((Date.parse(code.expiresAt) - now) / 1000)) : 0;
  const expired = code && left <= 0;

  if (!isLocal) {
    return (
      <>
        <PageHead eyebrow={t("Verbindung")} title={t("Gerät koppeln")} />
        <div className="grid-2">
          <Card title={t("Dieses Gerät ist gekoppelt")} icon={<Smartphone size={18} />}>
            <div className="stack">
              <p className="muted">{t("Angemeldet als „{n}“.", { n: conn.me?.device?.name ?? "" })}</p>
              <Banner kind="info">{t("Neue Geräte werden aus Sicherheitsgründen nur direkt am PC gekoppelt: Companion öffnen → „Gerät koppeln“ → Code erzeugen.")}</Banner>
              <div><Button variant="danger" icon={<LogOut size={16} />} onClick={() => client.logout()}>{t("Dieses Gerät abmelden")}</Button></div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead eyebrow={t("Verbindung")} title={t("Gerät koppeln")} text={t("Verbinde iPhone, iPad, Android oder einen anderen Browser sicher mit diesem PC.")} />
      <div className="grid-2">
        <Card title={t("Kopplungscode")} icon={<KeyRound size={18} />} className={code && !expired ? "glow" : ""}>
          <div className="stack">
            {code && !expired ? (
              <>
                <div className="code-display" aria-label={t("Kopplungscode")}>{code.code}</div>
                {code.pcAddress && (
                  <div className="stack-sm" style={{ textAlign: "center" }}>
                    <span className="label">{t("PC-Adresse (zum Abschreiben)")}</span>
                    <code style={{ fontSize: "1rem" }}>{code.pcAddress}</code>
                  </div>
                )}
                <div className="row between small">
                  <span className="muted">{t("Gültig noch {m}:{s}", { m: Math.floor(left / 60), s: String(left % 60).padStart(2, "0") })}</span>
                  <Button size="sm" onClick={() => client.call("pairing.cancel").then(load)}>{t("Code verwerfen")}</Button>
                </div>
              </>
            ) : (
              <div className="empty">
                <div className="icon-wrap"><QrCode size={28} /></div>
                <b>{expired ? t("Code abgelaufen") : t("Noch kein Code aktiv")}</b>
                <p>{t("Erzeuge einen einmaligen Code. Er ist 5 Minuten gültig.")}</p>
              </div>
            )}
            <Button variant="primary" size="lg" block onClick={create} icon={<KeyRound size={18} />}>{t("Neuen Code erzeugen")}</Button>
            <ol className="steps small">
              <li>{t("QR-Code mit der Handykamera scannen oder die Adresse im Browser öffnen.")}</li>
              <li>{t("Code eingeben (wird beim Scannen automatisch ausgefüllt).")}</li>
              <li>{t("Anfrage hier am PC mit „Erlauben“ bestätigen.")}</li>
            </ol>
          </div>
        </Card>

        <Card title={t("QR-Code & Adresse")} icon={<QrCode size={18} />}>
          {code && !expired && url ? (
            <div className="stack">
              <div className="qr">{qr ? <img src={qr} alt={t("QR-Code zur Kopplung")} /> : null}</div>
              {code.urls.length > 1 && (
                <div className="chips">{code.urls.map((u, i) => <button key={u} className={`chip ${i === urlIndex ? "on" : ""}`} onClick={() => setUrlIndex(i)}>{new URL(u).host}</button>)}</div>
              )}
              <code style={{ textAlign: "center" }}>{url.split("#")[0]}</code>
              <p className="tiny muted">{t("Der QR-Code enthält nur die Adresse und den einmaligen Code – keinen dauerhaften Zugang. Ohne deine Bestätigung passiert nichts.")}</p>
            </div>
          ) : (
            <div className="stack">
              <p className="muted small">{t("Nach dem Erzeugen eines Codes erscheint hier der QR-Code.")}</p>
              {code?.urls.length === 0 && <Banner kind="warn">{t("Keine WLAN-Adresse gefunden. Ist „Im WLAN erreichbar“ in den Einstellungen aktiv?")}</Banner>}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
