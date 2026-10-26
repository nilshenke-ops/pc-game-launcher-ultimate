# Änderungsprotokoll

Format: `## MAJOR.MINOR.PATCH – Datum`, darunter `### Neu`, `### Verbessert`, `### Behoben` mit je einem Punkt pro Zeile.
Die Version selbst steht nur in der Datei `VERSION`. `scripts/release-manifest.mjs` liest diesen Eintrag
für die Update-Zentrale (Webseite und Begleiter) und für die Release-Notizen.

## 2.47.0 – 2026-10-26
### Neu
- iPhone/iPad bleiben gekoppelt: Geräte & Verbindungen → „Dauerhaft auf diesem Gerät“ mit „Als App auf den Home-Bildschirm“ (die App vom Home-Bildschirm hat einen eigenen Speicher und bekommt per einmaligem Link einen eigenen Zugang – ohne neuen Code) und „Andere Adresse nutzen“ (Zugang auf eine feste Adresse des PCs übertragen)
- Feste PC-Adresse: Der Begleiter findet einen Namen, der bei neuer IP gleich bleibt – Router-Name (z. B. gaming-pc.fritz.box, nur wenn er wirklich auf diesen PC zeigt) oder Tailscale-Name; der QR-Code nutzt ihn zuerst. Mit „tailscale serve“ erkennt er die https-Adresse selbst, dann klappt auch die Website von unterwegs
- Die Website merkt sich die PC-App im WLAN und bietet „Zur PC-App (WLAN)“ statt nur „Offline – kein PC verbunden“
- Diagnose: „Adresse dieser Seite“, „Home-Bildschirm-App“, „Dauerhafter Speicher“ und am PC „Feste Adresse“
### Verbessert
- Nach dem Koppeln bittet die App den Browser, ihre Daten nicht von selbst zu löschen
- Antwortet der PC auf einen Befehl nicht rechtzeitig, steht dabei, dass unklar ist, ob er ausgeführt wurde – Befehle werden nie automatisch wiederholt
- Neuer Zugang per Link erscheint am PC als Benachrichtigung
### Behoben
- Beim Wiederverbinden konnte eine ältere Verbindungsprüfung eine zweite Verbindung öffnen; außerdem verbindet die App jetzt auch, wenn Safari die Seite aus dem Zurück-Speicher wiederherstellt

## 2.46.0 – 2026-10-26
### Neu
- Elf neue fest eingebaute Widgets für die Startseite (kein Plugin nötig, über „Anpassen“ einblendbar): „Wo war ich?“, „Nächster Gaming-Abend“, „Offene Abstimmung“, „Foto des Tages“, „Bauprojekte“, „Soundtrack-Tipp“, „Offene Challenges“, „Würfel & Münze“, „Letzte Aufnahmen“, „Speicherplatz“ und „Meistgespielt (7 Tage)“
- Die ersten acht funktionieren auch ohne PC-Verbindung; Aufnahmen, Speicherplatz und Meistgespielt kommen vom PC

## 2.45.0 – 2026-10-25
### Neu
- Bingo: Aufgaben von der KI zu genau dem Spiel, das man gerade spielt – im Spielbegleiter unter „Was spiele ich?“ → Bingo → „Neue Karte“: Spiel aus der Bibliothek wählen oder eintippen, Größe 3×3, 4×4 oder 5×5 antippen, „Aufgaben vorschlagen“; die Aufgaben landen in „Eigene Aufgaben“ und lassen sich vor dem Mischen noch ändern
- Dieselbe KI wie der KI-Assistent: die lokale KI (Ollama, kostenlos) oder Claude mit eigenem Schlüssel (Kosten laufen über das Monatslimit und werden dort mitgezählt)
### Verbessert
- KI-Aufgaben werden am PC geprüft: Aufzählungszeichen, Nummerierungen, Überschriften, doppelte und zu lange Zeilen fliegen raus; reichen die brauchbaren Aufgaben nicht für die Karte, kommt eine Meldung statt einer halb leeren Karte – der eingebaute lokale Assistent ohne Modell sagt das ehrlich, statt Aufgaben zu erfinden

## 2.44.0 – 2026-10-21
### Neu
- Deal Radar: Key-Shop-Preise über die offizielle Schnittstelle von GG.deals – günstigster Key-Shop-Preis (Instant Gaming, Eneba und viele mehr), Tiefstpreis und günstigster offizieller Shop, für das eingestellte Land (Deutschland in Euro). Braucht einen kostenlosen API-Schlüssel von GG.deals, der am PC eingetragen, vorher geprüft und verschlüsselt gespeichert wird
- Zielpreis-Alarm auch, wenn ein Key-Shop den Zielpreis erreicht; Hinweis „In einem Key-Shop gerade am günstigsten“
- Links „Alle Angebote bei GG.deals“ und „Bei Keyforsteam ansehen“ neben Instant Gaming und Eneba

## 2.43.1 – 2026-10-21
### Neu
- Deal Radar: zu jedem Spiel „Key-Shops (Deutschland)“ mit Links zu Instant Gaming und Eneba (Suche nach dem Spiel mit Euro-Preisen; bei Eneba nur Keys für Europa/Global). Ein Preis wird dort nicht angezeigt: beide Shops haben keine öffentliche Preisabfrage und sperren automatische Abfragen

## 2.43.0 – 2026-10-21
### Neu
- Installierte Spiele kommen automatisch in die Bibliothek – ohne Einrichtung: Steam, Epic Games, EA app und neu die Xbox-App. Abgleich wenige Sekunden nach dem Start des Begleiters und danach alle 10 Minuten; selbst entfernte Spiele kommen nicht wieder, deinstallierte verschwinden
- Xbox-Spiele werden erkannt: Ordner „XboxGames“ auf allen Laufwerken (auch eigene Ordner aus der Xbox-App), Name aus der Spiel-Konfiguration, Start direkt über Windows; neuer Bereich „Xbox“ in der Bibliothek
- „Jetzt abgleichen“ bei leerer Bibliothek: gleicht Steam, Epic, EA und Xbox sofort ab
### Verbessert
- Die Verknüpfungen mit Steam, Epic, EA und Xbox sind einmalig automatisch eingeschaltet (einzeln abschaltbar, bleiben dann aus)
- Game-Pass-Abgleich entfernt keine Spiele mehr, die über die Xbox-Verknüpfung gekommen sind

## 2.42.3 – 2026-10-21
### Behoben
- Deck und Kalender: Bei leerer Spiele-Bibliothek stand „Noch keine Spiele – sie erscheinen, sobald der PC einmal verbunden war“, auch wenn der PC verbunden ist. Jetzt: „Noch keine Spiele in der Bibliothek“ mit Hinweis und Link zu „Spiele“ → „Hinzufügen“ (Steam/Epic werden gefunden, alles andere als Datei freigeben); der alte Text nur noch, wenn wirklich noch nie ein PC verbunden war

