// Generates web/src/lib/brand-icons.ts: logos of well-known programs, launchers and games, so Discord, OBS, Minecraft …
// show their logo on tiles and deck keys, also without the PC. Only the shapes listed below are taken.
//  - simple-icons (CC0 1.0): filled brand shapes in the brand colour. Icons removed from simple-icons at the brand owner's
//    request are not available in the npm package and are not used.
//  - Arcticons (CC BY-SA 4.0, © Donnnno and the Arcticons contributors): line icons drawn by the community – used for games
//    simple-icons does not have (Minecraft, Apex Legends …). Used unchanged; attribution in docs/LIZENZEN.md and in the app.
// Usage: npm pack simple-icons@16.35.0 @iconify-json/arcticons@1.2.58, unpack both, then
//        node scripts/gen-brand-icons.mjs <simple-icons/package> <arcticons/package>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "");
const si = createRequire(import.meta.url)(path.join(dir, "index.js"));
const version = createRequire(import.meta.url)(path.join(dir, "package.json")).version;
const arcDir = path.resolve(process.argv[3] ?? "");
const arc = JSON.parse(readFileSync(path.join(arcDir, "icons.json"), "utf8"));
const arcVersion = JSON.parse(readFileSync(path.join(arcDir, "package.json"), "utf8")).version;

// id, simple-icons slug, display name, match on the folded name or file name (lowercase, without accents)
const BRANDS = [
  ["discord", "Discord", /discord/], ["obs", "Obsstudio", /\bobs\b|obs ?studio|obs64/], ["spotify", "Spotify", /spotify/],
  ["steam", "Steam", /^steam( client)?$|\\steam\.exe|^steam\.exe/], ["epic", "Epicgames", /epic games/], ["ea", "Ea", /^ea( app)?$|ea desktop|electronic arts/],
  ["battlenet", "Battledotnet", /battle\.?net/], ["gog", "Gogdotcom", /gog galaxy|gog\.com/], ["ubisoft", "Ubisoft", /ubisoft|uplay/],
  ["rockstar", "Rockstargames", /rockstar games/], ["riot", "Riotgames", /riot client|riot games/], ["valorant", "Valorant", /valorant/],
  ["lol", "Leagueoflegends", /league of legends/], ["roblox", "Roblox", /roblox/], ["fortnite", "Fortnite", /fortnite/],
  ["cs", "Counterstrike", /counter-?strike|^cs2$/], ["dota", "Dota2", /dota ?2/], ["pubg", "Pubg", /pubg|battlegrounds/],
  ["itch", "Itchdotio", /itch(\.io)?$/], ["heroic", "Heroicgameslauncher", /heroic/], ["playstation", "Playstation", /playstation|ps remote/],
  ["twitch", "Twitch", /twitch/], ["kick", "Kick", /^kick$/], ["youtube", "Youtube", /youtube/], ["streamlabs", "Streamlabs", /streamlabs/],
  ["elgato", "Elgato", /elgato|stream deck|camera hub/], ["nvidia", "Nvidia", /nvidia|geforce/], ["amd", "Amd", /\bamd\b|radeon/],
  ["steelseries", "Steelseries", /steelseries|sonar/], ["razer", "Razer", /razer|synapse/], ["corsair", "Corsair", /corsair|icue/],
  ["chrome", "Googlechrome", /chrome/], ["firefox", "Firefoxbrowser", /firefox/], ["operagx", "Operagx", /opera gx/], ["opera", "Opera", /^opera( browser)?$|\\opera\.exe/],
  ["brave", "Brave", /brave/], ["whatsapp", "Whatsapp", /whatsapp/], ["telegram", "Telegram", /telegram/], ["signal", "Signal", /^signal$/],
  ["teamspeak", "Teamspeak", /teamspeak/], ["zoom", "Zoom", /^zoom( workplace)?$/], ["vlc", "Vlcmediaplayer", /\bvlc\b/],
  ["netflix", "Netflix", /netflix/], ["deezer", "Deezer", /deezer/], ["applemusic", "Applemusic", /apple music|itunes/], ["tiktok", "Tiktok", /tiktok/],
  ["audacity", "Audacity", /audacity/], ["blender", "Blender", /blender/], ["gimp", "Gimp", /\bgimp\b/], ["davinci", "Davinciresolve", /davinci/],
  ["notion", "Notion", /^notion$/], ["obsidian", "Obsidian", /obsidian/], ["github", "Github", /github/],
  ["steamdeck", "Steamdeck", /steam deck/], ["osu", "Osu", /^osu!?$|\\osu!?\.exe/],
  ["thefinals", "Thefinals", /^the finals$/],
  ["claude", "Claude", /^claude/], ["curseforge", "Curseforge", /curseforge/], ["dolby", "Dolby", /dolby/], ["icloud", "Icloud", /icloud/],
  ["instagram", "Instagram", /instagram/], ["intel", "Intel", /\bintel\b/], ["keepass", "Keepassxc", /keepass/], ["hp", "Hp", /^hp\b|\bhp (smart|pc|support|wolf)/],
  ["modrinth", "Modrinth", /modrinth/], ["python", "Python", /^python/], ["docker", "Docker", /docker/], ["figma", "Figma", /^figma/],
  ["messenger", "Messenger", /^messenger/], ["reddit", "Reddit", /^reddit/], ["facebook", "Facebook", /^facebook/], ["pinterest", "Pinterest", /pinterest/],
  ["snapchat", "Snapchat", /snapchat/], ["paypal", "Paypal", /paypal/], ["dropbox", "Dropbox", /dropbox/], ["googledrive", "Googledrive", /google drive/],
  ["samsung", "Samsung", /samsung/], ["lenovo", "Lenovo", /lenovo|legion/], ["asus", "Asus", /^asus|myasus/], ["msi", "Msi", /^msi\b|msi center|dragon center/],
  ["wacom", "Wacom", /wacom/], ["notepadpp", "Notepadplusplus", /notepad\+\+/], ["7zip", "7zip", /7-?zip/], ["todoist", "Todoist", /todoist/],
  ["evernote", "Evernote", /evernote/], ["plex", "Plex", /^plex/], ["tidal", "Tidal", /^tidal/], ["soundcloud", "Soundcloud", /soundcloud/],
  ["unity", "Unity", /^unity( hub)?$/], ["unreal", "Unrealengine", /unreal engine/], ["godot", "Godotengine", /godot/], ["git", "Git", /^git( bash| gui)?$/],
  ["gitlab", "Gitlab", /gitlab/], ["postman", "Postman", /postman/], ["wireshark", "Wireshark", /wireshark/], ["virtualbox", "Virtualbox", /virtualbox/],
  ["vmware", "Vmware", /vmware/], ["teamviewer", "Teamviewer", /teamviewer/], ["anydesk", "Anydesk", /anydesk/], ["nordvpn", "Nordvpn", /nordvpn/],
  ["protonvpn", "Protonvpn", /proton ?vpn/], ["expressvpn", "Expressvpn", /expressvpn/], ["bitwarden", "Bitwarden", /bitwarden/], ["1password", "1password", /1password/],
  ["lastpass", "Lastpass", /lastpass/], ["thunderbird", "Thunderbird", /thunderbird/], ["vivaldi", "Vivaldi", /vivaldi/], ["duckduckgo", "Duckduckgo", /duckduckgo/],
  ["hyperx", "Hyperx", /hyperx/], ["rog", "Republicofgamers", /\brog\b|republic of gamers|armoury crate/], ["alienware", "Alienware", /alienware/],
  ["ollama", "Ollama", /ollama/], ["perplexity", "Perplexity", /perplexity/], ["obsidianmd", "Obsidian", /obsidian/],
];

