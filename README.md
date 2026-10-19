# Nexus Gaming Hub (früher PC Game Launcher Ultimate)

Gaming-Zentrale für deinen Windows-PC: Spiele und Programme starten, Soundboard (für Discord über ein virtuelles Audiokabel – in einer echten Discord-Runde nicht getestet), Gaming-Profile, Automatisierungen, Hotkeys & Makros, Overlay & Aufnahme, eigene Widgets, Netzwerkdiagnose, GameQuest, Deal Radar und Live-PC-Monitor – bedienbar am PC und vom iPhone, iPad oder Android-Handy.

Seit 2.0.0 heißt die Oberfläche „Nexus Gaming Hub“. EXE-Name (`PCGameLauncherCompanion.exe`), Datenordner (`%APPDATA%\PCGameLauncherUltimate`) und Update-Adresse behalten bewusst den alten Namen, damit Updates und gekoppelte Geräte weiter funktionieren.

```
┌──────────────────────┐   WLAN (http/ws)    ┌─────────────────────────────────────┐
│ Handy / Tablet / PC  │ ──────────────────▶ │ Windows-Companion (eine EXE)        │
│ Web-App (React, PWA) │                     │  • Webserver: liefert die Web-App   │
└──────────────────────┘                     │  • WebSocket-API (Protokoll v1)     │
          │ unterwegs (https/wss)            │  • Kopplung, Geräte, Sicherheit     │
          ▼                                  │  • Spiele, Audio, Hotkeys, Profile  │
┌──────────────────────┐   ausgehend (wss)   │  • Tray, Autostart, WebView2-Fenster│
│ Relay (optional,     │ ◀────────────────── │                                     │
│ Node.js, eigener     │                     └─────────────────────────────────────┘
│ Server)              │  leitet nur weiter – nur die Anmeldung ist Ende-zu-Ende geschützt
└──────────────────────┘
```

## Links

- **Webseite „PC verbinden“:** https://nilshenke-ops.github.io/pc-game-launcher-ultimate/
- **PC-Software (Windows), immer die neueste Version:** https://github.com/nilshenke-ops/pc-game-launcher-ultimate/releases/latest
  – direkt: https://github.com/nilshenke-ops/pc-game-launcher-ultimate/releases/latest/download/PCGameLauncherCompanion.exe
  (Version, Datum, Größe, Änderungen und SHA-256 stehen im Release und auf der Webseite unter „Updates & Versionen“; Updates sind signiert.)
- **Plugin-SDK:** [plugins/sdk/README.md](plugins/sdk/README.md) · **Änderungen:** [CHANGELOG.md](CHANGELOG.md)

Die Webseite liegt im Zweig `gh-pages` (gebaut mit `npm run build:hosted` im Ordner `web`), die Programmdateien in GitHub Releases.
Veröffentlicht wird mit dem Workflow „Release veröffentlichen“ (siehe INSTALLATION.md, Abschnitt 5).

## Komponenten

| Ordner | Inhalt | Technik |
|---|---|---|
| `web/` | Web-App (Oberfläche für alle Geräte, auch im Companion-Fenster) | React 19, TypeScript, Vite, PWA |
| `companion/src/Companion.Core` | Logik, Webserver, API, Kopplung, Speicherung | C# / .NET 8, ASP.NET Core (Kestrel) |
| `companion/src/Companion.Windows` | Windows-App: Tray, WebView2, Audio (NAudio), Hotkeys, Autostart, Messwerte | .NET 8 WinForms |
| `companion/src/Companion.Headless` | Companion ohne Desktop-Funktionen (Entwicklung, Tests, Linux) | .NET 8 Konsole |
| `relay/` | Optionales Relay für den Zugriff von unterwegs, Download-Server | Node.js 20+, TypeScript, `ws` |
| `protocol/protocol.json` | Einzige Quelle für alle API-Methoden und Berechtigungen | JSON, von allen Tests geprüft |
| `scripts/` | Build-, Start- und Testskripte | Bash / PowerShell |
| `docs/` | Architektur, Protokoll, Abschlussbericht | Markdown |

## Schnellstart (Nutzer)

1. `PCGameLauncherCompanion.exe` starten (keine Installation, keine Adminrechte). Firewall: „Private Netzwerke“ erlauben.
2. Im Companion **Gerät koppeln → Neuen Code erzeugen**, QR-Code mit dem Handy scannen, am PC **Erlauben**.
3. Fertig – das Handy öffnet die Web-App unter `http://<PC-IP>:8787` (Adresse steht im Companion).

Details: [INSTALLATION.md](INSTALLATION.md) · Probleme: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · Sicherheit: [SECURITY.md](SECURITY.md)

