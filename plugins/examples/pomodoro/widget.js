const $ = (id) => document.getElementById(id);
let cfg = { fokus: 25, pause: 5 }, phase = "fokus", left = 25 * 60, timer = null, rounds = 0;
const mins = (k) => Math.max(1, Math.min(180, Number(cfg[k]) || (k === "fokus" ? 25 : 5)));
const show = () => { $("time").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`; $("phase").textContent = timer ? (phase === "fokus" ? "Fokus" : "Pause") : "Angehalten"; $("start").textContent = timer ? "Pause" : "Start"; $("count").textContent = rounds ? `${rounds} × Fokus geschafft` : ""; };
pgl.config().then((c) => { cfg = { ...cfg, ...c }; left = mins("fokus") * 60; show(); }).catch(() => {});
function tick() {
  left--;
  if (left <= 0) {
    if (phase === "fokus") { rounds++; phase = "pause"; left = mins("pause") * 60; pgl.notify(`Fokus geschafft – ${mins("pause")} Minuten Pause.`); }
    else { phase = "fokus"; left = mins("fokus") * 60; pgl.notify("Pause vorbei – weiter geht's."); }
  }
  show();
}
$("start").onclick = () => { if (timer) { clearInterval(timer); timer = null; } else timer = setInterval(tick, 1000); show(); };
$("reset").onclick = () => { clearInterval(timer); timer = null; phase = "fokus"; left = mins("fokus") * 60; show(); };
show();
