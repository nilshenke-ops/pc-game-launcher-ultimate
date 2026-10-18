// Most played games in the chosen period, from "history.get" (the PC returns the latest 100 sessions).
const $ = (id) => document.getElementById(id);
const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

async function render() {
  const [history, cfg] = await Promise.all([pgl.call("history.get"), pgl.config()]);
  const days = [7, 14, 30].includes(Number(cfg.tage)) ? Number(cfg.tage) : 7;
  const from = Date.now() - days * 86400000;
  const per = {};
  for (const s of history.sessions) {
    const start = new Date(s.startedAt).getTime(), end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    if (end < from) continue;
    per[s.name] = (per[s.name] || 0) + (end - Math.max(start, from)) / 60000; // only the part inside the period
  }
  const top = Object.entries(per).filter(([, m]) => m >= 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  $("range").textContent = `Letzte ${days} Tage`;
  $("total").textContent = fmt(total);
  if (!history.enabled) $("err").textContent = "Spielverlauf ist am PC ausgeschaltet.";
  if (!top.length) { $("list").replaceChildren(Object.assign(document.createElement("div"), { className: "muted", textContent: "In diesem Zeitraum nichts gespielt." })); return; }
  $("list").replaceChildren(...top.map(([name, m]) => {
    const row = document.createElement("div"); row.className = "row";
    const l = document.createElement("div"); l.className = "l";
    l.append(Object.assign(document.createElement("span"), { textContent: name }), Object.assign(document.createElement("b"), { textContent: fmt(m) }));
    const bar = document.createElement("div"); bar.className = "bar";
    const fill = document.createElement("i"); fill.style.width = `${(m / top[0][1]) * 100}%`; bar.append(fill);
    row.append(l, bar);
    return row;
  }));
}

render().catch((e) => { $("total").textContent = "–"; $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
