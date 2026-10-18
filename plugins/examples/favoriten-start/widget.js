// Favourite games/programs as launch buttons. Data comes from the PC's library ("library.list").
const $ = (id) => document.getElementById(id);

async function render() {
  const [lib, cfg] = await Promise.all([pgl.call("library.list"), pgl.config()]);
  const running = new Set(lib.running || []);
  const max = Math.max(1, Math.min(30, Number(cfg.anzahl) || 8));
  const items = lib.items.filter((i) => i.favorite && (!cfg.nurSpiele || i.kind === "game"))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, max);
  $("info").textContent = items.length ? "" : "Noch keine Favoriten – in „Spiele & Programme“ mit dem Stern markieren.";
  $("grid").replaceChildren(...items.map((i) => {
    const b = document.createElement("button");
    if (running.has(i.id)) { b.className = "run"; b.title = "Läuft gerade"; }
    if (typeof i.iconData === "string" && i.iconData.startsWith("data:image/")) b.append(Object.assign(document.createElement("img"), { src: i.iconData, alt: "" }));
    b.append(Object.assign(document.createElement("span"), { textContent: (running.has(i.id) ? "▶ " : "") + i.name }));
    b.onclick = async () => {
      b.disabled = true; $("err").textContent = "";
      try { await pgl.call("library.launch", { id: i.id }); } catch (e) { $("err").textContent = `${i.name}: ${e.message}`; }
      b.disabled = false;
    };
    return b;
  }));
}

render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "library" || d.topic === "history") render().catch(() => {}); });
