const $ = (id) => document.getElementById(id);
let cfg = { schwelle: 85, hinweis: true }, lastNote = 0;
pgl.config().then((c) => { cfg = { ...cfg, ...c }; }).catch(() => {});
const gb = (b) => (b / 1073741824).toFixed(1);
pgl.on("monitor.sample", (m) => {
  if (!m.memTotalBytes || m.memUsedBytes == null) { $("pct").textContent = "–"; $("gb").textContent = m.off && m.off.includes("ram") ? "unter „Messwerte“ ausgeschaltet" : "nicht verfügbar"; return; }
  const pct = (m.memUsedBytes / m.memTotalBytes) * 100, limit = Math.max(50, Math.min(99, Number(cfg.schwelle) || 85));
  $("pct").textContent = pct.toFixed(0) + " %";
  $("gb").textContent = `${gb(m.memUsedBytes)} von ${gb(m.memTotalBytes)} GB · frei ${gb(m.memTotalBytes - m.memUsedBytes)} GB`;
  $("bar").style.width = pct.toFixed(0) + "%"; $("bar").style.background = pct >= limit ? "#ef4444" : "var(--pgl-accent)";
  $("hint").textContent = pct >= limit ? "Speicher wird knapp – Programme im Hintergrund schließen hilft." : "";
  if (pct >= limit && cfg.hinweis !== false && Date.now() - lastNote > 900000) { lastNote = Date.now(); pgl.notify(`Arbeitsspeicher zu ${pct.toFixed(0)} % belegt.`); }
});
