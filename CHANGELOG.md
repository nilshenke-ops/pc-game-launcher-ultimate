# Änderungsprotokoll

Format: `## MAJOR.MINOR.PATCH – Datum`, darunter `### Neu`, `### Verbessert`, `### Behoben` mit je einem Punkt pro Zeile.
Die Version selbst steht nur in der Datei `VERSION`. `scripts/release-manifest.mjs` liest diesen Eintrag
für die Update-Zentrale (Webseite und Begleiter) und für die Release-Notizen.

## 1.2.0 – 2026-10-18
### Neu
- Update-Zentrale „Updates & Versionen“ auf Webseite, Handy und im Begleiter: installierte und neueste Version, Datum, Größe, Änderungen, direkter Download
- Updates werden signiert (ECDSA) und vor der Installation auf Signatur, Größe, Prüfsumme und Dateityp geprüft
- Vorherige Version wiederherstellen (Update-Zentrale oder Tray-Menü); Wiederherstellungspunkt vor jedem Update
- Veröffentlichung über GitHub Releases mit automatischer Prüfung der Downloads und der Update-Erkennung
### Verbessert
- Eine Versionsquelle (Datei VERSION) für Begleiter und Webseite
### Behoben
- Nach einem Update startete der Begleiter nicht neu, solange die alte Version noch lief

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
