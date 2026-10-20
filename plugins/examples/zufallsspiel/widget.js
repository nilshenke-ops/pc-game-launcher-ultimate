const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const $ = (id) => document.getElementById(id);
let current = null;
async function roll() {
  $("err").textContent = "";
  const [lib, cfg] = await Promise.all([pgl.call("library.list"), pgl.config()]);
  let pool = lib.items.filter((i) => i.kind === "game");
  if (cfg.nurFavoriten) pool = pool.filter((i) => i.favorite);
  if (!pool.length) { $("pick").textContent = cfg.nurFavoriten ? "Noch keine Favoriten" : "Noch keine Spiele"; $("start").disabled = true; return; }
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && current && next.id === current.id) next = pool[(pool.indexOf(next) + 1) % pool.length]; // not twice in a row
  current = next; $("pick").textContent = next.name; $("start").disabled = false;
}
$("roll").onclick = () => roll().catch((e) => { $("err").textContent = e.message; });
$("start").onclick = async () => {
  if (!current) return; $("start").disabled = true;
  try { await pgl.call("library.launch", { id: current.id }); $("err").textContent = ""; $("pick").textContent = current.name + " startet …"; }
  catch (e) { $("err").textContent = e.message; }
  $("start").disabled = false;
};
