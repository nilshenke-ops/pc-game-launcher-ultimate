import { Activity, Images, Info, Archive, ArchiveRestore, BookMarked, Bug, Dices, Globe2, NotebookPen, Users, Wrench, Cpu, Camera, FolderUp, Gamepad, LayoutTemplate, Package, AudioLines, Bell, Bot, CalendarDays, Command, Crosshair, Download, Gamepad2, Gauge, Globe, Grid3x3, HardDrive, Headphones, Heart, HelpCircle, History, Home, Keyboard, LayoutGrid, Link2, ListTodo, Mic, Monitor, MonitorSmartphone, Moon, Music, Palette, Play, Puzzle, Radio, Rocket, Settings, Shapes, ShieldCheck, Smartphone, Sofa, Sparkles, Star, Stethoscope, Swords, Tag, Timer, Trophy, Tv, Video, Volume2, Wand2, Wifi, Zap, type LucideIcon } from "lucide-react";
import { t } from "./i18n";

export interface NavItem { path: string; label: string; short?: string; icon: LucideIcon; group: string; keywords?: string }

/** Sections that cannot be hidden – otherwise the app could lock itself out of its own settings or the PC connection. */
export const NAV_FIXED = new Set(["/", "/settings", "/connect"]);
/** Default shortcuts in the phone bar (besides "Verbinden" and "Mehr", which are always there). */
export const DEFAULT_BOTTOM = ["/", "/deck", "/games", "/soundboard"];

