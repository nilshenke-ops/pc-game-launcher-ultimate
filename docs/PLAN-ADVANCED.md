# Plan: Erweiterte Funktionen (Master-Prompt „Advanced Features …“)

Originaltext: `docs/MASTERPROMPT-ADVANCED.md` (Punkte 1–32, vollständig seit 19.10.2026).
Ausgangsstand: Version 2.5.1. Grundregeln: bestehendes Projekt weiterentwickeln, nichts doppelt bauen, keine Attrappen, keine erfundenen Test- oder Messwerte, Abhängigkeiten von Hardware/Treibern/Diensten prüfen und dokumentieren.

## Funktionsmatrix (Phase 1, gegen den Code geprüft)

Zustände nach Punkt 2: **1** vollständig implementiert und getestet · **2** implementiert, nicht ausreichend getestet · **3** teilweise · **4** nur grafisch · **5** nicht vorhanden · **6** technisch nicht oder nur eingeschränkt möglich.
„Getestet“ heißt hier: automatische Tests (C#, Web, E2E) in der Linux-Entwicklungsumgebung. Auf einem echten Windows-PC, iPhone, iPad oder Android-Gerät wurde **nichts** getestet (dort Zustand höchstens 2).

| # | Funktion | Zustand 2.5.1 | Was es schon gibt (Code) | Was fehlt | Weg ohne Doppelstruktur |
|---|---|---|---|---|---|
| 4 | Launcher-Erfolge | 3 | `QuestService`: 8 Erfolge (Spielzeit, Sitzungen, Siege, Matches), XP/Level, Benachrichtigung | Erfolge für Launcher-Aktionen (Profil, Gerät gekoppelt, Automatisierungen …), Schalter zum Abschalten, Fortschritt je Erfolg | dieselbe Erfolgsliste in GameQuest um Launcher-Zähler erweitern; Werte nur aus vorhandenen Dateien zählen, keine Hintergrundprüfung |
| 5 | Themes je Spiel | 3 | Design-Editor, Paletten, Hintergründe, reduzierte Animationen; Profile wechseln automatisch beim Spielstart (inkl. Layout) und zurück | Theme pro Profil/Spiel, Rückkehr zum vorherigen Theme, Export/Import einzelner Themes | Theme an das vorhandene Profil hängen (Profil = Spielzuordnung) – kein zweiter Auto-Wechsel-Mechanismus |
| 6 | Backlog-Manager | 3 | Bibliothek mit Favoriten, Bewertung, Notizen, Kategorien; Wunschliste im Deal Radar; Spielzeit aus Verlauf | Status (6 Zustände), Priorität, Zufallsauswahl, Filter nach Status/Spielzeit, persönliches Ziel | Felder an `LibraryItem`; Wunschliste bleibt im Deal Radar (verlinkt, nicht kopiert) |
| 7 | Aktivitätsstatus | 3 | Laufendes Spiel wird erkannt (Prozess/Ordner), Start/Dauer im Dashboard | eigener Status (verfügbar/beschäftigt …), Freigabe-Schalter (Standard aus), Anzeige für gekoppelte Geräte; externe Plattformen | Discord Rich Presence nur über die dokumentierte lokale Schnittstelle – auf Windows prüfen, hier nicht testbar |
| 8 | Screenshot-/Clip-Bibliothek | 5 | Aufnahme über OBS/Game Bar/NVIDIA/Steam auslösbar | Ordner erfassen, Vorschaubilder, Gruppierung, Favoriten, Löschen mit Bestätigung, Übertragung aufs Handy | Ordnerliste + Index, Vorschaubilder nur auf Anfrage und klein; Übertragung über die vorhandene gesicherte Verbindung |
| 9 | RGB-Zentrale | 6 | – | alles | nur über **OpenRGB** (offenes SDK-Protokoll, lokaler Server) – Hersteller-SDKs (iCUE, Synapse, G Hub) haben keine einheitliche offene Schnittstelle; ohne OpenRGB ehrlich „nicht unterstützt“ |
| 10 | Controller-Zentrale | 3/6 | – (Gamepad im Browser wäre das Handy, nicht der PC) | Erkennung, Testansicht, Profile | Windows: XInput (Xbox-kompatibel) lesbar ohne Treiber; Tastenbelegung systemweit nur mit Zusatztreibern → nicht umgesetzt, nur Anzeige und Test |
| 11 | Fenster-/Monitor-Layouts | 5 | – | Monitore, Fensterpositionen speichern/wiederherstellen, an Profil koppeln | Windows-APIs (EnumDisplayMonitors, SetWindowPlacement); nur hier nicht testbar |
| 12 | Mods | 5/6 | – | alles | nur Ordner-basierte Mods mit Sicherung (Kopie vor Änderung), keine Downloads, kein Ausführen; viele Spiele nutzen eigene Mod-Manager → dorthin verlinken |
| 13 | Speicher-/Update-Übersicht | 3 | Speicher je Laufwerk und je Spiel (auf Anfrage berechnet), Ordner öffnen | Sortierung nach letztem Start/Plattform, Warnung bei knappem Speicher, Update-Infos | Steam: `StateFlags` im appmanifest zeigt „Update nötig“ (dokumentiertes Dateiformat); andere: Link zum Launcher |
| 14 | Sprachsteuerung | 3 | Spracheingabe im Assistenten (Browser-Erkennung), lokale Befehle, Aktionen nur als Knopf | eigener Sprachmodus, Anzeige des erkannten Befehls vor Ausführung, Bestätigung kritischer Befehle | Assistent wiederverwenden (gleiche Befehlserkennung); Mikrofon nur während Knopf gedrückt/aktiv |
| 15 | Widget-Marktplatz | 2 | Widget-Baukasten, Plugin-Katalog (signiert, 14 Plugins), Widgets abgeschottet mit Rechten | Notizen-, Uhr-/Kalender-Widget prüfen, Ressourcenanzeige | vorhandene Plugin-/Widget-Technik |
| 16 | Gaming-Kalender | 5 | – | Termine, Wiederholung, Erinnerung, Zeitzonen, ICS-Export/Import | eigene Datei auf dem PC, Erinnerung über vorhandene Benachrichtigungen |
| 17 | Dateiübertragung | 3 | Sound-Upload (geprüft), Backup-Upload, Plugin-Upload, Backup-Download | allgemeiner Datei-Eingang (Handy → PC), Fortschritt/Abbruch, PC → Handy | vorhandenen Upload-Kanal (Stückchen über WebSocket) verallgemeinern; Ablage nur in einem festen Eingangsordner |
| 18 | Kompatibilitätsberater | 3 | Hardware-Daten (CPU, RAM, GPU-Name, Laufwerke) im Monitor | Anforderungen der Spiele | Steam-Shop `pc_requirements` (Text des Shops, als „Angabe des Shops, Stand …“), Vergleich nur wo eindeutig, sonst „unbekannt“ |
| 19 | Gaming-Szenen | 3 | Quick Actions mit Schritten (Starten, Profil, Audio-Gerät, Sound, OBS, Overlay, Warten, Bedingungen), Automatisierungen | Fortschritt je Schritt, Abbruch, einzelne Schritte abschaltbar, „vorher wiederherstellen“ | Quick Actions **sind** die Szenen – erweitern statt zweites System |
| 20 | Statistik-Karten | 3 | Gaming-Verlauf mit Statistik, Leistungswerte je Sitzung | gestaltete Karte, Auswahl der Inhalte, Export als Bild/Daten | im Browser zeichnen (Canvas), nichts wird veröffentlicht |
| 21 | Mehrere PCs | 2 | mehrere PCs in der Web-App (PC wechseln), Kopplung/Rechte je PC | Ziel-PC vor jeder Aktion sichtbar, Schutz vor veralteter Auswahl | Anzeige + Prüfung der PC-Kennung bei Aktionen |
| 22 | Desktop-Panel/Overlay | 2 | Overlay (Game-Bar-Stil, voll/mini, klickdurchlässig), Desktop-Widgets als Fenster | Tastatursteuerung, einstellbare Transparenz, Vollbild-Test | vorhandenes Overlay erweitern; Vollbild nur unter Windows prüfbar |
| 23 | Zentrale Integration | 3 | Automatisierungen mit Auslösern (Spielstart/-ende, Profil …), Schutz gegen Endlosschleifen (`_depth`), Sperre gegen Doppelstart | neue Auslöser (Kalender, Szene), Anzeige der Ereignisse | vorhandenen Automations-Bus erweitern |

## Reihenfolge (an Abhängigkeiten angepasst)

| Version | Inhalt | Begründung |
|---|---|---|
| 2.6.0 | Phase 1 (diese Matrix, Ausgangsmessung) · Backlog (6) · Themes je Profil/Spiel (5) · Launcher-Erfolge (4) · Statistik-Karten (20) | baut nur auf vorhandenen Daten auf, voll testbar |
| 2.7.0 | Kalender (16) · Aktivitätsstatus (7) · Szenen = Quick Actions mit Fortschritt/Abbruch/Wiederherstellen (19) · Ziel-PC-Schutz (21) | gemeinsamer Ereignis-Bus |
| 2.8.0 | Dateiübertragung (17) · Screenshot-Bibliothek (8) · Speicher-/Update-Übersicht (13) | gemeinsamer Datei-Kanal |
| 2.9.0 | Fenster-Layouts (11) · Controller (10) · Overlay-Ausbau (22) · RGB über OpenRGB (9) | Windows-APIs, hier nur gegen Nachbauten testbar |
| 2.10.0 | Kompatibilitätsberater (18) · Sprachsteuerung (14) · Mods (12) · Widget-Ergänzungen (15) | externe Daten/Abhängigkeiten |

Jede Version: Tests, Doku (FUNKTIONSSTATUS im Abschlussbericht), Backup/Export der neuen Daten, Messung vorher/nachher (docs/PERFORMANCE.md).
