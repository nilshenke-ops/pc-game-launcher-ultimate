// The collections of "Welten & Bauen", "Builds & Technik", "Freunde & Gruppe" and "Medien" – field lists only (UI: components/collection-view.tsx).
import type { Data, FieldDef, FieldError, Schema } from "./collections";
import { ACCESS_KEYS, FACT_KEYS, TIME_ZONES } from "./infos";
import { parseTime } from "./media";

const o = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const WORLD: Schema = {
  kind: "world", label: "Minecraft-Welt",
  fields: [
    { key: "title", label: "Name der Welt", type: "text", required: true, maxLen: 100, card: true },
    { key: "edition", label: "Edition", type: "select", required: true, options: o(["unknown", "Unbekannt"], ["java", "Java"], ["bedrock", "Bedrock"]), card: true, filter: true },
    { key: "version", label: "Spielversion", type: "text", maxLen: 30, placeholder: "z. B. 1.21.4", card: true },
    { key: "mode", label: "Spielmodus", type: "select", required: true, options: o(["survival", "Überleben"], ["creative", "Kreativ"], ["hardcore", "Hardcore"], ["adventure", "Abenteuer"], ["other", "Sonstiges"]), card: true, filter: true },
    { key: "where", label: "Wo gespeichert / Server", type: "text", maxLen: 200, placeholder: "Einzelspieler, Realm, Serveradresse …" },
    { key: "seed", label: "Seed", type: "text", maxLen: 40, hint: "Nur wenn du ihn kennst (im Spiel: /seed)." },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 4000 },
    { key: "pois", label: "Orte und Koordinaten", type: "rows", maxRows: 500, columns: [
      { key: "name", label: "Name", type: "text", required: true, maxLen: 80 },
      { key: "dim", label: "Dimension", type: "select", required: true, options: o(["overworld", "Oberwelt"], ["nether", "Nether"], ["end", "End"]) },
      { key: "x", label: "X", type: "number", required: true, int: true, min: -30000000, max: 30000000 },
      { key: "y", label: "Y", type: "number", int: true, min: -64, max: 320 },
      { key: "z", label: "Z", type: "number", required: true, int: true, min: -30000000, max: 30000000 },
      { key: "group", label: "Gruppe", type: "text", maxLen: 40, placeholder: "Basis, Farm, Portal …" },
      { key: "note", label: "Notiz", type: "text", maxLen: 200 },
    ] },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "imageIds", label: "Bilder", type: "images" },
  ],
};

export const PROJECT: Schema = {
  kind: "project", label: "Bauprojekt",
  fields: [
    { key: "title", label: "Projekt", type: "text", required: true, maxLen: 120, card: true },
    { key: "worldId", label: "Welt", type: "ref", refKind: "world", card: true, filter: true },
    { key: "game", label: "Spiel", type: "game" },
    { key: "status", label: "Status", type: "select", required: true, options: o(["idea", "Idee"], ["planned", "Geplant"], ["building", "Im Bau"], ["paused", "Pausiert"], ["done", "Fertig"]), card: true, filter: true },
    { key: "where", label: "Ort / Koordinaten", type: "text", maxLen: 120 },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 4000 },
    { key: "tasks", label: "Aufgaben", type: "rows", maxRows: 300, hint: "Der Fortschritt wird nur aus den abgehakten Aufgaben berechnet.", columns: [
      { key: "text", label: "Aufgabe", type: "text", required: true, maxLen: 160 },
      { key: "done", label: "Erledigt", type: "bool" },
    ] },
    { key: "materials", label: "Material", type: "rows", maxRows: 300, columns: [
      { key: "item", label: "Material", type: "text", required: true, maxLen: 80 },
      { key: "needed", label: "Benötigt", type: "number", int: true, min: 0, max: 10000000 },
      { key: "have", label: "Vorhanden", type: "number", int: true, min: 0, max: 10000000 },
    ] },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "imageIds", label: "Bilder", type: "images" },
  ],
  templates: [
    { name: "Haus", data: { status: "idea", tasks: [{ text: "Ort und Größe festlegen" }, { text: "Fundament" }, { text: "Wände und Dach" }, { text: "Innenausbau" }, { text: "Beleuchtung" }] } },
    { name: "Farm", data: { status: "planned", tasks: [{ text: "Design aussuchen" }, { text: "Material sammeln" }, { text: "Aufbauen" }, { text: "Testen und verbessern" }] } },
  ],
};