> **Wichtig zu Links:** Die Web-App läuft auf deinem PC. Ein Link funktioniert nur, solange der PC an ist und der Companion läuft. Vorschau-Links aus Entwicklungsumgebungen (z. B. `…style.dev`) sind temporär und eignen sich nicht zum Weitergeben per WhatsApp.

## Schnellstart (Entwicklung)

Voraussetzungen: Node.js 20+, .NET 8 SDK.

```bash
npm run install:all          # Abhängigkeiten von web/ und relay/
npm run dev                  # Headless-Companion :8787 + Vite-Dev-Server :5173
npm test                     # alle Tests (Web, Relay, C#, Windows-Build, End-to-End)
npm run build:companion      # Windows-EXE + ZIP nach artifacts/ (auch von Linux aus)
npm run start:relay          # optionales Relay (Konfiguration: relay/relay.config.json)
```

Unter Windows ohne Bash: `powershell -ExecutionPolicy Bypass -File scripts\publish-companion.ps1`.

## Funktionen (Auszug)

- **Bibliothek:** Steam- und Epic-Spiele werden erkannt, Startmenü-/Microsoft-Store-/Xbox-Apps auswählbar, eigene EXE-Dateien (nur am PC freigebbar). Favoriten, Kategorien, Cover, Suche, Sortierung, Laufend-Erkennung.
- **Quick Actions:** mehrstufige Ein-Tipp-Aktionen mit Icons, Kategorien, Reihenfolge, Bestätigungspflicht.
- **Soundboard:** Import (Datei, direkter Link, MyInstants-Seite), Duplikat- und Formatprüfung, Sammlungen, Favoriten, Warteschlange/Überlagern/Ersetzen, Pause/Stopp, Lautstärke pro Sound.
- **Audio Center & Discord:** Ausgabegerät, Monitoring auf Kopfhörer, Mikrofon-Durchleitung ins virtuelle Kabel, Testtöne, Pegelanzeige, Audio-Diagnose.
- **Gaming-Profile** mit automatischem Wechsel beim Spielstart und Rückwechsel beim Beenden.
- **Automatisierungen** (Wenn-Dann-Regeln) mit Schleifen- und Widerspruchsschutz, Testlauf, Ausführungsprotokoll.
- **Globale Hotkeys** mit Konflikterkennung und Statusanzeige.
- **Dashboard** mit Widgets, mehreren Layouts (Handy/Desktop getrennt), Design-Editor (Themes, Farben, Kontrastprüfung, Schrift, Rundung, Hintergrundbild), Import/Export.
- **PC-Monitor** (CPU, RAM, GPU, Datenträger) – nur echte Werte mit Quellenangabe, nur während geöffnet.
- **Diagnose** (Companion, Netzwerk, Relay, Audio, Browser), Benachrichtigungszentrale, Verlauf/Statistik, Backup/Wiederherstellung, Updatecenter, Deutsch/Englisch, globale Suche (Strg+K).
- **Overlay & Aufnahme:** Overlay im Stil der Xbox Game Bar mit frei verschiebbaren Widgets; Aufnahme/Replay über OBS (WebSocket) oder per Tastenkürzel an NVIDIA, Xbox Game Bar, Steam, Discord.
- **Widget-Baukasten:** eigene Widgets frei gestalten – für Dashboard, Overlay und als Windows-Desktop-Widget.
- **Netzwerkdiagnose (Ping Doctor):** Ping, Jitter, Paketverlust, Verbindungsqualität, eigene Ziele (z. B. Spiel-Server).
- **GameQuest:** eigene Ziele, XP, Level und Erfolge aus der erkannten Spielzeit; Siege und Matches trägst du selbst ein (die App liest keine Spielstatistiken aus).
- **KI-Assistent:** kennt die ganze App und deinen PC; lokal ohne Internet für 0 €, optional mit einem freien Sprachmodell auf dem PC (Ollama, 0 €) oder mit Claude (eigener Schlüssel, kostenpflichtig). Aktionen nur als Knopf zum Antippen.
- **Deal Radar:** Wunschliste mit Zielpreis; Preise aus dem Steam-Shop, nur wenn eingeschaltet, mit Benachrichtigung bei Erreichen.
- **Navigation** in Kategorien, anpassbar (Reihenfolge, Ausblenden, Handy-Leiste).
- **Plugins** (Widgets, Aktionen, Themes) aus einem signierten Katalog, ohne Code auf dem PC.

Datenschutz: [docs/DATENSCHUTZ.md](docs/DATENSCHUTZ.md) · Sicherheit: [SECURITY.md](SECURITY.md) · Stand der Prüfung: [docs/BESTANDSAUFNAHME.md](docs/BESTANDSAUFNAHME.md) · Leistung: [docs/PERFORMANCE.md](docs/PERFORMANCE.md)

Was getestet ist und was nicht: siehe [docs/ABSCHLUSSBERICHT.md](docs/ABSCHLUSSBERICHT.md).
