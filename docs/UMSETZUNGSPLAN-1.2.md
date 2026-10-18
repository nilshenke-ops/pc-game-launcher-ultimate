# Bestandsaufnahme und Umsetzungsplan – Version 1.2.0

Stand der Prüfung: Code von Web-App (`web/`), Relay (`relay/`), Windows-Begleiter (`companion/`), Build (`scripts/`) und Veröffentlichung (GitHub Pages, GitHub Actions).

## Architektur (unverändert, wird erweitert)
- **Windows-Begleiter** (.NET 8, Kestrel auf Port 8787) führt alle lokalen Aktionen aus und zeigt **dieselbe Web-App** in seinem eigenen Fenster (WebView2). Alles, was die Web-App kann, ist damit auch direkt am PC bedienbar – ohne Browser. Tray, Autostart und „Im Browser öffnen“ sind vorhanden.
- **Web-App** (React) läuft im Begleiter-Fenster, im WLAN über die PC-Adresse und als feste Webseite auf GitHub Pages (Handy/Tablet, auch unterwegs mit https-Adresse).
- **Relay** (optional) leitet nur weiter; Anmeldung bleibt Ende-zu-Ende beim PC.
- Schichten im Begleiter: `Api/RpcApi.cs` (Oberflächen-Schnittstelle, Berechtigungen aus `protocol/protocol.json`) → `Services/*` (Logik) → `Platform/*` (Systemzugriff; Windows-Implementierung in `Companion.Windows`).

## Bestandsaufnahme der gewünschten Funktionen

| Gewünscht | Stand vor 1.2 | Plan 1.2 |
|---|---|---|
| Universelle Suche | vorhanden (Spiele, Programme, Sounds, Aktionen, Bereiche) | Plugins, Profile und Einstellungsbereiche ergänzen |
| Benchmark-Verlauf (echte Messwerte) | fehlt (nur Live-Monitor) | Leistungswerte je Spielsitzung (CPU/RAM/GPU Mittel/Spitze, gemessen während des Spiels, alle 10 s) – **FPS bleibt nicht verfügbar** |
| Speicherplatz-Manager | fehlt (nur Laufwerke im Monitor) | Laufwerke + Größe jedes Spiels (auf Abruf berechnet), Ordner öffnen |
| Sitzungs-Tracker mit Notizen | Verlauf vorhanden, keine Notizen | Notizen je Sitzung |
| Makro-/Aktionseditor | vorhanden (Quick Actions, Schritt-Editor) | um Energie-Aktionen und Plugin-Aktionen erweitert |
| RGB/Peripherie | fehlt | **nicht vorgetäuscht**: keine herstellerübergreifende Windows-Schnittstelle vorhanden; als Plugin-Kategorie vorbereitet (z. B. OpenRGB-SDK später) |
| Sprachchat-/Audio-Presets | vorhanden (Profile mit Ausgabegerät/Lautstärke/Sammlung, Audio Center) | – |
| Netzwerk-Monitor (Ping, Verlust, Verlauf) | nur Einmal-Diagnose | Live-Ping mit Paketverlust und Verlauf, nur solange sichtbar |
| Spiel-Datenbank (Kategorien, Tags, Bewertung) | Kategorien, Favoriten, Notizen vorhanden | Bewertung (1–5) ergänzen |
| Widget-System | vorhanden (ein/aus, Größe, Reihenfolge, Layouts) | Plugin-Widgets |
| Update- und Versionszentrale | im Begleiter vorhanden | eigene Seite für Web + Begleiter, Download auch mobil, Signaturprüfung, Release über GitHub Releases |
| Aktivitätsverlauf, Fehlerprotokoll | vorhanden (Verlauf, Protokoll, Benachrichtigungen) | – |
| Automatische Gaming-Profile | vorhanden (Auto-Wechsel beim Spielstart) | – |
| Energiezentrale | fehlt | Sperren, Energiesparen, Neustart, Herunterfahren (mit Bestätigung, Admin-Recht) |
| Offline-Modus, Synchronisierung | vorhanden | – |
| Erweiterungssystem | fehlt | **Plugin-System** (siehe unten) |
| Import/Export | vorhanden (Backup-ZIP, Design-Export) | Plugins im Backup |
| Prüfung doppelter Hotkeys, fehlender Programme, ungültiger Pfade | Hotkey-Konflikte beim Speichern vorhanden | Konsistenzprüfung in der Diagnose (fehlende EXE, verwaiste Verweise) |
| Geräte, Berechtigungen, Sitzungen | vorhanden | – |
| Ein-Klick-Diagnose | vorhanden (PC + Gerät) | – |
| Wiederherstellungspunkte | Sicherung vor jeder Wiederherstellung vorhanden | Liste der Punkte + Wiederherstellen daraus, automatischer Punkt vor Updates |
| Barrierefreiheit | Schriftgröße, Bewegung reduzieren, Tastatur, Screenreader-Labels vorhanden | – |
| Mehrere Windows-PCs | fehlt (ein PC je Gerät) | gespeicherte PCs, Umschalten; Profile/Daten bleiben je PC getrennt (liegen auf dem jeweiligen PC) |

