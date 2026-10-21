// The collections of "Welten & Bauen" and "Builds & Technik" – field lists only (UI: components/collection-view.tsx).
import type { Data, Schema } from "./collections";

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
