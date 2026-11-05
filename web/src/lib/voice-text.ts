// What people say is not what they would type: "Hey Jarvis, ähm, starte bitte Rocket League." – the wake word, the filler and the full stop are
// removed before the sentence is sent, and short control words ("Stopp", "Danke, das war's") are recognised so they stop the voice or end the
// conversation instead of being sent to an AI. Pure functions, no browser needed.

const WAKE = /^(?:(?:hey|hallo|hi|ok|okay)[\s,]+)?jarvis\b[\s,.:;!?-]*/i;
const FILLER = /(?<!\p{L})(?:ä+h+m*|ö+h+m*|hm+|mhm+)(?!\p{L})[\s,.]*/giu;   // \b only knows ASCII letters – "äh" needs the Unicode form
const LEAD = /^(?:also|ja|okay|ok|na|dann|und)[\s,]+/i;
const TAIL = /[\s,]*\b(?:bitte|please|danke schön)\b[\s.!?…]*$/i;

/** The sentence as it would have been typed: no wake word, no filler, no trailing "bitte" or full stop, first letter capital. */
export function cleanSpoken(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(WAKE, "").replace(FILLER, " ").replace(/\s+/g, " ").trim();
  s = s.replace(LEAD, "").replace(TAIL, "").replace(/[\s,.!?…;:]+$/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

const norm = (raw: string) => raw.toLowerCase().replace(WAKE, "").replace(/[.,!?…;:"„“]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = /^(?:stopp?|halt(?: an)?|sei (?:still|ruhig)|ruhe|abbrechen|vergiss es|genug|pause|quiet|cancel|be quiet)$/;
const END = /^(?:danke(?: dir| schön)?(?: das war'?s| das wars| tschüss)?|das war'?s|das wars|tschüss|bis später|ende|fertig|gespräch beenden|beenden|goodbye|bye|that'?s all|thanks)$/;

/** "stop" = be quiet / cancel (the answer being read aloud is stopped); "end" = the conversation is over; otherwise null (a normal sentence). */
export function voiceControl(raw: string): "stop" | "end" | null {
  const s = norm(raw);
  if (!s || s.split(" ").length > 6) return null;
  if (STOP.test(s)) return "stop";
  if (END.test(s)) return "end";
  return null;
}
