// Game overlay widget: live values from the PC ("monitor.sample") and OBS control through the launcher
// ("obs.*" – the launcher talks to OBS Studio's WebSocket server; this widget never connects to OBS itself).
const $ = (id) => document.getElementById(id);
let status = null;

function bar(id, pct, hot) {
  $(id).textContent = pct == null ? "n. v." : `${pct.toFixed(0)} %`;
  const el = $(id + "Bar");
  el.style.width = `${pct ?? 0}%`;
  el.classList.toggle("hot", pct != null && pct >= (hot ?? 90));
}

pgl.on("monitor.sample", (m) => {
  bar("cpu", m.cpuPercent ?? null);
  bar("ram", m.memTotalBytes ? (m.memUsedBytes / m.memTotalBytes) * 100 : null);
  const g = m.gpus && m.gpus[0];
  bar("gpu", g ? g.utilPercent ?? null : null);
  $("gpuName").textContent = g && g.tempC != null ? `GPU · ${g.tempC.toFixed(0)} °C` : "GPU";
});

function message(text, error) { $("msg").textContent = text || ""; $("msg").className = "msg" + (error ? " err" : ""); }

function render() {
  const s = status;
  const connected = !!(s && s.connected);
  $("dot").className = "dot" + (s && s.recording ? " rec" : connected ? " ok" : "");
  $("state").textContent = !s ? "…" : !connected ? (s.error || "OBS nicht verbunden")
    : s.recording ? `Aufnahme läuft${s.recordTimecode ? " · " + s.recordTimecode.slice(0, 8) : ""}`
    : s.replayBuffer ? "Bereit · Replay-Puffer läuft" : "Bereit";
  $("rec").disabled = !connected;
  $("rec").textContent = s && s.recording ? "■ Aufnahme stoppen" : "● Aufnahme starten";
  $("rec").className = s && s.recording ? "stop" : "primary";
  $("buffer").disabled = !connected || s.replayBuffer == null;
  $("buffer").textContent = s && s.replayBuffer ? "Replay-Puffer aus" : "Replay-Puffer an";
  $("save").disabled = !connected || !s.replayBuffer;
}

async function refresh() {
  try { status = await pgl.call("obs.status"); }
  catch (e) { status = { connected: false, error: e.message }; }
  render();
}

async function act(method, button) {
  button.disabled = true;
  try { const r = await pgl.call(method); message(r && r.message); }
  catch (e) { message(e.message, true); }
  await refresh();
}

$("rec").onclick = () => act("obs.recordToggle", $("rec"));
$("buffer").onclick = () => act("obs.replayToggle", $("buffer"));
$("save").onclick = () => act("obs.replaySave", $("save"));

refresh();
pgl.on("changed", (d) => { if (d.topic === "obs" || d.topic === "settings") refresh(); });
// The recording time only changes while recording: then ask every 2 s, otherwise every 15 s (OBS may be started later).
setInterval(() => { if (status && status.recording) refresh(); }, 2000);
setInterval(() => { if (!status || !status.recording) refresh(); }, 15000);
