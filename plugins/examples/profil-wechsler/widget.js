// Gaming profiles from the PC ("profiles.list"); switching runs on the PC ("profiles.activate" / "profiles.revert").
const $ = (id) => document.getElementById(id);
const fail = (e) => { $("err").textContent = e.message; };

async function render() {
  const f = await pgl.call("profiles.list");
  const active = f.profiles.find((p) => p.id === f.activeProfileId);
  $("active").textContent = active ? `Aktiv: ${active.name}${f.activeReason ? ` (${f.activeReason})` : ""}` : "Kein Profil aktiv.";
  $("back").disabled = !f.previousProfileId;
  if (!f.profiles.length) { $("list").replaceChildren(Object.assign(document.createElement("div"), { className: "muted", textContent: "Noch keine Profile angelegt." })); return; }
  $("list").replaceChildren(...f.profiles.map((p) => {
    const b = Object.assign(document.createElement("button"), { textContent: p.name });
    if (p.color) b.style.setProperty("--c", p.color);
    if (p.id === f.activeProfileId) b.className = "on";
    b.onclick = () => { $("err").textContent = ""; pgl.call("profiles.activate", { id: p.id }).then(render, fail); };
    return b;
  }));
}

$("back").onclick = () => { $("err").textContent = ""; pgl.call("profiles.revert").then(render, fail); };
render().catch(fail);
pgl.on("changed", (d) => { if (d.topic === "profiles") render().catch(fail); });
