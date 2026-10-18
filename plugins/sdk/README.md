# Plugin-SDK – PC Game Launcher Ultimate (Plugin-API 1)

Mit Plugins erweiterst du Dashboard, Aktionen und Design – auf PC, Handy und Tablet gleichzeitig.
Plugins werden auf dem PC (Windows-Begleiter) installiert und von dort mit allen Geräten synchronisiert.

## Was ein Plugin kann – und was nicht

| Beitrag | Was | Wo es läuft |
|---|---|---|
| **Widgets** | eigenes HTML/CSS/JavaScript als Dashboard-Kachel | in der Web-App, in einem abgeschotteten iframe (Sandbox) |
| **Aktionen** | Abläufe aus den vorhandenen, geprüften Schritten (Sound abspielen, Profil wechseln, Spiel starten …) | auf dem PC, über den Begleiter |
| **Themes** | Farbschemata für den Design-Editor | Web-App |
| **Einstellungen** | Werte, die der Nutzer festlegt (Text, Zahl, Ja/Nein, Auswahl, Spiel, Programm, Sound, Profil) | gespeichert auf dem PC |

**Bewusst nicht möglich** (Sicherheit, geringe Hintergrundlast):
- eigener Code im Begleiter-Prozess, beliebige Windows-Befehle, Dateizugriff, Hintergrunddienste;
- Zugriff auf die App selbst, ihren Speicher, Anmeldedaten oder andere Plugins;
- Internetzugriff ohne die Berechtigung `network`.

Neue Systemfunktionen kommen über neue, geprüfte Schritte bzw. Bridge-Methoden in den Launcher. Sie werden nie über Plugin-Code nachgerüstet.

## Aufbau

```
mein-plugin/
  plugin.json      Manifest (Pflicht)
  widget.html      Einstiegsdatei eines Widgets
  widget.js        wird beim Laden in das Widget eingebettet
  style.css        ebenso
  icon.png         Bilder werden als data:-URL eingebettet
```

Erlaubte Dateitypen sind `.json .html .js .css .png .svg .jpg .jpeg .webp .txt .md`.

Grenzen:
- Paket höchstens 2 MB, entpackt höchstens 5 MB.
- Höchstens 100 Dateien, jede Datei höchstens 1 MB.
- Keine Pfade mit `..`.

## plugin.json

```json
{
  "id": "de.meinname.mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "minAppVersion": "1.2.0",
  "author": "Mein Name",
  "description": "Was es tut (max. 500 Zeichen)",
  "category": "information",
  "platforms": ["web"],
  "permissions": ["history.read"],
  "dependencies": { "de.anderer.basis": ">=1.0.0" },
  "homepage": "https://…",
  "contributes": {
    "widgets":  [{ "id": "haupt", "title": "Titel", "entry": "widget.html", "height": 180 }],
    "actions":  [{ "id": "los", "name": "Los", "icon": "zap", "steps": [{ "type": "playSound", "ref": "{config:sound}" }] }],
    "themes":   [{ "id": "dunkel", "name": "Dunkel", "theme": { "mode": "dark", "primary": "#22d3ee", "accent": "#a78bfa", "background": "#070b16" } }],
    "settings": [{ "key": "sound", "label": "Sound", "type": "sound" }]
  },
  "changelog": [{ "version": "1.0.0", "date": "2026-10-18", "changes": ["Erste Version"] }]
}
```

Die Felder im Einzelnen:
- **id:** Nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich, z. B. umgekehrte Domain. Muss eindeutig sein.
- **version:** Schema `MAJOR.MINOR.PATCH`. Ein Update muss eine höhere Version haben.
- **minAppVersion:** Älteste Launcher-Version, mit der das Plugin läuft.
- **apiVersion:** Muss `1` sein.
- **category:** Eine dieser Kategorien: `launcher`, `audio`, `discord`, `performance`, `design`, `automation`, `device`, `information`, `productivity`, `community`.
- **platforms:**
  - `web` heißt: Widgets oder Themes laufen in der Web-App.
  - `windows` heißt: Aktionen laufen auf dem PC.
  - Der Launcher zeigt an, wo ein Plugin funktioniert.
- **dependencies:** Andere Plugins, die installiert und aktiv sein müssen. Angabe als `>=X.Y.Z` oder genau `X.Y.Z`.
- **Aktionen:** Schritte, die ein Spiel, einen Sound, ein Profil, eine Sammlung oder ein Gerät brauchen, verweisen immer auf eine Einstellung (`{config:schlüssel}`). Diese IDs sind auf jedem PC anders. Feste IDs werden abgelehnt.
  - Erlaubte Schritt-Typen: `launchItem`, `activateProfile`, `revertProfile`, `playSound`, `stopAllSounds`, `setCollection`, `setAudioOutput`, `runDiagnostics`, `notify`.

## Berechtigungen

| Berechtigung | erlaubt |
|---|---|
| `library.read` | `pgl.call("library.list")` |
| `library.launch` | `pgl.call("library.launch", {id})`, Schritt `launchItem` |
| `history.read` | `pgl.call("history.get")` |
| `monitor.read` | Ereignis `monitor.sample` (Live-Werte, nur solange das Widget sichtbar ist) |
| `sounds.read` | `pgl.call("sounds.list")` |
| `sounds.play` | `sounds.play`, `sounds.stopAll`; Schritte `playSound`, `stopAllSounds`, `setCollection` |
| `profiles.read` | `pgl.call("profiles.list")` |
| `profiles.activate` | `profiles.activate`, `profiles.revert`; Schritte `activateProfile`, `revertProfile` |
| `audio.output` | Schritt `setAudioOutput` |
| `diagnostics.run` | `pgl.call("diagnostics.run")`, Schritt `runDiagnostics` |
| `notify` | `pgl.notify(text)`, Schritt `notify` |
| `network` | `fetch`/Bilder von `https://`-Adressen aus dem Widget |

