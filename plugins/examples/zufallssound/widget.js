const $ = (id) => document.getElementById(id);
let lastId = null;
$("go").onclick = async () => {
  $("err").textContent = "";
  try {
    const [list, cfg] = await Promise.all([pgl.call("sounds.list"), pgl.config()]);
    let pool = list.data.sounds; if (cfg.nurFavoriten) pool = pool.filter((s) => s.favorite);
    if (!pool.length) { $("err").textContent = cfg.nurFavoriten ? "Noch keine Favoriten im Soundboard." : "Noch keine Sounds im Soundboard."; return; }
    let s = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && s.id === lastId) s = pool[(pool.indexOf(s) + 1) % pool.length];
    lastId = s.id;
    await pgl.call("sounds.play", { id: s.id });
    $("last").textContent = "♪ " + s.name;
  } catch (e) { $("err").textContent = e.message; }
};
$("stop").onclick = () => pgl.call("sounds.stopAll").catch((e) => { $("err").textContent = e.message; });
