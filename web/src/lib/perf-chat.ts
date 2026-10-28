// JARVIS performance analysis: "Warum läuft mein Spiel langsam?", "Welche Programme verbrauchen am meisten RAM?",
// "Ist meine GPU aktuell stark ausgelastet?", "Was könnte meine FPS beeinträchtigen?". The PC measures (monitor.now,
// system.topProcesses); this module only reads the numbers and separates what was measured from what it suspects.
// Nothing is closed or changed from here – closing a program needs its own tap with a confirmation.

import { client } from "./rpc";

export type PerfIntent = { kind: "slow" | "ram" | "cpu" | "gpu" | "fps" | "status" | "temp" };

export function perfIntent(raw: string): PerfIntent | null {
  const s = raw.toLowerCase();
  if (/\bfps\b|bildrate|frames/.test(s) && /beeinträchtig|senk|niedrig|wenig|warum|was könnte|was kann|verbesser|mehr/.test(s)) return { kind: "fps" };
  if (/(warum|wieso|weshalb).*(langsam|ruckel|stottert|hakt|träge)|(läuft|ist).*(langsam|ruckelig|träge)|ruckelt (so|mein|das)|performance.?problem/.test(s) && !/internet|download|wlan|ping|verbindung/.test(s)) return { kind: "slow" };
  if (/(welche|was für) (programme?|prozesse|apps?)\b.*(ram|arbeitsspeicher|speicher)|\b(ram|arbeitsspeicher)\b.*(fress|verbrauch|belegt|voll)/.test(s)) return { kind: "ram" };
  if (/(welche|was für) (programme?|prozesse|apps?)\b.*(cpu|prozessor|rechenleistung)|\b(cpu|prozessor)\b.*(fress|verbrauch|ausgelastet|auslastung)/.test(s) && !/gpu|grafik/.test(s)) return { kind: "cpu" };
  if (/\b(gpu|grafikkarte)\b.*(ausgelastet|auslastung|last|voll|wie stark|wie hoch|grafikspeicher|vram)|wie (stark|hoch) ist (meine |die )?(gpu|grafikkarte)/.test(s)) return { kind: "gpu" };
  if (/wie (warm|heiß|heiss) (ist|wird|sind)|temperatur(en)? (von |meiner |meines |der )?(gpu|cpu|pc|grafikkarte|prozessor)|(gpu|cpu)-?temperatur/.test(s)) return { kind: "temp" };
  if (/wie geht es (meinem|dem) pc|pc-?status|wie läuft (mein|der) pc|leistungs-?check|systemstatus/.test(s)) return { kind: "status" };
  return null;
}

// ------------------------------------------------------------------------------------------ analysis (pure, tested)

export interface Gpu { name: string; utilPercent?: number | null; tempC?: number | null; memUsedBytes?: number | null; memTotalBytes?: number | null }
export interface Sample { cpuPercent?: number | null; cpuTempC?: number | null; cpuName?: string | null; memTotalBytes?: number | null; memUsedBytes?: number | null; gpus?: Gpu[]; disks?: { name: string; label: string; totalBytes: number; freeBytes: number }[]; fpsStatus?: string | null; off?: string[] }
export interface Proc { name: string; ramMb: number; cpuPercent?: number | null; count: number }
export interface Now { sample: Sample; running: { itemId: string; name: string }[]; gameRunning: boolean }

const pct = (n: number) => `${Math.round(n)} %`;
const gb = (b: number) => `${(b / 1073741824).toFixed(1).replace(".", ",")} GB`;
/** Programs that are part of Windows, drivers, security software or game launchers – never suggested for closing. */
const PROTECTED = /^(system|svchost|csrss|wininit|winlogon|services|lsass|dwm|explorer|msmpeng|securityhealth|smartscreen|nvcontainer|nvidia|amd|radeon|audiodg|steam|steamwebhelper|epicgameslauncher|eadesktop|battle\.net|riotclient|vgc|easyanticheat|beservice|pcgamelauncher|companion|dotnet|searchhost|startmenuexperiencehost|runtimebroker|textinputhost|ctfmon|sihost|taskhostw|fontdrvhost|registry)/i;

