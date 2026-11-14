// The page the QR code opens on the phone (3.64): "#/x/<id>.<secret>". No app and no account needed. It proves the secret, waits for
// the OK at the PC (both show the same code), then receives the files (PC → phone) or sends the chosen ones (phone → PC) – encrypted,
// piece by piece, with progress, speed, pause, cancel and retry. On iPhone/iPad the received files are saved via the share sheet.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Film, Image as ImageIcon, Loader2, Music, Package, Pause, Play, RotateCcw, Send, ShieldCheck, Upload, X } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { useConn } from "../lib/hooks";
import { bytes } from "../lib/format";
import { parseShareToken } from "../lib/share-crypto";
import { PhoneShare, rate, type Control, type Direction, type PhoneFile } from "../lib/share";
import { saveToDevice } from "../lib/transfer";

type Phase = "connecting" | "unreachable" | "waiting" | "ready" | "running" | "paused" | "done" | "failed" | "ended" | "invalid";
interface Item { name: string; size: number; kind: string; got: number; state: "wait" | "run" | "done" | "error"; blob?: Blob; file?: File; error?: string; saved?: boolean }

const KIND_ICON: Record<string, typeof FileText> = { image: ImageIcon, video: Film, audio: Music, archive: Package, document: FileText, other: FileText };
const kindOf = (name: string) => /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(name) ? "image" : /\.(mp4|mov|mkv|webm|avi)$/i.test(name) ? "video" : /\.(mp3|wav|m4a|flac|ogg)$/i.test(name) ? "audio" : /\.(zip|7z|rar)$/i.test(name) ? "archive" : /\.(pdf|txt|docx?|md)$/i.test(name) ? "document" : "other";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ShareTransfer({ token }: { token: string }) {
  const parsed = useMemo(() => parseShareToken(token), [token]);
  const share = useMemo(() => (parsed ? new PhoneShare(parsed.id, parsed.secret) : null), [parsed]);
  const conn = useConn();
  const [phase, setPhase] = useState<Phase>(parsed ? "connecting" : "invalid");
  const [direction, setDirection] = useState<Direction>("send");
  const [code, setCode] = useState("");
  const [pc, setPc] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [speed, setSpeed] = useState<{ bps: number | null; eta: number | null }>({ bps: null, eta: null });
  const ctl = useRef<Control>({ paused: false, aborted: false });
  const samples = useRef<{ t: number; bytes: number }[]>([]);
  const pick = useRef<HTMLInputElement>(null);
  const joined = useRef(false);
  const [previews, setPreviews] = useState(true);

  const online = conn.phase === "online";
  // Join as soon as the PC is reachable; again after a lost connection (with the resume token, without asking the PC again).
  useEffect(() => {
    if (!share || !online) return;
    let gone = false;
    share.join().then((r) => {
      if (gone) return;
      joined.current = true;
      setDirection(r.direction); setCode(r.code); setPc(r.pc ?? "");
      if (r.state === "approved") void loadInfo(); else setPhase((p) => (p === "running" || p === "paused" ? p : "waiting"));
    }, (e: Error & { code?: string }) => { if (!gone) { setMessage(e.message); setPhase(e.code === "expired" || e.code === "not-found" ? "ended" : "failed"); } });
    return () => { gone = true; };
  }, [share, online]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!online && !joined.current) { const id = window.setTimeout(() => setPhase((p) => (p === "connecting" ? "unreachable" : p)), 9000); return () => window.clearTimeout(id); } }, [online]);

  useEffect(() => client.on("share.state", (d) => {
    const x = d as { id: string; state: string; resume?: string; message?: string };
    if (!share || x.id !== share.id) return;
    if (x.state === "approved") { share.resume = x.resume ?? share.resume; void loadInfo(); }
    else if (["rejected", "revoked", "expired"].includes(x.state)) { ctl.current.aborted = true; setMessage(x.message ?? (x.state === "expired" ? t("Die Übertragung ist abgelaufen.") : t("Am PC beendet."))); setPhase("ended"); }
  }), [share]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInfo() {
    if (!share) return;
    try {
      const info = await share.info();
      setDirection(info.direction); setPreviews(info.previews !== false);
      if (info.direction === "send") setItems((old) => old.length ? old : info.files.map((f: PhoneFile) => ({ name: f.name, size: f.size, kind: f.kind, got: 0, state: "wait" as const })));
      setPhase((p) => (p === "running" || p === "paused" || p === "done" ? p : "ready"));
    } catch (e) { setMessage((e as Error).message); setPhase("failed"); }
  }

  const total = items.reduce((a, i) => a + i.size, 0);
  const got = items.reduce((a, i) => a + i.got, 0);
  const update = (name: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.name === name ? { ...i, ...patch } : i)));

  async function run() {
    if (!share) return;
    ctl.current = { paused: false, aborted: false };
    samples.current = [{ t: Date.now(), bytes: got }];
    setPhase("running");
    let sum = got, failed = 0;
    const tick = (n: number, name: string) => {
      sum += n;
      setItems((list) => list.map((i) => (i.name === name ? { ...i, got: i.got + n } : i)));
      samples.current = [...samples.current.filter((s) => Date.now() - s.t < 5000), { t: Date.now(), bytes: sum }];
      setSpeed(rate(samples.current, total - sum));
    };
    for (const it of items) {
      if (it.state === "done") continue;             // already complete – never sent twice
      update(it.name, { state: "run", got: 0, error: undefined });
      sum -= it.got;
      try {
        if (direction === "send") { const blob = await share.download(it.name, it.size, (n) => tick(n, it.name), ctl.current); update(it.name, { state: "done", blob, got: it.size }); }
        else { await share.upload(it.file!, (n) => tick(n, it.name), ctl.current); update(it.name, { state: "done", got: it.size }); }
      } catch (e) {
        if ((e as { code?: string }).code === "cancelled") { update(it.name, { state: "wait", got: 0 }); setPhase("ready"); return; }
        failed++; update(it.name, { state: "error", error: (e as Error).message });
      }
    }
    if (direction === "receive" && !failed) await share.finish().catch(() => undefined);
    setPhase(failed ? "failed" : "done");
    if (failed) setMessage(t("{n} Datei(en) fehlgeschlagen – „Erneut versuchen“ überträgt nur diese.", { n: failed }));
  }

  const choose = (files: File[]) => setItems((old) => [...old.filter((o) => o.state === "done"), ...files.slice(0, 50).map((f) => ({ name: f.name, size: f.size, kind: kindOf(f.name), got: 0, state: "wait" as const, file: f }))]);

  const save = async (it: Item) => { if (!it.blob) return; await saveToDevice(it.name, it.blob); update(it.name, { saved: true }); };
  const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;

  return (
    <div className="xs-page">
      <header className="xs-head">
        <span className="xs-logo" aria-hidden><img src="./icons/icon-192.png" alt="" width={28} height={28} /></span>
        <div><b>Nexus Gaming Hub</b><span className="xs-sub">{direction === "receive" ? t("Dateien an den PC senden") : t("Dateien vom PC empfangen")}{pc ? ` · ${pc}` : ""}</span></div>
      </header>

      <main className="xs-card" aria-live="polite">
        {phase === "invalid" && <State icon={<AlertTriangle />} title={t("Ungültiger QR-Code")} text={t("Bitte am PC einen neuen QR-Code erzeugen und erneut scannen.")} />}
        {phase === "connecting" && <State icon={<Loader2 className="spin" />} title={t("Verbinde mit dem PC …")} text={t("Einen Moment.")} />}
        {phase === "unreachable" && <State icon={<AlertTriangle />} title={t("PC nicht erreichbar")} text={t("Ist der PC an und der Nexus-Begleiter gestartet? Am einfachsten klappt es im selben WLAN wie der PC. Sobald der PC erreichbar ist, geht es hier von selbst weiter.")} />}
        {phase === "waiting" && (
          <div className="xs-wait">
            <ShieldCheck size={30} aria-hidden />
            <b>{t("Bitte am PC bestätigen")}</b>
            <span className="xs-sub">{t("Der PC zeigt denselben Code. Stimmt er, dort „Erlauben“ tippen.")}</span>
            <span className="xs-code" aria-label={t("Code {c}", { c: code.split("").join(" ") })}>{code}</span>
          </div>
        )}
        {phase === "ended" && <State icon={<X />} title={t("Übertragung beendet")} text={message || t("Bitte am PC einen neuen QR-Code erzeugen.")} />}

        {(["ready", "running", "paused", "done", "failed"] as Phase[]).includes(phase) && (
          <>
            {direction === "receive" && phase === "ready" && (
              <div className="xs-pick">
                <input ref={pick} type="file" multiple hidden onChange={(e) => { choose(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <button type="button" className="btn" onClick={() => pick.current?.click()}><Upload size={16} aria-hidden /> {t("Dateien auswählen")}</button>
                <span className="xs-sub">{t("Fotos, Videos, Dokumente … Programme und Skripte nimmt der PC nicht an.")}</span>
              </div>
            )}
            {items.length > 0 && (
              <>
                <div className="xs-sum"><span>{t("{n} Datei(en)", { n: items.length })}</span><b>{bytes(total)}</b></div>
                <ul className="xs-files">
                  {items.map((it) => {
                    const Icon = KIND_ICON[it.kind] ?? FileText;
                    const p = it.size ? Math.round((it.got / it.size) * 100) : it.state === "done" ? 100 : 0;
                    return (
                      <li key={it.name} className={`xs-file ${it.state}`}>
                        {previews && it.blob && it.kind === "image" ? <Thumb blob={it.blob} /> : <span className="xs-ficon" aria-hidden><Icon size={18} /></span>}
                        <span className="xs-fbody">
                          <b className="ellipsis">{it.name}</b>
                          <span className="xs-sub">{bytes(it.size)}{it.state === "run" ? ` · ${p} %` : it.state === "done" ? ` · ${t("fertig")}` : it.state === "error" ? ` · ${it.error}` : ""}</span>
                          {(it.state === "run" || it.state === "done") && <span className="xs-bar" aria-hidden><i style={{ transform: `scaleX(${p / 100})` }} /></span>}
                        </span>
                        {it.state === "done" && it.blob && <button type="button" className="btn sm" onClick={() => void save(it)}>{it.saved ? <CheckCircle2 size={15} aria-hidden /> : <Download size={15} aria-hidden />} {it.saved ? t("Gesichert") : t("Sichern")}</button>}
                        {it.state === "error" && <AlertTriangle size={16} className="xs-bad" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {(phase === "running" || phase === "paused") && (
              <div className="xs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <span className="xs-bar big" aria-hidden><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
                <span className="xs-sub">{pct} % · {bytes(got)} / {bytes(total)}{speed.bps ? ` · ${bytes(speed.bps)}/s` : ""}{speed.eta != null && phase === "running" ? ` · ${t("noch {t}", { t: mmss(speed.eta) })}` : ""}{phase === "paused" ? ` · ${t("pausiert")}` : ""}</span>
                <span className="row">
                  {phase === "running"
                    ? <button type="button" className="btn sm" onClick={() => { ctl.current.paused = true; setPhase("paused"); }}><Pause size={15} aria-hidden /> {t("Pause")}</button>
                    : <button type="button" className="btn sm" onClick={() => { ctl.current.paused = false; setPhase("running"); }}><Play size={15} aria-hidden /> {t("Weiter")}</button>}
                  <button type="button" className="btn sm ghost" onClick={() => { ctl.current.aborted = true; }}><X size={15} aria-hidden /> {t("Abbrechen")}</button>
                </span>
              </div>
            )}

            {phase === "ready" && items.length > 0 && (
              <button type="button" className="btn primary xs-go" onClick={() => void run()}>
                {direction === "send" ? <><Download size={17} aria-hidden /> {t("Dateien empfangen")}</> : <><Send size={17} aria-hidden /> {t("An den PC senden")}</>}
              </button>
            )}
            {phase === "failed" && (
              <div className="xs-fail">
                <span className="xs-sub">{message}</span>
                {items.some((i) => i.state === "error") && <button type="button" className="btn" onClick={() => void run()}><RotateCcw size={15} aria-hidden /> {t("Erneut versuchen")}</button>}
              </div>
            )}
            {phase === "done" && (
              <div className="xs-done">
                <CheckCircle2 size={26} aria-hidden />
                <b>{direction === "send" ? t("Alles empfangen") : t("Alles beim PC angekommen")}</b>
                {direction === "send" && <span className="xs-sub">{t("Tippe bei jeder Datei auf „Sichern“ – auf dem iPhone/iPad dann „Bild sichern“ oder „In Dateien sichern“.")}</span>}
              </div>
            )}
          </>
        )}
      </main>
      <p className="xs-foot">{t("Verschlüsselt übertragen (AES-256). Der QR-Code gilt nur kurz und nur für dieses Gerät.")}</p>
    </div>
  );
}

function State({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="xs-state"><span className="xs-sicon" aria-hidden>{icon}</span><b>{title}</b><span className="xs-sub">{text}</span></div>;
}

/** A small preview of a received picture (made only once it is here, freed again when the page goes). */
function Thumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  if (bad) return <span className="xs-ficon" aria-hidden><ImageIcon size={18} /></span>;
  return url ? <img className="xs-thumb" src={url} alt="" onError={() => setBad(true)} /> : null;
}
