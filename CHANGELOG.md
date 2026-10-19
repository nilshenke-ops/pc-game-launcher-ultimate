# Änderungsprotokoll

Format: `## MAJOR.MINOR.PATCH – Datum`, darunter `### Neu`, `### Verbessert`, `### Behoben` mit je einem Punkt pro Zeile.
Die Version selbst steht nur in der Datei `VERSION`. `scripts/release-manifest.mjs` liest diesen Eintrag
für die Update-Zentrale (Webseite und Begleiter) und für die Release-Notizen.

## 2.4.0 – 2026-10-19
### Neu
- KI-Assistent „Lokale KI“ für 0 €: ein freies Sprachmodell über Ollama direkt auf deinem PC – ohne Konto, ohne Kosten, nichts verlässt den PC; installierte Modelle werden angezeigt, Empfehlungen mit Größe und Grafikspeicher
- Befehle, PC-Werte, Spielzeit und App-Fragen beantwortet dabei immer der genaue lokale Assistent – das Sprachmodell nur freie Fragen (kleine Modelle erfanden im Test Messwerte)
- Während eines Spiels antwortet standardmäßig nur der lokale Assistent, das Modell wird 2 Minuten nach der letzten Frage aus dem Grafikspeicher entfernt
- Lokaler Assistent: „Welche Spiele habe ich?“ listet die Bibliothek mit Favoriten und „diesen Monat noch nicht gespielt“
- Modusauswahl zeigt die Kosten: „Lokal (0 €)“, „Lokale KI (0 €)“, „Claude (kostenpflichtig)“
### Behoben
- Lange Sätze mit „spielen“ wurden als Startbefehl gelesen („… habe ich nicht gefunden“)

## 2.3.1 – 2026-10-19
### Behoben
- KI-Assistent mit Claude Haiku 5.5: Die Anfrage enthielt ein leeres Ersatzmodell-Feld, das die API ablehnen kann – jetzt wird es nur bei Opus/Sonnet gesendet (mit Test)

## 2.3.0 – 2026-10-19
### Neu
- KI-Assistent (Dashboard → KI-Assistent, auch über Strg+K „Assistent fragen …“): kennt jede Seite der App, die Fehlerbehebung und den Datenschutz und beantwortet Fragen mit echten Daten deines PCs
- Lokaler Modus (Standard, ohne Internet, kostenlos): versteht Befehle wie „Starte …“, „Spiel Sound …“, „Profil …“, „Führe … aus“, „Öffne …“ und Fragen zu PC-Werten, laufenden Spielen, Spielzeit, Level, Deals, Benachrichtigungen, Updates und Netzwerk – auch mit Tippfehlern und Abkürzungen
- Optional Claude (eigener Anthropic-Schlüssel, nur am PC einzutragen): freie Gespräche, liest Daten über Werkzeuge, wählbar Opus 5.5 / Sonnet 5.5 / Haiku 5.5, Monatslimit, Kostenanzeige pro Antwort; einfache Befehle bleiben lokal und kostenlos
- Aktionen sind immer Vorschläge als Knopf – ausgeführt wird erst nach deinem Tippen, mit den Rechten deines Geräts; Programmstarts fragen nach
- Spracheingabe, wenn der Browser sie anbietet; jede Antwort nennt ihre Quelle
### Behoben
- Release: ein falsch eingefügtes Signatur-Secret wird erkannt und verständlich gemeldet (ohne Schlüsselinhalt)

## 2.2.0 – 2026-10-19
### Neu
- GameQuest: eigene Ziele (Spielzeit, Sitzungen, Siege, Matches; täglich, wöchentlich oder einmalig, für ein Spiel oder alle), XP und Level, 8 Erfolge, Match-Tagebuch mit Siegquote pro Spiel
- GameQuest: Spielzeit und Sitzungen kommen aus der Spielerkennung, Siege und Matches nur aus eigenen Einträgen – jeder Wert ist entsprechend gekennzeichnet; erreichte Ziele und Erfolge melden sich als Benachrichtigung
- Deal Radar: Wunschliste mit Zielpreis, Suche im Steam-Shop, Preisprüfung höchstens alle 6 Stunden (nie während eines Spiels), eigener Preisverlauf, Benachrichtigung bei erreichtem Zielpreis (erneut erst nach einem weiteren Preisrutsch)
- Deal Radar ist ausgeschaltet, bis du es einschaltest – vorher geht keine einzige Anfrage an Steam; Quelle und Zeitpunkt stehen bei jedem Preis
- Beide Bereiche funktionieren ohne PC-Verbindung (Ziele, Matches und Wunschliste werden vorgemerkt) und sind im Backup enthalten
### Datenschutz
- docs/DATENSCHUTZ.md: neue Dateien `quests.json`, `deals.json` und das neue Online-Ziel (Steam-Shop für Preise)

