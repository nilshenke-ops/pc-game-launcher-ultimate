# Dynamic Island 2.0 – Bestandsaufnahme und Plan

Stand: 3.59.0 (2026-11-13). Grundlage ist der Master-Prompt „Nexus Gaming Hub – Dynamic Island 2.0“. Geprüft wurde im
Quellcode (Begleiter, Website, Protokoll). Gebaut wird nur, was fehlt; Vorhandenes wird erweitert.

## Phase 1 – Bestandsaufnahme

### 1. Bereits vollständig umgesetzt
| Funktion | Wo |
|---|---|
| Insel als eigenes Fenster am PC, Sichtbarkeit (Desktop/Programme/Spiele), Feder-Animation, frei belegbare Bereiche und Kacheln, Farben und Effekte | `jarvis-island.tsx`, `island-*.tsx`, `WindowsDesktopIsland` |
| Universelles Media Center: läuft gerade (Windows-Medien), Albumbild, Pause/Weiter/Titel, Fortschritt, Lautstärke, Liedtext (lrclib), am Handy weiterhören | `media.*`, `island-lyrics.ts` |
| Quick Control Center: Lautstärke, Ausgabegerät, Mikrofon stumm, WLAN, Bluetooth, Helligkeit, Energieplan; Nachtmodus öffnet die Windows-Einstellung | `controls.*` |
| Privacy-Anzeige: welches Programm Mikrofon/Kamera nutzt (Windows-Datenschutz-Speicher), Bildschirmfreigabe der App selbst (Remote Desktop) | `controls.sensors`, `remote.*` |
| PC-Fernsteuerung mit Bildschirm: Live-Bild, Tippen/Klicken/Scrollen/Text, Ton, eigenes Recht „Bildschirm“/„Steuern“ | `remote.*`, `RemoteService` |
| Nexus Deck: frei gestaltbares Tastenraster am Handy (Spiele, Sounds, Profile, Medien, Quick Actions) | `deck.*` |
| Stream Center (OBS): Aufnahme/Replay/Szenen/Mikrofon stumm, Status | `obs.*` |
| Desktop-Widgets: eigene Widgets frei auf dem Windows-Desktop, pausieren im Spiel | `widgets.*`, `WindowsDesktopWidgets` |
| Dateiübertragung Handy ↔ PC mit Fortschritt, wartende Dateien ohne PC, Austausch-Ordner | `files.*`, `lib/transfer.ts` |
| Benachrichtigungen der App: Kategorien, gelesen/ungelesen, Ruhemodus, Verlauf | `notifications.*` |
| Kopplung per QR-Code, automatische Wiederverbindung, Rechte je Gerät, Widerruf | `pairing.*`, Geräteverwaltung |

### 2. Teilweise umgesetzt
| Funktion | Was fehlt |
|---|---|
| File Shelf | Ablage direkt in der Insel (Drag-and-drop auf die Insel), dauerhafter QR-Code zum Handy, Umbenennen |
| AI Activity Island | Die Insel zeigt „JARVIS denkt/antwortet“; die neuen Aufträge der Steuerzentrale (3.59) mit Fortschritt und Bestätigung fehlen dort noch |
| Smart Notification Center | Windows-Benachrichtigungen anderer Programme fehlen (siehe „nicht umsetzbar“); App-Meldungen sind vorhanden |
| Capture Center | OBS-, NVIDIA- und Xbox-Aufnahme sowie die Bibliothek sind da; ein eigener Screenshot oder Bildausschnitt aus der Insel und ein REC-Modus der Insel fehlen |
| Erinnerungen | Gaming-Kalender mit Erinnerung vorhanden; Snooze, Wiederholung und Schnellerstellen aus der Insel fehlen |
| Smart Clipboard | „An PC senden“ (Text/Link vom Handy) vorhanden; Verlauf der PC-Zwischenablage, Anheften und Rücksenden fehlen |
| PC Deck (Touchpad) | Steuerung nur mit Live-Bild; ein Touchpad ohne Bild sowie Präsentations- und Film-Modus fehlen |
| Desktop Widget Pinning | Desktop-Widgets gibt es; „aus der Insel lösen“ fehlt |

### 3. Vorhanden, aber verbesserungswürdig
- Bestätigungen von JARVIS erscheinen bisher nur auf der JARVIS-Seite, nicht in der Insel.
- Fokusmodus und Windows-Energiemodus im Quick Control: Der Energieplan ist schaltbar, der Fokusmodus nur über die Windows-Einstellung.

### 4. Neu zu entwickeln (Reihenfolge der Umsetzung)
1. **File Shelf in der Insel** und **AI Activity Island** (Aufträge live, Entscheidung direkt in der Insel).
2. **Smart Clipboard**: Verlauf der PC-Zwischenablage (nur wenn eingeschaltet), Anheften, Suche, Senden ans Handy über die bestehende verschlüsselte Verbindung, Löschen.
3. **Erinnerungen** in der Insel: Schnellerstellen, Snooze, Wiederholung, Ton. Sie werden am PC gespeichert und überstehen Neustarts.
4. **PC Deck**: Touchpad und Präsentations-/Film-Modus über die vorhandene, rechtegeprüfte Eingabe.
5. **Capture**: Screenshot aus der Insel, REC-Modus, Einstellung „Insel in Aufnahmen sichtbar“.
6. **Widget aus der Insel lösen** (auf die vorhandenen Desktop-Widgets).

## Nicht umsetzbar oder nur eingeschränkt (ehrlich)
- **Windows-Benachrichtigungen anderer Programme lesen:** Das Windows-API dafür (`UserNotificationListener`) steht nur Apps mit Paket-Identität (MSIX) zur Verfügung und braucht die Freigabe des Nutzers. Der Begleiter ist eine klassische Win32-Anwendung. Bis er als Paket ausgeliefert wird, zeigt die Insel nur die eigenen Meldungen.
- **Ob ein anderes Programm den Bildschirm teilt** (Discord, Teams): Dafür gibt Windows keine verlässliche Schnittstelle her. Angezeigt wird nur, was die App selbst teilt oder aufnimmt.
- **Twitch- und YouTube-Chat:** Lesen geht mit den offiziellen Schnittstellen nur mit Anmeldung (Twitch: IRC mit OAuth, YouTube: Live-Chat-API mit Schlüssel). Das kommt erst, wenn du einen Zugang einrichten möchtest.
- **Echte Bildrate der Insel unter Windows:** Messbar nur auf dem echten PC. Hier wird im Testbrowser gemessen und das so gekennzeichnet.
