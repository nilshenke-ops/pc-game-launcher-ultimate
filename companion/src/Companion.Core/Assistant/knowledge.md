# Wissen des Nexus-Assistenten

Format: Jeder Abschnitt beginnt mit „## Titel“. Eine Zeile „Seite: /pfad“ verknüpft ihn mit einer Seite der App, „Stichworte:“ hilft der Suche. Diese Datei ist die Quelle für den lokalen Assistenten und für Claude. Stand: Version 2.14.

## Was ist der Nexus Gaming Hub?
Stichworte: überblick app was kann programm begleiter companion webseite
Der Nexus Gaming Hub besteht aus drei Teilen:
- **Begleiter (Companion)** auf dem Windows-PC: eine EXE ohne Installation. Er startet Spiele und Programme, spielt Sounds ab, misst den PC, führt Automatisierungen aus und liefert die Web-App aus.
- **Web-App** für Handy, Tablet und PC: dieselbe Oberfläche überall, als Seite vom PC (im WLAN `http://<PC-IP>:8787`) oder als feste Webseite `https://nilshenke-ops.github.io/pc-game-launcher-ultimate`.
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
Unter Spiele → Chip „Steam“: eigenen Steam-Web-API-Schlüssel und Steam-ID eintragen. Dann zeigt die App alle gekauften Spiele mit Spielzeit. Der Schlüssel wird nur verschlüsselt (Windows-DPAPI) auf dem PC gespeichert und nie angezeigt oder ins Backup geschrieben.

## Game Pass
Seite: /games
Stichworte: xbox game pass katalog abo
Chip „Game Pass“ zeigt den öffentlichen Katalog (Markt einstellbar). Muss in den Einstellungen eingeschaltet sein. Ob du ein Abo hast, kann die App nicht prüfen.

## Programme
Seite: /programs
Stichworte: programme apps discord browser obs starten freigeben
Wie Spiele, aber für Programme (Discord, Browser, OBS …), angezeigt als App-Symbole wie auf dem Handy: Symbol antippen startet das Programm am PC; lange drücken (oder „Bearbeiten“ oben und dann antippen) öffnet die Einstellungen. Ein grüner Punkt heißt: läuft gerade. Bekannte Programme (Discord, OBS, Spotify, Steam, Browser …) zeigen ihr echtes Logo, auch ohne PC; andere bekommen das Programmsymbol vom PC (auch Startmenü- und Store-Apps wie der Minecraft Launcher, ab Version 2.9 auch für schon vorhandene Einträge). Freigabe einer EXE nur am PC.

## Quick Actions
Seite: /quick
Stichworte: quick action schnellaktion mehrere schritte ein tipp makro ablauf
Eigene Ein-Tipp-Aktionen aus mehreren Schritten, z. B. „Discord öffnen + Profil Streaming + Sound“. Bausteine: Programm/Spiel starten, Profil aktivieren, Sound abspielen, Medientaste, Overlay, Aufnahme/Replay, Benachrichtigung, Warten (Sekunden), „nur wenn läuft / nur wenn nicht läuft“. Optional „Vor dem Ausführen nachfragen“, Favorit, auf dem Dashboard zeigen. Einer Quick Action kann ein Hotkey zugewiesen werden.

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
Stichworte: deal preis angebot sale rabatt wunschliste zielpreis steam günstig
Wunschliste mit Zielpreis. Preise kommen aus dem Steam-Shop, nur wenn „Preise im Steam-Shop abfragen“ eingeschaltet ist; dann höchstens alle 6 Stunden und nie während eines Spiels. Benachrichtigung, wenn der Zielpreis erreicht ist. Preisverlauf = nur selbst gesehene Preise. Andere Shops (Epic, GOG, Key-Seiten) werden nicht abgefragt.

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
Bereiche: Allgemein (Sprache, PC-Name), Design & Layout (Dunkel/Hell, Themes, Farben, Hintergründe inkl. Cartoon-Szenen, Dashboard-Layouts, Navigation sortieren/ausblenden), Verbindung (WLAN, Port, Relay, öffentliche Adresse), Sicherheit (Zugangscode), Benachrichtigungen, Autostart & Hintergrund, Updates, Backup (erstellen, prüfen, wiederherstellen, Wiederherstellungspunkte), Datenschutz.

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
„Diagnose ausführen“ prüft Begleiter, Netzwerk, Relay, Audio und den Browser und zeigt Lösungen. Protokolle: `%APPDATA%\PCGameLauncherUltimate\logs`.

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
Ohne Zusatz ist der PC nur im Heimnetz erreichbar (keine Router-Ports). Für unterwegs: Cloudflare Tunnel oder Tailscale Funnel (https-Adresse auf `http://localhost:8787`, als „Öffentliche Adresse“ eintragen) oder ein eigenes Relay. Über ein Relay ist nur die Anmeldung Ende-zu-Ende geschützt, der Inhalt danach nicht – Relay nur selbst oder bei jemandem betreiben, dem du vertraust.

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
