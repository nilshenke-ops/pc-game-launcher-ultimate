// How an answer looks in the island: only the answer. The free AIs like to write Markdown (**bold**, # headings, lists) and
// sources – those are removed for display, and the source is told when the person asks for it ("Woher weißt du das?").

/** The answer as plain text: no Markdown marks, no link syntax, no citation numbers, no trailing "Quelle:" line. */
export function plainAnswer(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/gi, "").replace(/```/g, ""));
  s = s.replace(/!?\[([^\]]*)\]\((?:[^)\s]+)(?:\s+"[^"]*")?\)/g, "$1");                 // [text](url) → text
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");                                              // # headings
  s = s.replace(/^\s*[-*•]\s+/gm, "– ");                                                 // bullets
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2");                                              // **bold**
  s = s.replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2");              // *italic*
  s = s.replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,;:!?]|$)/g, "$1$2");                // _italic_
  s = s.replace(/`([^`]+)`/g, "$1");                                                     // `code`
  s = s.replace(/\s?\[\d{1,2}\]/g, "");                                                  // [1] citations
  s = s.replace(/\n+\s*(?:Quellen?|Sources?)\s*:[^\n]*(?:\n\s*[-–•*][^\n]*)*\s*$/i, ""); // closing source block
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** "Quelle?", "Woher weißt du das?", "Welche KI hat geantwortet?" – the person wants to know where the answer came from. */
export function asksForSource(text: string): boolean {
  const s = text.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.split(" ").length > 9) return false;
  return /^(?:und )?(?:die |deine |welche |was ist die |nenn(?:e)? (?:mir )?die |zeig(?:e)? (?:mir )?die )?quellen?(?: bitte)?$/.test(s)
    || /^woher (?:weißt|weisst|hast|kommt|ist) (?:du |das |die antwort |die info|dies)/.test(s)
    || /^(?:welche|was für eine|von welcher) (?:ki|quelle)\b/.test(s)
    || /^wer hat (?:das |die antwort )?(?:geantwortet|gesagt|beantwortet)/.test(s)
    || /^(?:hast du|beleg) (?:das |dafür )?(?:eine )?(?:quelle|beleg)/.test(s);
}
