# PC Game Launcher Ultimate

Gaming-Zentrale für deinen Windows-PC: Spiele und Programme starten, Soundboard (auch für Discord), Gaming-Profile, Automatisierungen, Hotkeys und Live-PC-Monitor – bedienbar am PC und vom iPhone, iPad oder Android-Handy.

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
│ Server)              │  leitet nur weiter – Anmeldung bleibt Ende-zu-Ende beim PC
└──────────────────────┘
```

## Links

- **Webseite „PC verbinden“:** https://nilshenke-ops.github.io/pc-game-launcher-ultimate/
- **PC-Software (Windows):** https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/PCGameLauncherCompanion-1.0.0-win-x64.zip
  (SHA-256 der EXE: `ef327ecd6865109a2e6a4c45980ae0b0b92eeb9d5f2c520d5218ae6fe1ff31f0`)

Die Webseite liegt im Zweig `gh-pages` (gebaut mit `npm run build:hosted` im Ordner `web`).

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

Was getestet ist und was nicht: siehe [docs/ABSCHLUSSBERICHT.md](docs/ABSCHLUSSBERICHT.md).
