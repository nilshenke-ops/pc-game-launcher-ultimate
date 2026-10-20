const $ = (id) => document.getElementById(id);
let cfg = { prozent: 10 };
pgl.config().then((c) => { cfg = { ...cfg, ...c }; }).catch(() => {});
const gb = (b) => (b >= 1099511627776 ? (b / 1099511627776).toFixed(2) + " TB" : (b / 1073741824).toFixed(0) + " GB");
pgl.on("monitor.sample", (m) => {
  if (m.off && m.off.includes("disks")) { $("list").textContent = "Laufwerke sind unter „Messwerte“ ausgeschaltet."; return; }
  const disks = (m.disks || []).filter((d) => d.totalBytes > 0);
  if (!disks.length) { $("list").textContent = "Keine Laufwerke gemeldet."; return; }
  const limit = Math.max(1, Math.min(50, Number(cfg.prozent) || 10));
  $("list").replaceChildren(...disks.map((d) => {
    const freePct = (d.freeBytes / d.totalBytes) * 100, box = document.createElement("div"); box.style.margin = "6px 0";
    const head = document.createElement("div"); head.className = "row";
    head.append(Object.assign(document.createElement("span"), { textContent: `${d.name} ${d.label || ""}`.trim() }), Object.assign(document.createElement("b"), { textContent: `${gb(d.freeBytes)} frei` }));
    const bar = document.createElement("div"); bar.className = "bar"; const i = document.createElement("i");
    i.style.width = (100 - freePct).toFixed(0) + "%"; i.style.background = freePct < limit ? "#ef4444" : "var(--pgl-accent)"; bar.append(i);
    box.append(head, bar); return box;
  }));
});
