const $ = (id) => document.getElementById(id);
let cfg = { warnen: 75, kritisch: 85, hinweis: true }, lastNote = 0;
pgl.config().then((c) => { cfg = { ...cfg, ...c }; }).catch(() => {});
pgl.on("monitor.sample", (m) => {
  if (m.off && m.off.includes("gpu")) { $("temp").textContent = "aus"; $("name").textContent = "Grafikkarte ist unter „Messwerte“ ausgeschaltet"; return; }
  const g = (m.gpus || [])[0];
  if (!g) { $("temp").textContent = "–"; $("name").textContent = "Keine Grafikkarte erkannt"; return; }
  $("name").textContent = g.name;
  $("util").textContent = g.utilPercent != null ? `Auslastung ${g.utilPercent.toFixed(0)} %` : "";
  if (g.tempC == null) { $("temp").textContent = "n. v."; $("lamp").style.background = "var(--pgl-border)"; $("util").textContent += " · Temperatur nur bei NVIDIA verfügbar"; return; }
  const t = g.tempC, warn = Number(cfg.warnen) || 75, crit = Number(cfg.kritisch) || 85;
  $("temp").textContent = `${t.toFixed(0)} °C`;
  const color = t >= crit ? "#ef4444" : t >= warn ? "#f59e0b" : "#22c55e";
  $("lamp").style.background = color; $("lamp").style.boxShadow = `0 0 18px ${color}`;
  if (t >= crit && cfg.hinweis !== false && Date.now() - lastNote > 600000) { lastNote = Date.now(); pgl.notify(`Grafikkarte ${t.toFixed(0)} °C – ab ${crit} °C rot.`); }
});
