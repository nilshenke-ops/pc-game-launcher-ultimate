const $ = (id) => document.getElementById(id);
const LABEL = { steam: "Steam", epic: "Epic Games", appsFolder: "Microsoft Store / Game Pass", exe: "Eigene EXE" };
async function render() {
  const [lib, h] = await Promise.all([pgl.call("library.list"), pgl.call("history.get")]);
  const games = lib.items.filter((i) => i.kind === "game"), played = new Set(h.stats.map((s) => s.itemId));
  $("games").textContent = games.length; $("progs").textContent = lib.items.length - games.length;
  $("never").textContent = games.filter((g) => !played.has(g.id)).length;
  const by = {}; for (const g of games) by[g.source] = (by[g.source] || 0) + 1;
  const fav = games.filter((g) => g.favorite).length;
  $("src").replaceChildren(...[...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => [LABEL[k] || k, n]), ["★ Favoriten", fav]].map(([k, n]) => {
    const li = document.createElement("li"); li.append(Object.assign(document.createElement("span"), { textContent: k }), Object.assign(document.createElement("b"), { textContent: n })); return li;
  }));
}
render().catch((e) => { $("err").textContent = e.message; });
pgl.on("changed", (d) => { if (d.topic === "library" || d.topic === "history") render().catch(() => {}); });
