// The knowledge sources JARVIS may ask. Every entry was checked on 2026-10-29: official MediaWiki API, answers the
// browser with CORS (works on iPhone/iPad without the PC), search returns results. Wikis that refused (wiki.gg login
// wall for Hollow Knight, pokewiki.de, poewiki.net without CORS) are not listed; PCGamingWiki and HowLongToBeat answer
// automated requests with 403 and are not used.

export interface Source { name: string; api: string; page: (title: string) => string; lang: "de" | "en"; extracts: boolean; /** Search only this namespace (UESP keeps each game in its own). */ ns?: number }

export const wiki = (name: string, api: string, base: string, lang: "de" | "en", extracts = true, ns?: number): Source =>
  ({ name, api, lang, extracts, ns, page: (t) => base + encodeURIComponent(t.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2F/g, "/") });
/** A Fandom wiki (no TextExtracts on most: the intro comes from action=parse). */
const fd = (sub: string, label: string, extracts = false) => wiki(`${label} (Fandom)`, `https://${sub}.fandom.com/api.php`, `https://${sub}.fandom.com/wiki/`, "en", extracts);
/** A wiki.gg wiki (mostly the official wiki of the game). */
const gg = (sub: string, label: string, extracts = false) => wiki(`${label} (wiki.gg)`, `https://${sub}.wiki.gg/api.php`, `https://${sub}.wiki.gg/wiki/`, "en", extracts);

export interface GameSources { name: string; aliases: string[]; wikis: Source[] }