export const MARKERS: Schema = {
  kind: "markers", label: "Karten-Marker",
  fields: [
    { key: "title", label: "Karte / Gebiet", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "mapImage", label: "Eigenes Kartenbild (optional)", type: "image", hint: "Ein Screenshot der Karte aus dem Spiel. Ohne Bild gibt es nur Liste und Tabelle – Nexus zeichnet keine erfundene Karte." },
    { key: "markers", label: "Marker", type: "rows", maxRows: 1000, columns: [
      { key: "name", label: "Name", type: "text", required: true, maxLen: 80 },
      { key: "group", label: "Gruppe", type: "text", maxLen: 40 },
      { key: "x", label: "X", type: "number", min: -100000000, max: 100000000 },
      { key: "y", label: "Y", type: "number", min: -100000000, max: 100000000 },
      { key: "done", label: "Erledigt", type: "bool" },
      { key: "note", label: "Notiz", type: "text", maxLen: 200 },
    ] },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
};

export const BUILD: Schema = {
  kind: "build", label: "Build / Loadout",
  fields: [
    { key: "title", label: "Name", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "role", label: "Rolle / Klasse", type: "text", maxLen: 60, card: true },
    { key: "mode", label: "Für Modus", type: "text", maxLen: 60, placeholder: "PvE, Ranked, Koop …" },
    { key: "props", label: "Eigenschaften", type: "rows", maxRows: 200, hint: "Frei wählbar: Waffe, Talent, Aufsatz, Wert …", columns: [
      { key: "name", label: "Eigenschaft", type: "text", required: true, maxLen: 60 },
      { key: "value", label: "Wert", type: "text", maxLen: 200 },
    ] },
    { key: "notes", label: "Notizen / Strategie", type: "textarea", maxLen: 8000 },
    { key: "source", label: "Quelle (optional)", type: "url", hint: "Woher der Build stammt, falls nicht selbst erstellt." },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
  templates: [
    { name: "Waffen-Loadout", data: { props: [{ name: "Primärwaffe", value: "" }, { name: "Sekundärwaffe", value: "" }, { name: "Aufsätze", value: "" }, { name: "Ausrüstung", value: "" }] } },
    { name: "Charakter-Build", data: { props: [{ name: "Klasse", value: "" }, { name: "Hauptwerte", value: "" }, { name: "Fähigkeiten", value: "" }, { name: "Ausrüstung", value: "" }] } },
    { name: "Fahrzeug-Setup", data: { props: [{ name: "Fahrzeug", value: "" }, { name: "Reifen", value: "" }, { name: "Getriebe", value: "" }, { name: "Abtrieb", value: "" }] } },
  ],
};

export const MODLIST: Schema = {
  kind: "modlist", label: "Mod-Sammlung",
  fields: [
    { key: "title", label: "Name der Sammlung / des Modpacks", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "gameVersion", label: "Spielversion", type: "text", maxLen: 40, card: true },
    { key: "loader", label: "Mod-Loader", type: "text", maxLen: 60, placeholder: "Fabric, Forge, BepInEx …" },
    { key: "mods", label: "Mods", type: "rows", maxRows: 1000, hint: "Der Status ist nur deine Markierung – Nexus prüft nicht, was installiert ist, und lädt nichts herunter.", columns: [
      { key: "name", label: "Mod", type: "text", required: true, maxLen: 100 },
      { key: "version", label: "Version", type: "text", maxLen: 40 },
      { key: "status", label: "Status (selbst markiert)", type: "select", required: true, options: o(["planned", "Geplant"], ["installed", "Installiert (selbst markiert)"], ["disabled", "Deaktiviert"], ["removed", "Entfernt"]) },
      { key: "url", label: "Seite", type: "url" },
      { key: "note", label: "Notiz / Abhängigkeit", type: "text", maxLen: 200 },
    ] },
    { key: "notes", label: "Versionshinweise / Notizen", type: "textarea", maxLen: 8000 },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
};

export const GFX: Schema = {
  kind: "gfx", label: "Grafikvergleich",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "imageA", label: "Bild A", type: "image", required: true },
    { key: "labelA", label: "Einstellungen A", type: "text", maxLen: 160, placeholder: "z. B. Hoch, DLSS Qualität, 1440p" },
    { key: "imageB", label: "Bild B", type: "image", required: true },
    { key: "labelB", label: "Einstellungen B", type: "text", maxLen: 160, placeholder: "z. B. Mittel, nativ, 1440p" },
    { key: "notes", label: "Was fällt dir auf?", type: "textarea", maxLen: 4000, hint: "Aus Bildern lässt sich keine Bildrate ablesen – FPS gehören ins Leistungsarchiv (gemessen)." },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
};

export const CONTROLS: Schema = {
  kind: "controls", label: "Steuerung",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120, card: true, placeholder: "z. B. Elden Ring – Controller" },
    { key: "game", label: "Spiel", type: "game", required: true, card: true },
    { key: "entries", label: "Belegung", type: "rows", maxRows: 500, columns: [
      { key: "action", label: "Aktion", type: "text", required: true, maxLen: 80 },
      { key: "input", label: "Taste / Knopf", type: "text", required: true, maxLen: 60 },
      { key: "device", label: "Gerät", type: "select", required: true, options: o(["kbm", "Tastatur & Maus"], ["pad", "Controller"], ["other", "Sonstiges"]) },
      { key: "origin", label: "Herkunft", type: "select", required: true, options: o(["own", "Eigene Angabe"], ["official", "Offiziell (mit Quelle)"]) },
      { key: "source", label: "Quelle (bei offiziell)", type: "url" },
    ] },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
  // "Official" only with a source – otherwise it is an own entry.
  check: (d) => ((d.entries as Data[] | undefined) ?? []).flatMap((r, i) => r.origin === "official" && !r.source ? [{ key: "entries", row: i, col: "source", message: "Zeile {n}: „Offiziell“ geht nur mit Quelle – sonst „Eigene Angabe“ wählen.", vars: { n: i + 1 } }] : []),
};

// ------------------------------------------------------------------------------------------ friends (2.41)

const PLATFORMS = "PC, PlayStation, Xbox, Switch, Mobil …";

export const PLAYER: Schema = {
  kind: "player", label: "Spieler-Karte",
  fields: [
    { key: "title", label: "Spielername", type: "text", required: true, maxLen: 60, card: true },
    { key: "me", label: "Das bin ich", type: "bool", filter: true },
    { key: "avatar", label: "Avatar", type: "image" },
    { key: "platforms", label: "Plattformen", type: "tags", hint: PLATFORMS, filter: true },
    { key: "games", label: "Spiele (besitzt / spielt)", type: "rows", maxRows: 300, hint: "Von Hand gepflegt – Nexus kennt die Bibliotheken deiner Freunde nicht.", columns: [
      { key: "name", label: "Spiel", type: "text", required: true, maxLen: 100 },
      { key: "platform", label: "Plattform", type: "text", maxLen: 30 },
      { key: "favorite", label: "Lieblingsspiel", type: "bool" },
    ] },
    { key: "genres", label: "Genres", type: "tags" },
    { key: "modes", label: "Bevorzugte Spielmodi", type: "text", maxLen: 160, card: true },
    { key: "style", label: "Spielstil", type: "text", maxLen: 160 },
    { key: "roles", label: "Bevorzugte Teamrollen", type: "tags" },
    { key: "availability", label: "Verfügbarkeit (freiwillig)", type: "text", maxLen: 200, placeholder: "z. B. Mo–Do ab 19 Uhr" },
    { key: "timezone", label: "Zeitzone", type: "text", maxLen: 60, placeholder: "z. B. Europe/Berlin", hint: "Für Termine in der Ortszeit dieser Person." },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 2000 },
    { key: "shareAllowed", label: "Darf geteilt werden (Zustimmung der Person)", type: "bool", hint: "Ohne Häkchen erscheint die Karte in keinem geteilten Link." },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
  check: (d) => {
    const tz = d.timezone as string | undefined;
    if (!tz) return [];
    try { new Intl.DateTimeFormat("de-DE", { timeZone: tz }); return []; } catch { return [{ key: "timezone", message: "Unbekannte Zeitzone – Schreibweise wie „Europe/Berlin“." }]; }
  },
};

export const SERVER: Schema = {
  kind: "server", label: "Server",
  fields: [
    { key: "title", label: "Servername", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "protocol", label: "Statusabfrage", type: "select", required: true, options: o(["other", "Keine (Status unbekannt)"], ["minecraft", "Minecraft Java (Server List Ping)"], ["source", "Steam/Source (A2S)"]), filter: true, hint: "Nur diese offiziellen Abfragen gibt es – für andere Spiele bleibt der Status „Unbekannt“." },
    { key: "host", label: "Adresse", type: "text", required: true, maxLen: 255, placeholder: "play.example.net oder 192.168.0.10" },
    { key: "port", label: "Port", type: "number", int: true, min: 1, max: 65535, placeholder: "leer = Standard" },
    { key: "category", label: "Kategorie", type: "text", maxLen: 40, card: true },
    { key: "region", label: "Region", type: "text", maxLen: 40, card: true },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 2000 },
    { key: "notes", label: "Eigene Notizen", type: "textarea", maxLen: 2000 },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
};

const TRI = o(["unknown", "Unbekannt"], ["yes", "Ja"], ["partial", "Teilweise"], ["no", "Nein"]);
const tri = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "select", required: true, options: TRI, ...extra });