## Update-System
- Zentrale Versionsquelle: Datei `VERSION` (MAJOR.MINOR.PATCH) – liest der .NET-Build und der Web-Build. Änderungsprotokoll: `CHANGELOG.md`.
- Release-Host: **GitHub Releases** (dauerhaft, ohne Anmeldung herunterladbar). Diese Sitzung darf Releases nicht direkt anlegen; daher erledigt das der Workflow `.github/workflows/release.yml` (baut, prüft, veröffentlicht, aktualisiert die Webseite, prüft Erreichbarkeit und Update-Erkennung).
- Manifest `download/update.json` (+ Verlauf `download/releases.json`) auf GitHub Pages; Webseite lädt es ohne Cache.
- Echtheit: SHA-256 **und** ECDSA-P-256-Signatur (öffentlicher Schlüssel im Begleiter eingebaut, privater Schlüssel nur als GitHub-Secret / beim Herausgeber).
- Installation nur nach Zustimmung am PC, Wiederherstellungspunkt vorher, alte EXE bleibt als Rückfall.

## Plugin-System
- Paket `.pglplugin` (ZIP) mit `plugin.json` (ID, Name, Version, Autor, Beschreibung, Kategorie, Mindestversion, API-Version, Plattformen, Berechtigungen, Beiträge).
- Beiträge: **Widgets** (eigener Code, läuft nur in einer abgeschotteten iframe-Sandbox ohne Zugriff auf App, Speicher oder Netzwerk), **Aktionen** (Abläufe aus vorhandenen, geprüften Schritten), **Themes**, **Einstellungen**.
- Kein Plugin-Code im Begleiter-Prozess: Windows-Funktionen nur über die vorhandene, berechtigungsgeprüfte Schnittstelle.
- Berechtigungen pro Plugin, einzeln entziehbar; Installation/Updates/Rollback; Testmodus; Entwickleransicht; Katalog (offiziell, signiert) auf GitHub Pages; lokale Pakete importierbar.

## Reihenfolge
1. Versionierung, Release-Workflow, Signatur, Update-Seite (Web + Begleiter).
2. Plugin-System mit Beispiel-Plugins, SDK und Doku.
3. Netzwerk-Monitor, Speicherplatz, Energiezentrale, Konsistenzprüfung, Wiederherstellungspunkte, Bewertungen, Sitzungsnotizen und Leistungswerte, mehrere PCs.
4. Tests, Veröffentlichung, Abschlussbericht.

## Grenzen dieser Umgebung
Kein Windows-PC und kein echtes Handy verfügbar: Windows-Funktionen werden kompiliert und mit Tests der Logik geprüft, die mobile Webseite mit Browser-Emulation (iPhone/iPad/Android-Größen). Ein echter Test am PC bleibt offen und wird so gekennzeichnet.