export function analyse(now: Now, top: { ram: Proc[]; cpu: Proc[] } | null, focus: PerfIntent["kind"]): { measured: string[]; guesses: string[]; tips: string[] } {
  const m = now.sample, measured: string[] = [], guesses: string[] = [], tips: string[] = [];
  const off = new Set(m.off ?? []);
  const ramPct = m.memTotalBytes && m.memUsedBytes != null ? (100 * m.memUsedBytes) / m.memTotalBytes : null;
  const gpu = (m.gpus ?? []).slice().sort((a, b) => (b.utilPercent ?? -1) - (a.utilPercent ?? -1))[0];
  const game = now.running[0]?.name;
  const add = (cond: boolean, line: string) => { if (cond) measured.push(line); };
  add(true, game ? `Läuft gerade: ${now.running.map((r) => r.name).join(", ")}` : "Kein Spiel aus deiner Bibliothek läuft gerade");
  add(m.cpuPercent != null, `CPU: ${pct(m.cpuPercent ?? 0)} ausgelastet${m.cpuTempC != null ? `, ${Math.round(m.cpuTempC)} °C` : ""}`);
  add(m.cpuPercent == null, off.has("cpu") ? "CPU: Messung ausgeschaltet" : "CPU: nicht verfügbar");
  add(ramPct != null, `RAM: ${gb(m.memUsedBytes ?? 0)} von ${gb(m.memTotalBytes ?? 0)} belegt (${pct(ramPct ?? 0)}), frei ${gb((m.memTotalBytes ?? 0) - (m.memUsedBytes ?? 0))}`);
  add(ramPct == null, off.has("ram") ? "RAM: Messung ausgeschaltet" : "RAM: nicht verfügbar");
  if (gpu) measured.push(`GPU ${gpu.name}: ${gpu.utilPercent != null ? pct(gpu.utilPercent) + " ausgelastet" : "Auslastung nicht verfügbar"}${gpu.tempC != null ? `, ${Math.round(gpu.tempC)} °C` : ""}${gpu.memUsedBytes != null && gpu.memTotalBytes ? `, Grafikspeicher ${gb(gpu.memUsedBytes)} von ${gb(gpu.memTotalBytes)}` : ""}`);
  else measured.push(off.has("gpu") ? "GPU: Messung ausgeschaltet" : "GPU: keine Werte (Treiber/nvidia-smi nicht erreichbar)");
  const lowDisk = (m.disks ?? []).filter((d) => d.totalBytes > 0 && d.freeBytes / d.totalBytes < 0.1);
  for (const d of (m.disks ?? []).slice(0, 3)) measured.push(`Laufwerk ${d.name}: ${gb(d.freeBytes)} frei von ${gb(d.totalBytes)}`);
  measured.push(`FPS: ${m.fpsStatus ?? "nicht verfügbar"}`);
  if (top && (focus === "ram" || focus === "slow" || focus === "fps" || focus === "status")) measured.push(`Meister RAM: ${top.ram.slice(0, 5).map((p) => `${p.name} ${p.ramMb >= 1024 ? `${(p.ramMb / 1024).toFixed(1).replace(".", ",")} GB` : `${Math.round(p.ramMb)} MB`}${p.count > 1 ? ` (${p.count} Prozesse)` : ""}`).join(", ")}`);
  if (top && (focus === "cpu" || focus === "slow" || focus === "fps")) measured.push(`Meiste CPU: ${top.cpu.slice(0, 5).map((p) => `${p.name} ${pct(p.cpuPercent ?? 0)}`).join(", ")}`);

  // Suspicions – each one says which number it is based on.
  const gpuUtil = gpu?.utilPercent ?? null;
  if (m.cpuPercent != null && m.cpuPercent >= 90) guesses.push(`Die CPU ist fast voll (${pct(m.cpuPercent)}) – das Spiel wartet vermutlich auf den Prozessor.`);
  if (m.cpuPercent != null && m.cpuPercent >= 80 && gpuUtil != null && gpuUtil < 60 && game) guesses.push("Hohe CPU- bei niedriger GPU-Last: eher CPU-begrenzt – weniger Hintergrundprogramme oder niedrigere CPU-lastige Einstellungen (Sichtweite, NPC-Dichte) helfen am ehesten.");
  if (gpuUtil != null && gpuUtil >= 95 && game) guesses.push(`Die GPU läuft am Anschlag (${pct(gpuUtil)}) – im Spiel ist das normal; für mehr FPS Grafikdetails, Auflösung oder Raytracing senken bzw. DLSS/FSR nutzen, falls das Spiel es anbietet.`);
  if (gpu?.memUsedBytes != null && gpu.memTotalBytes && gpu.memUsedBytes / gpu.memTotalBytes > 0.92) guesses.push("Der Grafikspeicher ist fast voll – Texturqualität eine Stufe senken kann Ruckler verhindern.");
  if (ramPct != null && ramPct >= 88) guesses.push(`Der Arbeitsspeicher ist knapp (${pct(ramPct)}) – Windows lagert dann auf die Festplatte aus, das kann ruckeln.`);
  if (gpu?.tempC != null && gpu.tempC >= 85) guesses.push(`Die GPU ist sehr warm (${Math.round(gpu.tempC)} °C) – möglicherweise drosselt sie sich. Lüftungsschlitze frei? Laptop auf fester Unterlage?`);
  if (m.cpuTempC != null && m.cpuTempC >= 95) guesses.push(`Die CPU ist sehr heiß (${Math.round(m.cpuTempC)} °C) – sie drosselt sich vermutlich.`);
  if (lowDisk.length) guesses.push(`Wenig freier Speicher auf ${lowDisk.map((d) => d.name).join(", ")} (unter 10 %) – das kann Ladezeiten und Updates bremsen.`);
  if (!guesses.length && (focus === "slow" || focus === "fps")) guesses.push(game ? "In den Messwerten sehe ich gerade keinen Engpass. Möglich sind Dinge, die ich nicht messe: FPS-Limit/V-Sync im Spiel, Energiesparmodus, Treiber, Internetverbindung (bei Online-Spielen) oder das Spiel selbst." : "Gerade läuft kein Spiel aus deiner Bibliothek – frag am besten, während das Spiel läuft, dann sehe ich die Last dabei.");

  // Safe next steps – nothing is done automatically.
  const closable = (top?.ram ?? []).filter((p) => !PROTECTED.test(p.name) && p.name !== game && p.ramMb > 300).slice(0, 3);
  if ((ramPct != null && ramPct >= 80 || focus === "ram") && closable.length) tips.push(`Nicht benötigte Programme schließen, z. B. ${closable.map((p) => p.name).join(", ")} – das machst du am PC oder unter PC-Steuerung (Programme aus deiner Bibliothek, mit Bestätigung). Windows-Prozesse, Treiber und Sicherheitssoftware schlage ich nie vor.`);
  if (focus === "slow" || focus === "fps") tips.push("Am Laptop prüfen: Netzteil angeschlossen, Windows-Energiemodus „Beste Leistung“, Spiel läuft auf der NVIDIA-GPU (NVIDIA-App → Grafik).", "Grafiktreiber aktuell? (NVIDIA-App bzw. Hersteller-Seite)", "Im Spiel: V-Sync/FPS-Limit, Auflösung, Upscaling (DLSS/FSR) und Schattenqualität prüfen.");
  if (lowDisk.length) tips.push("Speicher freiräumen: Speicher & Updates zeigt, was am meisten Platz braucht.");
  return { measured, guesses, tips };
}