/** Fact check (F14) – also used by the group finder (crossplay only with a source). */
export const FACTS: Schema = {
  kind: "facts", label: "Spiel-Fakten",
  fields: [
    { key: "title", label: "Spiel", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "In der Bibliothek", type: "game" },
    { key: "platforms", label: "Plattformen", type: "tags", hint: PLATFORMS, filter: true },
    { key: "feel", label: "Genre & Spielgefühl", type: "tags", hint: "Eigene Stichwörter, z. B. Survival, Koop, entspannt – daraus entstehen die Empfehlungen.", filter: true },
    ...FACT_KEYS.filter((k) => k.key !== "crossplay" && k.key !== "coop").slice(0, 2).map((k) => tri(k.key, k.label)),
    tri("crossplay", "Crossplay", { card: true, filter: true }),
    { key: "crossplaySource", label: "Quelle für Crossplay", type: "url", hint: "Pflicht bei „Ja“ oder „Teilweise“ – ohne Beleg gilt Crossplay als unbekannt." },
    tri("coop", "Koop", { filter: true }),
    ...FACT_KEYS.filter((k) => !["crossplay", "coop", "singleplayer", "multiplayer"].includes(k.key)).map((k) => tri(k.key, k.label)),
    { key: "maxPlayers", label: "Spieler gleichzeitig (online)", type: "number", int: true, min: 1, max: 1000 },
    { key: "source", label: "Quelle", type: "url", hint: "Shop-Seite, Hersteller-Seite oder Patchnotes – damit andere die Angaben nachprüfen können." },
    { key: "checkedOn", label: "Stand", type: "date", hint: "Wann die Angaben zuletzt geprüft wurden – Spiele ändern sich mit Updates." },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
  ],
  check: (d) => (d.crossplay === "yes" || d.crossplay === "partial") && !d.crossplaySource ? [{ key: "crossplaySource", message: "Crossplay „Ja/Teilweise“ nur mit Quelle – sonst „Unbekannt“ wählen." }] : [],
};

