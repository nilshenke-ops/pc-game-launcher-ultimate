const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
const pct = (v) => (v == null ? "–" : v.toFixed(0) + " %");
async function render() {
  const h = await pgl.call("history.get");
  const withPerf = h.sessions.filter((s) => s.perf && s.perf.samples > 0).slice(0, 6);
  $("info").textContent = withPerf.length ? "CPU Ø/max · GPU Ø/max" : "Noch keine gemessenen Sitzungen – Werte entstehen beim nächsten Spielen.";
  $("list").replaceChildren(...withPerf.map((s) => {
    const li = document.createElement("li"), p = s.perf;
    li.append(Object.assign(document.createElement("span"), { textContent: `${s.name} (${fmt(s.minutes)})` }), Object.assign(document.createElement("b"), { textContent: `${pct(p.cpuAvg)}/${pct(p.cpuMax)} · ${pct(p.gpuAvg)}/${pct(p.gpuMax)}` }));
    return li;
  }));
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
