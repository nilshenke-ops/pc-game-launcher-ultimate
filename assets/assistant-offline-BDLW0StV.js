import{t as n,aM as A}from"./index-y2T9H9hH.js";import{p as z,f as h,t as P,s as D}from"./knowledge-C1KMKmVX.js";import{p as C}from"./backlog-8dXDvUiE.js";import{o as v}from"./Assistant-CWa2ME3E.js";import"./react-DSLD3jH9.js";import"./plus-BIh_lnWq.js";import"./settings-2-BnTQiyIq.js";import"./mic-off-C6Un5ex4.js";import"./send-y8sNfd9W.js";import"./cpu-Ba29c9-y.js";const B=`# Wissen des Nexus-Assistenten

Format: Jeder Abschnitt beginnt mit „## Titel“. Eine Zeile „Seite: /pfad“ verknüpft ihn mit einer Seite der App, „Stichworte:“ hilft der Suche. Diese Datei ist die Quelle für den lokalen Assistenten und für Claude. Stand: Version 2.18.

## Was ist der Nexus Gaming Hub?
Stichworte: überblick app was kann programm begleiter companion webseite
Der Nexus Gaming Hub besteht aus drei Teilen:
- **Begleiter (Companion)** auf dem Windows-PC: eine EXE ohne Installation. Er startet Spiele und Programme, spielt Sounds ab, misst den PC, führt Automatisierungen aus und liefert die Web-App aus.
- **Web-App** für Handy, Tablet und PC: dieselbe Oberfläche überall, als Seite vom PC (im WLAN \`http://<PC-IP>:8787\`) oder als feste Webseite \`https://nilshenke-ops.github.io/pc-game-launcher-ultimate\`.
- **Relay** (optional): ein eigener Server für den Zugriff von unterwegs.
Alle Daten liegen auf dem PC. Keine Telemetrie, keine Werbung, kein Konto.

## Home / Dashboard
Seite: /
Stichworte: start übersicht widgets layout dashboard startseite home schnellstart notizen uhr erste schritte leiste untere leiste navigation anpassen
Die Startseite zeigt Widgets: laufendes Spiel, Favoriten, Quick Actions, PC-Werte, Soundboard, eigene Widgets und Plugin-Widgets, außerdem Schnellstart (große Kacheln zu Deck, Backlog, Assistent …; im „Anpassen“-Modus wählbar), Uhr & Datum, Notizen (nur auf dem Gerät), „Als Nächstes spielen“ (aus dem Backlog), „Mein Status“, „Termine“ (aus dem Kalender) und „Erste Schritte“. Ohne PC-Verbindung zeigt Home nur, was ohne PC funktioniert, und darunter, wie viele Widgets mit dem PC dazukommen. „Anpassen“ oben rechts: Widgets verschieben, Größe ändern, aus- und einblenden – geht auch ohne PC. Weitere Layouts (Handy und Desktop getrennt): Einstellungen → Design & Layout. Ein Profil kann ein Layout mitbringen. Untere Leiste am Handy: bis zu 4 eigene Bereiche plus „Mehr“; ändern durch langes Drücken auf die Leiste oder „Mehr“ → „Leiste anpassen“. „Verbinden“ steht nur in der Leiste, solange kein PC gekoppelt ist – danach zeigt der Punkt oben den Verbindungsstatus. Ohne PC zeigt eine schmale Leiste oben „Offline – kein PC verbunden“ und wie viele Änderungen auf den PC warten („Anzeigen“ öffnet die Liste); antippen klappt Details auf.

## Kalender
Seite: /calendar
Stichworte: kalender termin termine raid turnier lan party release erinnerung datum wiederholen ics google apple outlook
Gaming-Kalender: Raids, Turniere, LAN-Partys, Releases. „Neuer Termin“: Titel, ganztägig oder mit Uhrzeit und Dauer, Wiederholen (täglich, wöchentlich, monatlich, optional bis zu einem Datum), Erinnerung (zum Beginn bis 1 Tag vorher), Spiel (dann hat der Termin einen Start-Knopf), Farbe, Notiz. Monatsansicht, Tagesliste und „Demnächst“. Funktioniert ohne PC: Termine werden auf dem Gerät gespeichert und beim Verbinden übertragen; gespeichert auf dem PC, also auf allen Geräten gleich. Erinnerungen: der PC meldet sie als Benachrichtigung (auch in der App); auf dem Handy erscheinen sie, solange die App offen ist – auch ohne PC („Hinweise erlauben“ unter „Mehr“). Export/Import als .ics für Google-, Apple- oder Outlook-Kalender. Wöchentliche Termine bleiben über die Zeitumstellung zur selben Uhrzeit. Ändern braucht das Recht „Verwalten“.

## Dateien
Seite: /files
Stichworte: datei dateien übertragen senden schicken teilen upload download handy pc austausch ordner bild clip config offline behalten
Dateien zwischen Handy und PC über einen Austausch-Ordner am PC (Windows: Downloads\\Nexus Gaming Hub). „An den PC senden“ (mehrere Dateien, höchstens 200 MB pro Datei); ohne PC heißt der Knopf „Zum Senden vormerken“ – die Datei wartet auf dem Gerät (höchstens 500 MB zusammen) und wird beim Verbinden automatisch gesendet. „Auf dem PC“ zeigt den Ordner: Pfeil = aufs Gerät holen (am Handy über „Teilen“), Stecknadel = auf dem Gerät behalten (öffnet dann auch ohne PC), Papierkorb = am PC löschen. „Ordner am PC öffnen“ öffnet ihn im Explorer. Der PC öffnet oder startet empfangene Dateien nie selbst; unter Windows sind sie als „aus dem Internet“ markiert. Braucht das Recht „Verwalten“.

## Aufnahmen (Screenshots und Clips)
Seite: /captures
Stichworte: aufnahmen screenshot screenshots clip clips video replay galerie bilder obs nvidia game bar steam favorit schlagwort papierkorb
Alle Screenshots und Clips vom PC an einem Ort: Windows-Bildschirmfotos, Xbox Game Bar (Videos\\Captures), Steam-Screenshots, NVIDIA (Videos\\<Spiel>, nur Dateien erkannter Spiele – private Videos bleiben verborgen) und OBS (der Ordner kommt automatisch dazu, sobald OBS etwas speichert). Eigene Ordner am PC unter „Ordner“ hinzufügen. Filter Screenshots/Clips/Favoriten, Gruppen nach Spiel, Tag oder Ordner, Suche nach Name, Spiel und Schlagwort. Antippen öffnet das Bild bzw. lädt den Clip (bis 300 MB), „Aufs Gerät“ speichert ihn am Handy, „Papierkorb“ verschiebt ihn am PC in den Papierkorb (wiederherstellbar). Ohne PC: Liste und bereits gesehene Vorschaubilder bleiben auf dem Gerät; Favoriten und Schlagwörter werden vorgemerkt. Vorschaubilder liefert Windows selbst.

## Speicher & Updates
Seite: /storage
Stichworte: speicher speicherplatz festplatte ssd laufwerk voll größe spiel groß update updates patch ausstehend steam reparieren
Laufwerke mit freiem Platz, Größe jedes Spiels und Update-Stand. Steam meldet Größe und Update-Stand selbst (Aktuell, Update ausstehend mit Download-Größe, Wird aktualisiert, Pausiert, Dateien fehlen/beschädigt). Epic, EA und andere geben keinen lesbaren Update-Stand preis – dort steht ehrlich „Update-Stand unbekannt“. „Spielgrößen berechnen“ zählt die übrigen Ordner. Aktualisieren und Deinstallieren im jeweiligen Launcher. Ohne PC siehst du den letzten Stand.

## Läuft das auf meinem PC? (Kompatibilität)
Seite: /games
Stichworte: kompatibel kompatibilität läuft systemanforderungen mindestanforderungen empfohlen anforderungen hardware reicht mein pc kaufen
Bei Steam-Spielen (Spiel bearbeiten → „Läuft das auf meinem PC?“) und auf der Wunschliste im Deal Radar: Der PC fragt einmal den Steam-Shop nach den Systemanforderungen (Mindestens/Empfohlen) und vergleicht sie mit deinem PC. Automatisch bewertet werden nur Zahlen: Arbeitsspeicher, freier Speicherplatz und Grafikspeicher. Prozessor und Grafikkarte stehen daneben zum selbst Vergleichen – Namen lassen sich nicht zuverlässig einstufen. Das Ergebnis bleibt auf dem Gerät (auch ohne PC sichtbar) und am PC 7 Tage gespeichert.

## Installieren und Deinstallieren (Windows)
Seite: /settings
Stichworte: installieren installation setup startmenü desktop symbol deinstallieren entfernen apps features programme autostart smartscreen
Am PC: Einstellungen → Installation & Autostart → „Installieren“. Das Programm kommt nach %LOCALAPPDATA%\\Programs\\Nexus Gaming Hub, bekommt einen Startmenü-Eintrag (optional Desktop-Symbol), startet auf Wunsch mit Windows und erscheint in „Apps & Features“ – ohne Administrator. Danach startet es aus dem neuen Ordner neu; die heruntergeladene Datei kann gelöscht werden. Deinstallieren: dort oder in Windows unter „Apps & Features“ → Nexus Gaming Hub → Deinstallieren; Einstellungen und Daten bleiben, außer man wählt „auch Daten löschen“. Updates funktionieren wie vorher. Ohne Code-Signatur zeigt Windows beim ersten Start evtl. „Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“.

## Spielstart-Animation, bewegter Hintergrund, Übergänge, Atmosphären
Seite: /settings?s=design
Stichworte: ladebildschirm loading screen startanimation animation spielstart kino cinematic vorlage neon portal cyberpunk hologramm galaxie glitch hintergrund bewegt animiert partikel sterne raster übergang übergänge atmosphäre theme fire ice space glass
Einstellungen → Design & Layout. „Spielstart-Animation“: Ladebildschirm beim Spielstart an/aus, 8 Vorlagen, Dauer 1–8 s oder Schnellmodus (1,2 s), eigener Text, Bild des Spiels, „Vorschau“ (startet nichts). Der Startbefehl geht sofort an den PC; Antippen oder Esc überspringt. „Läuft auf dem PC“ steht erst da, wenn der PC das Spiel erkennt. „Bewegter Hintergrund“ (Partikel, Sternenflug, Neon-Raster, Wellen, Funken, Eiskristalle) mit Tempo, Menge, Deckkraft; „Seitenübergänge“ mit Dauer. Atmosphären (Cyberpunk, Neon, Space, Ice, Fire, Fantasy, Retro Arcade, Minimal Dark, Glass, Mono) stehen bei den Themes und setzen Farben, Hintergrund und Ladebildschirm zusammen. Bei „Animationen reduzieren“ oder leichter Darstellung: Standbild. Funktioniert ohne PC.

## Bibliothek: Raster, Liste, Holo
Seite: /games
Stichworte: ansicht holo hologramm karussell liste raster kacheln bibliothek spiele ansicht wechseln viele spiele
Oben bei den Spielen: „Raster“, „Liste“ oder „Holo“. Holo zeigt das gewählte Spiel groß in der Mitte mit Spielzeit und letztem Start (nur was der PC erfasst hat); weiter mit Pfeiltasten, Wischen, Mausrad, Schieberegler oder Tipp auf ein Nachbarspiel; Tipp auf die Mitte oder „Spielen“ startet. Die Ansicht bleibt gespeichert. Bei sehr vielen Spielen lädt Raster/Liste beim Scrollen nach.

## Gamer-Pass bearbeiten
Seite: /trophies
Stichworte: gamer-pass gamerpass karte profilkarte avatar bild titel rahmen hintergrund abzeichen badges lieblingsspiele farbe reihenfolge exportieren bild speichern
Im Trophäenraum: Name, Titel, Symbol oder eigenes Bild, Rahmen (Neon, Gold, Holo, Pixel), Hintergrund, Farbe, bis zu 3 Lieblingsspiele, bis zu 4 Abzeichen aus freigeschalteten Erfolgen, Bereiche ein-/ausblenden und umsortieren. Vorschau sofort, „Rückgängig“, „Zurücksetzen“, „Als Bild speichern“. Bleibt auf dem Gerät (und im Konto); nichts wird veröffentlicht.

## Dashboard (wenn der Gaming-Raum die Startseite ist)
Seite: /dashboard
Stichworte: dashboard übersicht widgets startseite zurück home
Das Dashboard mit allen Widgets. Ist der Gaming-Raum als Startseite gewählt, erreichst du es über den Knopf „Dashboard“ im Raum. Zurück zum Dashboard als Startseite: Gaming-Raum → „Raum bearbeiten“ → „Als Startseite verwenden“ ausschalten.

## Gaming-Raum
Seite: /room
Stichworte: gaming raum zimmer room startseite 2.5d deko dekoration poster regal lampe licht stil variante pc controller lautsprecher
Ein gezeichneter Raum: PC → Spiele, Poster (Lieblingsspiel) → Bibliothek, Regal → Backlog, Pokal → Trophäenraum, Lampe → Design, Lautsprecher → Soundboard, Controller → Deck. „Raum bearbeiten“: Varianten (bis 6), Stil (weitere werden im Fortschrittsbaum freigeschaltet), Lichtfarbe, Objekte ein-/ausblenden, Deko aus deinen Sammelstücken platzieren und verschieben (ziehen oder Pfeiltasten). „Als Startseite verwenden“ zeigt den Raum statt des Dashboards; das Dashboard bleibt über den Knopf „Dashboard“ erreichbar. Funktioniert ohne PC.

## Sammlung, Belohnungskisten, Fortschrittsbaum
Seite: /trophies?tab=collection
Stichworte: sammelstücke sammlung belohnung kiste lootbox fortschrittsbaum freischalten deko regal seltenheit
Im Trophäenraum unter „Sammlung & Fortschritt“. Fortschrittsbaum mit den Zweigen Level, Trophäen und Spielzeit (nur aus deinen echten Daten) – jeder Knoten gibt ein Sammelstück oder einen Raum-Stil. Pro erreichtem Level ab Level 2 eine Belohnungskiste: vorher siehst du alles, was drin sein kann, jedes gleich wahrscheinlich, nie doppelt, kein Echtgeld, keine Vorteile, kein Zeitdruck. Sammelstücke kannst du ins Regal stellen, verschieben und herausnehmen oder im Gaming-Raum als Deko nutzen. Sie sind getrennt von den echten Erfolgen.

## Mods
Seite: /mods
Stichworte: mod mods modding bepinex plugins zip installieren aktivieren deaktivieren entfernen sicherung backup zurück
Mods pro Spiel (für Spiele mit bekanntem Installationsordner): einmal den Mod-Ordner einstellen (Vorschläge wie „Mods“, „BepInEx/plugins“, „Content/Paks/~mods“). Dann Mods mit dem Schalter an/aus (ausgeschaltete liegen im Ordner „<Mods>.nexus-aus“ daneben), entfernen oder eine ZIP aus dem Austausch-Ordner (Bereich „Dateien“) installieren – vorher zeigt die App, was überschrieben würde. Vor jedem Installieren, Entfernen und Zurückholen sichert der PC den ganzen Mod-Ordner als ZIP (die letzten 5); „Zurückholen“ setzt ihn auf diesen Stand. Während das Spiel läuft, ist nichts änderbar. Nichts wird ausgeführt; eine ZIP, die außerhalb des Mod-Ordners schreiben will, wird ganz abgelehnt. Ohne PC siehst du den letzten Stand.

## Fenster-Layouts
Seite: /layouts
Stichworte: fenster layout monitor zweiter bildschirm anordnen position discord obs spotify maximiert
Am PC Fenster anordnen und „Aus offenen Fenstern“ tippen: die Position der gewählten Programme wird gespeichert (je Monitor). „Anwenden“ bringt alle offenen Fenster dorthin zurück – auch als Baustein „Fenster-Layout anwenden“ in Quick Actions und Automatisierungen (z. B. beim Spielstart). Programme werden nicht gestartet; fehlt ein Monitor, kommt das Fenster auf den Hauptmonitor. Ohne PC: „Neues Layout“ – je Programm einen Platz wählen (maximiert, linke/rechte/obere/untere Hälfte, Viertel, Mitte) und den Monitor (Hauptmonitor, Monitor 2 …); wird beim Verbinden übertragen und beim Anwenden für die Größe des Monitors berechnet. Bearbeiten und Löschen geht auch ohne PC. Programme mit Administratorrechten lassen sich von Windows aus nicht verschieben.

## Controller & RGB
Seite: /peripherals
Stichworte: controller gamepad xbox test tasten stick drift vibration akku rgb beleuchtung openrgb farbe profil led
Controller: Xbox- und XInput-kompatible Controller mit Akku-Stand, Live-Test (Tasten, Sticks, Trigger – zeigt Stick-Drift) und Vibrationstest. PlayStation/Switch nur über Steam Input oder DS4Windows. RGB: über das kostenlose OpenRGB (dort „SDK Server“ → „Start Server“). Eine Farbe für alle Geräte oder einzeln, OpenRGB-Profile laden – auch als Bausteine „RGB-Farbe setzen“ und „RGB-Profil laden“ in Quick Actions. Verbindung nur zu diesem PC oder einem Gerät im Heimnetz.

## Trophäenraum & Gamer-Pass
Seite: /trophies
Stichworte: trophäen trophäenraum erfolge gamer-pass profilkarte karte level xp teilen bild gold silber bronze
Die Erfolge aus GameQuest als Trophäen in drei Regalen: Gold (100 XP und mehr), Silber (50 XP), Bronze (25 XP); freigeschaltete mit Datum, gesperrte mit Fortschritt. Der Gamer-Pass ist eine Karte mit Level, XP-Balken, Stunden, Spielen, längster Serie, Trophäen und meistgespieltem Spiel – Name und Symbol frei wählbar (bleiben auf dem Gerät), „Als Bild speichern“ oder „Teilen“. Alles aus eigenen Daten; ohne PC wird der zuletzt geladene Stand gezeigt.

## Konto (Daten in einen anderen Browser mitnehmen)
Seite: /settings?s=design
Stichworte: profil konto benutzername passwort anmelden registrieren design übertragen neuer browser anderes handy sync design-code ohne email
Optional, ohne E-Mail. Personen-Symbol oben rechts neben der Glocke (oder Einstellungen → Design & Layout → „Konto“): „Registrieren“ mit Benutzername und Passwort, im anderen Browser „Anmelden“. Mit kommen Design, Startseite, Leiste, Sprache, Gamer-Pass, Zähler und Pausen-Erinnerung. Früher hieß das „Design-Profil“: „Neues Profil“ mit Benutzername und Passwort anlegen (PC muss verbunden sein); im neuen Browser nach dem Verbinden mit dem PC „Anmelden und Design laden“. Danach wird jede Design-Änderung automatisch ins Profil gespeichert. Verschlüsselt im Browser – der PC speichert nur verschlüsselte Daten, das Passwort verlässt das Gerät nie; Passwort vergessen = Design nicht wiederherstellbar (am PC unter Einstellungen löschbar). Ohne Konto und ohne PC: „Design-Code kopieren“ und im anderen Browser einfügen.

## Neue Widgets
Seite: /
Stichworte: widgets zähler tode pausen erinnerung spielzeit heute ping ziele level xp deals controller akku zufallsspiel overlay
Für Startseite und Game-Overlay: Zähler (z. B. Tode/Versuche, nur auf dem Gerät), Pausen-Erinnerung (vibriert nach 30/45/60/90 min Spiel), Spielzeit heute/diese Woche, Ping (misst der PC), Aktive Ziele, Level & XP, Deals (Zielpreis erreicht zuerst), Controller-Akku, Zufallsspiel (würfeln, Start nach Bestätigung). Hinzufügen: Startseite → Bearbeiten, oder im Overlay über „Widgets“.

## Startzeit-Analyse
Seite: /start-times
Stichworte: startzeit ladezeit dauer start langsam schnell analyse messen spiel startet warum lädt lange
Zeigt je Spiel, wie lange es vom Start in der App dauert, bis das Programm des Spiels am PC läuft: zuletzt, üblich (Median), am schnellsten, am langsamsten und den Verlauf der letzten 20 Starts. Hinweis, wenn die letzten Starts deutlich langsamer oder schneller wurden. Nach einem Start sucht der PC 3 Minuten lang jede Sekunde nach dem Spiel (auf etwa ±1 s genau; dadurch erscheint „läuft“ auch schneller). Gemessen wird bis der Prozess läuft, nicht bis zum Hauptmenü; nur Starts aus der App zählen.

## Tastatur & Maus belegen
Seite: /input
Stichworte: tastenbelegung tasten umbelegen umlegen remap tastatur maus royal kludge rk attack shark seitentaste maustaste caps lock windows-taste sperren profil spiel push-to-talk notaus
Tasten und Maustasten am PC umlegen (Windows-Begleiter): „Neues Profil“ → Name, „Gilt für“ (Überall oder bestimmte Spiele/Programme), dann eine Taste auf der Tastatur-Ansicht antippen (oder „Am PC drücken“ und die Taste an der echten Tastatur/Maus drücken) und festlegen, was sie wird: eine andere Taste, eine Tastenkombination (mit Strg/Shift/Alt/Win), eine Maustaste oder „Aus (sperren)“. Maus: rechte, mittlere und die beiden Seitentasten; die linke Maustaste ist nicht umlegbar. Spiel-Profile gelten nur, solange das Spiel im Vordergrund ist, und ergänzen das Profil „Überall“. Notaus: Strg+Alt+F12 am PC schaltet alles aus und wieder an. Gilt für alle Tastaturen und Mäuse gleichzeitig (auch Royal Kludge und Attack Shark – die werden am Namen erkannt); was die Hersteller-Software im Gerät speichert, bleibt. Keine Makros. Controller umlegen: über Steam Input. Profile lassen sich ohne PC vorbereiten (werden übertragen).

## Push-Benachrichtigungen
Seite: /notifications
Stichworte: push benachrichtigung handy geschlossen app zu erinnerung hintergrund iphone home bildschirm
Unter Benachrichtigungen → „Push auf diesem Gerät“: wichtige Meldungen vom PC kommen auch bei geschlossener App – z. B. Termin-Erinnerungen, fertige Abläufe, Aufnahmen, Updates. Kategorien wählbar, „Test senden“ prüft es. Geht nur über die Website mit https; auf iPhone/iPad nur, wenn die App auf dem Home-Bildschirm liegt (Teilen → „Zum Home-Bildschirm“, ab iOS 16.4). Der PC verschlüsselt jede Nachricht selbst; der Push-Dienst von Google, Apple, Mozilla oder Microsoft leitet nur weiter. Einschalten braucht einmal die Verbindung zum PC. Ein am PC entferntes Gerät bekommt keine Meldungen mehr.

## Mein Status (Aktivität)
Seite: /
Stichworte: status aktivität verfügbar beschäftigt abwesend nicht stören unsichtbar spielt gerade online freigabe
Widget „Mein Status“ auf Home: Verfügbar, Beschäftigt, Abwesend, Nicht stören oder Unsichtbar, dazu ein kurzer Text („Im Raid bis 22 Uhr“) und eine Dauer (danach wieder „Verfügbar“). Das laufende Spiel erkennt der PC selbst („Spielt Rocket League“, abschaltbar). Der Status bleibt bei deinen gekoppelten Geräten – nichts geht ins Internet oder an Discord. Standard: nur Geräte mit dem Recht „Verwalten“ sehen ihn; „Für Geräte mit Leserechten sichtbar“ zeigt ihn auch z. B. einem Familien-Tablet. „Unsichtbar“ verbirgt auch das Spiel. Ohne PC änderbar (die letzte Änderung wird übertragen).

## Deck
Seite: /deck
Stichworte: deck stream deck elgato tasten knöpfe raster fernbedienung buttons vollbild ordner tablet logo logos ohne pc
Raster großer Tasten wie ein Stream Deck auf dem Handy oder Tablet. „Deck aus meinen Sachen erstellen“ legt ein erstes Deck aus Favoriten, Programmen, Quick Actions, Sounds und Profilen an (mit Ordnern „Sounds“ und „Profile“). Jede Taste: Spiel/Programm starten, Quick Action, Sound abspielen, alle Sounds stoppen, Profil aktivieren oder zurück, Medientasten (Play/Pause, Lauter, Leiser, Ton aus), Overlay ein/aus, Aufnahme, Replay speichern, Ordner öffnen, Zurück oder eine Seite der App öffnen. Aussehen je Taste: Symbol, Emoji, Bild des Spiels oder eigenes Bild (wird verkleinert), Farbe, Schriftfarbe, Beschriftung. Bleistift = bearbeiten (Taste antippen zum Ändern, leeren Platz für neue Taste, „Verschieben“ und Zielplatz antippen). Zahnrad: Name, Raster (2–8 Spalten, 2–10 Zeilen; im Querformat getauscht), Hintergrund, Seiten, „Automatisch zeigen bei Profil“ (z. B. eigenes Deck, wenn ein Spiel läuft). Vollbild-Knopf, Sonne = Bildschirm anlassen (wenn der Browser das kann). Laufende Spiele, spielende Sounds und das aktive Profil leuchten auf der Taste. Gespeichert auf dem PC, also auf allen Geräten gleich; bearbeiten braucht das Recht „Verwalten“, Tasten nutzen die Rechte des Geräts. Ohne PC lässt sich ein Deck erstellen und gestalten (wird beim Verbinden übertragen), aber keine Taste ausführen. Logos: im Tasten-Editor unter „Logo“ 106 Logos mit Suche – Programme (Discord, OBS, Spotify, Steam, Epic, Twitch …) und Spiele (Minecraft, Apex Legends, Call of Duty, Rocket League, Valorant, Fortnite, Genshin Impact, Terraria …); die Taste bekommt die passende Farbe. Wählst du als Aktion ein Spiel, bekommt die Taste automatisch dessen Logo oder Cover. Für Spiele ohne Logo das Cover nehmen. Steam- und Epic-Spiele bekommen zusätzlich das Original-Symbol aus ihrer Spieldatei vom PC (Reiter „Cover“ bzw. automatisch beim Wählen des Spiels).

## Spiele (Bibliothek)
Seite: /games
Stichworte: spiele bibliothek starten steam epic ea xbox game pass hinzufügen cover favorit kategorie
Spiele von Steam, Epic, EA, Xbox/Microsoft Store und eigene EXE-Dateien. Hinzufügen: „Hinzufügen“ → erkannte Spiele übernehmen. Eine EXE kann nur **direkt am PC** freigegeben werden (Sicherheit: ein Handy darf keine beliebigen Programme freigeben). Pro Spiel: Favorit, Kategorien, Bewertung, Notiz, Startparameter, Prozessnamen zur Erkennung, Cover. Filter-Chips: Alle, Favoriten, Läuft, Steam, Epic, EA, Game Pass.
Starten: Cover antippen – das Spiel startet sofort am PC (kurzes Drehsymbol, dann „… wird gestartet“). Stift bzw. Stern auf dem Cover = bearbeiten bzw. Favorit. Spiele mit Administratorrechten zeigen die Windows-Abfrage am PC.


## Backlog
Seite: /backlog
Stichworte: backlog noch spielen als nächstes gerade aktiv pausiert durchgespielt nicht mehr interessant priorität zufall zufallsauswahl spielplanung liste ziel
Persönliche Spielplanung für Spiele aus der Bibliothek: Status (Noch spielen, Als Nächstes, Gerade aktiv, Pausiert, Durchgespielt, Nicht mehr interessant), Priorität (keine/niedrig/mittel/hoch), eigenes Ziel in Stunden mit Fortschritt aus dem Gaming-Verlauf. Filter nach Status, Plattform, Kategorie und Spielzeit; Sortierung nach Priorität, Name, zuletzt gespielt, Spielzeit. „Zufallsauswahl“ zieht ein Spiel aus gewählten Status (höhere Priorität optional öfter). Den Status setzt nur der Nutzer – nichts wird automatisch als durchgespielt markiert; läuft ein Spiel, wird „auf Gerade aktiv setzen“ nur angeboten. Gespeichert auf dem PC (alle Geräte sehen dasselbe, im Backup enthalten). Export als JSON und CSV, Import (JSON) mit Vorschau – Spiele, die es in der Bibliothek nicht gibt, werden übersprungen. Spiele, die man noch nicht besitzt: Wunschliste im Deal Radar.
## Steam verknüpfen
Seite: /games
Stichworte: steam api schlüssel key steam id bibliothek importieren spielzeit
Unter Spiele → Chip „Steam“: eigenen Steam-Web-API-Schlüssel und Steam-ID eintragen. Dann zeigt die App alle gekauften Spiele mit Spielzeit. Eine Karte antippen: installiert = das Spiel startet sofort (noch nicht in der Bibliothek → wird dabei hinzugefügt), nicht installiert = Steam öffnet die Installation. Der Schlüssel wird nur verschlüsselt (Windows-DPAPI) auf dem PC gespeichert und nie angezeigt oder ins Backup geschrieben.

## Game Pass
Seite: /games
Stichworte: xbox game pass katalog abo
Chip „Game Pass“ zeigt den öffentlichen Katalog (Markt einstellbar). Muss in den Einstellungen eingeschaltet sein. Ob du ein Abo hast, kann die App nicht prüfen. Karte antippen: installiert = starten, sonst öffnet die Xbox-App die Installationsseite.

## Programme
Seite: /programs
Stichworte: programme apps discord browser obs starten freigeben
Wie Spiele, aber für Programme (Discord, Browser, OBS …), angezeigt als App-Symbole wie auf dem Handy: Symbol antippen startet das Programm am PC; lange drücken (oder „Bearbeiten“ oben und dann antippen) öffnet die Einstellungen. Ein grüner Punkt heißt: läuft gerade. Bekannte Programme (Discord, OBS, Spotify, Steam, Browser …) zeigen ihr echtes Logo, auch ohne PC; andere bekommen das Programmsymbol vom PC (auch Startmenü- und Store-Apps wie der Minecraft Launcher, ab Version 2.9 auch für schon vorhandene Einträge). Freigabe einer EXE nur am PC.

## Quick Actions
Seite: /quick
Stichworte: quick action schnellaktion mehrere schritte ein tipp makro ablauf
Eigene Ein-Tipp-Aktionen aus mehreren Schritten, z. B. „Discord öffnen + Profil Streaming + Sound“. Bausteine: Programm/Spiel starten, Profil aktivieren, Sound abspielen, Medientaste, Overlay, Aufnahme/Replay, Benachrichtigung, Warten (Sekunden), „nur wenn läuft / nur wenn nicht läuft“. Optional „Vor dem Ausführen nachfragen“, Favorit, auf dem Dashboard zeigen. Einer Quick Action kann ein Hotkey zugewiesen werden. Abläufe (Szenen): Oben auf der Seite „Abläufe“ siehst du jeden Schritt einer laufenden Quick Action (erledigt, läuft, Fehler, übersprungen) auf allen Geräten; „Abbrechen“ stoppt vor dem nächsten Schritt und unterbricht auch eine Wartezeit sofort. Schon erledigte Schritte bleiben erledigt; hat der Ablauf das Profil gewechselt, bringt „Profil zurücksetzen“ das vorherige zurück. Dieselbe Quick Action läuft nicht zweimal gleichzeitig.

## Widget-Baukasten
Seite: /widgets
Stichworte: eigene widgets baukasten editor desktop widget uhr knopf gestalten
Eigene Widgets frei gestalten: Texte, Uhr, Werte (CPU, RAM …), Knöpfe für Aktionen (auch Medientasten und „Seite öffnen“), Symbole, Stoppuhr oder Countdown, Bilder, Formen. Gestalten geht auch ohne PC – gespeichert wird, sobald der PC wieder verbunden ist. Verwendbar auf dem Dashboard, im Overlay und als Fenster auf dem Windows-Desktop. Auf dem Windows-Start- oder Sperrbildschirm geht das nicht – Windows erlaubt dort keine fremden Widgets.

## Gaming-Profile
Seite: /profiles
Stichworte: profil competitive streaming wechsel automatisch audio layout theme farben je spiel design
Ein Profil bündelt Audio-Ausgabe, Soundboard-Lautstärke und -Sammlung, Programme, Quick Actions, Hotkeys und Dashboard-Layout. „Automatischer Wechsel“: Startet ein Spiel, das einem Profil zugeordnet ist, wird das Profil aktiv; endet es, kehrt die App zum vorherigen zurück. Eigenes Theme je Profil (Profil bearbeiten → „Eigenes Theme für dieses Profil“: Modus, Haupt-, Akzent-, Hintergrundfarbe, optional Hintergrundbild): Solange das Profil aktiv ist, zeigen PC, Handy und iPad diese Farben – so bekommt jedes Spiel sein Theme, wenn es einem Profil zugeordnet ist. Danach kommt das eigene Design zurück. Auf jedem Gerät abschaltbar: Einstellungen → Design → „Themes der Gaming-Profile anzeigen“.


## Spielmodus: Programme beim Spielen schließen
Seite: /profiles
Stichworte: spielmodus programme schließen beenden chrome discord browser hintergrund ressourcen wieder öffnen gaming modus
Unter Profile → „Spielmodus: Programme schließen“ trägst du Programme ein (z. B. chrome, Discord). Startet ein Spiel, werden sie gebeten, sich zu schließen – wie ein Klick auf ihr X, nie hart beendet. Fragt ein Programm nach dem Speichern oder hat es kein Fenster (nur im Infobereich), bleibt es offen und es kommt eine Benachrichtigung. Wenn das letzte Spiel endet, werden die geschlossenen Programme wieder gestartet (abschaltbar; offene Tabs stellt nur das Programm selbst wieder her). Nicht eintragbar: Windows-Prozesse, Spiele-Launcher (Steam, Epic, EA, Battle.net …), Anti-Cheat und der Begleiter. Das laufende Spiel wird nie geschlossen. Die Vorschau zeigt, was gerade laufen würde. Einstellen nur mit Admin-Recht. Nur im Windows-Begleiter.
## Automatisierungen
Seite: /automations
Stichworte: automatisierung wenn dann regel auslöser trigger spielstart
Wenn-Dann-Regeln, die der Begleiter selbst ausführt. Auslöser: Spiel startet/endet, Profil gewechselt, Audiogerät fehlt, Begleiter gestartet, Update fehlgeschlagen u. a. Schutz vor Endlosschleifen, Drosselung und Erkennung widersprüchlicher Regeln sind eingebaut. Die letzten 10 Ausführungen stehen bei jeder Regel.

## Hotkeys & Makros
Seite: /hotkeys
Stichworte: hotkey tastenkürzel tastenkombination global medientasten makro belegt
Globale Tastenkombinationen am PC, funktionieren auch im Spiel. Aktion: eine Quick Action, ein Sound, ein Profil, eine Medientaste u. a. Status „bereits belegt“ heißt: ein anderes Programm nutzt die Kombination. Von Windows reservierte Kombinationen werden abgelehnt. Makros, die Spiel-Eingaben automatisieren (Tasten spammen, Auto-Bauen, Waffenwechsel), gibt es bewusst nicht – das verstößt gegen die Regeln der meisten Spiele und kann zum Bann führen.

## Soundboard
Seite: /soundboard
Stichworte: soundboard sound abspielen myinstants import sammlung lautstärke wiederholen discord
Sounds werden auf dem PC abgespielt. Import: Datei hochladen (MP3, WAV; OGG braucht unter Windows einen Codec) oder Link (z. B. MyInstants mit öffentlichem MP3). Pro Sound: Name, Lautstärke, Farbe, Wiederholen, Hotkey. Sammlungen gruppieren Sounds; ein Profil kann eine Sammlung aktivieren. „Alle stoppen“ beendet alles. Abspielmodus: überlagern oder ersetzen, maximale Anzahl gleichzeitig.

## Audio Center und Discord
Seite: /audio
Stichworte: audio ausgabe gerät mikrofon durchleitung discord virtuelles kabel vb cable mithören testton echo
Ausgabegerät für das Soundboard, Mithören (Monitoring) auf Kopfhörer, Mikrofon-Durchleitung. Damit andere im Discord-Sprachkanal deine Sounds hören: VB-Audio Virtual Cable installieren, Soundboard-Ausgabe = „CABLE Input“, Mikrofon-Durchleitung an (echtes Mikrofon wählen), in Discord Eingabegerät = „CABLE Output“. Hinweis: Dieser Weg wurde nicht in einer echten Discord-Runde getestet. Die App kann nicht feststellen, ob Discord das Kabel wirklich nutzt.

## Discord einrichten: Sounds für andere hörbar machen
Seite: /audio
Stichworte: discord einrichten soundboard sprachkanal andere hören freunde mikrofon kabel
1. VB-Audio Virtual Cable installieren (kostenlos, vb-audio.com), PC neu starten.
2. Audio Center: Soundboard-Ausgabe = „CABLE Input“, „Mithören“ auf deine Kopfhörer.
3. Audio Center: Mikrofon-Durchleitung an und dein echtes Mikrofon wählen – sonst hört man dich nicht mehr.
4. Discord → Einstellungen → Sprache & Video: Eingabegerät = „CABLE Output“. Rauschunterdrückung ggf. aus, sonst werden Sounds weggefiltert.
Prüfen: Discord „Mikrofon testen“. Hinweis: nicht in einer echten Discord-Runde getestet; die App sieht nicht, ob Discord das Kabel nutzt.

## PC Monitor
Seite: /monitor
Stichworte: cpu ram gpu temperatur auslastung speicher festplatte vram leistung monitor fps messwerte ausschalten abschalten
Live-Werte: CPU-Auslastung, RAM, GPU-Auslastung, Laufwerke, Netzwerk, Energie. VRAM und GPU-Temperatur nur mit NVIDIA. CPU-Temperatur meist nicht verfügbar (Windows bietet ohne Treiber keine Quelle). FPS werden nicht gemessen – dafür bräuchte es einen Frame-Capture-Dienst. Werte werden nur abgefragt, solange die Seite oder ein System-Widget sichtbar ist. Unter „Messwerte“ (unten auf der Seite, Recht „Verwalten“) lässt sich jeder Wert einzeln ausschalten: CPU, Arbeitsspeicher, Grafikkarte, Laufwerke. Ausgeschaltet wird er gar nicht erst gemessen – auch nicht für Overlay, Spiel-Statistik und Assistent; bei der Grafikkarte spart das am meisten (kein nvidia-smi).

## Netzwerkdiagnose (Ping Doctor)
Seite: /network
Stichworte: ping jitter paketverlust lag latenz internet server router verbindung qualität
Ping, Jitter und Paketverlust zu Router, Internet (Cloudflare 1.1.1.1, Google 8.8.8.8) und bis zu 3 eigenen Zielen (z. B. Spiel-Server, wenn du die Adresse kennst). Gemessen vom PC, alle 2 Sekunden, nur solange die Seite offen ist. Bewertung: Ausgezeichnet bis Schlecht nach Faustregeln. Viele Router und manche Server beantworten keinen Ping – das erscheint als Verlust, obwohl alles geht.

## Gaming-Verlauf
Seite: /history
Stichworte: verlauf spielzeit statistik sitzungen gespielt startfehler statistik-karte bild teilen zusammenfassung jahresrückblick
Erkannte Spielsitzungen mit Dauer, optional CPU/RAM/GPU-Mittelwerte, Starts und Startfehler. Abschaltbar; „Verlauf löschen“ löscht alles. Bleibt auf dem PC. „Statistik-Karte“: gestaltete Zusammenfassung für 7 Tage, Monat, Jahr oder alles (Spielzeit, Sitzungen, meistgespielte Spiele, längste Sitzung, Auslastung falls gemessen, Vergleich mit dem vorherigen Zeitraum, Level/Erfolge), Hoch- oder Querformat, Inhalte wählbar; speichern als Bild (PNG) oder Daten (CSV/JSON). Wird nur auf dem Gerät erstellt, nie veröffentlicht; fehlende Werte werden weggelassen.

## GameQuest
Seite: /quests
Stichworte: quest ziele xp level erfolge achievements match sieg niederlage statistik
Eigene Ziele (Spielzeit, Sitzungen, Siege, Matches; täglich, wöchentlich, einmalig; ein Spiel oder alle) mit XP und Level, 8 Spiel-Erfolge plus 9 Launcher-Erfolge (eigenes Profil, Gerät gekoppelt, 3 Automatisierungen, 3 Quick Actions, 10 Sounds, eigenes Widget, Profil-Theme, 1 und 5 Spiele im Backlog durchgespielt; abschaltbar unter „Erfolge“, gezählt nur beim Öffnen der Seite), Match-Tagebuch mit Siegquote. Spielzeit und Sitzungen kommen automatisch aus der Spielerkennung, Siege und Matches nur aus eigenen Einträgen – die App liest keine Statistiken aus Spielen. XP: täglich 20, wöchentlich 60, einmalig 100 pro erreichtem Ziel. Level L braucht insgesamt 50·L·(L−1) XP.

## Deal Radar
Seite: /deals
Stichworte: deal preis angebot sale rabatt wunschliste zielpreis steam günstig xbox microsoft store vergleich hinzufügen name
Ohne PC prüft das Handy die Xbox-Preise selbst beim Microsoft Store („Xbox-Preise prüfen“, auch gleich nach dem Hinzufügen); Steam-Preise ohne PC kommen aus der Steam-Preisliste der Website (rund 3000 beliebte Spiele, alle 6 Stunden erneuert, nur Shop-Land DE) – Steam erlaubt keine Abfrage direkt aus dem Browser; seltene Spiele prüft der PC beim Verbinden. Zuordnung nur zum Spiel selbst oder einer Edition („Minecraft“ wird nicht „Minecraft Legends“). Wunschliste als Kacheln: Originalbild des Spiels, darunter der Preis bei Xbox (Microsoft Store) und bei Steam, der günstigere grün. Kachel antippen = Details mit Preisverlauf, Zielpreis, Links zu den Shops und „Läuft das auf meinem PC?“; dort „Bearbeiten“ für Zielpreis und Notiz. Einstellungen (Preisabfrage, Xbox-Vergleich, Steam-Wunschliste, Shop-Land) sind unten eingeklappt. Zum Hinzufügen reicht der Name des Spiels („Spiel hinzufügen“) – der PC sucht es im Steam-Shop; ohne PC wird der Name vorgemerkt und beim Verbinden gesucht. „Genauer suchen“ zeigt Treffer zur Auswahl. Mit „Steam-Wunschliste automatisch übernehmen“ holt der PC bei jeder Prüfung deine Steam-Wunschliste (sie muss öffentlich sein). „Auch im Microsoft Store (Xbox) vergleichen“ zeigt zusätzlich den Preis aus dem Katalog der Xbox-App und ob er günstiger als Steam ist. Preise werden nur abgefragt, wenn „Preise im Steam-Shop abfragen“ an ist; dann höchstens alle 6 Stunden und nie während eines Spiels. Benachrichtigung, wenn der Zielpreis erreicht ist. Preisverlauf = nur selbst gesehene Preise. Andere Shops (Epic, GOG, Key-Seiten) werden nicht abgefragt.

## Overlay & Aufnahme
Seite: /overlay-settings
Stichworte: overlay game bar aufnahme replay clip obs nvidia shadowplay xbox steam discord hud
Overlay im Stil der Xbox Game Bar mit frei verschiebbaren Widgets. Aufnahme und Replay über OBS (WebSocket, Passwort bleibt geschützt auf dem PC) oder per Tastenkürzel an NVIDIA, Xbox Game Bar, Steam oder Discord. Anbieter pro Funktion wählbar. Widgets im Overlay: Spiel, PC-Werte, Sounds, Quick Actions, Mini-Deck (die ersten Tasten deines Decks), Medien (Play/Pause, Lauter, Leiser), Timer, Uhr, Notizen, „Als Nächstes“ und eigene Widgets aus dem Baukasten.

## PC verbinden
Seite: /connect
Stichworte: verbinden koppeln adresse qr code pc nicht erreichbar abmelden automatisch wieder verbinden neu koppeln ip geändert feste ip
Verbindung zu deinem PC herstellen oder wechseln. Bei mehreren PCs: hier umschalten. „Abmelden“ löscht die Kopplung auf diesem Gerät. Einmal koppeln reicht: Das Handy bleibt gekoppelt (auch nach Neustart von Handy oder PC) und verbindet sich von selbst, sobald der PC an ist – bei geöffneter App innerhalb weniger Sekunden. Gespeichert ist die Kopplung für die Adresse, unter der die App geöffnet wurde (z. B. http://192.168.178.20:8787) – am besten als Lesezeichen oder „Zum Home-Bildschirm“. Gibt der Router dem PC eine neue IP, meldet der PC das; dann den QR-Code einmal neu scannen und im Router eine feste IP für den PC einstellen.

## Geräte
Seite: /devices
Stichworte: geräte gekoppelt entfernen rechte berechtigungen handy verloren
Alle gekoppelten Geräte mit Rechten (ansehen, starten, Soundboard, verwalten, admin). Entfernen trennt sofort. Ein verlorenes Handy hier entfernen.

## Gerät koppeln
Seite: /pair
Stichworte: koppeln code qr neues gerät iphone ipad android
Am PC „Neuen Code erzeugen“, QR-Code mit dem Handy scannen oder Code eingeben, am PC „Erlauben“. Codes gelten 5 Minuten und nur einmal. Nach Fehlversuchen wird das ratende Gerät gesperrt.

## Plugin Center
Seite: /plugins
Stichworte: plugins erweiterungen installieren katalog widgets themes aktionen pomodoro tageslimit weltzeit zufall clip
Plugins aus einem signierten Katalog oder als Datei: Widgets, Themes, Aktionen. Plugins führen nie Code auf dem PC aus; Widgets laufen abgeschottet. Rechte (z. B. Netzwerk) musst du beim Aktivieren erlauben. Im Katalog (33 Plugins): Spielzeit heute, Top-Spiele der Woche, Wochenstatistik, Weiterspielen, „Was spiele ich?“ (Zufallsspiel), Tageslimit, Spiel-Serie, Meilensteine, Bibliothek in Zahlen, Favoriten-Start, Sound-Pad, Zufallssound, Profil-Wechsler, CPU & RAM Mini, Leistungs-Verlauf, GPU-Temperatur-Ampel, RAM-Wächter, Speicherplatz, Leistung pro Spiel, PC-Check, Pausen-Erinnerung, Fokus-Timer (Pomodoro), Weltzeit-Uhr, Game-Overlay, Aktionen (Gaming-Abend, Discord-Schnellton, Wettkampf-Modus, Clip-Knöpfe für OBS) und Themes (Neon, Retro, Pastell, E-Sport, OLED-Schwarz).

## Benachrichtigungen
Seite: /notifications
Stichworte: benachrichtigungen hinweise meldungen glocke stumm ruhemodus
Echte Ereignisse vom PC (Startfehler, Updates, erreichte Ziele, Zielpreise, Spielmodus …), nach Wichtigkeit sortiert. „Offen“ zeigt die nicht geschlossenen, „Verlauf“ alle der letzten 30 Tage (höchstens 200). Ungelesene haben einen Punkt; beim Öffnen der Seite gelten sie als gelesen. Filter nach Kategorie (Updates, Starts, Automatisierungen, Spielmodus, Plugins, GameQuest, Deal Radar, Aufnahme, Assistent, System). Einzelne Meldungen lassen sich stummschalten (Fehler kommen immer). Ruhemodus während eines Spiels: Einstellungen → Benachrichtigungen – dann zeigt der PC nur noch Fehler als Windows-Hinweis. Gespeichert auf dem PC (notifications.json), bleiben also nach einem Neustart erhalten.

## Einstellungen
Seite: /settings
Stichworte: einstellungen design farben theme sprache backup verbindung sicherheit autostart datenschutz navigation
Bereiche: Allgemein (Sprache, PC-Name), Design & Layout (Dunkel/Hell, Themes, Farben, Hintergründe inkl. Cartoon-Szenen, Dashboard-Layouts, Navigation sortieren/ausblenden), Verbindung (WLAN, Port, Relay, öffentliche Adresse), Sicherheit (Zugangscode), Benachrichtigungen, Installation & Autostart (Installieren mit Startmenü und „Apps & Features“, Deinstallieren), Updates, Backup (erstellen, prüfen, wiederherstellen, Wiederherstellungspunkte), Datenschutz.

## Navigation anpassen
Seite: /settings?s=design
Stichworte: navigation menü reihenfolge ausblenden leiste handy unten
Einstellungen → Design & Layout → Navigation: Bereiche sortieren, ausblenden (Home, Einstellungen und PC verbinden bleiben immer), Handy-Leiste unten wählen. Ausgeblendete Bereiche findet die Suche weiterhin. Jeder Bereich hat ein eigenes farbiges Symbol; „Farbig/Schlicht“ umschalten unter Einstellungen → Design & Layout → Navigation oder beim Anpassen der unteren Leiste (lange drücken).

## Backup und Wiederherstellung
Seite: /settings?s=backup
Stichworte: backup sichern wiederherstellen export import umzug neuer pc
Backup als ZIP: Bibliothek, Profile, Quick Actions, Automatisierungen, Hotkeys, Sounds, Audio, Verlauf, Widgets, GameQuest, Deal Radar, Design. Geheimnisse (Schlüssel, Passwörter) sind nie enthalten. Vor dem Einspielen wird alles geprüft, einzelne Bereiche wählbar, vorher wird automatisch gesichert. Wöchentliche Wiederherstellungspunkte.

## Updates & Versionen
Seite: /updates
Stichworte: update version neueste herunterladen installieren aktualisieren änderungen zurück rollback absturz wächter
Zeigt installierte und neueste Version mit Änderungen. Download der Windows-EXE auch vom Handy. Updates sind signiert; der Begleiter lehnt unsignierte oder veränderte Dateien ab. Es wird nie automatisch installiert. Prüfung 2 Minuten nach dem Start, dann täglich, nie während eines Spiels. Update-Wächter: Stürzt eine neu installierte Version zweimal ab, bevor sie eine Minute stabil lief, startet der Begleiter beim nächsten Start von selbst wieder die letzte stabile Version und meldet das (Benachrichtigung „Update … automatisch zurückgesetzt“). Normales Beenden oder Herunterfahren zählt nicht als Absturz.

## Diagnose
Seite: /diagnostics
Stichworte: diagnose fehler prüfen problem logs protokoll verbindung test
„Diagnose ausführen“ prüft Begleiter, Netzwerk, Relay, Audio und den Browser und zeigt Lösungen. Protokolle: \`%APPDATA%\\PCGameLauncherUltimate\\logs\`.

## Hilfe
Seite: /help
Stichworte: hilfe anleitung erste schritte
Kurzanleitung: Begleiter starten, Firewall „Private Netzwerke“ erlauben, Gerät koppeln, Spiele hinzufügen. iPhone: in Safari „Teilen → Zum Home-Bildschirm“.

## Suche
Stichworte: suche finden strg k
Strg+K (oder die Lupe) durchsucht Bereiche, Spiele, Programme, Sounds, Profile und Quick Actions. Von dort lässt sich auch der Assistent fragen.

## KI-Assistent
Seite: /assistant
Stichworte: assistent ki claude ollama lokal kostenlos gratis frage chat befehl sprache kosten schlüssel modell einrichten auftrag design leiste
Einrichten per Auftrag (mit und ohne PC, 0 €, auf diesem Gerät): „Mach das Design hell/dunkel“, „Mach die Farben grün“, „Hintergrund Weltall“, „Schrift größer“, „Pack den Backlog in die Leiste“ (ist die Leiste voll, fragt er, welchen Platz er ersetzen soll), „Nimm Sounds aus der Leiste“, „Leiste schlicht wie früher“, „Zeig die Uhr auf Home“, „Blende Deal Radar aus“, „Stell die Sprache auf Englisch“. Jede Änderung erscheint als Knopf, wird erst beim Tippen übernommen und lässt sich mit „Rückgängig“ zurücknehmen.
Ohne PC (Hilfe-Modus, 0 €, läuft komplett im Browser): beantwortet Fragen zur App aus dieser Wissensbasis, öffnet Seiten („Öffne das Deck“), kennt die zuletzt vom PC geladenen Spiele und den Backlog („Was soll ich als Nächstes spielen?“). Starten, Live-Werte und Sounds brauchen den PC – das sagt er ehrlich, statt zu raten.
Mit PC drei Modi (Assistent → Einrichten):
- **Lokal** (Standard, 0 €, ohne Internet): versteht Befehle wie „Starte Rocket League“, „Spiel Sound Airhorn“, „Profil Streaming“, „Wie heiß ist meine GPU?“, „Wie lange habe ich diese Woche gespielt?“, „Welche Spiele habe ich?“ und beantwortet Fragen zur App aus dieser Wissensbasis.
- **Lokale KI** (0 €, ohne Konto, nichts verlässt den PC): zusätzlich ein freies Sprachmodell über Ollama (ollama.com) für freie Fragen. Installation: Ollama installieren, dann z. B. „ollama pull qwen2.5:7b“. Empfohlen mindestens 7B (braucht etwa 8 GB Grafikspeicher); kleinere Modelle machen viele Fehler. Befehle, PC-Werte und App-Fragen beantwortet weiter der genaue lokale Teil. Während eines Spiels antwortet standardmäßig nur der lokale Teil (schont die Grafikkarte).
- **Claude** (kostenpflichtig, optional): beste Antworten. Braucht einen eigenen Anthropic-API-Schlüssel, der nur am PC eingetragen und verschlüsselt gespeichert wird. Kostet pro Anfrage; Monatslimit einstellbar. Dabei gehen deine Frage und die dafür nötigen Daten (z. B. Spielnamen, PC-Werte) an Anthropic.
Der Assistent führt nie selbst etwas aus: Aktionen erscheinen als Knopf und laufen erst, wenn du tippst – mit den Rechten deines Geräts.

## Zugriff von unterwegs
Stichworte: unterwegs mobil daten 4g 5g außerhalb tunnel cloudflare tailscale relay
Ohne Zusatz ist der PC nur im Heimnetz erreichbar (keine Router-Ports). Für unterwegs: Cloudflare Tunnel oder Tailscale Funnel (https-Adresse auf \`http://localhost:8787\`, als „Öffentliche Adresse“ eintragen) oder ein eigenes Relay. Über ein Relay ist nur die Anmeldung Ende-zu-Ende geschützt, der Inhalt danach nicht – Relay nur selbst oder bei jemandem betreiben, dem du vertraust.

## Sicherheit
Stichworte: sicherheit schutz zugangscode passwort hacker sicher rechte
Kopplung mit Einmal-Code und Bestätigung am PC, Challenge-Response-Anmeldung, Rechte pro Gerät, Schutz gegen DNS-Rebinding und gefälschte Proxy-Header. Programme nur am PC freigeben. Update-Quelle und Plugin-Katalog nur am PC änderbar. Der Zugangscode der Webseite ist nur eine Sichtsperre, kein Schutz des PCs. Im WLAN ist der Inhalt unverschlüsselt (http) – in fremden Netzen nicht verwenden.

## Leistung beim Zocken
Stichworte: leistung fps ruckeln spielmodus ressourcen hintergrund langsam
Während ein Spiel läuft, wartet Hintergrundarbeit (Update-Prüfung, Kataloge, Preisabfragen), Messungen werden seltener, die Oberfläche ruht. Der Begleiter braucht im Leerlauf kaum CPU. Programme beim Spielstart automatisch schließen kann die App noch nicht (geplant).

## Was der Assistent und die App nicht können
Stichworte: kann nicht grenzen geht nicht unmöglich
- Keine Statistiken aus Spielen auslesen (Kills, Rang, Siege) – nur was du einträgst.
- Keine FPS-Messung, keine CPU-Temperatur ohne Treiberquelle.
- Keine Makros, die Spiel-Eingaben automatisieren.
- Keine Widgets auf dem Windows-Start- oder Sperrbildschirm.
- Kein automatisches Installieren von Updates oder Treibern (z. B. VB-Cable).
- Keine Preise außer aus dem Steam-Shop.
- Den PC herunterfahren o. Ä. schlägt der Assistent nicht vor – das geht nur über die Energie-Funktionen der App.
`,G=`# Fehlerbehebung

Erster Schritt bei jedem Problem: **Diagnose → Diagnose ausführen**. Sie trennt „kein Internet“, „WLAN-Problem“, „Companion nicht erreichbar“, „Relay-Problem“ und „Audio-Problem“.

## Das Handy zeigt „PC nicht erreichbar“
| Ursache | Lösung |
|---|---|
| Companion läuft nicht | Symbol im Infobereich (^) prüfen, EXE starten |
| Anderes Netz | Handy ins selbe WLAN, mobile Daten aus |
| Firewall blockiert | Windows-Sicherheit → Firewall → „App durch die Firewall zulassen“ → PCGameLauncherCompanion für **Privat** erlauben. Netzwerkprofil des WLANs muss „Privat“ sein |
| Falsche/alte Adresse | Aktuelle Adresse steht im Companion unter „Gerät koppeln“. Vorschau-Links aus Entwicklungsumgebungen (\`…style.dev\`, \`trycloudflare.com\` nach Neustart) funktionieren nicht dauerhaft |
| PC hat vom Router eine neue IP-Adresse bekommen (ging vorher, Handy wurde nie abgemeldet) | Der PC meldet das als Benachrichtigung „WLAN-Adresse des PCs hat sich geändert“. QR-Code unter „Gerät koppeln“ einmal neu scannen. Dauerhaft: im Router dem PC immer dieselbe IP geben (FRITZ!Box: Heimnetz → Netzwerk → Gerät bearbeiten → „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“) |
| WLAN-Zugriff ausgeschaltet | Einstellungen → Verbindung → „Im WLAN erreichbar“, danach Companion neu starten |
| Gast-WLAN / Client-Isolation | Router trennt Geräte voneinander → normales WLAN nutzen |

## Relay-Fehler mit \`ws://127.0.0.1:8787/ws\` („Relay hat die Anmeldung abgelehnt“)
Ursache: Als Relay-Adresse war die Adresse des PC-Begleiters selbst eingetragen. \`ws://…:8787/ws\` ist der Endpunkt, mit dem sich Browser (iPad, Handy) mit dem Begleiter verbinden – kein Relay. Der Begleiter hat sich mit sich selbst verbunden und wurde abgewiesen.
Lösung: Im WLAN wird **kein Relay** gebraucht → Einstellungen → Verbindung → „Mit eigenem Relay verbinden“ ausschalten. Für unterwegs Tailscale Funnel nutzen (siehe INSTALLATION.md). Ein Relay ist ein eigener Server (\`npm run start:relay\`, Standard-Port 8788, Endpunkt \`/companion\`). Ab dieser Version lehnt der Begleiter solche Adressen ab und erklärt das in der Diagnose.

## iPad findet den PC nicht / Adresse \`127.0.0.1\` oder \`localhost\`
\`127.0.0.1\` und \`localhost\` bedeuten auf jedem Gerät „dieses Gerät selbst“. Auf dem iPad eingetippt sucht das iPad sich selbst. Verwende die WLAN-Adresse aus dem PC Game Launcher („Gerät koppeln“, z. B. \`http://192.168.178.116:8787\`) oder die Tailscale-Adresse (\`https://…ts.net\`). Der Begleiter zeigt \`127.0.0.1\` nicht mehr als Adresse für andere Geräte an; die Web-App lehnt sie mit Erklärung ab.

## Die Webseite (github.io) verbindet sich nicht mit \`http://192.168…\`
Eine https-Seite darf im Browser keine unverschlüsselte Verbindung (\`ws://\`) öffnen. Entweder im WLAN den QR-Code am PC scannen (öffnet die App direkt vom PC über http) oder Tailscale Funnel einrichten und die \`https://…ts.net\`-Adresse als „Öffentliche Adresse“ eintragen. Die Diagnoseseite zeigt diesen Fall mit Lösung an.

## „Preview unavailable“ oder leere Seite nach Link aus WhatsApp
Der Link zeigte auf eine temporäre Entwicklungsvorschau. Verwende die Adresse aus dem Companion (\`http://<PC-IP>:8787\`) oder eine eigene dauerhafte https-Adresse (Cloudflare Tunnel mit eigener Domain oder eigenes Relay), siehe INSTALLATION.md.

## Kopplung
- **„Code ist ungültig“** – genau wie angezeigt eingeben (Groß/Klein egal, Bindestrich optional).
- **„Code abgelaufen“ / „gesperrt“** – Codes gelten 5 Minuten, nach 5 Fehlversuchen gesperrt → neuen Code erzeugen.
- **„Zu viele Versuche“** – einige Minuten warten (Schutz gegen Durchprobieren).
- **Gerät nach Browser-Löschen abgemeldet** – Kopplung liegt im Browser-Speicher; im privaten Modus wird sie beim Schließen vergessen. Neu koppeln, alten Eintrag unter „Geräte“ entfernen.

## Spiel/Programm startet nicht
- Fehlermeldung steht als Hinweis und unter **Gaming-Verlauf → Letzte Startfehler**.
- Steam/Epic: Launcher installiert und angemeldet? „Steam ist nicht installiert“ bedeutet: das \`steam://\`-Protokoll ist nicht registriert.
- EXE: „Datei nicht gefunden“ → Programm verschoben/deinstalliert; Eintrag am PC neu freigeben.
- Spiele, die Administratorrechte verlangen, zeigen die Windows-Abfrage **am PC**.

## Laufendes Spiel wird nicht erkannt / Profil wechselt nicht
Im Spiel-Eintrag „Prozessnamen zur Erkennung“ eintragen (Task-Manager → Details, ohne \`.exe\`). Steam/Epic-Spiele werden zusätzlich über den Installationsordner erkannt. Automatischer Wechsel muss unter Gaming-Profile aktiv sein.

## Soundboard / Discord

Hinweis: Der Weg über ein virtuelles Kabel ist eingebaut, wurde aber **nicht in einer echten Discord-Runde getestet** (keine Windows-/Discord-Umgebung beim Entwickeln). Ob andere dich hören, prüfst du am einfachsten mit Discords „Mikrofon testen“ (Einstellungen → Sprache & Video) oder mit einem zweiten Gerät.

**Einrichtung:**
1. VB-Audio Virtual Cable installieren (kostenlos, vb-audio.com; nicht automatisch – Treiber brauchen deine Zustimmung und Administratorrechte), PC neu starten.
2. Nexus → Audio Center: **Soundboard-Ausgabe = „CABLE Input“**. Damit du die Sounds selbst hörst: „Mithören“ auf deine Kopfhörer einschalten.
3. Nexus → Audio Center: **Mikrofon-Durchleitung** einschalten und dein echtes Mikrofon wählen – sonst hören die anderen nur noch Sounds, nicht mehr dich.
4. Discord → Einstellungen → Sprache & Video: **Eingabegerät = „CABLE Output“**.
5. Echo/Rückkopplung vermeiden: Mithören nie auf dasselbe Gerät wie die Soundboard-Ausgabe legen (die App verhindert das); in Discord „Rauschunterdrückung“ ggf. aus, sonst werden Sounds als Geräusch weggefiltert.

**Was die App anzeigen kann:** ob ein Sound läuft und auf welchem Gerät er ausgegeben wird, ob die Durchleitung aktiv ist und ein Pegel ankommt. **Nicht** feststellbar ist, ob Discord das Kabel tatsächlich als Mikrofon nutzt und andere etwas hören.
- **Kein Ton:** Audio Center → Testton. Gerät „fehlt“ → anschließen oder anderes wählen.
- **Andere hören nichts:** virtuelles Kabel installiert? Soundboard-Ausgabe = „CABLE Input“, Discord-Eingabegerät = „CABLE Output“.
- **Man hört mich nicht mehr in Discord:** „Mikrofon-Durchleitung“ einschalten (Discord nutzt dann das Kabel als Mikrofon).
- **Echo:** Durchleitung ist nur auf ein separates Gerät erlaubt; Monitoring nicht auf dasselbe Gerät wie die Ausgabe stellen.
- **OGG wird abgelehnt:** Windows spielt OGG/Opus ohne Zusatzcodec nicht ab → als MP3/WAV speichern.
- **MyInstants-Link abgelehnt:** Nur Seiten mit öffentlichem MP3-Link funktionieren; sonst Datei herunterladen und importieren.

## Hotkeys
Status „Fehler – bereits belegt“: ein anderes Programm (Discord, Overlay, Treibersoftware) nutzt die Kombination. Andere wählen. Von Windows reservierte Kombinationen werden absichtlich abgelehnt.

## Companion-Fenster bleibt leer
WebView2-Runtime fehlt oder ist defekt → Button „WebView2-Runtime herunterladen“ bzw. „Im Browser öffnen“. Der Companion funktioniert unabhängig vom Fenster weiter.

## „Port 8787 ist bereits belegt“
Ein zweiter Companion oder ein anderes Programm nutzt den Port. Im Infobereich prüfen; sonst Einstellungen → Verbindung → Port ändern und neu starten.

## Backup lässt sich nicht einspielen
Die Datei wird vollständig geprüft, bevor etwas geändert wird. Meldet die Prüfung einen Fehler, bleibt die Konfiguration unverändert. Vor jeder Wiederherstellung wird automatisch \`backups\\vor-wiederherstellung-*.zip\` angelegt.

## Protokolle
\`%APPDATA%\\PCGameLauncherUltimate\\logs\\companion-JJJJ-MM-TT.log\` (7 Tage) und **Diagnose → Protokoll**. Tokens und Codes werden nie protokolliert.
`,E="# Datenschutz – Nexus Gaming Hub\n\nKurz gesagt: Es gibt keine Telemetrie, keine Werbung und kein Konto. Alles Wichtige liegt auf deinem PC. Einige Funktionen sprechen aber Online-Dienste an. Welche das sind, steht hier vollständig, damit du selbst entscheiden kannst.\n\n## 1. Was auf dem PC gespeichert wird\n\nDie Daten liegen im Datenordner `%APPDATA%\\PCGameLauncherUltimate`. Der Name ist aus technischen Gründen der alte, damit Updates weiter funktionieren.\n\n| Daten | Datei | Löschen |\n|---|---|---|\n| Bibliothek (Spiele, Programme, Startziele, Notizen, Bewertungen, Backlog-Status, Priorität, Ziel in Stunden) | `library.json` | in der App einzeln, oder Datei löschen |\n| Profile (inkl. eigenem Theme je Profil), Quick Actions, Automatisierungen (inkl. letzte 10 Ausführungen), Hotkeys | `profiles.json`, `quickactions.json`, `automations.json`, `hotkeys.json` | in der App |\n| Sounds (Audiodateien und Namen) | `sounds\\`, `sounds.json` | Soundboard → Löschen |\n| Spielverlauf (Start/Ende, Dauer, optional CPU/RAM/GPU-Mittelwerte) | `history.json` | Gaming-Verlauf → „Verlauf löschen“; abschaltbar unter Einstellungen → Datenschutz |\n| Eigene Widgets, Decks (Tasten, Beschriftungen, kleine Tastenbilder), Overlay-Anordnung, eigene Ping-Ziele, Design je Gerät | `widgets.json`, `decks.json`, `settings.json`, `devices.json` | in der App |\n| Gekoppelte Geräte: Name, Rechte, letzte IP, **nur ein Hash** des Geräteschlüssels | `devices.json` | Geräte → Entfernen |\n| Geheimnisse: Relay-Schlüssel, Steam-API-Schlüssel, OBS-Passwort | `settings.json`, mit Windows-DPAPI verschlüsselt | Einstellungen → Feld leeren |\n| GameQuest: Ziele, selbst eingetragene Matches, verdiente XP | `quests.json` | GameQuest → Ziel/Match löschen, oder Datei löschen |\n| Deal Radar: Wunschliste, Zielpreise, selbst gesehene Preise | `deals.json` | Deal Radar → Entfernen |\n| KI-Assistent: Modus, Modell, Ollama-Adresse, Monatslimit, Kosten je Monat, **Anthropic-Schlüssel nur DPAPI-geschützt** | `assistant.json` | Assistent → Einrichten → Schlüssel löschen, oder Datei löschen |\n| Benachrichtigungen mit Verlauf (gelesen/geschlossen, höchstens 200, älter als 30 Tage wird gelöscht) | `notifications.json` | Benachrichtigungen → Verlauf löschen |\n| Spielmodus: Programmliste, Schalter und – während eines Spiels – die Pfade der geschlossenen Programme (zum Wiederöffnen) | `gamemode-programs.json` | Profile → Spielmodus |\n| Zuletzt gesehene WLAN-Adresse(n) des PCs (um eine Änderung zu melden) | `lan-address.json` | Datei löschen |\n| Update-Wächter: Version, ob sie stabil lief, Zahl fehlgeschlagener Starts | `update-guard.json` | Datei löschen |\n| Kalender-Termine und bereits gezeigte Erinnerungen | `calendar.json` | Kalender → Termin löschen oder Datei löschen |\n| Eigener Status (Text, Dauer, Freigabe). Wird nur an gekoppelte Geräte gegeben – an Geräte mit nur Leserechten erst nach Freigabe; nie ins Internet | `activity.json` | Datei löschen |\n| Dateien vom/zum Handy | `Downloads\\Nexus Gaming Hub\\` (mit eigenem Datenordner: `transfer\\`) | Dateien → Löschen oder im Explorer |\n| Aufnahmen: eigene Ordner, Favoriten, Schlagwörter | `captures.json` | Datei löschen |\n| Vorschaubilder der Aufnahmen (höchstens 3000) | `thumbs\\` | Ordner löschen |\n| Push: eigener Schlüssel des PCs (privat geschützt) und die Push-Adressen der Geräte | `webpush.json` | Benachrichtigungen → Push ausschalten oder Datei löschen |\n| Systemanforderungen aus dem Steam-Shop (höchstens 300 Spiele) | `compat.json` | Datei löschen |\n| Mods: eingestellte Mod-Ordner je Spiel | `mods.json` | Datei löschen |\n| Sicherungen der Mod-Ordner (je Spiel die letzten 5) | `mod-backups\\` | Ordner löschen |\n| Fenster-Layouts (Programmname, Monitor, Position) | `window-layouts.json` | Fenster-Layouts → Löschen |\n| Tastenbelegung (Profile, Programmnamen, welche Taste was wird) – **keine** Tastendrücke, nichts wird mitgeschrieben | `input-remap.json` | Tastatur & Maus belegen → Löschen |\n| Gamer-Pass: Name und Symbol | nur im Browser des Geräts (`localStorage`, `pgl.gamerpass`) | Feld leeren oder Browserdaten löschen |\n| Konten: Benutzername, Hash des Anmelde-Schlüssels, **verschlüsseltes** Design samt Gamer-Pass/Zähler/Pausen-Erinnerung (der PC kann es nicht lesen; das Passwort wird nie übertragen) | `design-accounts.json` | Einstellungen → Design → Profil löschen, oder Datei löschen |\n| Widgets Zähler/Pausen-Erinnerung, vom Handy geprüfte Xbox-Preise | nur im Browser des Geräts (`pgl.widget.*`, `pgl.deals.ms`) | Browserdaten löschen |\n| OpenRGB-Verbindung (Adresse, Port) | `rgb.json` | Datei löschen |\n| Plugins | `plugins\\` | Plugin Center → Entfernen |\n| Logs (Fehler/Ereignisse, ohne Nachrichteninhalte) | `logs\\` (rotierend) | Ordner löschen |\n| Backups und Wiederherstellungspunkte | `backups\\` (automatisch die neuesten 5) | Einstellungen → Backup oder Ordner löschen |\n\n**Assistent-Gespräche** liegen nur im Arbeitsspeicher und sind nach einem Neustart weg (spätestens nach 3 Stunden). Auf dem Gerät steht der Chat nur im Speicher des Browser-Tabs.\n\n## 2. Was auf dem Handy, Tablet oder im Browser gespeichert wird\n\n- **Gerätekennung und Geräteschlüssel** (Browser-Speicher). Wer das Gerät entsperrt benutzt, kann damit den PC steuern. Ein verlorenes Gerät deshalb am PC unter „Geräte“ entfernen.\n- **Design, Layouts, Navigation, Sprache.** Diese Daten liegen zusätzlich auf dem PC, damit sie mit dem Gerät mitwandern.\n- **Zugangscode der Webseite:** nur als gesalzener Hash. Er ist eine Sichtsperre, kein Schutz des PCs.\n- **Zwischenspeicher für den Offline-Betrieb:** Listen (Bibliothek, Sounds, Profile …), wartende Änderungen, noch nicht übertragene Sounds und Plugin-Dateien.\n  - Ein OBS-Passwort, das offline eingegeben wurde, wartet hier **unverschlüsselt**, bis der PC es übernimmt.\n- **Kalender-Erinnerungen:** welche Erinnerungen dieses Gerät schon gezeigt hat (`pgl.calendar.reminded`, höchstens 300 Einträge).\n- **Dateien und Vorschaubilder:** zum Senden vorgemerkte und „offline behaltene“ Dateien (IndexedDB `pgl-files`, zusammen höchstens 500 MB) und gesehene Vorschaubilder der Aufnahmen (`pgl-thumbs`, höchstens 600). Entfernen über den Bereich „Dateien“ bzw. die Website-Daten des Browsers.\n- **Service Worker:** die App-Dateien, damit die Seite auch bei ausgeschaltetem PC öffnet. Bei jedem Update wird aufgeräumt.\n\nAlles löschen: Browser-Daten der Seite löschen oder in der App „PC verbinden“ → „Abmelden“.\n\n## 3. Was zwischen PC und Geräten übertragen wird\n\n- **Im WLAN:** direkt per http/ws. Die Anmeldung ist geschützt (Challenge-Response), der **Inhalt aber unverschlüsselt**. Im eigenen Heimnetz ist das vertretbar, in fremden Netzen nicht.\n- **Über einen eigenen Tunnel** (z. B. Cloudflare Tunnel): TLS bis zum Tunnel.\n- **Über das Relay:** TLS bis zum Relay. Das Relay leitet nur weiter und speichert nichts dauerhaft.\n  - Die Anmeldung ist Ende-zu-Ende geschützt, der Inhalt danach aber nicht: Der Betreiber eines Relays könnte ihn technisch mitlesen. Ein Relay deshalb nur selbst oder bei jemandem betreiben, dem du vertraust.\n\n## 4. Optionale Online-Dienste (wer etwas erfährt)\n\n- **Kompatibilitäts-Check (nur auf Knopfdruck):** Der PC fragt den Steam-Shop nach den Anforderungen eines Spiels (`store.steampowered.com`, nur die App-ID). Steam erfährt, dass von deiner IP-Adresse diese Seite abgerufen wurde.\n- **Push-Benachrichtigungen (nur wenn auf einem Gerät eingeschaltet):** Der PC schickt Meldungen an den Push-Dienst des Browsers (Google, Mozilla, Apple oder Microsoft). Inhalt ist Ende-zu-Ende verschlüsselt; der Dienst sieht Zeitpunkt, Größe und das Ziel-Gerät. Andere Adressen werden nie angesprochen.\n\n| Funktion | Ziel | Was gesendet wird | Abschalten |\n|---|---|---|---|\n| Update-Prüfung (2 min nach Start, dann täglich; nicht während eines Spiels) | `nilshenke-ops.github.io` (GitHub Pages) | normale HTTP-Anfrage (IP-Adresse) | Einstellungen → Updates → Quelle leeren |\n| Plugin-Katalog (täglich) | `nilshenke-ops.github.io` | dito | Einstellungen → Katalog-Adresse leeren |\n| Cover-Suche | Steam-Shop, Microsoft Store | Spielname | Einstellungen → Datenschutz → „Cover automatisch suchen“ |\n| Steam-Cover anzeigen | `steamstatic.com` (Steam-CDN) | IP-Adresse deines Geräts | Einstellungen → Datenschutz → „Steam-Cover aus dem Steam-CDN“ |\n| Steam-Bibliothek | Steam Web API | dein eigener API-Schlüssel und deine Steam-ID | Steam-Verknüpfung entfernen |\n| Deal Radar (aus, bis du es einschaltest; höchstens alle 6 h, nie während eines Spiels; Suche nur auf Knopfdruck) | Steam-Shop `store.steampowered.com` | IP-Adresse des PCs, App-IDs der Wunschliste bzw. der Suchbegriff, Shop-Land | Deal Radar → „Preise im Steam-Shop abfragen“ aus |\n| Deal Radar – Steam-Wunschliste (nur wenn Preisabfrage und „Steam-Wunschliste automatisch übernehmen“ an sind; mit jeder Prüfung) | Steam-Web-API `api.steampowered.com` (ohne API-Schlüssel) | IP-Adresse des PCs, deine Steam-ID, App-IDs für die Namen | Deal Radar → „Steam-Wunschliste automatisch übernehmen“ aus |\n| Deal Radar – Microsoft Store (nur wenn Preisabfrage und „Auch im Microsoft Store (Xbox) vergleichen“ an sind; mit jeder Prüfung) | Microsoft-Katalog `displaycatalog.mp.microsoft.com` | IP-Adresse des PCs, Spielname der Wunschliste, Shop-Land | Deal Radar → „Auch im Microsoft Store (Xbox) vergleichen“ aus |\n| Deal Radar ohne PC (nur wenn Preisabfrage und Xbox-Vergleich an sind; auf Knopfdruck oder nach dem Hinzufügen) | Microsoft-Katalog `displaycatalog.mp.microsoft.com`, **direkt vom Handy** | IP-Adresse des Handys, Spielname, Shop-Land | Deal Radar → „Auch im Microsoft Store (Xbox) vergleichen“ aus |\n| Steam-Preise und -Bilder ohne PC | Dateien `prices/steam-de.json` und `prices/apps/<Buchstabe>.json` auf der eigenen Website (GitHub Pages) – erstellt von einer GitHub Action, die Steam fragt | nur der übliche Seitenabruf (IP-Adresse an GitHub); **keine** Angaben zur Wunschliste | Preisabfrage aus |\n| KI-Assistent „Lokale KI“ (Ollama) | die eingetragene Ollama-Adresse – normalerweise dieser PC (`127.0.0.1:11434`), sonst ein Gerät im Heimnetz; Internet-Adressen werden abgelehnt | Frage, Verlauf und abgefragte Daten – bleiben auf dem PC bzw. im Heimnetz | Assistent → Einrichten → „Lokal“ |\n| KI-Assistent mit Claude (nur wenn du einen Schlüssel einträgst und „Claude“ wählst; lokaler Modus sendet nichts) | Anthropic (`api.anthropic.com`) | deine Frage, der Gesprächsverlauf, die Wissensbasis der App und die Daten, die Claude dafür über Werkzeuge abfragt (z. B. Spielnamen, PC-Werte, Spielzeit, Wunschliste, Gerätename). Nie: Schlüssel, Passwörter, Tokens | Assistent → Einrichten → „Lokal“ oder Schlüssel löschen |\n| Game Pass | `catalog.gamepass.com`, `displaycatalog.mp.microsoft.com` | Markt (z. B. DE) | Game Pass ausschalten |\n| Netzwerkdiagnose | Ping zu `1.1.1.1` (Cloudflare) und `8.8.8.8` (Google); eigene Ziele; Diagnose: DNS `www.msftconnecttest.com` | ICMP-Ping bzw. DNS-Anfrage, nur solange die Seite offen ist | Seite nicht öffnen |\n| Sound-Import per Link | die eingegebene Adresse (z. B. MyInstants) | normale Anfrage | nicht benutzen |\n| OBS | die eingetragene OBS-Adresse (meist dieser PC) | Steuerbefehle | OBS-Verbindung leeren |\n| Eigene Widgets mit Bild-Adresse | die eingetragene https-Adresse | IP-Adresse | Bild hochladen statt verlinken |\n| Plugins mit Recht „Netzwerk“ | vom Plugin gewählte https-Ziele | was das Plugin sendet | Plugin deaktivieren |\n\n**Wichtig – öffentliche Steam-Liste:** Der GitHub-Workflow `steam-library.yml` veröffentlicht, wenn die Secrets `STEAM_API_KEY` und `STEAM_ID` gesetzt sind, alle 6 Stunden `steam.json` auf GitHub Pages.\n- Die Datei enthält Spielenamen, Spielzeit und den Steam-Anzeigenamen.\n- Sie ist **für jeden im Internet lesbar**.\n- Abschalten: das Secret `STEAM_API_KEY` im Repository löschen oder den Workflow deaktivieren und `steam.json` aus `gh-pages` entfernen.\n\n## 5. Was ohne Internet, Relay und Cloud funktioniert\n\nIm WLAN funktioniert alles, was zwischen Handy und PC passiert, ohne Internet:\n- Starten, Soundboard, Profile, Hotkeys, Automatisierungen, Monitor, Overlay, Widgets, Backups.\n\nOhne Internet fehlen nur:\n- Update- und Plugin-Katalog-Prüfung, Cover-Suche, Steam, Game Pass und die Preise im Deal Radar.\n- Die Internet-Ziele der Netzwerkdiagnose.\n",W=z([{source:"Wissen",markdown:B},{source:"Fehlerbehebung",markdown:G},{source:"Datenschutz",markdown:E}]),u=(r,s={})=>({text:r,actions:[],sources:[],suggestions:[],mode:"offline",...s}),m=(r,s)=>{var l;return{kind:"navigate",label:n("{n} öffnen",{n:s??((l=A().find(t=>t.path===r))==null?void 0:l.label)??r}),path:r}};function y(r,s){const l=h(s).trim();if(l)return r.find(t=>h(t.name)===l)??r.find(t=>h(t.name).includes(l))??r.find(t=>l.split(/\s+/).every(d=>h(t.name).includes(d)))}function K(r,s){const l=r.trim(),t=h(l),d=s.library.filter(e=>e.kind==="game"),S=s.paired?n("Dafür muss der PC verbunden sein – sobald er an ist, verbindet sich die App von selbst."):n("Dafür muss zuerst ein PC verbunden werden."),b=/^(oeffne|offne|zeig(e)?( mir)?|geh(e)?( zu| zur| zum| in)?|wechsel(e)? zu|open|show)\s+(.+)$/.exec(t);if(b){const e=b[b.length-1].replace(/^(das|die|den|der|mein(e|en)?|the)\s+/,""),a=P(e),i=A(),o=i.find(g=>h(g.label)===e||h(g.short??"")===e)??i.find(g=>a.length>0&&a.every(k=>P(`${g.label} ${g.short??""} ${g.keywords??""}`).some(w=>w.startsWith(k)||k.startsWith(w))));if(o)return u(n("Hier geht's zu „{n}“.",{n:o.label}),{actions:[m(o.path,o.label)],sources:[n("Navigation")]})}const f=/^(starte|start|spiel(e)?|launch|oeffne das spiel)\s+(.+)$/.exec(t);if(f&&!/sound/.test(t)){const e=y(s.library,f[f.length-1]);if(e)return u(`${n("„{n}“ startet am PC.",{n:e.name})} ${S}`,{actions:[{kind:"launch",label:n("{n} starten",{n:e.name}),method:"library.launch",params:{id:e.id},confirm:!0}],sources:[n("Bibliothek (zuletzt vom PC geladen)")]})}if(/(welche|meine|alle).*(spiele|games)|spiele.*(hab|besitz)/.test(t)){if(!d.length)return u(s.paired?n("Auf diesem Gerät ist noch keine Spieleliste gespeichert – sie kommt beim nächsten Verbinden vom PC."):n("Noch kein PC verbunden – deine Spiele kennt nur der PC."),{actions:[m("/connect")]});const e=d.filter(a=>a.favorite).map(a=>a.name);return u(n("{n} Spiele: {l}",{n:d.length,l:d.slice(0,15).map(a=>a.name).join(", ")+(d.length>15?" …":"")})+(e.length?" "+n("Favoriten: {f}.",{f:e.join(", ")}):""),{actions:[m("/games")],sources:[n("Bibliothek (zuletzt vom PC geladen)")]})}if(/(was|welches).*(spielen|zocken)|als naechstes|backlog|zufall/.test(t)){const e=d.filter(i=>i.backlog==="next"||i.backlog==="playing").sort((i,o)=>(o.priority??0)-(i.priority??0)),a=d.filter(i=>i.backlog==="backlog"||i.backlog==="next");if(e.length||a.length){const i=e[0]??C(a,!0);return u(e.length?n("Als Nächstes steht „{n}“ an.",{n:i.name})+(e.length>1?" "+n("Außerdem: {l}.",{l:e.slice(1,4).map(o=>o.name).join(", ")}):""):n("Zufällig aus deinem Backlog: „{n}“.",{n:i.name}),{actions:[m("/backlog")],sources:[n("Backlog (zuletzt vom PC geladen)")]})}}if(/(cpu|ram|gpu|temperatur|auslastung|wie geht es meinem pc|laeuft gerade|spielzeit|wie lange.*gespielt|lautstaerke|sound.*(spiel|abspiel))/.test(t))return u(`${n("Das misst bzw. steuert der PC selbst.")} ${S}`,{actions:[m(s.paired?"/monitor":"/connect")]});const p=D(W,l,3);if(!p.length||p[0].score<2.5)return u(n("Das weiß ich ohne PC nicht. Frag mich zur App (z. B. „Wie richte ich Discord ein?“), lass dich zu einer Seite bringen („Öffne das Deck“) oder frag nach deinem Backlog."),{suggestions:v().slice(0,4)});const c=p[0].section;return u(c.text,{actions:c.page?[m(c.page,c.title)]:[],sources:[`${c.source}: ${c.title}`],suggestions:p.slice(1).filter(e=>e.score>=p[0].score*.6).map(e=>e.section.title.endsWith("?")?e.section.title:n("Mehr zu: {n}",{n:e.section.title}))})}export{W as SECTIONS,K as answerOffline};