/** Accessibility finder (F24). */
export const ACCESS: Schema = {
  kind: "access", label: "Barrierefreiheit",
  fields: [
    { key: "title", label: "Spiel", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "In der Bibliothek", type: "game" },
    ...ACCESS_KEYS.map((k) => tri(k.key, k.label)),
    { key: "source", label: "Quelle", type: "url", hint: "Z. B. die Barrierefreiheits-Seite des Herstellers oder ein Test von Can I Play That." },
    { key: "checkedOn", label: "Stand", type: "date" },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000, hint: "Eigene Erfahrungen, z. B. was gut geklappt hat." },
  ],
};

const SOURCE_NEEDED = "„Bestätigt“ nur mit Quelle – sonst „Unbestätigt“ wählen.";

/** Release and DLC calendar (F12). */
export const RELEASE: Schema = {
  kind: "release", label: "Release",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "Gehört zu (Bibliothek)", type: "game" },
    { key: "type", label: "Art", type: "select", required: true, options: o(["game", "Spiel"], ["dlc", "DLC / Erweiterung"], ["update", "Großes Update"], ["season", "Saison"], ["other", "Sonstiges"]), card: true, filter: true },
    { key: "dateStatus", label: "Termin", type: "select", required: true, options: o(["unconfirmed", "Unbestätigt"], ["confirmed", "Bestätigt"], ["window", "Nur Zeitraum bekannt"]), card: true, filter: true },
    { key: "date", label: "Datum", type: "date", card: true },
    { key: "window", label: "Zeitraum", type: "text", maxLen: 40, placeholder: "z. B. Q1 2027, Frühjahr 2027" },
    { key: "platforms", label: "Plattformen", type: "tags", hint: PLATFORMS, filter: true },
    { key: "source", label: "Quelle", type: "url", hint: "Offizielle Ankündigung, Shop-Seite oder Presseseite des Herstellers." },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
    { key: "tags", label: "Kategorien", type: "tags" },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
    { key: "calendarId", label: "Kalender", type: "text", hidden: true },
  ],
  check: (d) => {
    const e: FieldError[] = [];
    if (d.dateStatus === "window") { if (!String(d.window ?? "").trim()) e.push({ key: "window", message: "Zeitraum angeben – oder ein Datum mit „Unbestätigt“." }); }
    else if (!d.date) e.push({ key: "date", message: "„{f}“ fehlt.", vars: { f: "Datum" } });
    if (d.dateStatus === "confirmed" && !d.source) e.push({ key: "source", message: SOURCE_NEEDED });
    return e;
  },
};

