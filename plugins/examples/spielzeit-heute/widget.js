// Runs inside the sandbox. "pgl" is the bridge provided by the launcher (see plugins/sdk/README.md).
const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

async function render() {
  const [history, config] = await Promise.all([pgl.call("history.get"), pgl.config()]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const perGame = {};
  for (const s of history.sessions) {
    const start = new Date(s.startedAt), end = s.endedAt ? new Date(s.endedAt) : new Date();
    if (end < today) continue;
    const minutes = (end - Math.max(start, today)) / 60000; // only the part that falls on today
    perGame[s.name] = (perGame[s.name] || 0) + minutes;
  }
  const total = Object.values(perGame).reduce((a, b) => a + b, 0);
  document.getElementById("total").textContent = fmt(total);
  const goal = Number(config.ziel) || 0;
  document.getElementById("goal").textContent = goal > 0 ? `Tagesziel ${fmt(goal)} – ${total >= goal ? "erreicht" : "noch " + fmt(goal - total)}` : history.enabled ? "heute gespielt" : "Spielverlauf ist am PC ausgeschaltet";
  const list = document.getElementById("list");
  list.replaceChildren(...Object.entries(perGame).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, m]) => {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("span"), { textContent: name }), Object.assign(document.createElement("b"), { textContent: fmt(m) }));
    return li;
  }));
}

render().catch((e) => { document.getElementById("total").textContent = "–"; document.getElementById("goal").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render(); });
