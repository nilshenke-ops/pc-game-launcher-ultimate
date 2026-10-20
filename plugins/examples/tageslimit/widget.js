const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
let warned = false;
async function render() {
  const [h, cfg] = await Promise.all([pgl.call("history.get"), pgl.config()]);
  const limit = Math.max(10, Math.min(1440, Number(cfg.minuten) || 120));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let played = 0;
  for (const s of h.sessions) { const end = s.endedAt ? new Date(s.endedAt) : new Date(); if (end > today) played += (end - Math.max(new Date(s.startedAt), today)) / 60000; }
  const pct = Math.min(100, (played / limit) * 100);
  $("ring").setAttribute("stroke-dasharray", `${pct} 100`);
  $("ring").style.stroke = pct >= 100 ? "#f87171" : pct >= 80 ? "#fbbf24" : "var(--pgl-accent)";
  $("left").textContent = played >= limit ? "Limit erreicht" : "noch " + fmt(limit - played);
  $("sub").textContent = `heute ${fmt(played)} von ${fmt(limit)}`;
  if (played >= limit && !warned && cfg.hinweis !== false) { warned = true; pgl.notify(`Tageslimit von ${fmt(limit)} erreicht – Zeit für eine Pause?`); }
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
setInterval(() => render().catch(() => {}), 60000); // a running session grows every minute
