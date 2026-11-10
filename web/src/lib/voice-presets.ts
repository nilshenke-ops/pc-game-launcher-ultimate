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
  { id: "deep", name: "Tiefe Stimme", emoji: "🧔", desc: "Dunkel und ruhig", pitch: 0.78, lowShelf: 4 },
  { id: "monster", name: "Monster", emoji: "👹", desc: "Tief, rau, bedrohlich", pitch: 0.6, drive: 9, lowShelf: 6, reverb: 0.15 },
  { id: "demon", name: "Dämon", emoji: "😈", desc: "Noch tiefer, mit Knurren und Hall", pitch: 0.52, ring: { hz: 38, mix: 0.28 }, lowShelf: 5, reverb: 0.35 },
  { id: "chipmunk", name: "Chipmunk", emoji: "🐿️", desc: "Hoch und piepsig", pitch: 1.6 },
  { id: "child", name: "Kind", emoji: "🧒", desc: "Heller und leichter", pitch: 1.3, highShelf: 3 },
  { id: "robot", name: "Roboter", emoji: "🤖", desc: "Metallisch, wie aus einem Computer", pitch: 1, ring: { hz: 60, mix: 1 }, echo: { time: 0.012, feedback: 0.55, mix: 0.5 } },
  { id: "alien", name: "Alien", emoji: "👽", desc: "Fremd, zittrig und hoch", pitch: 1.22, ring: { hz: 28, mix: 0.5 }, vibrato: { hz: 6.5, ms: 3.5 } },
  { id: "radio", name: "Funkgerät", emoji: "📻", desc: "Knackig, wie im Einsatz", pitch: 1, band: { low: 500, high: 3200 }, drive: 4 },
  { id: "phone", name: "Telefon", emoji: "📞", desc: "Dünn wie am alten Telefon", pitch: 1, band: { low: 350, high: 3000 } },
  { id: "megaphone", name: "Megafon", emoji: "📣", desc: "Laut und verzerrt", pitch: 1, band: { low: 700, high: 4000 }, drive: 16 },
  { id: "cave", name: "Höhle", emoji: "🕳️", desc: "Du stehst in einer großen Halle", pitch: 0.95, reverb: 0.55 },
  { id: "echo", name: "Echo", emoji: "🔁", desc: "Jedes Wort kommt zurück", pitch: 1, echo: { time: 0.3, feedback: 0.45, mix: 0.5 } },
];

export const voiceById = (id: string): VoicePreset => VOICES.find((v) => v.id === id) ?? VOICES[0];

/** Semitones → pitch factor (+12 = double). */
export const semitoneRatio = (st: number) => Math.pow(2, st / 12);
/** Pitch of the voice with the person's own fine tuning (±6 semitones) on top, kept in the range the shifter can do. */
export const effectivePitch = (v: VoicePreset, trimSemitones: number) => Math.min(4, Math.max(0.25, v.pitch * semitoneRatio(Math.max(-12, Math.min(12, trimSemitones)))));
