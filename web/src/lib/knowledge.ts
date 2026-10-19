// Search over the app's own help (same rules as KnowledgeBase.cs on the PC), so the assistant also answers without a PC.

export interface Section { source: string; title: string; page: string | null; body: string; keywords: string; text: string }

export function parse(docs: { source: string; markdown: string }[]): Section[] {
  const out: Section[] = [];
  for (const { source, markdown } of docs) {
    for (const part of markdown.replace(/\r/g, "").split(/^## /m).slice(1)) {
      const nl = part.indexOf("\n");
      const title = (nl < 0 ? part : part.slice(0, nl)).trim();
      const body = nl < 0 ? "" : part.slice(nl + 1).trim();
      const page = /^Seite: (\S+)/m.exec(body)?.[1] ?? null;
      const keywords = /^Stichworte: (.+)$/m.exec(body)?.[1] ?? "";
      const text = body.split("\n").filter((l) => !l.startsWith("Seite:") && !l.startsWith("Stichworte:")).join("\n").trim();
      out.push({ source, title, page, body, keywords, text });
    }
  }
  return out;
}

const STOP = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "und", "oder", "ich", "du", "mein", "meine", "meinen", "mir", "mich",
  "ist", "sind", "wie", "was", "wo", "wann", "warum", "kann", "kannst", "geht", "mit", "von", "für", "fur", "auf", "im", "in", "an", "am", "zu", "zum", "zur",
  "es", "man", "bitte", "nicht", "auch", "noch", "mal", "dann", "the", "a", "how", "do", "i", "is", "my", "to", "what", "can", "of", "and", "where", "why"]);
const WEAK = new Set(["einstell", "einricht", "einschalt", "mach", "funktionier", "geht", "brauch", "find"]);

export function fold(text: string) {
  return text.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stem(w: string) {
  for (const suf of ["ungen", "ung", "en", "er", "es", "e", "n", "s"]) if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const m of fold(text).matchAll(/[a-z0-9]+/g)) {
    const w = m[0];
    if (w.length < 2 || STOP.has(w)) continue;
    const st = stem(w);
    out.push(({ richt: "einricht", stell: "einstell", schalt: "einschalt", richtet: "einricht" } as Record<string, string>)[st] ?? st);
  }
  return out;
}

export function search(sections: Section[], query: string, max = 3): { section: Section; score: number }[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const scored: { section: Section; score: number }[] = [];
  for (const s of sections) {
    const title = new Set(tokens(s.title));
    const kw = new Set(tokens(s.keywords));
    const body = new Set(tokens(s.body));
    let score = 0;
    for (const t of q) {
      const w = WEAK.has(t) ? 0.3 : 1;
      if (title.has(t)) score += 3 * w;
      if (kw.has(t)) score += 2.5 * w;
      else if ([...kw].some((k) => k.length >= 4 && t.length >= 4 && (k.startsWith(t) || t.startsWith(k)))) score += 1.2 * w;
      if (body.has(t)) score += 1 * w;
    }
    const covered = q.filter((t) => title.has(t) || kw.has(t) || body.has(t)).length / q.length;
    score *= 0.5 + covered;
    if (s.source !== "Wissen") score *= 0.9;
    if (score > 0) scored.push({ section: s, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}
