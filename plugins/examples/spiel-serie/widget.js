const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
const key = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
async function render() {
  const h = await pgl.call("history.get");
  const days = new Set(h.sessions.map((s) => key(s.startedAt)));
  const d = new Date(); let cur = 0;
  if (!days.has(key(d))) d.setDate(d.getDate() - 1); // today not played yet: the series up to yesterday still counts
  while (days.has(key(d))) { cur++; d.setDate(d.getDate() - 1); }
  const sorted = [...h.sessions.map((s) => new Date(s.startedAt))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const t of sorted) { const day = new Date(t); day.setHours(0, 0, 0, 0); if (prev && day - prev === 0) continue; run = prev && day - prev <= 86400000 * 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  const now = new Date(), month = [...days].filter((k) => k.startsWith(`${now.getFullYear()}-${now.getMonth()}-`)).length;
  $("cur").textContent = cur; $("best").textContent = `${best} Tage`;
  $("month").textContent = h.enabled ? `Diesen Monat an ${month} Tagen gespielt (aus den letzten 100 Sitzungen).` : "Spielverlauf ist am PC ausgeschaltet.";
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
