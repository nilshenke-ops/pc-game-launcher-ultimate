import {
  Activity, AudioLines, Bell, Bot, Command, Crosshair, Download, Gamepad2, Gauge, Globe, HardDrive, Headphones, Heart, HelpCircle, History, Home,
  Keyboard, LayoutGrid, Link2, MonitorSmartphone, Mic, Monitor, Moon, Music, Palette, Play, Puzzle, Radio, Rocket, Settings, ShieldCheck, Smartphone, Sparkles, Star,
  Stethoscope, Swords, Timer, Trophy, Tv, Volume2, Wand2, Zap, type LucideIcon,
} from "lucide-react";
import { t } from "./i18n";

export interface NavItem { path: string; label: string; icon: LucideIcon; group: string; keywords?: string }

/** Single definition of all sections, used by sidebar, mobile menu and global search. */
export function navItems(): NavItem[] {
  return [
    { path: "/", label: t("Home"), icon: Home, group: t("Start"), keywords: "dashboard übersicht" },
    { path: "/games", label: t("Spiele"), icon: Gamepad2, group: t("Start"), keywords: "steam epic xbox launcher" },
    { path: "/programs", label: t("Programme"), icon: LayoutGrid, group: t("Start"), keywords: "apps discord browser" },
    { path: "/quick", label: t("Quick Actions"), icon: Zap, group: t("Start"), keywords: "schnellstart makro" },
    { path: "/soundboard", label: t("Soundboard"), icon: Music, group: t("Audio"), keywords: "sounds myinstants" },
    { path: "/audio", label: t("Audio Center"), icon: Headphones, group: t("Audio"), keywords: "mikrofon discord kabel ausgabe" },
    { path: "/profiles", label: t("Gaming-Profile"), icon: Swords, group: t("Gaming"), keywords: "competitive streaming" },
    { path: "/automations", label: t("Automatisierungen"), icon: Bot, group: t("Gaming"), keywords: "regeln wenn dann" },
    { path: "/hotkeys", label: t("Hotkeys"), icon: Keyboard, group: t("Gaming"), keywords: "tastenkürzel tasten" },
    { path: "/history", label: t("Gaming-Verlauf"), icon: History, group: t("Gaming"), keywords: "statistik spielzeit" },
    { path: "/monitor", label: t("PC Monitor"), icon: Activity, group: t("System"), keywords: "cpu ram gpu temperatur" },
    { path: "/connect", label: t("PC verbinden"), icon: MonitorSmartphone, group: t("System"), keywords: "verbinden koppeln qr code adresse anmelden" },
    { path: "/devices", label: t("Geräte"), icon: Smartphone, group: t("System"), keywords: "verbindungen gekoppelt" },
    { path: "/pair", label: t("Gerät koppeln"), icon: Link2, group: t("System"), keywords: "qr code kopplung" },
    { path: "/notifications", label: t("Benachrichtigungen"), icon: Bell, group: t("System") },
    { path: "/settings", label: t("Einstellungen"), icon: Settings, group: t("System"), keywords: "design sprache backup update" },
    { path: "/diagnostics", label: t("Diagnose"), icon: Stethoscope, group: t("System"), keywords: "netzwerk fehler logs ping" },
    { path: "/plugins", label: t("Plugin Center"), icon: Puzzle, group: t("System"), keywords: "plugins erweiterungen store widgets themes addons module" },
    { path: "/updates", label: t("Updates & Versionen"), icon: Download, group: t("System"), keywords: "update version download herunterladen neueste windows exe änderungen" },
    { path: "/help", label: t("Hilfe"), icon: HelpCircle, group: t("System"), keywords: "anleitung download begleiter" },
  ];
}

export const ICONS: Record<string, LucideIcon> = {
  zap: Zap, "gamepad-2": Gamepad2, monitor: Monitor, crosshair: Crosshair, radio: Radio, moon: Moon, music: Music, mic: Mic, headphones: Headphones,
  rocket: Rocket, star: Star, heart: Heart, trophy: Trophy, timer: Timer, tv: Tv, globe: Globe, play: Play, sparkles: Sparkles, wand: Wand2,
  swords: Swords, volume: Volume2, command: Command, gauge: Gauge, shield: ShieldCheck, palette: Palette, download: Download, drive: HardDrive, audio: AudioLines,
};

export function IconByName({ name, size = 20 }: { name?: string; size?: number }) {
  const I = ICONS[name ?? ""] ?? Zap;
  return <I size={size} />;
}