## 2.1.0 – 2026-10-19
### Sicherheit
- Proxy-Header (X-Forwarded-For u. a.) werden nur noch von einem Proxy auf dem PC selbst geglaubt – ein Gerät im WLAN kann sich keine fremde Adresse mehr geben und so die Bremsen gegen Rateversuche umgehen
- Schutz gegen DNS-Rebinding: die eigene Seite zählt nur unter einer Adresse dieses PCs
- Relay: ein fehlerhafter Verbindungsaufbau (z. B. „Origin: null“) wird abgelehnt statt den Relay-Server abstürzen zu lassen
- Update-Quelle, Plugin-Katalog und erlaubte Web-Adressen sind nur noch direkt am PC änderbar (vorher auch von Geräten mit Admin-Recht)
- OBS: Wird die Adresse geändert, wird das gespeicherte Passwort verworfen (es kann nicht mehr an einen anderen Rechner umgeleitet werden)
- Kopplung: Fehlversuche sperren nur noch das ratende Gerät, nicht mehr die Kopplung für alle; nach 50 Fehlversuchen insgesamt wird der Code zurückgezogen
- Ohne PC vorgemerkte Plugin-Installationen/-Freigaben und Änderungen älter als 7 Tage werden erst nach erneuter Bestätigung übertragen
- Eine vorgemerkte Änderung, die doppelt gleichzeitig ankommt, wird nur einmal ausgeführt
### Behoben
- Dialoge: Der Fokus sprang beim Tippen in ein späteres Feld zurück ins erste Feld; Tab bleibt jetzt im Dialog (Fokus-Fang), Esc schließt nur den obersten Dialog
- Live-Werte: Schloss sich eine von mehreren Ansichten (z. B. ein eigenes Widget), bekamen die anderen keine Werte mehr
- Mikrofon-Durchleitung erholt sich nach dem Abziehen des Mikrofons (startet wieder, sobald das Gerät zurück ist)
- Autostart-Eintrag zeigt nach dem Verschieben der EXE auf den neuen Ort
- Nur ein Begleiter pro PC (auch über mehrere Windows-Benutzer), mit Hinweis statt Port-Konflikt
- Diagramme auf einer Seite teilen sich keine Farbverläufe mehr
### Leistung (gemessen, siehe docs/PERFORMANCE.md)
- Haupt-Bundle 503 → 359 KB (gzip 162 → 114 KB): englische Texte und Demo-Daten werden nur bei Bedarf geladen; Kaltstart auf Deutsch 665 → 526 KB übertragen, Desktop 365 → 283 ms bis nutzbar
- Laufende Sounds zeichnen nicht mehr die ganze Oberfläche neu; Ping und Uhren laufen bei verborgener Seite seltener bzw. gar nicht
- Service Worker räumt alte Versionen auf und zeigt „Neue Version geladen – neu laden“
### Dokumentation
- Neu: Bestandsaufnahme (docs/BESTANDSAUFNAHME.md), Datenschutz-Übersicht mit allen Online-Zielen (docs/DATENSCHUTZ.md), Messplan und Messwerte (docs/PERFORMANCE.md); Datenschutz-Karte in den Einstellungen ergänzt
- SECURITY.md: Plugins, Updates mit Signatur, Grenzen des Relays, Zugangscode; Discord-Einrichtung als „nicht in echter Discord-Runde getestet“ gekennzeichnet

## 2.0.0 – 2026-10-19
### Neu
- Neuer Name: Nexus Gaming Hub (Dateien, Datenordner, Update-Adressen und Kopplungen bleiben gleich)
- Navigation in Kategorien: Dashboard, Steuerung, Audio, System, Verbindung, Erweiterungen, Verwaltung; „Mehr“ auf dem Handy nach Kategorien geordnet
- Navigation anpassen (Einstellungen → Design): Reihenfolge, Bereiche ausblenden, die vier Plätze der Handy-Leiste wählen
- Netzwerkdiagnose (Ping Doctor): Ping, Jitter, Paketverlust, Antwortzeit zum PC, Ping-Verlauf mit Werten beim Zeigen, Verbindungsqualität mit offengelegten Regeln, bis zu 3 eigene Ziele (z. B. Spiel-Server per Hostname/IP)
- Automatisierungen und Quick Actions: Bausteine „Warten“, „Nur weiter, wenn … läuft / nicht läuft“ und „Medientaste drücken“; Verlauf der letzten 10 Ausführungen je Regel; eine laufende Regel startet nicht doppelt; lange Abläufe laufen auf dem PC weiter
- Hotkeys & Makros: Medientasten (Play/Pause, Titel vor/zurück, Ton aus, lauter/leiser) als Hotkey, Knopf „Jetzt testen“
- Soundboard: Sounds wiederholen bis gestoppt, Hinweis auf fehlende Audiodateien, Formatliste
### Verbessert
- Wartende Änderungen: eigene Kennung je Änderung – der PC wendet sie nur einmal an, auch wenn sie nach einer verlorenen Antwort erneut gesendet wird; neue Versuche mit wachsender Wartezeit, Anzahl der Versuche sichtbar
### Behoben
- Einstellungen → Design stürzte ab, wenn ein eigenes Widget oder Plugin-Widget auf dem Dashboard lag (Fehler seit 1.9.0)
### Hinweis
- Makros, die in Online-Spielen Eingaben automatisieren (Tasten spammen, automatisch bauen, Waffen wechseln), gibt es bewusst nicht

