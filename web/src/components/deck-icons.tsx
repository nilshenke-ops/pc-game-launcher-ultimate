// Symbols for deck keys and custom widgets. Only loaded with the pages that show them (not part of the main bundle).
import type { DeckKey } from "../lib/deck";
import type { LibraryItem } from "../lib/types";
import {
  ArrowLeft, AudioLines, Bell, Bomb, Camera, Cat, Circle, Clapperboard, Coffee, Command, Cpu, Crosshair, Crown, Download, Eye, EyeOff, Flame, Folder, Gamepad2, Gauge, Ghost,
  Gift, Globe, HardDrive, Headphones, Heart, Home, Image, Joystick, Keyboard, Laugh, Layers, LayoutGrid, Lightbulb, Lock, Megaphone, MessageCircle, Mic, MicOff, Monitor, Moon,
  Mouse, Music, Music2, PartyPopper, Pause, Play, Power, Radio, Rocket, Settings, Shield, ShieldCheck, Skull, SkipBack, SkipForward, Smile, Sparkles, Square, Star, Sun,
  Swords, Target, Timer, Trophy, Tv, Undo2, Video, Volume1, Volume2, VolumeX, Wand2, Wifi, Zap, type LucideIcon,
} from "lucide-react";

export const DECK_ICONS: Record<string, LucideIcon> = {
  "gamepad-2": Gamepad2, joystick: Joystick, swords: Swords, crosshair: Crosshair, target: Target, trophy: Trophy, crown: Crown, flame: Flame, rocket: Rocket, bomb: Bomb,
  skull: Skull, ghost: Ghost, shield: Shield, "shield-check": ShieldCheck, star: Star, heart: Heart, zap: Zap, sparkles: Sparkles, wand: Wand2, gift: Gift,
  music: Music, "music-2": Music2, "audio-lines": AudioLines, headphones: Headphones, mic: Mic, "mic-off": MicOff, "volume-1": Volume1, "volume-2": Volume2, "volume-x": VolumeX,
  play: Play, pause: Pause, square: Square, "skip-forward": SkipForward, "skip-back": SkipBack, circle: Circle, video: Video, camera: Camera, clapperboard: Clapperboard, image: Image,
  radio: Radio, tv: Tv, monitor: Monitor, cpu: Cpu, gauge: Gauge, "hard-drive": HardDrive, wifi: Wifi, globe: Globe, keyboard: Keyboard, mouse: Mouse,
  "message-circle": MessageCircle, megaphone: Megaphone, bell: Bell, eye: Eye, "eye-off": EyeOff, lock: Lock, power: Power, settings: Settings, layers: Layers, "layout-grid": LayoutGrid,
  folder: Folder, home: Home, "arrow-left": ArrowLeft, "undo-2": Undo2, download: Download, timer: Timer, command: Command, lightbulb: Lightbulb, sun: Sun, moon: Moon,
  coffee: Coffee, smile: Smile, laugh: Laugh, "party-popper": PartyPopper, cat: Cat,
};
// Names used by the profile icons elsewhere in the app map to the same symbols.
const ALIASES: Record<string, string> = { volume: "volume-2", audio: "audio-lines", drive: "hard-drive" };

export function DeckIcon({ name, size = 28 }: { name: string; size?: number }) {
  const I = DECK_ICONS[name] ?? DECK_ICONS[ALIASES[name] ?? ""] ?? Zap;
  return <I size={size} strokeWidth={2} />;
}

/** Face of a deck key: symbol, emoji, picture of the game or own picture, plus the label. */
export function KeyFace({ k, item }: { k: DeckKey; item?: LibraryItem }) {
  const icon = k.icon ?? "";
  const cover = icon === "cover" ? item?.iconData || item?.coverUrl : undefined;
  return (
    <>
      <span className="deck-icon" aria-hidden>
        {icon.startsWith("icon:") ? <DeckIcon name={icon.slice(5)} size={30} />
          : icon.startsWith("emoji:") ? <span className="deck-emoji">{icon.slice(6)}</span>
          : icon.startsWith("data:image/") ? <img src={icon} alt="" />
          : cover ? <img src={cover} alt="" className={item?.iconData ? "" : "cover"} />
          : <DeckIcon name="zap" size={30} />}
      </span>
      {k.label && <span className="deck-label">{k.label}</span>}
    </>
  );
}
