// The voices of the Discord voice changer. Every voice is just a set of numbers for the same chain of stages (see voice-changer.ts):
// pitch → ring modulation → vibrato → band filter → distortion → shelves → echo → reverb. A stage that a voice does not use stays neutral,
// so switching voices while talking only moves the numbers – no clicks, no new graph.

export interface VoicePreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** Pitch factor: 1 = unchanged, 0.5 = an octave lower, 2 = an octave higher. */
  pitch: number;
  /** Ring modulation (robot sounds): frequency in Hz and how much of it is mixed in (0…1). */
  ring?: { hz: number; mix: number };
  /** Vibrato: speed in Hz and depth in milliseconds. */
  vibrato?: { hz: number; ms: number };
  /** Band filter in Hz (telephone, radio, megaphone). */
  band?: { low: number; high: number };
  /** Distortion 0…40. */
  drive?: number;
  /** Bass / treble in dB. */
  lowShelf?: number;
  highShelf?: number;
  /** Echo: delay in seconds, feedback 0…0.8, mix 0…1. */
  echo?: { time: number; feedback: number; mix: number };
  /** Reverb: mix 0…1 (the room is fixed). */
  reverb?: number;
}

export const VOICES: VoicePreset[] = [
  { id: "original", name: "Original", emoji: "🎙️", desc: "Deine Stimme, unverändert", pitch: 1 },
  { id: "deep", name: "Tiefe Stimme", emoji: "🧔", desc: "Dunkel und ruhig", pitch: 0.78, lowShelf: 2 },
  { id: "monster", name: "Monster", emoji: "👹", desc: "Tief, rau, bedrohlich", pitch: 0.6, drive: 7, lowShelf: 3, reverb: 0.15 },
  { id: "demon", name: "Dämon", emoji: "😈", desc: "Noch tiefer, mit Knurren und Hall", pitch: 0.54, ring: { hz: 38, mix: 0.22 }, lowShelf: 3, reverb: 0.35 },
  { id: "chipmunk", name: "Chipmunk", emoji: "🐿️", desc: "Hoch und piepsig", pitch: 1.6 },
  { id: "child", name: "Kind", emoji: "🧒", desc: "Heller und leichter", pitch: 1.3, highShelf: 3 },
  { id: "robot", name: "Roboter", emoji: "🤖", desc: "Metallisch, wie aus einem Computer", pitch: 1, ring: { hz: 60, mix: 1 }, echo: { time: 0.012, feedback: 0.55, mix: 0.5 } },
  { id: "alien", name: "Alien", emoji: "👽", desc: "Fremd, zittrig und hoch", pitch: 1.22, ring: { hz: 28, mix: 0.5 }, vibrato: { hz: 6.5, ms: 3.5 } },
  { id: "radio", name: "Funkgerät", emoji: "📻", desc: "Knackig, wie im Einsatz", pitch: 1, band: { low: 500, high: 3200 }, drive: 4 },
  { id: "phone", name: "Telefon", emoji: "📞", desc: "Dünn wie am alten Telefon", pitch: 1, band: { low: 350, high: 3000 } },
  { id: "megaphone", name: "Megafon", emoji: "📣", desc: "Laut und verzerrt", pitch: 1, band: { low: 700, high: 4000 }, drive: 16 },
  { id: "cave", name: "Höhle", emoji: "🕳️", desc: "Du stehst in einer großen Halle", pitch: 0.95, reverb: 0.55 },
  { id: "echo", name: "Echo", emoji: "🔁", desc: "Jedes Wort kommt zurück", pitch: 1, echo: { time: 0.3, feedback: 0.45, mix: 0.5 } },
  { id: "duel", name: "Duell-Ansager", emoji: "🃏", desc: "Dramatisch wie bei einem großen Kartenduell", pitch: 0.86, lowShelf: 3, highShelf: 2, drive: 2, echo: { time: 0.12, feedback: 0.3, mix: 0.25 }, reverb: 0.3 },
  { id: "giant", name: "Riese", emoji: "🗻", desc: "Riesig tief, die Erde bebt", pitch: 0.5, lowShelf: 3, reverb: 0.25 },
  { id: "ogre", name: "Oger", emoji: "🧌", desc: "Grob und brummig", pitch: 0.68, drive: 4, lowShelf: 3 },
  { id: "lord", name: "Dunkler Herrscher", emoji: "🦹", desc: "Tief, bedrohlich und mit Hall", pitch: 0.62, ring: { hz: 70, mix: 0.1 }, lowShelf: 2, reverb: 0.3 },
  { id: "villain", name: "Bösewicht", emoji: "🧛", desc: "Tief mit gemeinem Nachhall", pitch: 0.7, echo: { time: 0.18, feedback: 0.4, mix: 0.3 }, reverb: 0.4 },
  { id: "zombie", name: "Zombie", emoji: "🧟", desc: "Brummig, wackelig und rau", pitch: 0.7, vibrato: { hz: 3, ms: 8 }, drive: 6, band: { low: 200, high: 2500 } },
  { id: "ghost", name: "Geist", emoji: "👻", desc: "Hauchig mit Zittern und Hall", pitch: 0.9, vibrato: { hz: 4, ms: 6 }, echo: { time: 0.35, feedback: 0.45, mix: 0.3 }, reverb: 0.6 },
  { id: "dungeon", name: "Gruselkeller", emoji: "🦇", desc: "Dumpf, mit langem Echo", pitch: 0.8, echo: { time: 0.45, feedback: 0.55, mix: 0.45 }, reverb: 0.5 },
  { id: "underwater", name: "Unterwasser", emoji: "🫧", desc: "Blubbernd, als wärst du abgetaucht", pitch: 0.95, vibrato: { hz: 2.5, ms: 6 }, band: { low: 100, high: 900 }, reverb: 0.3 },
  { id: "helium", name: "Helium", emoji: "🎈", desc: "Ballongas-Stimme", pitch: 1.9, highShelf: 4 },
  { id: "mouse", name: "Maus", emoji: "🐭", desc: "Winzig und piepsig", pitch: 2.2, highShelf: 5 },
  { id: "fairy", name: "Fee", emoji: "🧚", desc: "Hell, funkelnd und leicht zittrig", pitch: 1.45, vibrato: { hz: 7, ms: 2 }, highShelf: 4, reverb: 0.35 },
  { id: "goblin", name: "Kobold", emoji: "👺", desc: "Kratzig-hoch und frech", pitch: 1.35, ring: { hz: 90, mix: 0.2 }, drive: 4 },
  { id: "tin", name: "Blechdose", emoji: "🥫", desc: "Blechern wie in einer Dose", pitch: 1, band: { low: 800, high: 2500 }, ring: { hz: 150, mix: 0.35 }, drive: 6 },
  { id: "cyborg", name: "Cyborg", emoji: "🦾", desc: "Tiefer Roboter mit hartem Klang", pitch: 0.9, ring: { hz: 30, mix: 1 }, band: { low: 300, high: 3500 } },
  { id: "pa", name: "Durchsage", emoji: "📢", desc: "Wie eine Lautsprecher-Durchsage", pitch: 1, band: { low: 400, high: 3500 }, echo: { time: 0.09, feedback: 0.35, mix: 0.3 }, reverb: 0.35 },
  { id: "stadium", name: "Stadion-Sprecher", emoji: "🏟️", desc: "Laut, hallend, als stündest du im Stadion", pitch: 1, band: { low: 500, high: 4500 }, drive: 5, echo: { time: 0.22, feedback: 0.35, mix: 0.3 }, reverb: 0.25 },
  { id: "double", name: "Doppelgänger", emoji: "👥", desc: "Deine Stimme doppelt, leicht versetzt", pitch: 1, vibrato: { hz: 4, ms: 2 }, echo: { time: 0.025, feedback: 0.2, mix: 0.6 } },
  { id: "pilot", name: "Pilot", emoji: "🧑‍✈️", desc: "Knisternde Funkdurchsage aus dem Cockpit", pitch: 1, band: { low: 450, high: 3000 }, drive: 3 },
];

