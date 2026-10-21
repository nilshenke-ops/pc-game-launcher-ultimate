// Hardware and device inventory: what the PC can really read, grouped by category. A category the PC cannot read says
// why. Without the PC the last copy is shown with its date. Read only – nothing is installed or changed from here.
import { Link } from "react-router-dom";
import { Cpu, RefreshCw } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { Banner, Button, Card, Loadable, PageHead } from "../components/ui";

type Item = Record<string, string | number | boolean | null | undefined>;
interface Category { id: string; title: string; available: boolean; reason?: string | null; items: Item[] }
export interface Inventory { at: string; system: { os: string; uptimeHours: number; companion: string; platform: string }; categories: Category[] }

/** One line per device: name first, then the facts that exist (missing ones are left out, never guessed). */
export function describe(cat: string, i: Item): { name: string; facts: string[] } {
  const f: (string | null | false | undefined)[] = [];
  switch (cat) {
    case "cpu": f.push(i.cores != null && t("{n} Threads", { n: Number(i.cores) })); break;
    case "ram": return { name: bytes(Number(i.totalBytes)), facts: [] };
    case "gpu": f.push(i.memTotalBytes != null && t("{s} Grafikspeicher", { s: bytes(Number(i.memTotalBytes)) }), i.driverVersion ? t("Treiber {v}", { v: String(i.driverVersion) }) + (i.driverDate ? ` (${i.driverDate})` : "") : t("Treiberversion nicht gelesen")); break;
    case "audio": f.push(String(i.kind ?? ""), i.isDefault === true && t("Standard"), i.headset === true && t("Headset (nach Name)"), i.virtualCable === true && t("Virtuelles Kabel")); break;
    case "controllers": f.push(i.battery ? t("Akku: {b}", { b: String(i.battery) }) : null); break;
    case "input": f.push(i.kind ? String(i.kind) : null, i.manufacturer ? String(i.manufacturer) : null, i.vid ? `VID ${i.vid} · PID ${i.pid ?? "?"}` : null); break;
    case "monitors": f.push(`${i.width} × ${i.height}`, i.primary === true && t("Hauptmonitor")); break;
    case "drives": f.push([i.label, i.format].filter(Boolean).join(" · ") || null, t("{f} frei von {s}", { f: bytes(Number(i.freeBytes)), s: bytes(Number(i.totalBytes)) })); break;
    case "network": f.push(i.description ? String(i.description) : null, i.up === true ? (i.speedMbit ? t("Verbunden · {n} Mbit/s", { n: Number(i.speedMbit) }) : t("Verbunden")) : t("Getrennt")); break;
  }
  return { name: String(i.name ?? "?"), facts: f.filter((x): x is string => !!x) };
}

export default function InventoryPage() {
  const q = useRpc<Inventory>("inventory.get", {}, []);
  const d = q.data;
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Hardware-Inventar")}
        text={t("Alles, was der PC über seine Geräte selbst auslesen kann – Prozessor, Grafik mit Treiber, Audio, Controller, Tastaturen und Mäuse, Monitore, Laufwerke und Netzwerk. Was nicht lesbar ist, steht mit Grund da.")}
        actions={!q.stale && <Button icon={<RefreshCw size={16} />} busy={q.loading} onClick={q.reload}>{t("Neu einlesen")}</Button>} />
      {q.stale && <div style={{ marginBottom: 14 }}><Banner kind="info">{t("Ohne PC: Stand vom {d}. Neu einlesen geht erst, wenn der PC verbunden ist.", { d: dateTime(q.updatedAt ? new Date(q.updatedAt).toISOString() : null) })}</Banner></div>}
      <Loadable loading={q.loading && !d} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            <Card title={t("System")} icon={<Cpu size={18} />} meta={t("Gelesen {d}", { d: dateTime(d.at) })}>
              <div className="small stack-sm">
                <div>{d.system.os}</div>
                <div className="muted">{t("Begleiter {v} ({p}) · läuft seit {h} h", { v: d.system.companion, p: d.system.platform, h: d.system.uptimeHours })}</div>
              </div>
            </Card>
            <div className="grid-2">
              {d.categories.map((c) => (
                <Card key={c.id} title={t(c.title)} meta={c.available ? String(c.items.length) : undefined} className="inv-cat">
                  {!c.available ? <p className="small muted" style={{ margin: 0 }}>{t("Nicht verfügbar")}: {t(c.reason ?? "")}</p>
                    : c.items.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Keine gefunden.")}</p>
                      : (
                        <ul className="inv-list">
                          {c.items.map((i, n) => { const x = describe(c.id, i); return <li key={n}><b>{x.name}</b>{x.facts.length > 0 && <span className="small muted"> · {x.facts.join(" · ")}</span>}</li>; })}
                        </ul>
                      )}
                  {c.id === "audio" && c.available && <p className="tiny" style={{ margin: "8px 0 0" }}><Link to="/audio">{t("Testton und Mikrofon-Test im Audio Center")}</Link></p>}
                  {c.id === "controllers" && c.available && <p className="tiny" style={{ margin: "8px 0 0" }}><Link to="/peripherals">{t("Controller testen (Vibration, Sticks)")}</Link></p>}
                  {c.id === "input" && c.available && <p className="tiny" style={{ margin: "8px 0 0" }}><Link to="/input">{t("Tasten belegen")}</Link></p>}
                </Card>
              ))}
            </div>
            <p className="tiny muted">{t("Nur Anzeige: Von hier wird kein Treiber installiert und keine Einstellung geändert.")}</p>
          </div>
        )}
      </Loadable>
    </>
  );
}
