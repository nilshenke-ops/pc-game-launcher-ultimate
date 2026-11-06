// "An PC senden": a link or text from this phone/tablet goes to the PC. Links can be opened in the PC's browser right away;
// texts stay in the list until they are copied or deleted. The PC keeps them for 30 days. Needs the PC connection.
import { useEffect, useState } from "react";
import { ClipboardPaste, Copy, ExternalLink, FileText, Globe, Link2, Send, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { relTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Loadable, PageHead, Switch } from "../components/ui";

interface Item { id: string; kind: "link" | "text"; text: string; from: string; at: string; opened: boolean }
const SHARE_KEY = "pgl.share";

/** What the system share sheet handed over (see main.tsx): taken once. */
function takeShared(): string {
  try { const v = sessionStorage.getItem(SHARE_KEY) ?? ""; sessionStorage.removeItem(SHARE_KEY); return v; } catch { return ""; }
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* old browser or no permission: fall back below */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

export default function InboxPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canSend = useCan("launch");
  const canClear = useCan("manage");
  const q = useRpc<{ items: Item[] }>("inbox.list", {}, ["inbox"]);
  const [text, setText] = useState(takeShared);
  const [openNow, setOpenNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const items = q.data?.items ?? [];
  const isLink = /^https?:\/\/\S+$/i.test(text.trim());

  useEffect(() => { const s = takeShared(); if (s) setText(s); }, []);

  const send = async () => {
    const v = text.trim(); if (!v) return;
    setBusy(true);
    try {
      const r = await client.call<{ message?: string }>("inbox.send", { text: v, open: openNow && isLink });
      toast(t(r.message ?? "Gesendet"), "success"); setText(""); q.reload();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const paste = async () => { try { const v = await navigator.clipboard.readText(); if (v) setText(v); else toast(t("Die Zwischenablage ist leer."), "info"); } catch { toast(t("Einfügen ist hier nicht erlaubt – halte im Feld gedrückt und wähle „Einfügen“."), "info"); } };
  const act = (method: string, params: Record<string, unknown>, ok?: string) => client.call<{ message?: string } | boolean>(method, params)
    .then((r) => { if (ok) toast(ok, "success"); else if (r && typeof r === "object" && r.message) toast(t(r.message), "success"); q.reload(); }, (e: Error) => toast(e.message, "error"));

  return (
    <>
      <PageHead eyebrow={t("Verbindung")} title={t("An PC senden")}
        text={t("Schicke einen Link oder Text vom Handy oder Tablet an deinen PC. Links öffnen sich auf Wunsch gleich im Browser des PCs; Text bleibt hier zum Kopieren stehen.")}
        actions={canClear && items.length > 0 && <Button variant="ghost" icon={<Trash2 size={16} />} disabled={!online}
          onClick={async () => { if (await confirmDialog(t("Alles löschen?"), t("Alle gesendeten Einträge werden vom PC entfernt."), { danger: true, ok: t("Löschen") })) void act("inbox.clear", {}, t("Gelöscht")); }}>{t("Alle löschen")}</Button>} />
      {!online && <div style={{ marginBottom: 14 }}><Banner kind="info">{t("Zum Senden muss der PC verbunden sein.")}</Banner></div>}
      <div className="stack">
        <Card title={t("Senden")} icon={<Send size={18} />}>
          <div className="stack-sm">
            <textarea className="input inbox-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3}
              placeholder={t("Link oder Text hier einfügen")} aria-label={t("Link oder Text")} />
            {isLink && <Switch checked={openNow} onChange={setOpenNow} label={t("Link gleich am PC öffnen")} hint={t("Öffnet ihn im Standard-Browser des PCs. Aus: er landet nur in der Liste.")} />}
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" icon={<Send size={16} />} busy={busy} disabled={!online || !canSend || !text.trim()} onClick={() => void send()}>{t("An PC senden")}</Button>
              <Button icon={<ClipboardPaste size={16} />} onClick={() => void paste()}>{t("Einfügen")}</Button>
            </div>
            {!canSend && online && <p className="tiny muted" style={{ margin: 0 }}>{t("Dieses Gerät darf nichts an den PC senden (Recht „Starten“ fehlt).")}</p>}
          </div>
        </Card>

        <Card title={t("Vom Handy gesendet")} icon={<Link2 size={18} />}>
          <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
            {items.length === 0 ? <Empty icon={<Send size={28} />} title={t("Noch nichts gesendet")} text={t("Gesendete Links und Texte bleiben 30 Tage hier, auf allen deinen Geräten sichtbar.")} />
              : <div className="inbox-list">{items.map((i) => (
                <div key={i.id} className="inbox-item">
                  <span className="inbox-icon" aria-hidden>{i.kind === "link" ? <Globe size={16} /> : <FileText size={16} />}</span>
                  <div className="inbox-body">
                    <div className="inbox-main">{i.kind === "link" ? <a href={i.text} target="_blank" rel="noopener noreferrer">{i.text}</a> : i.text}</div>
                    <small className="muted">{i.from} · {relTime(i.at)}{i.opened ? " · " + t("am PC geöffnet") : ""}</small>
                  </div>
                  <div className="inbox-actions">
                    {i.kind === "link" && <Button size="sm" icon={<ExternalLink size={14} />} disabled={!online || !canSend} onClick={() => void act("inbox.open", { id: i.id })}>{t("Am PC öffnen")}</Button>}
                    <Button size="sm" icon={<Copy size={14} />} aria-label={t("Kopieren")} onClick={async () => toast((await copy(i.text)) ? t("Kopiert") : t("Kopieren hat nicht geklappt"), "info")}>{t("Kopieren")}</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Eintrag löschen")} disabled={!online || !canSend} onClick={() => void act("inbox.remove", { id: i.id })} />
                  </div>
                </div>))}</div>}
          </Loadable>
        </Card>
      </div>
    </>
  );
}