/** Seasons and events (F17) – times as announced, with the announcement's time zone. */
export const GAMEEVENT: Schema = {
  kind: "gameevent", label: "Saison / Event",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "type", label: "Art", type: "select", required: true, options: o(["season", "Saison"], ["event", "Event"], ["pass", "Battle Pass"], ["tournament", "Turnier"], ["maintenance", "Wartung"], ["other", "Sonstiges"]), filter: true },
    { key: "status", label: "Termin", type: "select", required: true, options: o(["unconfirmed", "Unbestätigt"], ["confirmed", "Bestätigt"]), filter: true },
    { key: "start", label: "Beginn", type: "datetime", required: true },
    { key: "end", label: "Ende", type: "datetime", hint: "Leer lassen, wenn das Ende nicht bekannt ist – dann wird auch nichts behauptet." },
    { key: "tz", label: "Zeitzone der Angabe", type: "select", options: TIME_ZONES.filter(Boolean).map((z) => ({ value: z, label: z })), hint: "Die Zeitzone aus der Ankündigung. Leer = deine eigene. Angezeigt wird immer auch deine Ortszeit." },
    { key: "source", label: "Quelle", type: "url" },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
    { key: "tags", label: "Kategorien", type: "tags" },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
    { key: "calendarIds", label: "Kalender", type: "tags", hidden: true },
  ],
  check: (d) => {
    const e: FieldError[] = [];
    if (d.status === "confirmed" && !d.source) e.push({ key: "source", message: SOURCE_NEEDED });
    if (typeof d.start === "string" && typeof d.end === "string" && d.end <= d.start) e.push({ key: "end", message: "Das Ende muss nach dem Beginn liegen." });
    return e;
  },
};

