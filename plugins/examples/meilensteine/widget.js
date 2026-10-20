const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
const STEPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
async function render() {
  const h = await pgl.call("history.get");
  const top = h.stats.slice(0, 5);
  $("info").textContent = top.length ? "" : "Noch keine Spielzeit erfasst.";
  $("list").replaceChildren(...top.map((s) => {
    const hours = s.totalMinutes / 60, next = STEPS.find((x) => x > hours) ?? null, prev = [...STEPS].reverse().find((x) => x <= hours) ?? 0;
    const pct = next ? ((hours - prev) / (next - prev)) * 100 : 100;
    const box = document.createElement("div"); box.style.margin = "6px 0";
    const head = document.createElement("div"); head.className = "row";
    head.append(Object.assign(document.createElement("span"), { textContent: s.name }), Object.assign(document.createElement("b"), { textContent: next ? `${fmt(s.totalMinutes)} → ${next} h` : `${fmt(s.totalMinutes)} 🏆` }));
    const bar = document.createElement("div"); bar.className = "bar"; const i = document.createElement("i"); i.style.width = pct.toFixed(0) + "%"; bar.append(i);
    box.append(head, bar); return box;
  }));
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history") render().catch(() => {}); });