// ------------------------------------------------------------------------------------------ chat answer

export interface PerfReply { text: string; ok: boolean | null; navigate: { label: string; path: string }[] }

export async function perfAnswer(i: PerfIntent, online: boolean): Promise<PerfReply> {
  const nav = [{ label: "PC-Steuerung", path: "/control" }, { label: "PC-Monitor", path: "/monitor" }];
  if (!online) return { text: "Dafür brauche ich echte Messwerte vom PC – er ist gerade nicht verbunden. Ich rate keine Werte. Sobald der Begleiter läuft und verbunden ist, frag nochmal.", ok: null, navigate: [{ label: "Verbindung prüfen", path: "/diagnostics" }] };
  let now: Now;
  try { now = await client.call<Now>("monitor.now"); }
  catch (e) { return { text: `Die Messwerte konnte ich nicht abrufen: ${(e as Error).message}`, ok: false, navigate: nav }; }
  let top: { ram: Proc[]; cpu: Proc[] } | null = null;
  if (i.kind !== "gpu" && i.kind !== "temp") {
    try { top = await client.call<{ ram: Proc[]; cpu: Proc[] }>("system.topProcesses"); } catch { /* without the right to see programs: only the totals */ }
  }
  const a = analyse(now, top, i.kind);
  const title = { slow: "Warum es langsam sein könnte", ram: "Arbeitsspeicher", cpu: "Prozessor", gpu: "Grafikkarte", fps: "Was die FPS bremsen könnte", status: "PC-Status", temp: "Temperaturen" }[i.kind];
  let measured = a.measured;
  if (i.kind === "gpu") measured = measured.filter((l) => l.startsWith("GPU") || l.startsWith("Läuft") || l.startsWith("Kein Spiel"));
  if (i.kind === "temp") measured = measured.filter((l) => /°C|nicht verfügbar|ausgeschaltet/.test(l) && /^(CPU|GPU)/.test(l));
  if (i.kind === "ram") measured = measured.filter((l) => /^(RAM|Meister RAM|Läuft|Kein Spiel)/.test(l));
  if (i.kind === "cpu") measured = measured.filter((l) => /^(CPU|Meiste CPU|Läuft|Kein Spiel)/.test(l));
  const lines = [`JARVIS – ${title}`, "📊 Gemessen (vom PC, jetzt):", ...measured.map((x) => "• " + x)];
  const guesses = i.kind === "gpu" || i.kind === "temp" || i.kind === "ram" || i.kind === "cpu" ? a.guesses.filter((g) => (i.kind === "gpu" ? /GPU|Grafik/ : i.kind === "temp" ? /warm|heiß/ : i.kind === "ram" ? /Arbeitsspeicher/ : /CPU/).test(g)) : a.guesses;
  if (guesses.length) lines.push("", "💡 Vermutung (aus den Messwerten abgeleitet):", ...guesses.map((x) => "• " + x));
  if (a.tips.length && i.kind !== "gpu" && i.kind !== "temp") lines.push("", "✅ Sichere nächste Schritte (nichts passiert automatisch):", ...a.tips.map((x) => "• " + x));
  return { text: lines.join("\n"), ok: true, navigate: nav };
}
