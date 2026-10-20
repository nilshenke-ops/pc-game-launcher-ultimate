const $ = (id) => document.getElementById(id);
let zones = ["Europe/London", "America/New_York", "Asia/Tokyo"];
pgl.config().then((c) => {
  const list = String(c.zonen || "").split(",").map((z) => z.trim()).filter(Boolean);
  if (list.length) zones = list.slice(0, 3);
  render();
}).catch(() => render());
function valid(z) { try { new Intl.DateTimeFormat("de-DE", { timeZone: z }); return true; } catch { return false; } }
function render() {
  const now = new Date();
  $("local").textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  $("date").textContent = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  $("zones").replaceChildren(...zones.map((z) => {
    const li = document.createElement("li");
    const name = z.split("/").pop().replace(/_/g, " ");
    const time = valid(z) ? now.toLocaleTimeString("de-DE", { timeZone: z, hour: "2-digit", minute: "2-digit", weekday: "short" }) : "unbekannte Zone";
    li.append(Object.assign(document.createElement("span"), { textContent: name }), Object.assign(document.createElement("b"), { textContent: time }));
    return li;
  }));
}
setInterval(render, 15000);
