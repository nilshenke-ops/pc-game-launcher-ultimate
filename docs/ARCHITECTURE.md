# Architektur

## Entscheidungen und Gründe

| Entscheidung | Grund |
|---|---|
| **Der Companion ist gleichzeitig Webserver** (Kestrel im Prozess, Port 8787) | Ein einziges Programm auf dem PC. Kein separates Relay nötig für das Heimnetz – damit entfällt der häufigste Fehler „Fehler bei der Verbindung“ (Relay nicht gestartet). |
| **Eine Oberfläche für alle Geräte** (React-Web-App, im Companion per WebView2 angezeigt) | Keine doppelte UI (WinForms + Web). Gleiches modernes Design am PC und am Handy. |
| **Relay als reine Durchleitung** (Node.js) | Zugriff von unterwegs ohne Portfreigabe. Sicherheit bleibt Ende-zu-Ende im Companion; das Relay hat keine eigene Kopplungslogik (keine doppelte Implementierung). |
| **WebSocket-JSON-Protokoll statt REST** | Echtzeit-Events (Sounds, Monitor, Kopplung) und Anfragen über eine Verbindung; funktioniert identisch lokal und über das Relay. REST nur für Health/Download/statische Dateien. |
| **JSON-Dateien statt Datenbank** | Wenige, kleine Datenmengen; atomare Schreibvorgänge (temp + replace); leicht zu sichern. Getrennte Dateien für Einstellungen, Bibliothek, Profile, Regeln, Hotkeys, Sounds, Audio, Verlauf, Geräte. |
| **.NET 8 + WinForms** für Windows | Stabil, LTS, cross-kompilierbar (Build auch unter Linux/CI), kleine native Teile (Tray, Hotkeys, WebView2-Host). |
| **NAudio (WASAPI)** | Etablierte Bibliothek für Geräteauswahl, Wiedergabe auf mehreren Geräten und Mikrofon-Aufnahme. |
| **Plattform-Interfaces** (`IPlatform`) | Kernlogik ist plattformunabhängig und unter Linux testbar; Windows-Funktionen sind austauschbar; der Headless-Host meldet fehlende Funktionen ehrlich als „nicht unterstützt“. |
| **HashRouter, relative Pfade** | Die Web-App funktioniert unverändert vom Companion, vom Relay, hinter einem Tunnel oder unter einem Unterpfad. |
| **Eigene SHA-256/HMAC-Implementierung im Browser** | `crypto.subtle` gibt es nur in sicheren Kontexten (https/localhost); im WLAN wird http genutzt. Gegen Node-Crypto getestet. |

## Komponenten im Companion

```
CompanionServices (Composition Root)
├─ RpcServer ─── RpcApi (alle Methoden aus protocol.json, je eine Berechtigung)
├─ WebHost (Kestrel): statische Web-App, /ws, /healthz, /download/*
├─ RelayClient: ausgehende wss-Verbindung, Multiplexing pro Client-Kanal
├─ DeviceStore + PairingService (Kopplung, Tokens, Widerruf)
├─ LibraryService (+ Steam/Epic/Startmenü-Erkennung, LaunchValidator)
├─ SessionTracker (Prozess-Snapshot alle N s) → HistoryService
├─ ProfileService, QuickActionService, AutomationEngine, HotkeyService
│    └─ ActionRunner (gemeinsame Ausführung aller Aktionsschritte)
├─ AudioService + SoundboardService (NAudio-Engine über IAudioEngine)
├─ MonitorService (nur bei Abonnenten aktiv), NetworkDiagnostics
├─ NotificationCenter, SettingsService, UpdateService, BackupService
└─ IPlatform: Launcher, Prozesse, Audio, Hotkeys, Messwerte, Autostart, Secrets (DPAPI), Desktop
```

Ereignisfluss Beispiel „Spiel startet“: `SessionTracker` erkennt Prozess → `HistoryService` schreibt Sitzung → `ProfileService` aktiviert ggf. das zugeordnete Profil (Audio-Ausgabe, Lautstärke, Sammlung, Programme) → `AutomationEngine` feuert `gameStarted` → alle Clients erhalten `session`/`profile.active`/`changed`.

## Web-App

```
main.tsx → App (HashRouter, Gate: Verbinden → Koppeln → App)
lib/rpc.ts      Verbindung, Wiederverbindung mit Backoff, Login, Events
lib/state.ts    gemeinsamer Übersichtszustand (ein state.get für alle Widgets)
lib/hooks.ts    useRpc (lädt + aktualisiert bei "changed"), Toasts
lib/prefs*.ts   Design/Layouts/Sprache (localStorage + Sync zum PC)
lib/i18n.ts/en.ts  Deutsch als Quelltext, Englisch als Wörterbuch (Test prüft Vollständigkeit)
components/     Designsystem (ui.tsx), AppShell, Suche, StepEditor, DownloadCard
pages/          je Bereich eine Seite (lazy geladen)
```

## Performance-Maßnahmen
- Prozess-Erkennung: ein Snapshot alle 5 s (einstellbar 2–60 s), nur wenn Einträge mit Erkennungsregeln existieren.
- PC-Monitor: Messung nur, solange mindestens ein Client abonniert ist (2 s Intervall, keine Überlappung); `nvidia-smi` höchstens alle 4 s.
- Kein Polling in der Web-App außer einem Ping alle 15 s; Daten werden per Event nachgeladen.
- Seiten werden lazy geladen; Hauptbundle ~126 KB gzip (gemessen beim Build).
- Statische Dateien mit ETag und `immutable`-Caching für gehashte Assets.

Gemessene Werte und Grenzen: siehe ABSCHLUSSBERICHT.md. Es wurden keine Last-/Langzeitmessungen auf einem echten Windows-Gaming-PC durchgeführt.