/** Update explainer (F13): the original patch notes stay as they are. */
export const PATCH: Schema = {
  kind: "patch", label: "Patchnotes",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 200, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "version", label: "Version", type: "text", maxLen: 40, card: true },
    { key: "date", label: "Datum", type: "date", required: true, card: true },
    { key: "source", label: "Quelle", type: "url", required: true, hint: "Link zu den offiziellen Patchnotes." },
    { key: "original", label: "Originaltext", type: "textarea", required: true, maxLen: 60000, hint: "Unverändert einfügen – sortiert wird nur zur Übersicht, der Originaltext bleibt erhalten." },
    { key: "read", label: "Gelesen", type: "bool", filter: true },
    { key: "notes", label: "Eigene Notizen", type: "textarea", maxLen: 4000 },
    { key: "steamGid", label: "Steam-ID", type: "text", hidden: true },
  ],
};

/** Editions and DLC comparison (F16). */
export const EDITIONS: Schema = {
  kind: "editions", label: "Editionen & DLCs",
  fields: [
    { key: "title", label: "Spiel", type: "text", required: true, maxLen: 100, card: true },
    { key: "game", label: "In der Bibliothek", type: "game" },
    { key: "rows", label: "Editionen, DLCs und Pakete", type: "rows", maxRows: 40, hint: "Inhalt mit Komma trennen. Gleiche Bezeichnungen werden als gleicher Inhalt erkannt – so fallen Doppelkäufe auf.", columns: [
      { key: "kind", label: "Art", type: "select", required: true, options: o(["edition", "Edition"], ["dlc", "DLC"], ["bundle", "Paket / Pass"]) },
      { key: "name", label: "Name", type: "text", required: true, maxLen: 60 },
      { key: "contents", label: "Inhalt", type: "text", maxLen: 500 },
      { key: "platform", label: "Plattform / Shop", type: "text", maxLen: 40 },
      { key: "price", label: "Preis", type: "number", min: 0, max: 10000 },
      { key: "priceSource", label: "Preis-Quelle", type: "url" },
      { key: "confirmed", label: "Inhalt bestätigt", type: "bool" },
      { key: "owned", label: "Habe ich", type: "bool" },
    ] },
    { key: "source", label: "Quelle", type: "url", hint: "Z. B. die Shop-Seite mit dem Editionsvergleich." },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
  ],
  check: (d) => ((d.rows as Data[] | undefined) ?? []).flatMap((r, i) => r.price != null && !r.priceSource ? [{ key: "rows", row: i, col: "priceSource", message: "Preis nur mit Quelle (Zeile {n}).", vars: { n: i + 1 } }] : []),
};