/** Game → its wikis. The name is the one the game catalog/library uses; aliases are what players write. */
export const GAMES: GameSources[] = [
  { name: "Minecraft", aliases: ["minecraft"], wikis: [wiki("Minecraft Wiki", "https://de.minecraft.wiki/api.php", "https://de.minecraft.wiki/w/", "de")] },
  { name: "Terraria", aliases: ["terraria"], wikis: [wiki("Terraria Wiki (offiziell)", "https://terraria.wiki.gg/api.php", "https://terraria.wiki.gg/wiki/", "en")] },
  { name: "Stardew Valley", aliases: ["stardew valley", "stardew"], wikis: [wiki("Stardew Valley Wiki (offiziell)", "https://stardewvalleywiki.com/mediawiki/api.php", "https://stardewvalleywiki.com/", "en")] },
  { name: "Elden Ring", aliases: ["elden ring"], wikis: [fd("eldenring", "Elden Ring Wiki")] },
  { name: "Skyrim", aliases: ["skyrim", "elder scrolls", "the elder scrolls", "the elder scrolls v", "tes v"], wikis: [wiki("UESP (Elder Scrolls Wiki)", "https://en.uesp.net/w/api.php", "https://en.uesp.net/wiki/", "en", true, 134), fd("elderscrolls", "Elder Scrolls Wiki")] },
  { name: "Fortnite", aliases: ["fortnite"], wikis: [fd("fortnite", "Fortnite Wiki")] },
  { name: "Cyberpunk 2077", aliases: ["cyberpunk 2077", "cyberpunk"], wikis: [fd("cyberpunk", "Cyberpunk Wiki")] },
  { name: "GTA V", aliases: ["gta v", "gta 5", "gta", "gta online", "grand theft auto"], wikis: [fd("gta", "GTA Wiki")] },
  { name: "Palworld", aliases: ["palworld"], wikis: [gg("palworld", "Palworld Wiki")] },
  { name: "Baldur's Gate 3", aliases: ["baldur's gate 3", "baldurs gate 3", "bg3"], wikis: [wiki("bg3.wiki", "https://bg3.wiki/w/api.php", "https://bg3.wiki/wiki/", "en")] },
  { name: "Hollow Knight", aliases: ["hollow knight", "silksong"], wikis: [fd("hollowknight", "Hollow Knight Wiki")] },
  { name: "Valheim", aliases: ["valheim"], wikis: [fd("valheim", "Valheim Wiki")] },
  { name: "Zelda", aliases: ["zelda", "tears of the kingdom", "breath of the wild", "totk", "botw"], wikis: [wiki("Zelda Wiki", "https://zeldawiki.wiki/w/api.php", "https://zeldawiki.wiki/wiki/", "en")] },
  { name: "Pokémon", aliases: ["pokemon", "pokémon"], wikis: [wiki("Bulbapedia", "https://bulbapedia.bulbagarden.net/w/api.php", "https://bulbapedia.bulbagarden.net/wiki/", "en")] },
  { name: "League of Legends", aliases: ["league of legends", "lol", "league"], wikis: [wiki("League of Legends Wiki (offiziell)", "https://wiki.leagueoflegends.com/en-us/api.php", "https://wiki.leagueoflegends.com/en-us/", "en")] },
  { name: "Genshin Impact", aliases: ["genshin impact", "genshin"], wikis: [fd("genshin-impact", "Genshin Impact Wiki")] },
  { name: "Rocket League", aliases: ["rocket league"], wikis: [fd("rocketleague", "Rocket League Wiki")] },
  { name: "Fallout", aliases: ["fallout", "fallout 4", "fallout 76", "fallout new vegas"], wikis: [fd("fallout", "Nukapedia (Fallout Wiki)", true)] },
  { name: "The Witcher", aliases: ["the witcher", "witcher", "witcher 3"], wikis: [fd("witcher", "Witcher Wiki")] },
  { name: "Dark Souls", aliases: ["dark souls", "dark souls 3"], wikis: [fd("darksouls", "Dark Souls Wiki")] },
  { name: "Hogwarts Legacy", aliases: ["hogwarts legacy", "harry potter"], wikis: [fd("harrypotter", "Harry Potter Wiki")] },
  { name: "Among Us", aliases: ["among us"], wikis: [fd("among-us", "Among Us Wiki")] },
  { name: "Apex Legends", aliases: ["apex legends", "apex"], wikis: [fd("apexlegends", "Apex Legends Wiki", true)] },
  { name: "Valorant", aliases: ["valorant"], wikis: [fd("valorant", "Valorant Wiki")] },
  { name: "Overwatch", aliases: ["overwatch", "overwatch 2"], wikis: [fd("overwatch", "Overwatch Wiki", true)] },
  { name: "Counter-Strike", aliases: ["counter-strike", "counter strike", "cs2", "csgo", "cs go"], wikis: [fd("counterstrike", "Counter-Strike Wiki")] },
  { name: "Rainbow Six Siege", aliases: ["rainbow six siege", "rainbow six", "r6"], wikis: [fd("rainbowsix", "Rainbow Six Wiki")] },
  { name: "Call of Duty", aliases: ["call of duty", "warzone", "cod"], wikis: [fd("callofduty", "Call of Duty Wiki")] },
  { name: "Die Sims", aliases: ["die sims", "sims 4", "the sims", "sims"], wikis: [fd("sims", "Sims Wiki")] },
  { name: "Satisfactory", aliases: ["satisfactory"], wikis: [gg("satisfactory", "Satisfactory Wiki", true)] },
  { name: "Factorio", aliases: ["factorio"], wikis: [wiki("Factorio Wiki (offiziell)", "https://wiki.factorio.com/api.php", "https://wiki.factorio.com/", "en", false)] },
  { name: "RimWorld", aliases: ["rimworld"], wikis: [wiki("RimWorld Wiki", "https://rimworldwiki.com/api.php", "https://rimworldwiki.com/wiki/", "en", false)] },
  { name: "Subnautica", aliases: ["subnautica"], wikis: [fd("subnautica", "Subnautica Wiki")] },
  { name: "Hades", aliases: ["hades", "hades 2"], wikis: [fd("hades", "Hades Wiki", true)] },
  { name: "Dead by Daylight", aliases: ["dead by daylight", "dbd"], wikis: [fd("deadbydaylight", "Dead by Daylight Wiki", true)] },
  { name: "Rust", aliases: ["rust"], wikis: [fd("rust", "Rust Wiki")] },
  { name: "ARK", aliases: ["ark survival", "ark survival evolved", "ark survival ascended", "ark"], wikis: [gg("ark", "ARK Wiki (offiziell)")] },
  { name: "Don't Starve", aliases: ["don't starve", "dont starve", "don't starve together"], wikis: [gg("dontstarve", "Don't Starve Wiki")] },
  { name: "Path of Exile", aliases: ["path of exile", "poe", "poe 2"], wikis: [fd("pathofexile", "Path of Exile Wiki", true)] },
  { name: "Warframe", aliases: ["warframe"], wikis: [fd("warframe", "Warframe Wiki")] },
  { name: "Sea of Thieves", aliases: ["sea of thieves"], wikis: [gg("seaofthieves", "Sea of Thieves Wiki (offiziell)")] },
  { name: "No Man's Sky", aliases: ["no man's sky", "no mans sky"], wikis: [fd("nomanssky", "No Man's Sky Wiki", true)] },
  { name: "Borderlands", aliases: ["borderlands"], wikis: [fd("borderlands", "Borderlands Wiki")] },
  { name: "Assassin's Creed", aliases: ["assassin's creed", "assassins creed"], wikis: [fd("assassinscreed", "Assassin's Creed Wiki")] },
  { name: "Red Dead Redemption 2", aliases: ["red dead redemption", "red dead", "rdr2"], wikis: [fd("reddead", "Red Dead Wiki")] },
  { name: "Super Mario", aliases: ["super mario", "mario kart", "mario"], wikis: [wiki("Super Mario Wiki", "https://www.mariowiki.com/api.php", "https://www.mariowiki.com/", "en")] },
  { name: "Halo", aliases: ["halo", "halo infinite"], wikis: [wiki("Halopedia", "https://www.halopedia.org/api.php", "https://www.halopedia.org/", "en")] },
  { name: "World of Warcraft", aliases: ["world of warcraft", "wow", "warcraft"], wikis: [gg("warcraft", "Warcraft Wiki", true)] },
  { name: "Hearthstone", aliases: ["hearthstone"], wikis: [gg("hearthstone", "Hearthstone Wiki", true)] },
  { name: "Lethal Company", aliases: ["lethal company"], wikis: [fd("lethal-company", "Lethal Company Wiki")] },
  { name: "Helldivers 2", aliases: ["helldivers 2", "helldivers"], wikis: [gg("helldivers", "Helldivers Wiki", true)] },
  { name: "Roblox", aliases: ["roblox"], wikis: [fd("roblox", "Roblox Wiki")] },
  { name: "Age of Empires", aliases: ["age of empires", "aoe", "aoe2", "aoe4"], wikis: [fd("ageofempires", "Age of Empires Wiki")] },
  { name: "Monster Hunter", aliases: ["monster hunter", "monster hunter wilds", "monster hunter world"], wikis: [fd("monsterhunter", "Monster Hunter Wiki")] },
  { name: "Sekiro", aliases: ["sekiro"], wikis: [fd("sekiro-shadows-die-twice", "Sekiro Wiki")] },
  { name: "Bloodborne", aliases: ["bloodborne"], wikis: [fd("bloodborne", "Bloodborne Wiki")] },
  { name: "Starfield", aliases: ["starfield"], wikis: [fd("starfield", "Starfield Wiki")] },
  { name: "Lords of the Fallen", aliases: ["lords of the fallen"], wikis: [fd("lordsofthefallen", "Lords of the Fallen Wiki")] },
  { name: "Diablo", aliases: ["diablo", "diablo 4", "diablo iv"], wikis: [fd("diablo", "Diablo Wiki")] },
  { name: "Dota 2", aliases: ["dota 2", "dota"], wikis: [fd("dota2", "Dota 2 Wiki", true)] },
  { name: "Deep Rock Galactic", aliases: ["deep rock galactic", "drg"], wikis: [gg("deeprockgalactic", "Deep Rock Galactic Wiki")] },
  { name: "Resident Evil", aliases: ["resident evil"], wikis: [fd("residentevil", "Resident Evil Wiki")] },
  { name: "Silent Hill", aliases: ["silent hill"], wikis: [fd("silenthill", "Silent Hill Wiki")] },
  { name: "Forza", aliases: ["forza horizon", "forza"], wikis: [fd("forza", "Forza Wiki")] },
  { name: "The Crew", aliases: ["the crew motorfest", "the crew"], wikis: [fd("thecrew", "The Crew Wiki")] },
  { name: "EA Sports FC", aliases: ["ea sports fc", "ea fc", "fifa"], wikis: [fd("fifa", "FIFA Wiki")] },
  { name: "Need for Speed", aliases: ["need for speed", "nfs"], wikis: [fd("nfs", "Need for Speed Wiki")] },
  { name: "Super Smash Bros.", aliases: ["super smash bros", "smash bros", "smash"], wikis: [wiki("SmashWiki", "https://www.ssbwiki.com/api.php", "https://www.ssbwiki.com/", "en")] },
  { name: "The Binding of Isaac", aliases: ["binding of isaac", "isaac"], wikis: [fd("bindingofisaacrebirth", "Binding of Isaac Wiki", true)] },
  { name: "Slay the Spire", aliases: ["slay the spire"], wikis: [gg("slaythespire", "Slay the Spire Wiki")] },
  { name: "Cuphead", aliases: ["cuphead"], wikis: [fd("cuphead", "Cuphead Wiki")] },
  { name: "Hytale", aliases: ["hytale"], wikis: [fd("hytale", "Hytale Wiki")] },
  { name: "Phasmophobia", aliases: ["phasmophobia", "phasmo"], wikis: [fd("phasmophobia", "Phasmophobia Wiki")] },
  { name: "Five Nights at Freddy's", aliases: ["five nights at freddy's", "five nights at freddys", "fnaf"], wikis: [fd("fnaf", "FNaF Wiki")] },
  { name: "Ghost of Tsushima", aliases: ["ghost of tsushima", "ghost of yotei"], wikis: [fd("ghostoftsushima", "Ghost of Tsushima Wiki")] },
  { name: "God of War", aliases: ["god of war"], wikis: [fd("godofwar", "God of War Wiki")] },
  { name: "Horizon", aliases: ["horizon zero dawn", "horizon forbidden west"], wikis: [fd("horizon", "Horizon Wiki")] },
  { name: "The Last of Us", aliases: ["the last of us", "last of us", "tlou"], wikis: [fd("thelastofus", "The Last of Us Wiki")] },
  { name: "Mass Effect", aliases: ["mass effect"], wikis: [fd("masseffect", "Mass Effect Wiki")] },
  { name: "Dragon Age", aliases: ["dragon age"], wikis: [fd("dragonage", "Dragon Age Wiki")] },
  { name: "Persona", aliases: ["persona 5", "persona 3", "persona"], wikis: [fd("persona", "Persona Wiki")] },
  { name: "Final Fantasy", aliases: ["final fantasy"], wikis: [fd("finalfantasy", "Final Fantasy Wiki")] },
  { name: "Kingdom Hearts", aliases: ["kingdom hearts"], wikis: [fd("kingdomhearts", "Kingdom Hearts Wiki")] },
];