export const voiceById = (id: string): VoicePreset => VOICES.find((v) => v.id === id) ?? VOICES[0];

/** Semitones → pitch factor (+12 = double). */
export const semitoneRatio = (st: number) => Math.pow(2, st / 12);
/** Pitch of the voice with the person's own fine tuning (±6 semitones) on top, kept in the range the shifter can do. */
export const effectivePitch = (v: VoicePreset, trimSemitones: number) => Math.min(4, Math.max(0.25, v.pitch * semitoneRatio(Math.max(-12, Math.min(12, trimSemitones)))));

/**
 * The same voice, weaker or stronger: 1 = as defined, 0 = your own voice. A strongly changed voice is hard to understand, so the app starts at
 * 70 %: the pitch moves less (a power of the factor – so an octave stays an octave at 100 %), and ring modulation, distortion, echo, reverb and
 * the band filter fade towards "off". Everything stays in the range the stages can do.
 */
export function scaleVoice(v: VoicePreset, strength: number): VoicePreset {
  const k = Math.min(1, Math.max(0, strength));
  const out: VoicePreset = { ...v, pitch: Math.pow(v.pitch, k) };
  if (v.ring) out.ring = { hz: v.ring.hz, mix: v.ring.mix * k };
  if (v.vibrato) out.vibrato = { hz: v.vibrato.hz, ms: v.vibrato.ms * k };
  if (v.band) out.band = { low: 20 + (v.band.low - 20) * k, high: 20000 - (20000 - v.band.high) * k };
  if (v.drive) out.drive = v.drive * k;
  if (v.lowShelf) out.lowShelf = v.lowShelf * k;
  if (v.highShelf) out.highShelf = v.highShelf * k;
  if (v.echo) out.echo = { time: v.echo.time, feedback: v.echo.feedback * k, mix: v.echo.mix * k };
  if (v.reverb) out.reverb = v.reverb * k;
  return out;
}
