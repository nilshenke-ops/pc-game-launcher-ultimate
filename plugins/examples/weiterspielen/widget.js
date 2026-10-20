const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
const ago = (d) => { const m = (Date.now() - new Date(d)) / 60000; return m < 60 ? "gerade eben" : m < 1440 ? `vor ${Math.round(m / 60)} h` : `vor ${Math.round(m / 1440)} Tag${Math.round(m / 1440) === 1 ? "" : "en"}`; };
async function render() {
  const [h, lib, cfg] = await Promise.all([pgl.call("history.get"), pgl.call("library.list"), pgl.config()]);
  const byId = new Map(lib.items.map((i) => [i.id, i])), running = new Set(lib.running || []);
  const n = Math.max(1, Math.min(8, Number(cfg.anzahl) || 4));
  const recent = h.stats.filter((s) => byId.has(s.itemId)).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed)).slice(0, n);
  $("info").textContent = recent.length ? "" : h.enabled ? "Noch nichts gespielt – sobald du am PC spielst, erscheint es hier." : "Spielverlauf ist am PC ausgeschaltet.";
  $("list").replaceChildren(...recent.map((s) => {
    const li = document.createElement("li"), item = byId.get(s.itemId);
    const left = document.createElement("span"); left.textContent = `${item.name} · ${ago(s.lastPlayed)} · ${fmt(s.totalMinutes)}`;
    const b = Object.assign(document.createElement("button"), { textContent: running.has(item.id) ? "läuft" : "▶", className: "primary" });
    b.disabled = running.has(item.id);
    b.onclick = async () => { b.disabled = true; try { await pgl.call("library.launch", { id: item.id }); } catch (e) { $("err").textContent = e.message; } b.disabled = false; };
    li.append(left, b); return li;
  }));
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "history" || d.topic === "library") render().catch(() => {}); });
