import { Activity, AudioLines, Bell, Bot, Command, Crosshair, Download, Gamepad2, Gauge, Globe, HardDrive, Headphones, Heart, HelpCircle, History, Home, Keyboard, LayoutGrid, Link2, ListTodo, Mic, Monitor, MonitorSmartphone, Moon, Music, Palette, Play, Puzzle, Radio, Rocket, Settings, Shapes, ShieldCheck, Smartphone, Sparkles, Star, Stethoscope, Swords, Tag, Timer, Trophy, Tv, Video, Volume2, Wand2, Wifi, Zap, type LucideIcon } from "lucide-react";
import { t } from "./i18n";

export interface NavItem { path: string; label: string; short?: string; icon: LucideIcon; group: string; keywords?: string }

/** Sections that cannot be hidden – otherwise the app could lock itself out of its own settings or the PC connection. */
export const NAV_FIXED = new Set(["/", "/settings", "/connect"]);
/** Default shortcuts in the phone bar (besides "Verbinden" and "Mehr", which are always there). */
export const DEFAULT_BOTTOM = ["/", "/games", "/soundboard", "/quick"];

/** Single definition of all sections, used by sidebar, mobile menu and global search. */
export function navItems(): NavItem[] {
  const g = { dash: t("Dashboard"), ctrl: t("Steuerung"), audio: t("Audio"), sys: t("System"), conn: t("Verbindung"), ext: t("Erweiterungen"), admin: t("Verwaltung") };
  return [
    { path: "/", label: t("Home"), icon: Home, group: g.dash, keywords: "dashboard übersicht" },
    { path: "/games", label: t("Spiele"), icon: Gamepad2, group: g.dash, keywords: "steam epic xbox launcher bibliothek game center" },
    { path: "/backlog", label: t("Backlog"), icon: ListTodo, group: g.dash, keywords: "noch spielen als nächstes durchgespielt pausiert priorität zufall spielplanung liste" },
    { path: "/programs", label: t("Programme"), icon: LayoutGrid, group: g.dash, keywords: "apps discord browser" },
    { path: "/quick", label: t("Quick Actions"), short: t("Aktionen"), icon: Zap, group: g.dash, keywords: "schnellstart makro" },
    { path: "/assistant", label: t("KI-Assistent"), short: t("Assistent"), icon: Sparkles, group: g.dash, keywords: "ki ai claude chat frage hilfe sprache befehl assistent fragen" },
    { path: "/widgets", label: t("Widget-Baukasten"), short: t("Widgets"), icon: Shapes, group: g.dash, keywords: "widgets eigene editor desktop baukasten design uhr knopf setup designer" },
    { path: "/profiles", label: t("Gaming-Profile"), short: t("Profile"), icon: Swords, group: g.ctrl, keywords: "competitive streaming" },
    { path: "/automations", label: t("Automatisierungen"), short: t("Abläufe"), icon: Bot, group: g.ctrl, keywords: "regeln wenn dann automation hub ablauf" },
    { path: "/hotkeys", label: t("Hotkeys & Makros"), short: t("Hotkeys"), icon: Keyboard, group: g.ctrl, keywords: "tastenkürzel tasten macro studio makro medientasten" },
    { path: "/soundboard", label: t("Soundboard"), short: t("Sounds"), icon: Music, group: g.audio, keywords: "sounds myinstants soundlab discord" },
    { path: "/audio", label: t("Audio Center"), short: t("Audio"), icon: Headphones, group: g.audio, keywords: "mikrofon discord kabel ausgabe" },
    { path: "/monitor", label: t("PC Monitor"), short: t("Monitor"), icon: Activity, group: g.sys, keywords: "cpu ram gpu temperatur vram performance center" },
    { path: "/network", label: t("Netzwerkdiagnose"), short: t("Netzwerk"), icon: Wifi, group: g.sys, keywords: "ping jitter paketverlust latenz ping doctor lag server" },
    { path: "/history", label: t("Gaming-Verlauf"), short: t("Verlauf"), icon: History, group: g.sys, keywords: "statistik spielzeit" },
    { path: "/overlay-settings", label: t("Overlay & Aufnahme"), short: t("Overlay"), icon: Video, group: g.sys, keywords: "overlay game bar aufnahme video replay clip obs fps hud" },
    { path: "/connect", label: t("PC verbinden"), short: t("Verbinden"), icon: MonitorSmartphone, group: g.conn, keywords: "verbinden koppeln qr code adresse anmelden" },
    { path: "/devices", label: t("Geräte"), icon: Smartphone, group: g.conn, keywords: "verbindungen gekoppelt" },
    { path: "/pair", label: t("Gerät koppeln"), short: t("Koppeln"), icon: Link2, group: g.conn, keywords: "qr code kopplung" },
    { path: "/plugins", label: t("Plugin Center"), short: t("Plugins"), icon: Puzzle, group: g.ext, keywords: "plugins erweiterungen store widgets themes addons module" },
    { path: "/quests", label: t("GameQuest"), short: t("Quests"), icon: Trophy, group: g.ext, keywords: "ziele xp level erfolge achievements matches siege statistik quest" },
    { path: "/deals", label: t("Deal Radar"), short: t("Deals"), icon: Tag, group: g.ext, keywords: "wunschliste preis angebot sale rabatt steam zielpreis deal" },
    { path: "/notifications", label: t("Benachrichtigungen"), short: t("Hinweise"), icon: Bell, group: g.admin },
    { path: "/settings", label: t("Einstellungen"), short: t("Einstell."), icon: Settings, group: g.admin, keywords: "design sprache backup update navigation" },
    { path: "/diagnostics", label: t("Diagnose"), icon: Stethoscope, group: g.admin, keywords: "netzwerk fehler logs" },
    { path: "/updates", label: t("Updates & Versionen"), short: t("Updates"), icon: Download, group: g.admin, keywords: "update version download herunterladen neueste windows exe änderungen" },
    { path: "/help", label: t("Hilfe"), icon: HelpCircle, group: g.admin, keywords: "anleitung download begleiter" },
  ];
}

/** The user's own order and hidden sections (Einstellungen → Design → Navigation). Order is kept inside each category. */
export function arrangeNav(items: NavItem[], nav: { order: string[]; hidden: string[] }): NavItem[] {
  const pos = (p: string) => { const i = nav.order.indexOf(p); return i < 0 ? 1000 + items.findIndex((x) => x.path === p) : i; };
  const groups = [...new Set(items.map((i) => i.group))];
  return groups.flatMap((g) => items.filter((i) => i.group === g && (NAV_FIXED.has(i.path) || !nav.hidden.includes(i.path))).sort((a, b) => pos(a.path) - pos(b.path)));
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
