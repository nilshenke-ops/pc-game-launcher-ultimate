export function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Scores a search hit: prefix > word start > substring; usage count boosts frequently used entries. */
export function score(text: string, query: string, usage = 0) {
  const a = normalize(text), q = normalize(query.trim());
  if (!q) return 1 + usage;
  if (a.startsWith(q)) return 100 + usage;
  if (a.split(/[\s\-_/]+/).some((w) => w.startsWith(q))) return 60 + usage;
  if (a.includes(q)) return 30 + usage;
  const parts = q.split(/\s+/);
  if (parts.length > 1 && parts.every((p) => a.includes(p))) return 20 + usage;
  return 0;
}
