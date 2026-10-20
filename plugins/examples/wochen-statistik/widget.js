const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
const DAY = 86400000;
async function render() {
  const [h, cfg] = await Promise.all([pgl.call("history.get"), pgl.config()]);
  const days = Number(cfg.tage) === 14 ? 14 : 7;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setTime(start.getTime() - (days - 1) * DAY);
  const per = new Array(days).fill(0);
  for (const s of h.sessions) {
    let a = new Date(s.startedAt).getTime(); const b = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    // Sessions over midnight are split onto both days.
    while (a < b) {
      const dayStart = new Date(a); dayStart.setHours(0, 0, 0, 0);
      const next = dayStart.getTime() + DAY, part = Math.min(b, next) - a, i = Math.floor((dayStart.getTime() - start.getTime()) / DAY);
      if (i >= 0 && i < days) per[i] += part / 60000;
      a = next;
    }
  }
  const total = per.reduce((x, y) => x + y, 0), max = Math.max(1, ...per);
  $("total").textContent = fmt(total);
  $("avg").textContent = h.enabled ? `${days} Tage · Ø ${fmt(total / days)} pro Tag` : "Spielverlauf ist am PC ausgeschaltet";
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  $("bars").replaceChildren(...per.map((m) => { const b = document.createElement("div"); b.title = fmt(m); b.style.cssText = `flex:1;border-radius:4px 4px 0 0;background:var(--pgl-accent);opacity:${m ? 1 : .25};height:${Math.max(3, (m / max) * 100)}%`; return b; }));
  $("labels").replaceChildren(...per.map((_, i) => Object.assign(document.createElement("span"), { textContent: names[new Date(start.getTime() + i * DAY).getDay()], style: "flex:1;text-align:center" })));
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