/** Single definition of all sections, used by sidebar, mobile menu and global search. */
export function navItems(): NavItem[] {
  const g = { play: t("Spielbegleiter"), dash: t("Dashboard"), ctrl: t("Steuerung"), audio: t("Audio"), sys: t("System"), conn: t("Verbindung"), ext: t("Erweiterungen"), admin: t("Verwaltung") };
  return [
    { path: "/", label: t("Home"), icon: Home, group: g.dash, keywords: "dashboard übersicht" },
    { path: "/deck", label: t("Deck"), icon: Grid3x3, group: g.dash, keywords: "stream deck tasten knöpfe raster tablet fernbedienung buttons elgato streamdeck" },
    { path: "/games", label: t("Spiele"), icon: Gamepad2, group: g.dash, keywords: "steam epic xbox launcher bibliothek game center" },
    { path: "/mods", label: t("Mods"), icon: Package, group: g.dash, keywords: "mod mods modding bepinex nexus mods aktivieren deaktivieren zip installieren sicherung" },
    { path: "/vault", label: t("Savegame-Tresor"), short: t("Tresor"), icon: Archive, group: g.dash, keywords: "savegame spielstand spielstände sichern sicherung backup wiederherstellen tresor konfiguration config ini vergleichen version steam cloud" },
    { path: "/gamestate", label: t("Spielzustand"), icon: ArchiveRestore, group: g.dash, keywords: "momentaufnahme snapshot spielzustand zustand wiederherstellen zurück vorher einstellungen konfiguration startargumente mods version vergleichen rückgängig" },
    { path: "/calendar", label: t("Kalender"), icon: CalendarDays, group: g.dash, keywords: "termine raid turnier lan party release erinnerung datum woche monat ics" },
    { path: "/play", label: t("Was spiele ich?"), short: t("Spielen"), icon: Dices, group: g.play, keywords: "zeit finder wie viel zeit minuten was spielen vorschlag zufall challenge herausforderung bingo gaming bingo ultimate bingo karte teilen 3x3 4x4 5x5 aufgaben" },
    { path: "/journal", label: t("Spiele-Journal"), short: t("Journal"), icon: NotebookPen, group: g.play, keywords: "wo war ich erinnerung notizen tagebuch fortschritt zielpfad ziele etappen meilensteine belohnung quest sammlung fund funde gegenstand geheimnis ort story kapitel figuren spoiler zusammenfassung" },
    { path: "/wiki", label: t("Gaming-Wiki"), short: t("Wiki"), icon: BookMarked, group: g.play, keywords: "wiki seiten nachschlagen links rückverweise rezepte strategie boss notizen wissen" },
    { path: "/worlds", label: t("Welten & Bauen"), short: t("Welten"), icon: Globe2, group: g.play, keywords: "minecraft welt welten koordinaten seed nether oberwelt portal basis bauprojekt bauen material aufgaben karte marker kartenmarker" },
    { path: "/builds", label: t("Builds & Technik"), short: t("Builds"), icon: Wrench, group: g.play, keywords: "build builds loadout ausrüstung klasse vergleichen mods modpack modliste version grafik grafikvergleich einstellungen screenshot schieber steuerung tastenbelegung controller lexikon" },
    { path: "/friends", label: t("Freunde & Gruppe"), short: t("Freunde"), icon: Users, group: g.play, keywords: "freunde gruppe spieler karte profil zusammen spielen crossplay abstimmung umfrage gaming abend termin einladung zusage team rollen aufstellung turnier bracket k.o. gruppenphase server status minecraft" },
    { path: "/media", label: t("Medien"), short: t("Medien"), icon: Images, group: g.play, keywords: "fotomuseum galerie screenshot screenshots bilder fotos erinnerungsbuch erinnerungen momente timeline sortieren duplikate doppelte clip clips moment zeitstempel video soundtrack musik lied komponist album" },
    { path: "/studio", label: t("Kreativ-Studio"), short: t("Studio"), icon: Palette, group: g.play, keywords: "kreativ studio sammelkarten karten poster cover banner profilbild header kanalbanner youtube twitch steam ausstellung galerie museum abzeichen badges editor gestalten zeichnen" },
    { path: "/infos", label: t("Spiele-Infos"), short: t("Infos"), icon: Info, group: g.play, keywords: "release releases dlc kalender erscheint erscheinungstermin saison event battle pass patch patchnotes update erklärer fakten faktencheck crossplay koop offline controller cloud ultrawide mods barrierefreiheit untertitel farbenblind kontrast edition editionen deluxe season pass doppelt empfehlung empfehlungen ähnlich wenn dir gefällt" },
    { path: "/backlog", label: t("Backlog"), icon: ListTodo, group: g.dash, keywords: "noch spielen als nächstes durchgespielt pausiert priorität zufall spielplanung liste" },
    { path: "/programs", label: t("Programme"), icon: LayoutGrid, group: g.dash, keywords: "apps discord browser" },
    { path: "/quick", label: t("Quick Actions"), short: t("Aktionen"), icon: Zap, group: g.dash, keywords: "schnellstart makro" },
    { path: "/assistant", label: t("KI-Assistent"), short: t("Assistent"), icon: Sparkles, group: g.dash, keywords: "ki ai claude chat frage hilfe sprache befehl assistent fragen" },
    { path: "/widgets", label: t("Widget-Baukasten"), short: t("Widgets"), icon: Shapes, group: g.dash, keywords: "widgets eigene editor desktop baukasten design uhr knopf setup designer" },
    { path: "/remote", label: t("Remote Desktop"), short: t("Remote"), icon: MonitorSmartphone, group: g.ctrl, keywords: "remote desktop fernsteuerung fernsteuern bildschirm übertragen live handy ipad touch maus tastatur pc steuern spiegeln screen" },
    { path: "/profiles", label: t("Gaming-Profile"), short: t("Profile"), icon: Swords, group: g.ctrl, keywords: "competitive streaming" },
    { path: "/automations", label: t("Automatisierungen"), short: t("Abläufe"), icon: Bot, group: g.ctrl, keywords: "regeln wenn dann automation hub ablauf" },
    { path: "/layouts", label: t("Fenster-Layouts"), short: t("Layouts"), icon: LayoutTemplate, group: g.ctrl, keywords: "fenster monitor bildschirm anordnen layout zweiter monitor position discord obs" },
    { path: "/hotkeys", label: t("Hotkeys & Makros"), short: t("Hotkeys"), icon: Keyboard, group: g.ctrl, keywords: "tastenkürzel tasten macro studio makro medientasten" },
    { path: "/soundboard", label: t("Soundboard"), short: t("Sounds"), icon: Music, group: g.audio, keywords: "sounds myinstants soundlab discord" },
    { path: "/audio", label: t("Audio Center"), short: t("Audio"), icon: Headphones, group: g.audio, keywords: "mikrofon discord kabel ausgabe" },
    { path: "/monitor", label: t("PC Monitor"), short: t("Monitor"), icon: Activity, group: g.sys, keywords: "cpu ram gpu temperatur vram performance center" },
    { path: "/captures", label: t("Aufnahmen"), icon: Camera, group: g.sys, keywords: "screenshot screenshots clip clips video aufnahme replay bilder galerie obs nvidia game bar steam" },
    { path: "/input", label: t("Tastatur & Maus belegen"), short: t("Tasten"), icon: Keyboard, group: g.sys, keywords: "tastenbelegung tasten umbelegen remap keyboard tastatur maus mouse royal kludge rk attack shark seitentaste profil spiel caps lock windows-taste sperren" },
    { path: "/peripherals", label: t("Controller & RGB"), short: t("Controller"), icon: Gamepad, group: g.sys, keywords: "controller gamepad xbox xinput vibration akku stick drift rgb beleuchtung openrgb farbe led tastatur maus" },
    { path: "/storage", label: t("Speicher & Updates"), short: t("Speicher"), icon: HardDrive, group: g.sys, keywords: "speicherplatz festplatte ssd laufwerk größe update updates steam patch download frei" },
    { path: "/move", label: t("Spiele verschieben"), short: t("Verschieben"), icon: HardDrive, group: g.sys, keywords: "verschieben umziehen laufwerk festplatte ssd wechseln platz frei steam bibliothek kopieren anderes laufwerk move" },
    { path: "/network", label: t("Netzwerkdiagnose"), short: t("Netzwerk"), icon: Wifi, group: g.sys, keywords: "ping jitter paketverlust latenz ping doctor lag server" },
    { path: "/start-times", label: t("Startzeit-Analyse"), short: t("Startzeit"), icon: Timer, group: g.sys, keywords: "startzeit ladezeit dauer start langsam schnell analyse messen spiel startet" },
    { path: "/inventory", label: t("Hardware-Inventar"), short: t("Hardware"), icon: Cpu, group: g.sys, keywords: "hardware inventar geräte treiber grafikkarte gpu cpu prozessor ram arbeitsspeicher monitor laufwerk headset mikrofon controller maus tastatur netzwerk adapter" },
    { path: "/crashes", label: t("Fehlerberichte"), short: t("Fehler"), icon: Bug, group: g.sys, keywords: "absturz abstürze crash crashes fehler fehlerbericht bericht absturzbericht spiel stürzt ab hängt wer ausnahmecode modul" },
    { path: "/history", label: t("Gaming-Verlauf"), short: t("Verlauf"), icon: History, group: g.sys, keywords: "statistik spielzeit" },
    { path: "/overlay-settings", label: t("Overlay & Aufnahme"), short: t("Overlay"), icon: Video, group: g.sys, keywords: "overlay game bar aufnahme video replay clip obs fps hud" },
    { path: "/files", label: t("Dateien"), icon: FolderUp, group: g.conn, keywords: "datei dateien übertragen senden teilen upload download bilder clips config austausch handy pc" },
    { path: "/connect", label: t("PC verbinden"), short: t("Verbinden"), icon: MonitorSmartphone, group: g.conn, keywords: "verbinden koppeln qr code adresse anmelden" },
    { path: "/devices", label: t("Geräte"), icon: Smartphone, group: g.conn, keywords: "verbindungen gekoppelt" },
    { path: "/pair", label: t("Gerät koppeln"), short: t("Koppeln"), icon: Link2, group: g.conn, keywords: "qr code kopplung" },
    { path: "/plugins", label: t("Plugin Center"), short: t("Plugins"), icon: Puzzle, group: g.ext, keywords: "plugins erweiterungen store widgets themes addons module" },
    { path: "/quests", label: t("GameQuest"), short: t("Quests"), icon: Trophy, group: g.ext, keywords: "ziele xp level erfolge achievements matches siege statistik quest" },
    { path: "/room", label: t("Gaming-Raum"), short: t("Raum"), icon: Sofa, group: g.ext, keywords: "raum zimmer gaming room startseite 3d deko dekoration poster regal lampe licht stil variante" },
    { path: "/trophies", label: t("Trophäenraum & Gamer-Pass"), short: t("Trophäen"), icon: Trophy, group: g.ext, keywords: "trophäen trophäenraum erfolge gamer-pass profil karte level xp teilen gold silber bronze" },
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

/** A fixed, vivid colour per area, so symbols are recognisable at a glance (not grey). */
const NAV_COLORS: Record<string, string> = {
  "/": "#38bdf8", "/deck": "#a78bfa", "/games": "#34d399", "/programs": "#60a5fa", "/backlog": "#f59e0b", "/journal": "#34d399", "/play": "#f97316", "/worlds": "#4ade80", "/builds": "#a78bfa", "/friends": "#fb7185", "/media": "#f472b6", "/studio": "#c084fc", "/infos": "#22d3ee", "/wiki": "#60a5fa", "/calendar": "#f472b6", "/quick": "#facc15", "/assistant": "#f472b6",
  "/widgets": "#c084fc", "/profiles": "#fb7185", "/automations": "#2dd4bf", "/hotkeys": "#94a3b8", "/soundboard": "#22d3ee", "/audio": "#818cf8",
  "/monitor": "#4ade80", "/storage": "#94a3b8", "/mods": "#a3e635", "/vault": "#fbbf24", "/inventory": "#60a5fa", "/crashes": "#f87171", "/gamestate": "#a78bfa", "/remote": "#818cf8", "/move": "#94a3b8", "/layouts": "#22d3ee", "/peripherals": "#e879f9", "/input": "#f472b6", "/captures": "#fb7185", "/files": "#2dd4bf", "/network": "#38bdf8", "/history": "#fbbf24", "/trophies": "#facc15", "/start-times": "#facc15", "/overlay-settings": "#f97316", "/connect": "#60a5fa", "/devices": "#a3e635",
  "/pair": "#5eead4", "/plugins": "#e879f9", "/quests": "#fcd34d", "/deals": "#f87171", "/notifications": "#fb923c", "/settings": "#cbd5e1",
  "/diagnostics": "#2dd4bf", "/updates": "#4ade80", "/help": "#93c5fd",
};
export function navColor(path: string) {
  if (NAV_COLORS[path]) return NAV_COLORS[path];
  let h = 0;
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 80% 65%)`;
}

export function IconByName({ name, size = 20 }: { name?: string; size?: number }) {
  const I = ICONS[name ?? ""] ?? Zap;
  return <I size={size} />;
}