export const TEAM: Schema = {
  kind: "team", label: "Team",
  fields: [
    { key: "title", label: "Teamname", type: "text", required: true, maxLen: 80, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "template", label: "Als Vorlage nutzen", type: "bool", filter: true },
    { key: "roles", label: "Rollen", type: "rows", maxRows: 50, hint: "Frei definierbar – nicht auf ein Spiel beschränkt.", columns: [
      { key: "name", label: "Rolle", type: "text", required: true, maxLen: 40 },
      { key: "description", label: "Beschreibung", type: "text", maxLen: 200 },
      { key: "tasks", label: "Strategie / Aufgaben", type: "text", maxLen: 300 },
    ] },
    { key: "members", label: "Spieler", type: "rows", maxRows: 100, columns: [
      { key: "name", label: "Name", type: "text", required: true, maxLen: 60 },
      { key: "placeholder", label: "Platzhalter", type: "bool" },
      { key: "role", label: "Hauptrolle", type: "text", maxLen: 40 },
      { key: "alt", label: "Kann auch", type: "text", maxLen: 100 },
    ] },
    { key: "lineups", label: "Aufstellungen", type: "rows", maxRows: 300, hint: "Gleicher Name = gleiche Aufstellung (z. B. „Standard“, „Ohne Tank“).", columns: [
      { key: "lineup", label: "Aufstellung", type: "text", required: true, maxLen: 40 },
      { key: "role", label: "Rolle", type: "text", required: true, maxLen: 40 },
      { key: "member", label: "Spieler", type: "text", maxLen: 60 },
      { key: "task", label: "Aufgabe", type: "text", maxLen: 200 },
    ] },
    { key: "results", label: "Ergebnisse und Notizen", type: "textarea", maxLen: 8000 },
    { key: "tags", label: "Tags", type: "tags", filter: true },
  ],
  templates: [
    { name: "Shooter 5er-Team", data: { roles: [{ name: "Entry" }, { name: "Support" }, { name: "Aufklärung" }, { name: "Anker" }, { name: "Teamleitung" }] } },
    { name: "MMO-Gruppe", data: { roles: [{ name: "Tank" }, { name: "Heiler" }, { name: "Schaden" }, { name: "Schaden" }, { name: "Schaden" }] } },
    { name: "Survival / Aufbau", data: { roles: [{ name: "Bauplanung" }, { name: "Ressourcenmanagement" }, { name: "Erkundung" }, { name: "Verteidigung" }] } },
    { name: "Rennen / Fahrzeuge", data: { roles: [{ name: "Fahrer" }, { name: "Navigation" }, { name: "Taktik" }] } },
  ],
};

// ------------------------------------------------------------------------------------------ Medien (2.42)

const PHOTO_CATS = o(["landscape", "Landschaft"], ["action", "Action"], ["character", "Figur / Porträt"], ["build", "Gebautes"], ["funny", "Lustig"], ["friends", "Mit Freunden"], ["achievement", "Erfolg"], ["other", "Sonstiges"]);

export const PHOTO: Schema = {
  kind: "photo", label: "Foto",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120 },
    { key: "game", label: "Spiel", type: "game" },
    { key: "takenAt", label: "Aufnahmedatum", type: "date", hint: "Beim Import aus den Bilddaten (EXIF) oder dem Dateidatum – hier änderbar." },
    { key: "category", label: "Kategorie", type: "select", options: PHOTO_CATS, filter: true },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 4000 },
    { key: "settings", label: "Aufnahmeeinstellungen", type: "rows", maxRows: 30, hint: "Freiwillig, z. B. Auflösung, Grafikstufe, Fotomodus, Sichtfeld.", columns: [
      { key: "name", label: "Einstellung", type: "text", required: true, maxLen: 60 },
      { key: "value", label: "Wert", type: "text", maxLen: 100 },
    ] },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
};

export const ALBUM: Schema = {
  kind: "album", label: "Sammlung",
  fields: [
    { key: "title", label: "Name der Sammlung", type: "text", required: true, maxLen: 80 },
    { key: "description", label: "Beschreibung", type: "textarea", maxLen: 2000 },
  ],
};

export const BOOK: Schema = {
  kind: "book", label: "Erinnerung im Buch",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120, card: true },
    { key: "date", label: "Datum", type: "date", required: true, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "category", label: "Kategorie", type: "select", options: o(["milestone", "Meilenstein"], ["win", "Sieg / Erfolg"], ["friends", "Mit Freunden"], ["funny", "Lustig"], ["story", "Story-Moment"], ["first", "Erstes Mal"], ["other", "Sonstiges"]), card: true, filter: true },
    { key: "text", label: "Deine Geschichte", type: "textarea", maxLen: 20000 },
    { key: "imageIds", label: "Bilder", type: "images" },
    { key: "media", label: "Medienverweise", type: "rows", maxRows: 20, hint: "Links zu Videos, Clips oder Beiträgen – werden nur verlinkt, nicht geladen.", columns: [
      { key: "label", label: "Bezeichnung", type: "text", maxLen: 80 },
      { key: "url", label: "Adresse", type: "url", required: true },
    ] },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
};

