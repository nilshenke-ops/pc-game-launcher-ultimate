// The stylesheets switch animations on and off with @media (prefers-reduced-motion …) – that is the OPERATING SYSTEM's setting
// ("Animationen anzeigen" in Windows, "Bewegung reduzieren" on iPad/iPhone). Many gaming PCs have it switched off for speed, and then the whole app
// stood still (no opening animation of the island, nothing). This plugin turns those two media queries into the app's OWN switch:
//   (prefers-reduced-motion: reduce)         →  :root[data-motion="reduce"] …            (Settings: "Animationen reduzieren" / lite mode / follow the system)
//   (prefers-reduced-motion: no-preference)  →  :root:not([data-motion="reduce"]) …
// data-motion is set by lib/prefs.ts (it follows the system only when the user asks for it).
const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;
const NOPREF = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;

function scoped(selector, scope) {
  const s = selector.trim();
  const m = /^(:root|html)(?=$|[\s.:#\[>+~])/.exec(s);
  return m ? scope + s.slice(m[0].length) : `${scope} ${s}`;
}

export default function motionQueries() {
  return {
    postcssPlugin: "pgl-motion-queries",
    Once(root) {
      const todo = [];
      root.walkAtRules("media", (at) => { if (REDUCE.test(at.params) || NOPREF.test(at.params)) todo.push(at); });
      for (const at of todo) {
        const parts = at.params.split(",").map((x) => x.trim()).filter(Boolean);
        const others = parts.filter((x) => !REDUCE.test(x) && !NOPREF.test(x));
        const wantsReduce = parts.some((x) => REDUCE.test(x));
        const scope = wantsReduce ? ':root[data-motion="reduce"]' : ':root:not([data-motion="reduce"])';
        const out = [];
        at.each((node) => {
          if (node.type === "rule") { const r = node.clone(); r.selectors = node.selectors.map((sel) => scoped(sel, scope)); out.push(r); }
          else out.push(node.clone());
        });
        if (out.length) at.before(out);
        if (others.length) at.params = others.join(", "); else at.remove();
      }
    },
  };
}
motionQueries.postcss = true;