## 1.9.0 – 2026-10-19
### Neu
- Widget-Baukasten: eigene Widgets frei gestalten – Text, Uhr/Datum, Live-Werte (CPU, RAM, GPU, GPU-Temperatur als Zahl, Balken oder Ring), Knöpfe, Bilder, Spielzeit, „Läuft gerade“ und Flächen
- Elemente frei verschieben und in der Größe ändern (ziehen, Ecke, Pfeiltasten), Farben, Verlauf, Hintergrundbild, Deckkraft, Ecken-Rundung, Schriftgröße und Ausrichtung einstellbar; Vorlagen als Startpunkt, Duplizieren
- Knöpfe im Widget: Aufnahme, Replay speichern, Overlay, alle Sounds stoppen, Quick Action, Spiel/Programm starten, Sound abspielen, Gaming-Profil aktivieren (nur Ziele dieses PCs, mit den Rechten des Geräts)
- Eigene Widgets auf dem Dashboard (Website und PC-App) und frei verschiebbar im Overlay
- Desktop-Widgets für Windows: eigene kleine Fenster ganz unten auf dem Desktop, per Ziehen verschiebbar; pausieren automatisch, solange ein Spiel läuft
- Widgets ohne PC auf dem Handy/Tablet bauen und platzieren – sie werden beim nächsten Verbinden übertragen; im Backup enthalten
### Hinweis
- Startmenü, Sperrbildschirm und die Windows-Widget-Leiste (Win+W) lassen normale Programme nicht zu – dafür gibt es keine Funktion

## 1.8.0 – 2026-10-19
### Verbessert
- Spielmodus: Solange ein Spiel läuft, tritt der Begleiter zurück – niedrigere Priorität, Windows-Effizienzmodus, Arbeitsspeicher wird freigegeben (bei aktiver Mikrofon-Durchleitung bleibt die Priorität normal, damit der Sprachchat nicht knackt)
- Hintergrundarbeit (Steam-, Game-Pass-, Epic/EA-Abgleich, Cover-Suche, Update- und Plugin-Prüfung) wartet, bis kein Spiel mehr läuft
- Versteckte Oberflächen ruhen: Hauptfenster im Tray und geschlossenes Overlay brauchen keine Rechenzeit mehr
- GPU-Werte: nvidia-smi läuft bei Bedarf dauerhaft mit, statt alle paar Sekunden neu gestartet zu werden; Windows-GPU-Zähler höchstens alle 4 s; Laufwerke höchstens jede Minute
- Spielerkennung öffnet jeden Prozess nur noch einmal (statt alle 5 s alle Prozesse) und liest Pfade nur, wenn ein Spiel über seinen Ordner erkannt wird
- Overlay rechnet im Leerlauf halb so viel (gemessen: 248 → 124 ms in 20 s, Layout-Neuberechnungen 260 → 16): Balken ohne Layout-Neuberechnung, ohne Weichzeichner und Dauer-Animationen
- Neue Overlay-Widgets suchen sich einen freien Platz; Widgets standardmäßig deckender (besser lesbar)
- Design: Option „Leichte Darstellung (spart Leistung)“ ohne Unschärfe, Leuchten und Animationen
- Plugins Game-Overlay 1.2.1 und CPU & RAM Mini 1.0.1: weniger Rechenlast

## 1.7.1 – 2026-10-19
### Neu
- Drei neue Cartoon-Hintergründe: Cartoon Nacht, Cartoon Unterwasser, Cartoon Weltall
- Cartoon-Hintergründe haben eine eigene Hochformat-Zeichnung fürs Handy (statt eines beschnittenen Querformat-Bilds); Figuren liegen am Rand, damit Text gut lesbar bleibt

## 1.7.0 – 2026-10-19
### Neu
- Overlay im Stil der Xbox Game Bar: Leiste oben mit Uhr und Widget-Symbolen, Widgets als halbdurchsichtige Fenster frei auf dem ganzen Bildschirm verschiebbar und in der Größe änderbar
- Widgets hinzufügen und entfernen: PC-Auslastung, Aufnahme, Quick Actions, Soundboard, Favoriten, Zuletzt gestartet, Audio, Laufende Sounds, Gaming-Profil, Spielesitzung, Benachrichtigungen und alle Plugin-Widgets
- Deckkraft einstellbar, Anordnung wird auf dem PC gespeichert; Auswahl auch ohne PC auf dem Handy
### Verbessert
- Hinter dem Overlay bleibt das Spiel besser sichtbar (weniger abgedunkelt)

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