export const CLIPMARK: Schema = {
  kind: "clipmark", label: "Aufnahme mit Momenten",
  fields: [
    { key: "title", label: "Aufnahme", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "recordedAt", label: "Aufgenommen am", type: "date", card: true },
    { key: "url", label: "Videolink", type: "url", hint: "YouTube, Twitch-Video oder direkte Videodatei: dann springen Momente an die Stelle. Andere Seiten öffnen am Anfang." },
    { key: "captureId", label: "Aufnahme vom PC", type: "text", maxLen: 16, hidden: true },
    { key: "captureName", label: "Aufnahme vom PC", type: "text", maxLen: 260, hidden: true },
    { key: "category", label: "Kategorie", type: "select", options: o(["highlight", "Highlight"], ["fail", "Fail"], ["funny", "Lustig"], ["tutorial", "Erklärung"], ["boss", "Bosskampf"], ["other", "Sonstiges"]), card: true, filter: true },
    { key: "marks", label: "Momente", type: "rows", maxRows: 300, columns: [
      { key: "time", label: "Zeit", type: "text", required: true, maxLen: 12, placeholder: "1:23 oder 1:02:03" },
      { key: "text", label: "Was passiert", type: "text", required: true, maxLen: 200 },
      { key: "tag", label: "Tag", type: "text", maxLen: 30 },
      { key: "fav", label: "Favorit", type: "bool" },
    ] },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 4000 },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
  check: (d) => {
    const errs: FieldError[] = [];
    const marks = (d.marks as Data[] | undefined) ?? [];
    marks.forEach((m, i) => { if (typeof m.time === "string" && m.time.trim() && parseTime(m.time) == null) errs.push({ key: "marks", row: i, col: "time", message: "Zeile {n}: Zeit wie 1:23, 1:02:03 oder 95 eingeben.", vars: { n: i + 1 } }); });
    if (!d.url && !d.captureId && marks.length) errs.push({ key: "url", message: "Bitte einen Videolink eintragen oder eine Aufnahme vom PC wählen." });
    return errs;
  },
};

export const TRACK: Schema = {
  kind: "track", label: "Soundtrack",
  fields: [
    { key: "title", label: "Titel", type: "text", required: true, maxLen: 120, card: true },
    { key: "game", label: "Spiel", type: "game", card: true },
    { key: "artist", label: "Künstler", type: "text", maxLen: 120, card: true },
    { key: "composer", label: "Komponist", type: "text", maxLen: 120 },
    { key: "album", label: "Album", type: "text", maxLen: 120 },
    { key: "cover", label: "Coverbild", type: "image", hint: "Ein eigenes Bild oder ein Cover, das du verwenden darfst." },
    { key: "mood", label: "Stimmung", type: "select", options: o(["epic", "Episch"], ["calm", "Ruhig"], ["sad", "Traurig"], ["tense", "Spannend"], ["happy", "Fröhlich"], ["dark", "Düster"], ["energetic", "Energiegeladen"]), card: true, filter: true },
    { key: "lists", label: "Sammlungen", type: "tags", hint: "Eigene Listen, z. B. „Zum Lernen“, „Bosskämpfe“." },
    { key: "links", label: "Links zu Musikdiensten", type: "rows", maxRows: 10, hint: "Nur offizielle Seiten (Spotify, Apple Music, YouTube, Bandcamp, Steam …). Nexus spielt nichts selbst ab und lädt nichts herunter.", columns: [
      { key: "url", label: "Adresse", type: "url", required: true },
    ] },
    { key: "notes", label: "Notizen", type: "textarea", maxLen: 2000 },
    { key: "tags", label: "Tags", type: "tags", filter: true },
    { key: "favorite", label: "Favorit", type: "bool", filter: true },
  ],
};