/** Topic sources beyond games – picked by what the question is about. */
export const KLEXIKON = wiki("Klexikon (Kinder-Lexikon, einfach erklärt)", "https://klexikon.zum.de/api.php", "https://klexikon.zum.de/wiki/", "de");
export const WIKIVOYAGE = wiki("Wikivoyage (deutsch)", "https://de.wikivoyage.org/w/api.php", "https://de.wikivoyage.org/wiki/", "de");
export const WIKIPEDIA = (lang: "de" | "en") => wiki(`Wikipedia (${lang === "de" ? "deutsch" : "englisch"})`, `https://${lang}.wikipedia.org/w/api.php`, `https://${lang}.wikipedia.org/wiki/`, lang);

/** Stack Exchange Q&A sites (answers with votes, CC BY-SA) and when they fit. */
export const QA_SITES = {
  gaming: { site: "gaming", host: "gaming.stackexchange.com", name: "Arqade (Stack Exchange)" },
  superuser: { site: "superuser", host: "superuser.com", name: "Super User (Stack Exchange, PC-Hilfe)" },
  boardgames: { site: "boardgames", host: "boardgames.stackexchange.com", name: "Board & Card Games (Stack Exchange)" },
} as const;
export type QaSite = keyof typeof QA_SITES;

const normAlias = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[-–:]/g, " ").replace(/\s+/g, " ").trim();
const BY_ALIAS = new Map<string, GameSources>();
for (const g of GAMES) for (const a of [g.name, ...g.aliases]) BY_ALIAS.set(normAlias(a), g);

/** The registry entry for a game name or alias ("GTA 5", "Skyrim", "Baldur's Gate 3"). */
export const gameSources = (name: string | null): GameSources | undefined => (name ? BY_ALIAS.get(normAlias(name)) : undefined);

/** Aliases that are also everyday words – only taken when written after "in/bei/für …", not anywhere in the sentence. */
const AMBIGUOUS = new Set(["rust", "league", "smash", "mario", "persona", "halo", "apex", "forza", "the crew", "isaac", "hades", "ark", "poe", "cod", "lol", "wow", "dota", "drg", "r6", "sims", "gta", "fifa", "dbd", "aoe", "phasmo", "horizon", "diablo"]);
/** A registered game named anywhere in the sentence (longest alias wins). */
export function gameMentioned(text: string): string | null {
  const s = ` ${normAlias(text).replace(/[?!.,;]/g, " ")} `.replace(/\s+/g, " ");
  let best: [string, GameSources] | null = null;
  for (const [alias, g] of BY_ALIAS) if (alias.length >= 3 && !AMBIGUOUS.has(alias) && s.includes(` ${alias} `) && (!best || alias.length > best[0].length)) best = [alias, g];
  return best?.[1].name ?? null;
}
