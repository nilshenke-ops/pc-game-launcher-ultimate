// Sound buttons from the PC's soundboard ("sounds.list"); playback happens on the PC ("sounds.play").
const $ = (id) => document.getElementById(id);
const fail = (e) => { $("err").textContent = e.message; };

async function render() {
  const [list, cfg] = await Promise.all([pgl.call("sounds.list"), pgl.config()]);
  const { sounds, collections, activeCollectionId } = list.data;
  let pick;
  if (cfg.auswahl === "Alle") pick = sounds;
  else if (cfg.auswahl === "Aktive Sammlung") {
    const col = collections.find((c) => c.id === activeCollectionId);
    pick = col ? col.soundIds.map((id) => sounds.find((s) => s.id === id)).filter(Boolean) : [];
    $("info").textContent = col ? `Sammlung: ${col.name}` : "Keine Sammlung aktiv.";
  } else pick = sounds.filter((s) => s.favorite);
  pick = pick.slice(0, Math.max(1, Math.min(16, Number(cfg.anzahl) || 12)));
  if (!pick.length && cfg.auswahl !== "Aktive Sammlung") $("info").textContent = cfg.auswahl === "Alle" ? "Noch keine Sounds im Soundboard." : "Noch keine Favoriten – im Soundboard mit dem Stern markieren.";
  if (!list.supported) $("err").textContent = list.reason || "Wiedergabe ist auf diesem PC nicht verfügbar.";
  $("pad").replaceChildren(...pick.map((s) => {
    const b = Object.assign(document.createElement("button"), { textContent: s.name, title: s.name });
    if (s.color) b.style.setProperty("--c", s.color);
    b.onclick = () => { $("err").textContent = ""; pgl.call("sounds.play", { id: s.id }).catch(fail); };
    return b;
  }));
}

$("stop").onclick = () => pgl.call("sounds.stopAll").catch(fail);
render().catch(fail);
pgl.on("changed", (d) => { if (d.topic === "sounds") render().catch(fail); });
