# Änderungsprotokoll

Format: `## MAJOR.MINOR.PATCH – Datum`, darunter `### Neu`, `### Verbessert`, `### Behoben` mit je einem Punkt pro Zeile.
Die Version selbst steht nur in der Datei `VERSION`. `scripts/release-manifest.mjs` liest diesen Eintrag
für die Update-Zentrale (Webseite und Begleiter) und für die Release-Notizen.

## 1.6.0 – 2026-10-18
### Neu
- Pro Funktion ein anderes Programm: z. B. Aufnahme mit OBS, Replays als Discord-Clip, oder Aufnahme mit Steam und „letzte Sekunden“ über die Xbox Game Bar – auch ohne PC auf dem Handy einstellbar
- Plugin „Game-Overlay“ 1.2.0 zeigt, welches Programm für Aufnahme und Replay zuständig ist

## 1.5.0 – 2026-10-18
### Neu
- Aufnahme-Programm wählbar: OBS Studio, NVIDIA App / GeForce Experience, Xbox Game Bar, Steam oder Discord – der Launcher drückt deren Tastenkürzel (Werkseinstellungen vorausgefüllt, frei änderbar)
- Großes Overlay wahlweise das eigene oder das von NVIDIA, Xbox Game Bar, Steam oder Discord
- Auswahl und Tasten auch ohne PC auf dem Handy einstellbar
- Plugin „Game-Overlay“ 1.1.0 nutzt das gewählte Programm
### Verbessert
- Warnung und Schutz, wenn eine Taste zugleich Launcher-Hotkey ist (sonst bekäme das andere Programm sie nie)

## 1.4.1 – 2026-10-18
### Behoben
- Plugin-Widgets wurden im dunklen Design auf weißem Hintergrund mit heller Schrift angezeigt (abhängig von der Farbeinstellung des Geräts)

## 1.4.0 – 2026-10-18
### Neu
- Overlay im Spiel wie die Xbox Game Bar: großes Overlay mit Plugin-Widgets und klickdurchlässiges Mini-Overlay mit CPU/RAM/GPU und Aufnahme-Anzeige (Windows, Fenster- und randloser Vollbildmodus)
- Aufnahme und Replays über OBS Studio: Aufnahme starten/stoppen, Replay-Puffer, „Replay speichern“, Replay-Puffer automatisch während eines Spiels
- Neue Seite „Overlay & Aufnahme“: Tastenkürzel frei wählbar (auch Maus-Seitentasten), OBS-Verbindung, Ecke des Mini-Overlays – alles schon ohne PC auf dem Handy einstellbar
- Offizielles Plugin „Game-Overlay“ und Plugin-API: Overlay-Widgets, Berechtigungen „capture.control“ und „overlay.show“, vier neue Schritte für Hotkeys, Quick Actions und Automatisierungen
### Verbessert
- OBS-Passwort wird nur geschützt auf dem PC gespeichert und nie an Geräte oder in Backups weitergegeben

## 1.3.1 – 2026-10-18
### Neu
- Ohne PC nutzbar: Einstellungen (Allgemein, Benachrichtigungen, Datenschutz), Audio Center (nur geänderte Werte werden übertragen), Gaming-Verlauf, Spiele- und Programmliste
- Steam-Spiele aus der Steam-Liste zur Bibliothek hinzufügen – auch ohne PC vorgemerkt
- Hotkeys und Quick Actions können Sounds nutzen, die noch auf dem Handy warten; nach dem Hochladen zeigen sie automatisch auf den Sound am PC
### Verbessert
- Wartende Sounds werden vor den übrigen Änderungen übertragen
### Behoben
- Offline geänderte Audio-Werte hätten am PC gewählte Geräte (z. B. das virtuelle Kabel) überschreiben können