So läuft die Freigabe ab:
- Vor dem Aktivieren sieht der Nutzer jede Berechtigung und muss zustimmen.
- Einzelne Rechte lassen sich jederzeit wieder entziehen. Aufrufe, die ein entzogenes Recht brauchen, scheitern dann mit „Berechtigung fehlt“.
- Fordert ein Update neue Rechte an, wird das Plugin deaktiviert, bis der Nutzer erneut zustimmt.
- Jeder Aufruf läuft zusätzlich mit den Rechten des Geräts, auf dem das Widget angezeigt wird.

## Widget-Schnittstelle (`window.pgl`)

```js
const games = await pgl.call("library.list");     // Promise; Fehler bei fehlender Berechtigung
const cfg = await pgl.config();                    // Einstellungen des Plugins
pgl.on("monitor.sample", (m) => { … });            // Live-Werte (Berechtigung monitor.read)
pgl.on("changed", (d) => { if (d.topic === "history") … });  // Daten auf dem PC haben sich geändert
pgl.notify("Fertig");                              // Hinweis in der App (Berechtigung notify)
pgl.resize(240);                                   // Höhe des Widgets ändern (60–800 px)
```

Farben des aktuellen Designs stehen als CSS-Variablen bereit:
- `--pgl-text`
- `--pgl-muted`
- `--pgl-accent`
- `--pgl-border`
- `--pgl-bg`

Sandbox-Regeln:
- Kein Zugriff auf `localStorage`, Cookies oder `parent`.
- Keine Formulare, keine Navigation, keine Pop-ups.
- Nicht abgefangene Fehler werden protokolliert. 5 Fehler innerhalb einer Minute deaktivieren das Plugin automatisch.
- Höchstens 20 Aufrufe pro 10 Sekunden.

## Entwickeln, testen, installieren

1. **Vorlage kopieren:** `plugins/examples/spielzeit-heute` (Widget), `discord-schnellton` (Aktionen + Einstellungen), `neon-themes` (Themes), `cpu-mini` (Live-Werte).
2. **Packen:** `node plugins/sdk/pack.mjs plugins/examples/mein-plugin dist-plugins` erzeugt `de.meinname.mein-plugin-1.0.0.pglplugin`. Dabei werden die Grundregeln geprüft.
3. **Importieren:** Plugin Center → Entwickler → „Datei wählen und prüfen“.
   - Erlaubt am PC selbst oder auf einem Gerät mit Admin-Recht.
   - Der Begleiter prüft das Paket vollständig und zeigt Berechtigungen, Warnungen und die SHA-256-Prüfsumme.
   - Erst danach wird installiert, und zwar deaktiviert.
4. **Testmodus:** Entwickler → „Widget im Testmodus starten“.
   - Das Widget läuft ohne jeden Zugriff auf den PC.
   - Jeder Aufruf wird abgelehnt und protokolliert.
   - Die Protokolle stehen pro Plugin in der Entwickleransicht.
5. **Aktivieren:** Plugin Center → Installiert → Details → Aktivieren (Berechtigungen bestätigen) → Widget „aufs Dashboard“.
6. **Update:** Version erhöhen, neu packen, wieder importieren. Die vorherige Version bleibt für „Version … wiederherstellen“ erhalten.

## Veröffentlichen

- **Eigene Weitergabe:** Die `.pglplugin`-Datei weitergeben. Sie erscheint beim Empfänger als „Nicht verifiziert“.
- **Offizieller Katalog:** Plugin-Ordner nach `plugins/examples/` legen und `node scripts/plugin-catalog.mjs --out <gh-pages>/plugins --base-url https://nilshenke-ops.github.io/pc-game-launcher-ultimate/plugins` ausführen.
  - Der Katalog wird mit dem Projektschlüssel signiert (`--key` oder `PGL_UPDATE_SIGNING_KEY`).
  - Der Begleiter akzeptiert den offiziellen Katalog nur mit gültiger Signatur. Jedes Paket wird gegen Größe und SHA-256 aus dem Katalog geprüft.
- **Eigener Katalog:** In den Einstellungen eine andere Katalog-Adresse eintragen (nur https). Ohne gültige Projektsignatur gelten alle Einträge als „Nicht verifiziert“.

Vertrauensstufen:
- **Offiziell:** signierter Projektkatalog.
- **Geprüft:** im signierten Katalog als geprüft markiert.
- **Nicht verifiziert:** eigene Datei oder eigener Katalog.

## Kategorien – was heute geht

| Kategorie | Heute möglich |
|---|---|
| Game-Launcher, Informationen, Performance | Widgets mit Bibliothek, Verlauf, Live-Werten; externe Daten mit `network` |
| Audio, Discord | Aktionen mit Sounds, Sammlungen, Ausgabegerät, Profilen. Discord selbst hat keine offizielle Schnittstelle für Soundboards fremder Programme; der Weg bleibt das virtuelle Audiokabel |
| Design | Themes |
| Automatisierung, Produktivität | Aktionen (Programme starten, Profile, Hinweise) |
| Geräte/RGB | **noch nicht**: Es gibt keine herstellerübergreifende Windows-Schnittstelle. Eine Anbindung (z. B. OpenRGB-SDK) müsste als geprüfter Schritt in den Begleiter kommen |
| Community | eigene Plugins anderer Entwickler (nicht verifiziert, bis sie in einen signierten Katalog aufgenommen werden) |