## 2.42.2 – 2026-10-21
### Behoben
- Handy koppeln über die Website: Mit einer PC-Adresse im Heimnetz (http://192.168.…) blieb es bei einer roten Meldung – die Website (https) darf diese Adresse nicht öffnen, das blockiert der Browser. Jetzt gibt es dort den Knopf „Beim PC öffnen und koppeln“: er öffnet die Seite des PCs mit dem schon eingetragenen Code, danach „Koppeln“ und am PC „Erlauben“

## 2.42.1 – 2026-10-21
### Behoben
- Startseite am PC: zeigte „Online“ und „Lokal verbunden“, als wäre ein Handy verbunden – gemeint war nur das Fenster am PC selbst. Jetzt steht dort „Begleiter läuft“ und „Dieses Fenster läuft am PC“, dazu welche gekoppelten Geräte gerade wirklich verbunden sind (oder dass noch keins gekoppelt ist)
- „Erste Schritte“ am PC hakte „PC verbinden“ ab, obwohl kein Handy gekoppelt war – am PC heißt der Schritt jetzt „Handy koppeln“ und ist erst erledigt, wenn ein Gerät gekoppelt ist
- Geräteliste am PC: verbindet oder trennt sich ein Handy, aktualisiert sich die Anzeige sofort (vorher erst nach Neuladen)

## 2.42.0 – 2026-10-21
### Neu
- „Medien“ (Spielbegleiter) mit fünf Bereichen, alles auch ohne PC nutzbar
- Fotomuseum: Screenshots importieren (Kopie mit höchstens 1600 px plus Vorschaubild), Aufnahmedatum aus den Bilddaten (EXIF) oder Dateidatum, Spiel, Kategorie, Tags, Favoriten, Aufnahmeeinstellungen, Raster/Galerie/Vollbild (Wischen, Pfeiltasten), eigene Sammlungen; dasselbe Bild zweimal wird erkannt und nachgefragt
- Erinnerungsbuch: Momente mit Geschichte, Bildern, Fotos aus dem Museum, Medienlinks, Tags, Kategorie, Favorit und Archiv als Zeitleiste nach Jahr und Monat; übernimmt Notizen aus „Wo war ich?“
- Screenshots sortieren: PC-Aufnahmen und Museum in einer Liste – nach Datum, Dateiname, Spiel, Größe; Filter nach Quelle, Art, Format, Größe, Spiel, Kategorie, Sammlung, Tag; Mehrfachauswahl (Favorit, Tag, Kategorie, Sammlung, ins Museum, ins Erinnerungsbuch, löschen nur nach Bestätigung); Export als CSV/JSON
- Doppelte finden: nur bei identischem Inhalt (SHA-256, für PC-Dateien am PC berechnet); „Alle Kopien auswählen“ wählt nur aus, gelöscht wird erst nach Bestätigung (PC-Dateien in den Papierkorb)
- Clip-Momente: Zeitstempel zu Videolinks oder PC-Aufnahmen; YouTube, Twitch-Videos und Videodateien öffnen an der Stelle, PC-Aufnahmen spielen hier ab und springen dorthin; keine Aufnahme, kein Schnitt
- Soundtracks: Titel, Spiel, Künstler, Komponist, Album, Cover, Stimmung, Sammlungen und Links zu offiziellen Musikdiensten – ohne eingebauten Player, ohne Download
### Verbessert
- Aufnahmen am PC haben jetzt auch eine Kategorie (auch ohne PC vorgemerkt)
- Sammlungen (Listen der Spielbegleiter): Sortierung nach Datum, Filter für eigene Listen, Felder, die die Seite selbst setzt
### Behoben
- Speichern am PC: zwei gleichzeitige Schreibvorgänge derselben Datei konnten sich die Zwischendatei wegnehmen (Fehler „moves.json.tmp nicht gefunden“) – jede Speicherung nutzt jetzt eine eigene Zwischendatei

## 2.41.0 – 2026-10-21
### Neu
- „Freunde & Gruppe“ (Spielbegleiter): Spieler-Karten mit Avatar, Plattformen, Spielen, Genres, Rollen, freiwilliger Verfügbarkeit, Zeitzone und Freigabe nur mit Zustimmung
- „Was spielen wir?“: findet Spiele, die alle haben – gleiche Plattform zuerst; Crossplay zählt nur mit Quelle (Spiel-Fakten), sonst „unbekannt“
- Spiele-Abstimmungen per Einladungs-Link: Freunde antworten mit einem Antwort-Link; schließen, Frist, „Link zurückziehen“ macht alte Links ungültig – keine Live-Zählung
- Gaming-Abende: Datum mit Zeitzone (Freunde sehen ihre Ortszeit), Spiele und Alternativen, Zu-/Absagen per Link oder selbst, Notizen, Regeln, Absage, vergangene Abende; in den Gaming-Kalender (Erinnerung über den PC) und als .ics
- Team-Rollenplaner: frei definierbare Rollen, Spieler und Platzhalter, mehrere Aufstellungen, Vorlagen
- Mini-Turniere: K.-o., Doppel-K.-o. mit Verliererrunde und Entscheidungsfinale, Gruppen + Finalrunde, Jeder gegen jeden; Auslosen, Freilose, geprüfte Ergebnisse, Tabellen, Historie, CSV/Datei/Drucken – ohne Geld und Wetten
- Server-Favoriten mit Status auf Knopfdruck über den PC (Minecraft Java Server List Ping, Steam/Source A2S); andere Spiele „Unbekannt“
### Verbessert
- Turnier-Ergebnisse merken sich die Spieler: ändert sich ein früheres Ergebnis, werden spätere, nicht mehr passende Ergebnisse gemeldet statt still weiterverwendet
- Zahlenfelder in Sammlungen sind für Screenreader beschriftet

## 2.40.0 – 2026-10-21
### Neu
- „Welten & Bauen“ (Spielbegleiter): Minecraft-Welten mit Edition, Version, Modus, Seed und Orten (Dimension, X/Y/Z, Gruppen); Nether ↔ Oberwelt umrechnen (Faktor 8), Abstand zwischen Orten, Orte als CSV – keine erfundene Karte
- Bauprojekte mit Welt-Verknüpfung, Aufgaben und Material; Fortschritt nur aus abgehakten Aufgaben, fehlendes Material wird angezeigt; Vorlagen
- Karten-Marker als Liste, Tabelle und Gruppen; auf einer Karte nur mit eigenem Kartenbild (Stelle antippen)
- „Builds & Technik“: Builds/Loadouts mit freien Eigenschaften, Vorlagen, Duplizieren und Vergleich zweier Builds
- Mod-Sammlungen mit Versionshinweisen – Status nur selbst markiert, nichts wird installiert oder heruntergeladen
- Grafikvergleich mit Schieber über zwei eigene Screenshots (keine FPS aus Bildern)
- Steuerungs-Lexikon: „Offiziell“ nur mit Quelle, sonst „Eigene Angabe“
### Verbessert
- Gemeinsamer Sammlungs-Baukasten: Prüfung jeder Eingabe (auch Tabellenzeilen), Suche, Filter, Tabelle/Karten, Archiv, Export/Import und CSV; beim Löschen werden Verknüpfungen anderer Einträge entfernt

## 2.39.0 – 2026-10-21
### Neu
- „Was spiele ich?“ (Spielbegleiter): Zeit-Finder für 10–15, 30, 45, 60, 90, 120+ Minuten oder eigene Zeit – schlägt nur Spiele mit bekannter Sitzungsdauer vor (eigene Angabe oder Median der echten Sitzungen), jede Karte nennt die Gründe; Spiele ohne bekannte Dauer stehen getrennt; Filter und Zufallsauswahl
- Challenge-Generator: allgemeine Vorschläge (als solche gekennzeichnet) und Vorschläge aus deinen Daten (Verlauf, Backlog, Zielpfade, Funde); eigene spielspezifische Challenges; speichern, bearbeiten, neu würfeln, abhaken
- Gaming-Bingo: 3×3, 4×4, 5×5 mit freier Mitte, Vorlagen und eigene Aufgaben, erkennt Reihen, Spalten und Diagonalen; Export als Bild oder Datei, Teilen per Link (die Karte steckt nur im Link, nichts liegt online)
- Backlog: Bewertung, Tags, eigene Zeitschätzung und Sitzungsdauer, Archiv statt Löschen, Mehrfachauswahl (Status, Priorität, Archiv), doppelte Spiele zusammenführen
### Verbessert
- Gaming-Verlauf liefert die typische Sitzungsdauer je Spiel (Median, erst ab 3 Sitzungen)
- Backlog-Export/-Import und CSV enthalten die neuen Felder

## 2.38.0 – 2026-10-21
### Neu
- Neuer Bereich „Spielbegleiter“ mit Spiele-Journal und Gaming-Wiki – funktioniert ohne PC: gespeichert im Browser, beim Verbinden mit dem PC abgeglichen (andere Geräte sehen dasselbe, alles im PC-Backup)
- „Wo war ich noch mal?“: Verlauf je Spiel (was gemacht, wo, was als Nächstes, Bilder); beim Spielstart erscheint die letzte eigene Notiz, auch im Bearbeiten-Fenster des Spiels
- Zielpfade: eigene Etappen mit Belohnungen und Meilensteinen, Fortschritt aus den Etappen, Vorlagen und eigene Vorlagen, Archiv – ohne tägliche Pflichten oder Fristen
- Quest- und Fundsammlung: Kategorien, Status offen/gefunden/erledigt, Tags, Bilder, Favoriten, Suche, Filter, Sortierung
- Story ohne Spoiler: Kapitel, Figuren, offene Fragen und eigener Stand; die spoilerfreie Ansicht verdeckt alles danach und alles als Spoiler Markierte
- Gaming-Wiki: [[Links]] zwischen Seiten (fehlende Seite mit einem Tipp anlegen), Rückverweise, automatisches Speichern, Versionen mit Wiederherstellen, doppelte Seiten zusammenführen, Markdown-Export
- Alle Einträge lassen sich untereinander verknüpfen; Export und Import als Datei geht ohne PC
### Verbessert
- Wurde ein Eintrag auf zwei Geräten geändert, gilt die neuere Änderung; die andere bleibt als Konflikt-Kopie auf dem PC und lässt sich wiederherstellen
- Backup enthält die Sammlungen (Bilder zusammen mit den Audiodateien)

## 2.37.0 – 2026-10-21
### Neu
- Remote Desktop mit Ton: Knopf „Ton“ überträgt, was der PC gerade abspielt, mit Lautstärkeregler – Standardgeräte und Mikrofon bleiben unverändert
- Spiele verschieben (System → Spiele verschieben): zeigt zuerst den offiziellen Weg des Launchers (Steam, Xbox-App, Epic)
- Umzugsassistent für Steam-Spiele: Ziel-Bibliothek auf einem anderen Laufwerk, Prüfungen (vollständig installiert, Spiel läuft nicht, Platz + 1 GB Reserve, keine Verknüpfungen), Kopie mit SHA-256-Prüfung jeder Datei und Fortschritt
- Umstellen erst bei geschlossenem Steam; das Original wird erst gelöscht, wenn du bestätigst, dass das Spiel am neuen Ort startet – bis dahin „Rückgängig“
- Umzüge lassen sich ohne PC vorbereiten; kopiert wird erst mit dem PC nach neuer Prüfung
### Verbessert
- Angehaltene oder unterbrochene Kopien (auch nach Neustart des Begleiters) laufen mit „Fortsetzen“ weiter; schon kopierte Dateien werden dabei erneut geprüft
- Ändert sich das Spiel nach dem Kopieren (z. B. Update), wird nicht umgestellt, sondern zuerst abgeglichen

## 2.36.0 – 2026-10-21
### Neu
- Remote Desktop (Steuerung → Remote Desktop): der echte Windows-Bildschirm live auf iPhone, iPad oder einem anderen Browser – über die bestehende angemeldete Verbindung (WLAN direkt, von unterwegs über den eigenen Tunnel oder das Relay)
- Touch-Maus (tippen, Doppeltippen, halten = Rechtsklick, halten und ziehen, wischen = scrollen, zwei Finger = Rechtsklick) und Touchpad-Modus mit eigenem Zeiger
- Bildschirmtastatur mit Umlauten, Strg/Alt/Umschalt/Windows zum Antippen, Sondertasten, F1–F12 und Kombinationen (Strg+C/V/X/Z/A, Alt+Tab, Win+D, Task-Manager); Maus und Tastatur am Computer-Browser
- Zoom, Pause, Vollbild, Qualität (Automatisch, Wenig Daten, Ausgewogen, Hohe Qualität) mit gemessener Bildrate, Datenrate und Antwortzeit
- Eigene Rechte „Bildschirm ansehen“ und „Fernsteuern“ (nie automatisch vergeben); Freigabe, Höchstdauer und Ende ohne Eingabe nur am PC einstellbar
- Am PC: Leiste „… steuert diesen PC – Beenden“, Benachrichtigung und „Sitzung beenden“
- Einstellungen für Remote Desktop werden auf dem Gerät gespeichert und gehen auch ohne PC
- Anleitung: docs/REMOTE-DESKTOP.md
### Verbessert
- Datenschutztaste beendet auf Wunsch auch eine laufende Fernsteuerung und lässt bis zum Ausschalten keine neue zu
- Bilder werden nur bei Bedarf geschickt: höchstens zwei unterwegs, unverändertes Bild nicht doppelt, bei Stillstand weniger Aufnahmen (spart Leistung beim Spielen)
- Sitzungen enden nach Höchstdauer, ohne Eingabe, ohne Antwort, bei Verbindungsabbruch oder entzogenem Recht – gedrückte Tasten werden immer losgelassen

## 2.35.0 – 2026-10-21
### Neu
- Datenschutz- und Notfalltaste (Schild oben in der Leiste oder Deck-Taste „Datenschutzmodus an/aus“) mit vorher gewählten Schritten: Soundboard stoppen, Mikrofon-Durchleitung aus, Windows-Mikrofon stummschalten, Benachrichtigungen leise (auch nur bestimmte Kategorien), andere Geräte pausieren, Inhalte verdecken
- Für jeden Schritt steht da, was wirklich passiert ist: „Wirkt“, „Erledigt“, „Nicht möglich“ oder „Fehlgeschlagen“; Discord, Spiele und andere Programme werden ausdrücklich nicht als stummgeschaltet ausgegeben
- Pausierte Geräte bleiben gekoppelt, zeigen „Vom PC pausiert“ und verbinden sich nach dem Ausschalten von selbst wieder
- Inhalte verdecken: Benachrichtigungen, Dashboard-Widgets, Chats, Dateien und Aufnahmen werden unscharf; Antippen zeigt einen Bereich kurz, ohne etwas auszulösen; auf dem eigenen Gerät auch ohne PC
- Spielzustand (Spiele → Spielzustand): Momentaufnahmen mit Spielversion, Startargumenten, Arbeitsordner, verknüpftem Gaming-Profil, Kopie der Konfigurationsdateien aus dem Savegame-Tresor, Mods an/aus, Plugin-Versionen und System
- Vergleichen (mit jetzt oder zwei Momentaufnahmen, Einstellungen einzeln) und Zurückholen mit Vorschau; der jetzige Zustand wird vorher automatisch gespeichert
- Automatische Momentaufnahme vor Mod-Installationen, Mod-Wiederherstellungen und dem Zurückholen von Konfigurationsdateien
### Verbessert
- Vor dem Zurückholen steht, was nicht enthalten ist (Spieldateien, Spielstände, gelöschte Mods, Windows); jedes Ergebnis wird mit Fehlern und fehlenden Dateien gespeichert
- Ausschalten stellt nur zurück, was die Taste selbst geändert hat (z. B. nur ein Mikrofon, das sie stummgeschaltet hat)

## 2.34.0 – 2026-10-21
### Neu
- Hardware-Inventar (System → Hardware-Inventar): Prozessor, Arbeitsspeicher, Grafikkarte mit Treiberversion und -datum, Audio-Ausgänge und Mikrofone, Controller mit Akku, Tastaturen und Mäuse, Monitore, Laufwerke und Netzwerkadapter – was nicht lesbar ist, steht mit Grund da
- Fehlerberichte pro Spiel (System → Fehlerberichte): nach einem Absturz (Windows-Absturzbericht des Spiels gefunden) oder einem sehr kurzen Spiel legt der PC automatisch einen Bericht an und benachrichtigt dich
- Ein Bericht enthält Fehlerbaustein, Ausnahmecode, Spielversion, letzten Start, Gaming-Profil, System und Änderungen kurz davor; mögliche Ursachen sind als Vermutung mit Begründung markiert
- Berichte durchsuchen, zwei Berichte vergleichen, auf Anforderung erstellen und als Text exportieren – wahlweise ohne Benutzername, PC-Name und E-Mail
- Plugin-Prüflabor: „Alle prüfen“ bzw. Details → „Prüfen“ zeigt Paket-Unversehrtheit, Manifest und Version, unbekannte Einträge, Berechtigungen, Abhängigkeiten, Konflikte, Fehler der letzten 7 Tage, Update und vorherige Version
### Verbessert
- Das Inventar ist ohne PC mit dem letzten Stand und Datum sichtbar
- Die Prüfung führt keinen Plugin-Code aus und ändert nichts

## 2.33.0 – 2026-10-21
### Neu
- Savegame-Tresor (Spiele → Savegame-Tresor): Spielstände sichern, prüfen und zurückholen – mit Verlauf, Größe und Grund jeder Sicherung
- Sichere Vorschläge statt Raten: Steam-Cloud-Ordner des Spiels oder Ordner mit genau dem Namen des Spiels (Gespeicherte Spiele, Dokumente\My Games, AppData); eigene Ordner nur direkt am PC
- Automatisch nach dem Spielen oder täglich (nur wenn sich etwas geändert hat), Anzahl der Sicherungen einstellbar
- Vor dem Zurückholen eine Vorschau: was ersetzt wird, was zurückkommt, was entfernt wird – mit Warnung, wenn der jetzige Stand neuer ist
- Konfigurationsdateien (ini, cfg, json, xml, txt …) mit Versionen und Vergleich: neue, geänderte und entfernte Einstellungen nebeneinander
### Verbessert
- Jede Sicherung hat eine SHA-256-Prüfliste; „Prüfen“ findet beschädigte Sicherungen, beschädigte werden nie zurückgeholt
- Der jetzige Stand wird vor jedem Zurückholen automatisch gesichert; solange das Spiel läuft, passiert nichts
- Regeln lassen sich ohne PC ändern und werden beim Verbinden übertragen; Orte und Regeln sind Teil des Konfigurations-Backups

## 2.32.0 – 2026-10-20
### Neu
- PC vom Handy sperren, in den Energiesparmodus schicken, neu starten und herunterfahren: Widget „PC-Energie“ (Home), Karte „Energie“ im PC Monitor und Deck-Tasten („PC sperren / ausschalten“)
- Neustart und Herunterfahren wahlweise sofort oder in 30 s, 1, 5 oder 10 min – mit Countdown auf jedem Gerät und „Abbrechen“; Hinweis, wenn gerade ein Spiel läuft
- Neues Geräte-Recht „PC ausschalten“ (am PC unter Geräte einmal für das Handy ankreuzen); Sperren geht schon mit dem Recht „Starten“
- Der PC zeigt eine Benachrichtigung, welches Gerät gesperrt, neu gestartet oder heruntergefahren hat
### Verbessert
- Vorher ging das nur mit Admin-Recht – das hat ein gekoppeltes Handy normalerweise nicht
- Wird nie für später vorgemerkt: ohne Verbindung zum PC passiert nichts
### Behoben
- Dialoge erscheinen immer über der ganzen Seite – vorher konnte ein Dialog in einem Home-Widget (z. B. „Mein Status“) unter der unteren Leiste landen
- Neuer Termin nach 20 Uhr: Vorschlag ist jetzt die nächste volle Stunde statt 20:00 (lag schon in der Vergangenheit)

## 2.31.0 – 2026-10-20
### Neu
- Icon-Werkstatt: eigene Icons (1:1) und Cover (2:3) gestalten – Vorlagen (Neon, Retro, Minimal, Gold, Ice, Fire), Symbol oder Emoji, eigenes Bild mit Zoom, Form (abgerundet, Kreis, Sechseck, Quadrat), Farben, Verlauf, Rand, Muster, Leuchten, Live-Vorschau
- Erreichbar dort, wo das Bild gebraucht wird: Spiel/Programm bearbeiten, Deck-Taste, Gamer-Pass – mit „Übernehmen“ oder „Als Bild speichern“
### Verbessert
- Selbst gestaltete Icons haben Vorrang vor dem Marken-Logo eines Programms
- Sicherer Bild-Upload: Cover-Bilder werden im Browser neu gezeichnet (keine Metadaten, kein SVG, nur PNG/JPEG/WebP/GIF) und passend verkleinert
- Private Lobby: ehrlich als „noch nicht verfügbar“ erklärt (braucht einen eigenen Server) – keine Attrappe

## 2.30.0 – 2026-10-20
### Neu
- Musik-Visualizer als Widget (Home und Overlay): Balken, Welle oder Kreis – nur zu echtem Ton: PC-Ton teilen (Chrome/Edge am PC, „Systemaudio teilen“), Mikrofon oder eigene Audiodatei; ohne Quelle bewegt sich nichts
- HUD-Layouts für das große Overlay: bis zu 10 Anordnungen unter einem Namen speichern (z. B. „Ranked“, „Streaming“), mit Vorschau, mit einem Tipp anwenden, überschreiben oder löschen
### Verbessert
- Der Ton wird nur im Browser ausgewertet – nichts wird aufgenommen oder gesendet; beim Beenden des Teilens stoppt der Visualizer von selbst
- HUD-Layouts lassen sich auch ohne PC ändern und werden beim Verbinden übertragen

## 2.29.0 – 2026-10-20
### Neu
- Gaming-Raum (Navigation → Gaming-Raum): gezeichneter 2.5D-Raum, dessen Objekte zu vorhandenen Bereichen führen – PC → Spiele, Poster mit deinem Lieblingsspiel → Bibliothek, Regal → Backlog, Pokal → Trophäenraum, Lampe → Design, Lautsprecher → Soundboard, Controller → Deck
- Raum bearbeiten: bis zu 6 Varianten, 5 Stile, Lichtfarbe, Objekte ein-/ausblenden, Deko aus deinen Sammelstücken platzieren und verschieben (ziehen oder Pfeiltasten)
- Optional als Startseite – das Dashboard bleibt über „Dashboard“ erreichbar
- Trophäenraum → „Sammlung & Fortschritt“: Fortschrittsbaum (Level, Trophäen, Spielzeit – nur aus deinen echten Daten) mit Sammelstücken und Raum-Stilen als Belohnung
- Belohnungskisten: eine pro erreichtem Level ab Level 2, kostenlos, Inhalt vorher sichtbar, jedes Teil gleich wahrscheinlich, nie doppelt
- Regal für Launcher-Sammelstücke: hinstellen, verschieben, herausnehmen – klar getrennt von den Erfolgen aus deinen echten Spieldaten
### Verbessert
- Raum und Sammlung funktionieren ohne PC und kommen mit dem Konto in andere Browser mit
- Kein Echtgeld, keine Vorteile, kein Zeitdruck, keine Anmeldepflicht – alles nur Deko

## 2.28.0 – 2026-10-20
### Neu
- Spiele-Bibliothek mit drei Ansichten: Raster, Liste und Holo – die Wahl bleibt gespeichert
- Holo-Ansicht: drehendes Schaufenster mit dem gewählten Spiel groß in der Mitte, darunter Spielzeit und letzter Start (nur vom PC erfasste Werte), Favorit, Bearbeiten und Spielen; bedienbar mit Pfeiltasten, Wischen, Mausrad, Schieberegler oder Tipp auf ein Nachbarspiel
- Listenansicht: kompakte Zeilen mit Bild, Bewertung, Spielzeit und Spielen-Knopf
- Gamer-Pass-Editor im Trophäenraum: eigenes Bild (im Browser auf 256 px verkleinert), Titel, bis zu 3 Lieblingsspiele, bis zu 4 Abzeichen aus echten Erfolgen, Rahmen (Neon, Gold, Holo, Pixel), 8 Hintergründe, eigene Farbe, Bereiche ein-/ausblenden und umsortieren, Live-Vorschau, Rückgängig und Zurücksetzen
### Verbessert
- Große Bibliotheken: Raster und Liste bauen zuerst 120 Spiele auf und laden beim Scrollen nach (bei 3010 Spielen Wechsel der Ansicht 0,2 s statt 1,3–1,8 s)
- Die Holo-Ansicht zeichnet nur die 9 Spiele um die Mitte – auch bei Tausenden Spielen
- Der Gamer-Pass kommt mit dem Konto in andere Browser mit; nichts wird automatisch veröffentlicht

## 2.27.0 – 2026-10-20
### Neu
- Spielstart-Animation (Ladebildschirm) bei jedem Start – aus der Bibliothek, vom Deck, aus der Suche, aus Widgets und Plugins: 8 Vorlagen (Neon-Portal, Cyberpunk, Weltraumreise, Minimal Dark, Digital Glitch, Energiewelle, Lila Galaxie, Blaues Hologramm), Dauer 1–8 s, Schnellmodus, eigener Text, Bild des Spiels, Vorschau
- Der Ladebildschirm zeigt nur, was wirklich bekannt ist: „wird gesendet“ → „Startbefehl angekommen“ → „Läuft auf dem PC“ erst, wenn der PC das Spiel erkennt; Fehler mit Grund
- Bewegter Hintergrund: Partikel, Sternenflug, Neon-Raster, Wellen, Funken, Eiskristalle – Tempo, Menge und Deckkraft einstellbar
- Seitenübergänge: Einblenden, Gleiten, Zoom, Unschärfe oder keiner, Dauer einstellbar
- Atmosphären: Cyberpunk, Neon, Space, Ice, Fire, Fantasy, Retro Arcade, Minimal Dark, Glass, Mono – Farben plus passender Hintergrund und Ladebildschirm in einem Tipp
### Verbessert
- Die Animation hält einen Start nie auf: der Befehl geht vorher an den PC, Antippen/Esc überspringt sofort, ein Fehler in der Animation zeigt einfach nichts
- Bei „Animationen reduzieren“, leichter Darstellung oder der Systemeinstellung „Bewegung reduzieren“: Standbild statt Animation; der Hintergrund hält an, wenn die Seite nicht sichtbar ist
- Alles läuft ohne PC und kommt mit Design-Code und Konto in andere Browser mit

## 2.26.1 – 2026-10-20
### Behoben
- Das Konto-Symbol neben der Glocke fehlte in Browsern, die noch nie mit einem PC verbunden waren – jetzt immer sichtbar; ohne PC erklärt das Fenster, dass das Konto einmal die Verbindung zum PC braucht (mit „PC verbinden“)

## 2.26.0 – 2026-10-20
### Neu
- Konto (optional, ohne E-Mail): Personen-Symbol oben rechts neben der Glocke – Registrieren und Anmelden mit Benutzername und Passwort; angemeldet zeigt das Symbol den Anfangsbuchstaben
- Mit dem Konto kommen in einem anderen Browser mit: Design, Startseite und Leiste, Sprache, Gamer-Pass, Zähler, Pausen-Erinnerung und vom Handy geprüfte Xbox-Preise – Ende-zu-Ende verschlüsselt, gespeichert auf dem eigenen PC
### Verbessert
- Gespeichert wird automatisch bei jeder Design-Änderung und beim Verlassen der Seite

## 2.25.0 – 2026-10-20
### Neu
- Jedes Steam-Spiel im Deal Radar bekommt sein echtes Bild – auch neue Spiele (Steam legt deren Bilder unter einem eigenen Pfad ab, der alte Pfad liefert dort nichts)
- Katalog aller Steam-Spiele neben der Website (einmal täglich, nach Anfangsbuchstaben aufgeteilt): Name, Bild und Preis auch für Spiele außerhalb der Beliebt-Liste – ohne PC
### Verbessert
- Bild-Reihenfolge: echtes Steam-Bild, dann altes Steam-Bild, dann Microsoft-Store-Bild, erst dann Buchstaben

## 2.24.0 – 2026-10-20
### Neu
- Deal Radar ohne PC zeigt jetzt auch Steam-Preise: eine Steam-Preisliste der rund 3000 beliebtesten Spiele (Bestseller, meistgewünscht, neu, im Angebot) liegt neben der Website und wird alle 6 Stunden erneuert
### Behoben
- „Minecraft“ wurde im Microsoft Store als „Minecraft Legends“ erkannt (falscher Preis und falsches Bild) – jetzt zählt nur das Spiel selbst oder eine Edition davon („Minecraft: Java & Bedrock Edition“), auf PC und Handy
- Die Steam-Suche am PC nimmt kein ähnliches Spiel mehr (vorher wurde aus „Minecraft“ „Minecraft Dungeons“); gibt es ein Spiel bei Steam nicht, steht das dabei

## 2.23.0 – 2026-10-20
### Neu
- Design-Profil (optional): Benutzername + Passwort nehmen dein Design (Farben, Hintergrund, Startseite, Leiste, Sprache) in einen neuen Browser mit – Ende-zu-Ende verschlüsselt, gespeichert auf deinem PC; Änderungen werden automatisch gesichert
- Design-Code: das Design ganz ohne Konto und ohne PC in einen anderen Browser kopieren
- Fenster-Layouts ohne PC anlegen: je Programm einen Platz (Hälfte, Viertel, maximiert, Mitte) und den Monitor wählen, mit kleiner Vorschau
- Neun neue Widgets für Startseite und Game-Overlay: Zähler, Pausen-Erinnerung, Spielzeit heute, Ping, Aktive Ziele, Level & XP, Deals, Controller-Akku, Zufallsspiel
### Verbessert
- Deal Radar am Handy: ohne PC prüft das Handy die Xbox-Preise selbst beim Microsoft Store (auch gleich nach dem Hinzufügen); Steam-Preise bleiben vom letzten Abgleich am PC

## 2.22.0 – 2026-10-20
### Neu
- Trophäenraum: die GameQuest-Erfolge als Trophäen in Gold-, Silber- und Bronze-Regalen – freigeschaltete mit Datum, gesperrte mit Fortschritt
- Gamer-Pass: Profilkarte mit Level, XP, Stunden, Spielen, Serie, Trophäen und meistgespieltem Spiel; Name und Symbol frei wählbar, als Bild speichern oder teilen – auch ohne PC

## 2.21.0 – 2026-10-20
### Neu
- Startzeit-Analyse: je Spiel, wie lange es vom Tippen auf „Spielen“ dauert, bis das Spiel läuft – zuletzt, üblich, schnellster und langsamster Start, Verlauf und Hinweis, wenn Starts langsamer werden
### Verbessert
- Nach einem Start sucht der PC 3 Minuten lang jede Sekunde nach dem Spiel – „läuft“, Profilwechsel und Automatisierungen beim Spielstart kommen schneller

## 2.20.0 – 2026-10-20
### Neu
- Tastatur & Maus belegen (Windows): Tasten und Maustasten am PC umlegen – auf eine andere Taste, eine Tastenkombination (Strg/Shift/Alt/Win + Taste), eine Maustaste oder sperren. Profile für überall oder nur für bestimmte Spiele, umgeschaltet nach dem Programm im Vordergrund
- Anklickbare Tastatur (deutsches Layout) und Maustasten im Editor; „Am PC drücken“ übernimmt die Taste direkt von der echten Tastatur oder Maus
- Erkannte Tastaturen und Mäuse mit Namen; Royal Kludge und Attack Shark werden erkannt – die Belegung funktioniert mit jedem Gerät
- Notaus: Strg+Alt+F12 am PC schaltet alle Belegungen sofort aus und wieder an; auch per Knopf in der App
- Profile lassen sich ohne PC vorbereiten und werden beim Verbinden übertragen; im Backup enthalten

## 2.19.0 – 2026-10-20
### Neu
- Deal Radar: Spiel hinzufügen nur mit dem Namen – der PC findet es selbst im Steam-Shop; ohne PC wird der Name vorgemerkt und beim Verbinden gesucht
- Deal Radar: Steam-Wunschliste wird automatisch übernommen und bei jeder Prüfung abgeglichen (öffentliche Wunschliste nötig)
- Deal Radar: Preisvergleich mit dem Microsoft Store (Xbox) – günstigste kaufbare Edition, Hinweis „günstiger als Steam“ und Link zum Store
- Deal Radar übersichtlich als Kacheln: Originalbild des Spiels, darunter Xbox- und Steam-Preis (der günstigere grün); Antippen zeigt Preisverlauf, Zielpreis, Links und Kompatibilität. Einstellungen und genaue Suche sind eingeklappt
### Verbessert
- Spiele unter Steam, Game Pass, Epic und EA: die ganze Karte antippen startet das Spiel (installiert) bzw. öffnet die Installation – mit Ladeanzeige und Schutz gegen Doppeltippen; auch per Tastatur (Enter/Leertaste)
- Installierte Steam-Spiele, die noch nicht in der Bibliothek sind, werden beim Antippen hinzugefügt und gestartet
- Wunschliste fasst jetzt 300 Spiele
### Behoben
- Microsoft-Store-Vergleich nimmt keine Add-on-Pakete und keine Game-Pass-Mitgliederpreise als Spielpreis
- Änderungen ohne PC erscheinen sofort auf der offenen Seite, auch wenn die Verbindung erst währenddessen abreißt (vorher erst nach dem Neuladen)

## 2.18.0 – 2026-10-20
### Neu
- Mods: pro Spiel Mod-Ordner einstellen, Mods an/aus schalten, aus einer ZIP installieren (mit Vorschau, was überschrieben wird) und entfernen – vor jeder Änderung sichert der PC den Mod-Ordner, „Zurückholen“ stellt jeden Stand wieder her. Während das Spiel läuft, ist nichts änderbar
- Fenster-Layouts: Position und Monitor deiner Programmfenster speichern und mit einem Tipp wiederherstellen; fehlt ein Monitor, kommt das Fenster auf den Hauptmonitor
- Controller: Xbox-/XInput-Controller mit Akku-Stand, Live-Test für Tasten, Sticks (zeigt Drift) und Trigger, Vibrationstest
- RGB-Beleuchtung über OpenRGB: eine Farbe für alle Geräte oder einzeln, OpenRGB-Profile laden
- Neue Bausteine für Quick Actions und Automatisierungen: „Fenster-Layout anwenden“, „RGB-Farbe setzen“, „RGB-Profil laden“
### Verbessert
- Fenster-Layouts umbenennen und löschen geht auch ohne PC

## 2.17.0 – 2026-10-20
### Neu
- Installieren am PC (Einstellungen → Installation & Autostart): eigener Programmordner, Startmenü-Eintrag, optional Desktop-Symbol, Autostart und Eintrag in „Apps & Features“ – ohne Administrator und ohne extra Setup-Programm
- Deinstallieren aus der App oder über „Apps & Features“: entfernt Verknüpfungen, Autostart, Eintrag und Programmordner; Einstellungen und Daten bleiben auf Wunsch erhalten
### Verbessert
- Ein laufender Begleiter wird beim Deinstallieren über „Apps & Features“ von selbst beendet

## 2.16.0 – 2026-10-20
### Neu
- Abläufe mit Fortschritt: Jede Quick Action zeigt Schritt für Schritt, was erledigt ist, was gerade läuft und was fehlgeschlagen ist – auf allen Geräten. „Abbrechen“ stoppt vor dem nächsten Schritt (auch mitten in einer Wartezeit); nach einem Abbruch lässt sich ein gewechseltes Profil zurücksetzen
- „Läuft das auf meinem PC?“ für Steam-Spiele und die Wunschliste: Systemanforderungen aus dem Steam-Shop neben den echten Werten deines PCs; bewertet werden nur Arbeitsspeicher, Speicherplatz und Grafikspeicher – Prozessor und Grafikkarte zum selbst Vergleichen
- Push-Benachrichtigungen aufs Handy, auch bei geschlossener App (Termine, Abläufe, Aufnahmen, Updates …): vom PC selbst verschlüsselt, Kategorien wählbar, Test-Knopf. iPhone/iPad: App auf dem Home-Bildschirm
### Verbessert
- Benachrichtigungen lassen sich auch nach „Kalender“ filtern
- Dieselbe Quick Action startet nicht doppelt, solange sie noch läuft

## 2.15.0 – 2026-10-20
### Neu
- Dateien zwischen Handy und PC (neuer Bereich „Dateien“): senden bis 200 MB pro Datei, vom PC aufs Handy holen oder teilen, Dateien „offline behalten“. Ohne PC wartet eine Datei auf dem Gerät und wird beim Verbinden automatisch gesendet. Am PC landet alles in Downloads\Nexus Gaming Hub; der PC öffnet empfangene Dateien nie selbst, Windows warnt vor dem Ausführen
- Aufnahmen: Screenshots und Clips von Windows, Xbox Game Bar, Steam, NVIDIA und OBS an einem Ort – nach Spiel, Tag oder Ordner, mit Suche, Favoriten und Schlagwörtern, Vorschau und Abspielen am Handy, Löschen in den Papierkorb. Ohne PC bleiben Liste und gesehene Vorschaubilder auf dem Gerät; Favoriten und Schlagwörter werden vorgemerkt
- Speicher & Updates: Laufwerke, Größe jedes Spiels und Update-Stand der Steam-Spiele (Update ausstehend mit Größe, wird aktualisiert, pausiert, Dateien beschädigt) – auch ohne PC mit dem letzten Stand. Launcher ohne lesbaren Update-Stand werden ehrlich als „unbekannt“ angezeigt
### Verbessert
- Steam-Spiele zeigen ihre Größe sofort (aus Steams eigener Angabe), ohne den Ordner zählen zu müssen

## 2.14.0 – 2026-10-20
### Neu
- Gaming-Kalender: Raids, Turniere, LAN-Partys und Releases mit Wiederholung, Erinnerung und Spiel-Start-Knopf; Monatsansicht, „Demnächst“, Home-Widget „Termine“; Export/Import als .ics (Google, Apple, Outlook). Funktioniert auch ohne PC – Termine werden beim Verbinden übertragen
- Erinnerungen an Termine: am PC als Benachrichtigung (auch in der App), auf dem Handy auch ohne PC, solange die App offen ist
- „Mein Status“: Verfügbar, Beschäftigt, Abwesend, Nicht stören, Unsichtbar – mit Text, Dauer und dem laufenden Spiel vom PC. Bleibt bei deinen Geräten (nichts geht ins Internet); für Geräte mit Leserechten nur, wenn du es freigibst. Auch ohne PC änderbar
### Verbessert
- Statt großer Banner zeigt eine schmale Leiste oben „Offline“ und wartende Änderungen; Details zum Aufklappen
- Neue Widgets „Mein Status“ und „Termine“ erscheinen einmalig auch in bestehenden Home-Layouts (ausgeblendet bleiben sie ausgeblendet)

## 2.13.0 – 2026-10-20
### Neu
- Original-Logos für Steam- und Epic-Spiele: Der PC liest das Symbol direkt aus der Spieldatei (z. B. RocketLeague.exe) – genau das Logo des Spiels, auch für schon vorhandene Spiele (einmalig im Hintergrund). Installer, Crash-Handler, Anti-Cheat- und Redist-Dateien werden dabei übersprungen
### Behoben
- Ließ sich ein Cover nicht laden (z. B. ohne Internet), zeigte eine Deck-Taste ein kaputtes Bild – jetzt erscheint das Logo bzw. ein Spiel-Symbol; ebenso auf den App-Kacheln

## 2.12.0 – 2026-10-20
### Neu
- 50 Spiele-Logos dazu (jetzt 106 Logos): u. a. Minecraft, Apex Legends, Call of Duty, Rocket League, Genshin Impact, Among Us, Terraria, Stardew Valley, Hearthstone, Destiny 2, Warframe, Fall Guys, Forza, Skyrim, Hollow Knight & Silksong, Cuphead, Balatro, Subnautica, No Man's Sky, EA SPORTS FC, Honkai: Star Rail, Zenless Zone Zero, Half-Life, DOOM, Xbox, Game Pass, Nintendo, Steam Deck, osu!, The Finals
- Logo-Auswahl im Deck mit Suche („mine“ → Minecraft) und getrennt nach Spielen sowie Programmen & Plattformen
- Wählst du für eine Taste ein Spiel oder Programm, bekommt sie automatisch dessen Logo bzw. Cover (solange du kein eigenes Aussehen gewählt hast)
### Verbessert
- Ohne PC steht bei „Spiel oder Programm“ jetzt, dass die Spiele nach dem ersten Verbinden erscheinen (statt „Bibliothek ist leer“)
- Lizenzangaben der Logos in der App und in docs/LIZENZEN.md

## 2.11.0 – 2026-10-20
### Neu
- 19 neue Plugins im Katalog (jetzt 33): Wochenstatistik, „Was spiele ich?“ (Zufallsspiel mit Start), Weiterspielen, Tageslimit, Spiel-Serie, Spielzeit-Meilensteine, GPU-Temperatur-Ampel, RAM-Wächter, Speicherplatz, Leistung pro Spiel, Bibliothek in Zahlen, Zufallssound, Fokus-Timer (Pomodoro), Weltzeit-Uhr, Wettkampf-Modus (Aktionen), Clip-Knöpfe für OBS (Aktionen), Pastell-, E-Sport- und OLED-Themes
- Programme: Bearbeiten wie am Handy – lange auf ein Symbol drücken oder „Bearbeiten“ oben, dann ein Symbol antippen
### Verbessert
- Wiederverbinden nach dem Einschalten des PCs meist in ~0,3 s (vorher bis 3,8 s): Solange die App offen ist, prüft sie alle 0,5 s mit einer winzigen Anfrage, ob der PC wieder da ist – Browser bremsen wiederholte Verbindungsversuche sonst aus
- Nichts springt mehr beim Öffnen: Home, Soundboard und Assistent zeigen kurz Platzhalter in der richtigen Größe, bis der PC antwortet (vorher rutschten Kacheln nach unten, während man tippen wollte)
- Meldungen erscheinen am Handy klein oben statt über Knöpfen, Chat und Leiste; Antippen schließt sie
- Kopfzeile nicht mehr durchscheinend – darunter gescrollter Text überlagert den Titel nicht mehr
### Behoben
- Hervorgehobene Knöpfe (z. B. „Deck aus meinen Sachen erstellen“, „Fertig“) wurden nach dem Antippen am Handy dunkel mit unlesbarer Schrift
- Spiel-Cover hoben sich am Handy nach dem Antippen an und blieben verschoben (Maus-Effekte gelten jetzt nur noch mit Maus)
- Drei-Punkte-Knöpfe lagen über den Programm-Symbolen

## 2.10.0 – 2026-10-19
### Neu
- KI-Assistent richtet die App per Auftrag ein – auch ohne PC, 0 €, direkt auf dem Gerät: Design hell/dunkel, Farben, Hintergrund, Schriftgröße, Animationen, untere Leiste (hinzufügen, entfernen, farbig/schlicht; ist sie voll, fragt er, welchen Platz er ersetzen soll), Home-Widgets ein-/ausblenden, Bereiche im Menü ausblenden, Sprache, Profil-Designs
- Jede Änderung erscheint als Knopf, wird erst beim Tippen übernommen und lässt sich mit „Rückgängig“ zurücknehmen

## 2.9.0 – 2026-10-19
### Neu
- Echte Logos: Discord, OBS, Spotify, Steam, Epic, EA, Battle.net, Twitch, YouTube, Valorant, Browser und gut 40 weitere Programme zeigen ihr Logo in der Markenfarbe – auf den App-Kacheln, im Deck (neuer Reiter „Logo“ im Tasten-Editor) und auch ohne PC
- Der PC liest jetzt auch die Symbole von Startmenü- und Store-Apps (z. B. Minecraft Launcher, Spotify aus dem Store) und ergänzt sie einmalig für schon vorhandene Programme
- Untere Leiste und Menü: Symbole „Farbig“ oder „Schlicht“ (wie früher) wählbar – beim Anpassen der Leiste oder unter Einstellungen → Navigation
### Verbessert
- Deck-Tasten und App-Kacheln im Glanz-Look (Licht von oben, Tiefe unten); „Aus meinen Sachen erstellen“ nutzt kräftige Farben und Logos statt Grau
### Behoben
- Deck ohne PC: Ein neues Deck wurde zwar für den PC vorgemerkt, aber auf dem Handy nicht angezeigt („Noch kein Deck“) – jetzt sofort sichtbar und bearbeitbar
- Grau dargestellte 🎵-Taste aus dem ersten Deck wird als farbiges Symbol gezeigt

## 2.8.0 – 2026-10-19
### Neu
- KI-Assistent ohne PC: Hilfe-Modus direkt im Browser (0 €, ohne Internet) – beantwortet Fragen zur App aus derselben Wissensbasis wie der PC-Assistent, öffnet Seiten („Öffne das Deck“), kennt die zuletzt vom PC geladenen Spiele und den Backlog; Starten, Live-Werte und Sounds brauchen den PC – das sagt er ehrlich
- Spiele: Cover antippen startet das Spiel sofort am PC (Drehsymbol, dann „… wird gestartet“); Programme als App-Symbole wie auf dem Handy – antippen startet, drei Punkte öffnen die Einstellungen, grüner Punkt = läuft
- Home: neue Widgets Medien & Lautstärke, Stoppuhr & Countdown, Mini-Deck; Favoriten/Zuletzt gestartet als antippbare App-Kacheln
- Widget-Baukasten: neue Bausteine Symbol und Stoppuhr/Countdown, Knöpfe auch für Medientasten und „Seite öffnen“
- Overlay: zusätzlich Mini-Deck, Medien, Timer, Uhr, Notizen und „Als Nächstes spielen“ hinzufügbar
### Verbessert
- Farbige Symbole in Navigation, „Mehr“-Menü und unterer Leiste statt grau
- Deck und eigene Widgets teilen sich jetzt einen Ausführungsweg für Tasten (gleiches Verhalten überall)

## 2.7.0 – 2026-10-19
### Neu
- Deck (wie ein Stream Deck auf dem Handy): Raster großer, frei gestaltbarer Tasten – Spiel/Programm starten, Quick Action, Sound, alle Sounds stoppen, Profil wechseln, Medientasten (Play/Pause, Lauter, Leiser, Ton aus), Overlay, Aufnahme, Replay, Ordner und Seiten der App
- Deck: Symbol, Emoji, Bild des Spiels oder eigenes Bild je Taste, Farben, Beschriftung; mehrere Decks und Seiten, Raster 2–8 × 2–10, Hoch- und Querformat (Spalten/Zeilen getauscht), Vollbild, Bildschirm anlassen, eigener Hintergrund, automatisch passendes Deck beim aktiven Gaming-Profil
- Deck: „Aus meinen Sachen erstellen“ legt ein erstes Deck aus Favoriten, Programmen, Quick Actions, Sounds und Profilen an; laufende Spiele, spielende Sounds und das aktive Profil leuchten auf der Taste
- Deck wird auf dem PC gespeichert (alle Geräte gleich, im Backup); Tasten nutzen die vorhandenen Befehle mit den Rechten des Geräts; ohne PC gestaltbar
- Home: neue Widgets Schnellstart, Uhr & Datum, Notizen, „Als Nächstes spielen“ (Backlog) und „Erste Schritte“; ohne PC zeigt Home nur, was ohne PC funktioniert, statt leerer Felder; „Anpassen“ geht jetzt auch ohne PC
- Untere Leiste am Handy: neues schwebendes Design, bis zu 4 eigene Bereiche plus „Mehr“, bearbeiten durch langes Drücken oder „Mehr“ → „Leiste anpassen“; „Verbinden“ nur noch, solange kein PC gekoppelt ist
### Verbessert
- Home zeigt den Offline-Hinweis nur noch einmal (vorher dreifach)

## 2.6.0 – 2026-10-19
### Neu
- Backlog (Dashboard → Backlog): Status (Noch spielen, Als Nächstes, Gerade aktiv, Pausiert, Durchgespielt, Nicht mehr interessant), Priorität, eigenes Ziel in Stunden mit Fortschritt aus dem Gaming-Verlauf, Filter nach Status/Plattform/Kategorie/Spielzeit, Sortierung, Zufallsauswahl (optional nach Priorität gewichtet), Export als JSON/CSV, Import mit Vorschau; nichts wird automatisch als durchgespielt markiert
- Themes je Spiel über Gaming-Profile: Ein Profil kann eigene Farben und ein Hintergrundbild haben – startet ein zugeordnetes Spiel, zeigen PC, Handy und iPad dieses Theme, danach wieder das eigene Design; pro Gerät abschaltbar
- GameQuest: 9 Launcher-Erfolge (eigenes Profil, Gerät gekoppelt, Automatisierungen, Quick Actions, Sounds, eigenes Widget, Profil-Theme, Backlog durchgespielt), abschaltbar, gezählt nur beim Öffnen der Seite
- Statistik-Karte (Gaming-Verlauf): Zusammenfassung für 7 Tage, Monat, Jahr oder alles mit Vergleich zum vorherigen Zeitraum, Inhalte wählbar, Hoch- oder Querformat, als Bild (PNG) oder Daten (CSV/JSON) speichern – nur lokal, fehlende Werte werden weggelassen
### Verbessert
- Grundlage für die nächsten Ausbaustufen: Funktionsmatrix gegen den Code (docs/PLAN-ADVANCED.md) und Messwerte vorher/nachher (docs/PERFORMANCE.md)

## 2.5.1 – 2026-10-19
### Verbessert
- Hauptfunktion geprüft – Handy einmal koppeln, danach automatisch verbunden, Programme am PC starten: im Test 31–175 ms vom Tippen bis das Programm am PC läuft, 0,5 s vom Öffnen der App bis zum laufenden Programm, keine erneute Kopplung nach Schließen des Browsers oder Neustart des PCs
- Schnelleres Wiederverbinden: Solange die App auf dem Bildschirm ist, versucht sie es höchstens alle 3 s (vorher bis 15 s) – nach dem Einschalten des PCs im Test nach 0,8–1,4 s wieder verbunden; ein Tippen auf „Spielen“ ohne Verbindung startet sofort einen neuen Verbindungsversuch (der Start selbst wird nie aufgehoben und später ausgeführt)
- Gerät koppeln am PC: Ist der Autostart aus, wird er mit einem Klick angeboten – sonst ist der PC nach einem Neustart für das Handy nicht erreichbar
### Neu
- Der PC meldet, wenn der Router ihm eine neue WLAN-Adresse gegeben hat (gekoppelte Handys suchen ihn sonst unter der alten), mit Lösung: QR-Code neu scannen, feste IP im Router; dieselbe Ursache steht auf dem Handy bei „PC nicht erreichbar“

## 2.5.0 – 2026-10-19
### Neu
- Update-Wächter: Stürzt eine neu installierte Version zweimal ab, bevor sie eine Minute stabil lief, startet der Begleiter beim nächsten Start von selbst wieder die letzte stabile Version und meldet das; normales Beenden und Herunterfahren zählen nie als Absturz. Die Update-Zentrale zeigt den Zustand
- Benachrichtigungen bleiben gespeichert (30 Tage, höchstens 200): „Offen“ und „Verlauf“, gelesen/ungelesen mit Punkt, Kategorien als Filter (Updates, Starts, Automatisierungen, Spielmodus, Plugins, GameQuest, Deal Radar, Aufnahme, Assistent, System), Verlauf löschen
- Ruhemodus während eines Spiels gilt jetzt auch für die Windows-Hinweise des PCs: dann nur noch Fehler
- Spielmodus für Programme (Profile → „Spielmodus: Programme schließen“): gewählte Programme werden beim Spielstart gebeten, sich zu schließen – wie ein Klick auf ihr X, nie hart beendet – und nach dem letzten Spiel wieder geöffnet; Vorschau zeigt, was gerade laufen würde; Windows-Prozesse, Spiele-Launcher, Anti-Cheat und der Begleiter sind gesperrt, das laufende Spiel wird nie angefasst
- Messwerte einzeln abschaltbar (PC Monitor → Messwerte): CPU, Arbeitsspeicher, Grafikkarte, Laufwerke – ausgeschaltet wird der Wert gar nicht erst gemessen (bei der Grafikkarte läuft dann kein nvidia-smi), auch nicht für Overlay, Spiel-Statistik und Assistent
### Verbessert
- Backup: Widgets, GameQuest, Deal Radar und die Spielmodus-Liste sind beim Einspielen einzeln abwählbar
- KI-Assistent kennt Update-Wächter, Spielmodus, Messwert-Schalter und den Benachrichtigungs-Verlauf
### Datenschutz
- docs/DATENSCHUTZ.md: neue Dateien `notifications.json`, `gamemode-programs.json`, `update-guard.json`; Benachrichtigungen liegen nicht mehr nur im Arbeitsspeicher

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
