// Running session from "history.get" (session without end time). The clock runs locally;
// the PC is asked again only when its history changes and as a fallback every 5 minutes.
const $ = (id) => document.getElementById(id);
const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.floor(m % 60)} min` : `${Math.floor(m)} min`);
let running = null, limit = 60;
const reminded = new Set(); // "<session start>:<n-th reminder>" – each reminder only once while this widget is open

async function load() {
  const [history, cfg] = await Promise.all([pgl.call("history.get"), pgl.config()]);
  limit = Math.max(15, Math.min(480, Number(cfg.minuten) || 60));
  running = history.sessions.find((s) => !s.endedAt) || null;
  $("err").textContent = history.enabled ? "" : "Spielverlauf ist am PC ausgeschaltet – laufende Spiele werden nicht erfasst.";
  tick();
}

function tick() {
  if (!running) {
    $("game").textContent = "Gerade läuft kein Spiel.";
    $("time").textContent = ""; $("hint").textContent = `Erinnerung nach ${fmt(limit)}`; $("fill").style.width = "0";
    return;
  }
  const minutes = (Date.now() - new Date(running.startedAt).getTime()) / 60000;
  $("game").textContent = running.name;
  $("time").textContent = fmt(minutes);
  $("time").classList.toggle("over", minutes >= limit);
  $("fill").style.width = `${Math.min(100, (minutes / limit) * 100)}%`;
  const n = Math.floor(minutes / limit);
  $("hint").textContent = n > 0 ? "Zeit für eine kurze Pause." : `Pause in ${fmt(limit - minutes)}`;
  const key = `${running.startedAt}:${n}`;
  if (n > 0 && !reminded.has(key)) { reminded.add(key); pgl.notify(`${running.name}: schon ${fmt(minutes)} gespielt – Zeit für eine Pause.`); }
}

load().catch((e) => { $("err").textContent = e.message; });
setInterval(tick, 30000);
setInterval(() => load().catch(() => {}), 300000);
pgl.on("changed", (d) => { if (d.topic === "history") load().catch(() => {}); });
