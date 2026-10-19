// Game overlay widget: live values from the PC ("monitor.sample") and recording through the launcher ("capture.*").
// The launcher talks to the program chosen under "Overlay & Aufnahme" (OBS with feedback; NVIDIA, Xbox Game Bar, Steam,
// Discord by pressing their shortcuts) – this widget never connects to any of them itself.
const $ = (id) => document.getElementById(id);
let status = null; // OBS status (only when a function uses OBS)
let cap = null;

function bar(id, pct, hot) {
  $(id).textContent = pct == null ? "n. v." : `${pct.toFixed(0)} %`;
  const el = $(id + "Bar");
  el.style.transform = `scaleX(${(pct ?? 0) / 100})`; // GPU-friendly: no layout work on every sample
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
  const fp = cap && cap.effectiveProviders ? cap.effectiveProviders : { record: "obs", replay: "obs", buffer: "obs" };
  if (cap && Object.values(fp).some((p) => p !== "obs")) return renderMixed(fp);
  $("title").textContent = "Aufnahme (OBS)";
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

/**
 * One or more functions use NVIDIA, Xbox Game Bar, Steam or Discord (no feedback – the launcher presses their shortcuts).
 * Functions that use OBS still show OBS's state.
 */
function renderMixed(fp) {
  const info = (id) => cap.providers.find((x) => x.id === id);
  const short = (id) => (info(id) ? info(id).name.split(" ")[0] : id);
  const obsOk = !!(status && status.connected);
  const can = (a) => { const p = info(fp[a]); return !!p && p.actions.includes(a) && (fp[a] === "obs" ? obsOk : !!p.effective[a]); };
  const names = [...new Set(Object.values(fp))];
  $("title").textContent = "Aufnahme (" + names.map(short).join(" + ") + ")";
  const recObs = fp.record === "obs" && status && status.recording;
  $("dot").className = "dot" + (recObs ? " rec" : "");
  $("state").textContent = "Aufnahme: " + short(fp.record) + " · Replay: " + short(fp.replay) + (recObs ? " · läuft" : "");
  $("rec").disabled = !can("record");
  $("rec").textContent = recObs ? "■ Aufnahme stoppen" : fp.record === "obs" ? "● Aufnahme starten" : "● Aufnahme an/aus";
  $("rec").className = recObs ? "stop" : "primary";
  $("buffer").disabled = !can("buffer");
  $("buffer").textContent = "Replay-Puffer an/aus";
  $("save").disabled = !can("replay") || (fp.replay === "obs" && status && status.replayBuffer === false);
}

async function refresh() {
  try {
    cap = await pgl.call("capture.status");
    status = cap.obs || null;
  } catch (e) { cap = null; status = { connected: false, error: e.message }; }
  render();
}

async function act(method, button) {
  button.disabled = true;
  try { const r = await pgl.call(method); message(r && r.message); }
  catch (e) { message(e.message, true); }
  await refresh();
}

$("rec").onclick = () => act("capture.recordToggle", $("rec"));
$("buffer").onclick = () => act("capture.replayToggle", $("buffer"));
$("save").onclick = () => act("capture.replaySave", $("save"));

refresh();
pgl.on("changed", (d) => { if (d.topic === "obs" || d.topic === "capture" || d.topic === "settings") refresh(); });
// The recording time only changes while recording: then ask every 2 s, otherwise every 15 s (OBS may be started later).
setInterval(() => { if (status && status.recording) refresh(); }, 2000);
setInterval(() => { if (!status || !status.recording) refresh(); }, 15000);