// Games (and the Xbox app) from Arcticons: id, Arcticons name, display name, tile colour, match.
const GAMES = [
  ["minecraft", "minecraft", "Minecraft", "#3c8527", /minecraft/], ["apex", "apex-legends", "Apex Legends", "#da292a", /apex legends/],
  ["cod", "call-of-duty", "Call of Duty", "#1a1a1a", /call of duty|warzone|modern warfare|black ops/], ["genshin", "genshin-impact", "Genshin Impact", "#4a6fa5", /genshin/],
  ["amongus", "amongus", "Among Us", "#c51111", /^among us/], ["terraria", "terraria", "Terraria", "#2e7d32", /terraria/],
  ["stardew", "stardew-valley", "Stardew Valley", "#4f8a2b", /stardew/], ["hearthstone", "hearthstone", "Hearthstone", "#a0612c", /hearthstone/],
  ["destiny2", "destiny-2", "Destiny 2", "#2b2f36", /destiny 2/], ["warframe", "warframe", "Warframe", "#1f4e5f", /warframe/],
  ["fallguys", "fall-guys", "Fall Guys", "#e73ea4", /fall guys/], ["forzam", "forza-motorsport", "Forza Motorsport", "#1d3b6b", /forza motorsport/],
  ["forza", "forza", "Forza Horizon", "#e5541e", /forza/], ["skyrim", "skyrim", "Skyrim", "#3d3d3d", /skyrim/], ["oblivion", "oblivion", "Oblivion", "#5a4a2f", /oblivion/],
  ["ark", "ark-survival", "ARK", "#2d5d7b", /^ark\b/], ["rocketleague", "rocket-league-sideswipe", "Rocket League", "#1061c7", /rocket league/],
  ["geometrydash", "geometry-dash", "Geometry Dash", "#2a7de1", /geometry dash/], ["brawlhalla", "brawlhalla", "Brawlhalla", "#d9532b", /brawlhalla/],
  ["hollowknight", "hollow-knight", "Hollow Knight", "#2a3550", /hollow knight(?!.*silksong)/], ["silksong", "hollow-knight-silksong", "Silksong", "#7a1f2b", /silksong/],
  ["cuphead", "cuphead", "Cuphead", "#c4382f", /cuphead/], ["deadcells", "dead-cells", "Dead Cells", "#5b2a86", /dead cells/],
  ["vampiresurvivors", "vampiresurvivors", "Vampire Survivors", "#7b1e2b", /vampire survivors/], ["balatro", "balatro", "Balatro", "#c0392b", /balatro/],
  ["slaythespire", "slay-the-spire", "Slay the Spire", "#8b2e2e", /slay the spire/], ["limbo", "limbo", "Limbo", "#2b2b2b", /^limbo$/],
  ["dontstarve", "dont-starve", "Don't Starve", "#5c4a3a", /don'?t starve/], ["cultofthelamb", "cult-of-the-lamb", "Cult of the Lamb", "#9b1c31", /cult of the lamb/],
  ["undertale", "undertale", "Undertale", "#1b1b1b", /undertale/], ["subnautica", "subnautica", "Subnautica", "#0e6e8c", /subnautica/],
  ["nomanssky", "no-mans-sky", "No Man's Sky", "#c4492f", /no man'?s sky/], ["mortalkombat", "mortal-kombat", "Mortal Kombat", "#a6721e", /mortal kombat/],
  ["efootball", "efootball", "eFootball", "#1b3d8f", /efootball/], ["fc", "ea-sports-fc-companion", "EA SPORTS FC", "#0f7a3a", /ea sports fc|^fc \d{2}|^ea fc/],
  ["starrail", "honkai-star-rail", "Honkai: Star Rail", "#3b4f8f", /star rail/], ["honkai3", "honkai-impact-3rd", "Honkai Impact 3rd", "#5a3d8a", /honkai impact/],
  ["zzz", "zenless-zone-zero", "Zenless Zone Zero", "#d4a017", /zenless/], ["wuwa", "wuthering-waves", "Wuthering Waves", "#2d3e50", /wuthering waves/],
  ["arknights", "arknights", "Arknights", "#2a2a2a", /^arknights/], ["halflife", "half-life", "Half-Life", "#d4741c", /half-life/],
  ["doom", "doom", "DOOM", "#9b1b1b", /^doom(?![a-z])/], ["runescape", "runescape", "RuneScape", "#7a5a2a", /runescape/], ["albion", "albion-online", "Albion Online", "#3b5a2a", /albion online/],
  ["newworld", "new-world", "New World", "#6a4a2a", /^new world/], ["vrchat", "vrchat", "VRChat", "#1f1f1f", /vrchat/], ["recroom", "rec-room", "Rec Room", "#e25b45", /rec room/],
  ["xbox", "xbox", "Xbox", "#107c10", /^xbox( app)?$|gaming services/], ["gamepass", "xbox-gamepass", "Game Pass", "#107c10", /game pass/],
  ["nintendo", "nintendo", "Nintendo", "#e60012", /nintendo/],
];

// Everyday apps without a simple-icons logo (Adobe, Microsoft, Canva …) from Arcticons: id, Arcticons name, display name, tile colour, match.
const APPS = [
  ["acrobat", "adobe-acrobat", "Adobe Acrobat", "#b30b00", /adobe acrobat|acrobat reader/], ["canva", "canva", "Canva", "#00c4cc", /canva/],
  ["copilot", "microsoft-copilot", "Copilot", "#5b5fc7", /copilot/], ["chatgpt", "openai-chatgpt", "ChatGPT", "#10a37f", /chatgpt/],
  ["edge", "edge", "Microsoft Edge", "#0f7dc2", /microsoft edge|^edge$/], ["m365", "microsoft-365", "Microsoft 365", "#d83b01", /microsoft 365|^office$|microsoft office/],
  ["excel", "microsoft-excel", "Excel", "#107c41", /\bexcel\b/], ["powerpoint", "microsoft-powerpoint", "PowerPoint", "#c43e1c", /powerpoint/],
  ["teams", "microsoft-teams", "Microsoft Teams", "#5059c9", /microsoft teams|^teams$/], ["onedrive", "microsoft-onedrive", "OneDrive", "#0364b8", /onedrive/],
  ["onenote", "microsoft-onenote", "OneNote", "#7719aa", /onenote/], ["outlook", "microsoft-outlook", "Outlook", "#0078d4", /outlook/],
  ["msstore", "microsoft", "Microsoft Store", "#0078d4", /microsoft store/], ["medal", "medal-tv", "Medal", "#d4a017", /^medal$/],
  ["logitech", "logitech-g", "Logitech G", "#00b8fc", /logitech/], ["slack", "slack", "Slack", "#4a154b", /^slack/],
  ["amazon", "amazon", "Amazon", "#ff9900", /^amazon\b/], ["primevideo", "amazon-prime-video", "Prime Video", "#00a8e1", /prime video/],
  ["disney", "disney", "Disney+", "#113ccf", /disney/], ["voicemod", "voicemod-controller", "Voicemod", "#7d3cff", /voicemod/],
  ["omen", "omen-gaming-hub", "OMEN", "#d71920", /\bomen\b/], ["skype", "skype", "Skype", "#00aff0", /^skype/],
  ["calculator", "calculator", "Rechner", "#4a4a4a", /^rechner$|^calculator$/],
  ["camera", "camera", "Kamera", "#4a4a4a", /^kamera$|^camera$/], ["clock", "clock", "Uhr", "#4a4a4a", /^uhr$|^clock$/],
  ["mail", "mail", "Mail", "#3b6fd6", /^mail$|^e-?mail$/], ["feedback", "feedback", "Feedback-Hub", "#4a4a4a", /feedback-?hub/],
  ["vscode", "visual-studio-code", "Visual Studio Code", "#007acc", /visual studio code|^vs ?code$/], ["quantum", "quantum", "JBL QuantumENGINE", "#ff6a00", /quantum ?engine/],
  ["jbl", "jblheadphones", "JBL", "#ff6a00", /^jbl/],
];
const SAFE = /^(<(path|circle|ellipse|rect|line|polyline|polygon|g)\b(\s+(fill|stroke|stroke-linecap|stroke-linejoin|stroke-width|stroke-miterlimit|d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points|transform)="[^"<>]*")*\s*\/?>|<\/(g)>)+$/;

const out = [];
for (const [id, slug, rx] of BRANDS) {
  const icon = si["si" + slug];
  if (!icon) throw new Error("fehlt in simple-icons: " + slug);
  out.push(`  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(icon.title)}, hex: "#${icon.hex}", match: ${rx}, path: ${JSON.stringify(icon.path)} },`);
}
for (const [id, name, label, hex, rx] of GAMES) {
  const icon = arc.icons[name];
  if (!icon) throw new Error("fehlt in Arcticons: " + name);
  // Only plain shapes (no scripts, links or event attributes): the body is inserted as SVG markup.
  if (!SAFE.test(icon.body)) throw new Error("unerwarteter SVG-Inhalt: " + name);
  out.push(`  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(label)}, hex: "${hex}", match: ${rx}, body: ${JSON.stringify(icon.body)}, source: "arcticons" },`);
}
for (const [id, name, label, hex, rx] of APPS) {
  const icon = arc.icons[name];
  if (!icon) throw new Error("fehlt in Arcticons: " + name);
  if (!SAFE.test(icon.body)) throw new Error("unerwarteter SVG-Inhalt: " + name);
  out.push(`  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(label)}, hex: "${hex}", match: ${rx}, body: ${JSON.stringify(icon.body)}, source: "arcticons" },`);
}
const file = `// GENERATED by scripts/gen-brand-icons.mjs – do not edit by hand.
// simple-icons ${version} (CC0 1.0) and Arcticons ${arcVersion} (CC BY-SA 4.0, © Donnnno and contributors,
// https://github.com/Arcticons-Team/Arcticons) – see docs/LIZENZEN.md. Logos identify the program or game the user
// installed; trademarks belong to their owners.
export interface Brand { id: string; name: string; hex: string; match: RegExp; path?: string; body?: string; source?: "arcticons" }
export const BRANDS: Brand[] = [
${out.join("\n")}
];
`;
writeFileSync(new URL("../web/src/lib/brand-icons.ts", import.meta.url), file);
console.log(BRANDS.length + " Logos (simple-icons) + " + (GAMES.length + APPS.length) + " (Arcticons) geschrieben");