## 1.3.0 – 2026-10-18
### Neu
- Alles schon ohne PC einrichten: Hotkeys, Quick Actions, Profile, Automatisierungen, Sounds, Audio- und allgemeine Einstellungen, Bewertungen, Notizen und Plugins werden auf dem Handy gespeichert und beim nächsten Verbinden der Reihe nach auf den PC übertragen
- Plugin-Store ohne PC: direkt von der Projekt-Webseite (Signatur im Browser geprüft); Designs und Widgets sofort auf dem Gerät nutzbar
- Anzeige „Wartende Änderungen“ mit Ablehnungsgrund, erneut senden und verwerfen
- Maus-Seitentasten (Maus 4/5, z. B. Attack Shark) als Hotkey, auch mit Strg/Alt/Shift
- Hotkey-Vorschläge für 60-%-Tastaturen (z. B. Royal Kludge) und F13–F24
### Verbessert
- Doppelte Hotkeys werden schon beim Eingeben erkannt
### Behoben
- Offline wurden Bearbeiten-Knöpfe ausgeblendet, obwohl Änderungen vorgemerkt werden können

## 1.2.0 – 2026-10-18
### Neu
- Plugin Center: Plugins aus dem signierten Store oder als Datei installieren, aktivieren, Rechte einzeln erteilen und entziehen, aktualisieren, zurücksetzen, exportieren
- Plugin-SDK mit Anleitung und vier Beispiel-Plugins (Spielzeit heute, CPU & RAM Mini, Neon-Themes, Discord-Schnellton); Widgets laufen abgeschottet in einer Sandbox
- Update-Zentrale „Updates & Versionen“ auf Webseite, Handy und im Begleiter: Version, Datum, Größe, Änderungen, direkter Download von GitHub Releases
- Signierte Updates (ECDSA) mit Prüfung von Signatur, Größe, Prüfsumme und Dateityp; vorherige Version wiederherstellen; Wiederherstellungspunkt vor jedem Update
- Netzwerk-Monitor mit Ping, Jitter, Paketverlust und Verlauf
- Speicherplatz-Manager mit Laufwerken und Spielgrößen
- Energiezentrale: Sperren, Energiesparen, Neustart, Herunterfahren (mit Verzögerung und Abbrechen)
- Leistungswerte (CPU/GPU/RAM) und Notizen je Spielsitzung
- Bewertungen (1–5 Sterne) für Spiele und Programme
- Wiederherstellungspunkte: wöchentlich automatisch, manuell, vor Updates; prüfen und wiederherstellen
- Mehrere Windows-PCs auf einem Handy verwalten und wechseln
- Konsistenzprüfung in der Diagnose: fehlende Programme, verwaiste Verweise, doppelte Hotkeys
### Verbessert
- Eine Versionsquelle (Datei VERSION) für Begleiter und Webseite
- Universelle Suche findet auch Plugins und ihre Aktionen
- Veröffentlichung über GitHub Releases mit automatischer Prüfung der Downloads und der Update-Erkennung
### Behoben
- Nach einem Update startete der Begleiter nicht neu, solange die alte Version noch lief
- Webseite zeigte bei älteren Update-Angaben keine Download-Datei

## 1.1.0 – 2026-10-18
### Neu
- Mikrofon-Test mit Live-Pegel
- Erkennung von an- und abgesteckten Audiogeräten
- Sicherheitsprüfung in der Diagnose
- Automatische Update-Prüfung mit Benachrichtigung
### Verbessert
- Testton nutzt das gerade gewählte Gerät
- Live-Werte nur bei sichtbarer Ansicht (weniger Hintergrundlast)
- Profil-Layouts gelten auf allen Geräten mit gleichnamigem Layout
### Behoben
- Backup konnte aus der Ferne Programme freigeben und die Relay-Adresse ändern
- Entfernte Steam-/Epic-/EA-/Game-Pass-Spiele kamen beim nächsten Abgleich zurück
- Hotkeys ohne Ziel und profilgebundene Hotkeys

## 1.0.0 – 2026-10-17
### Neu
- Erste Version: Spiele und Programme, Soundboard, Audio Center, Profile, Automatisierungen, Hotkeys, Monitor, Kopplung, Relay, Backup
