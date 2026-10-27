# Wissen des Nexus-Assistenten

Format: Jeder Abschnitt beginnt mit „## Titel“. Eine Zeile „Seite: /pfad“ verknüpft ihn mit einer Seite der App, „Stichworte:“ hilft der Suche. Diese Datei ist die Quelle für den lokalen Assistenten und für Claude. Stand: Version 2.18.

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

## Dateien
Seite: /files
Stichworte: datei dateien übertragen senden schicken teilen upload download handy pc austausch ordner bild clip config offline behalten
Dateien zwischen Handy und PC über einen Austausch-Ordner am PC (Windows: Downloads\Nexus Gaming Hub). „An den PC senden“ (mehrere Dateien, höchstens 200 MB pro Datei); ohne PC heißt der Knopf „Zum Senden vormerken“ – die Datei wartet auf dem Gerät (höchstens 500 MB zusammen) und wird beim Verbinden automatisch gesendet. „Auf dem PC“ zeigt den Ordner: Pfeil = aufs Gerät holen (am Handy über „Teilen“), Stecknadel = auf dem Gerät behalten (öffnet dann auch ohne PC), Papierkorb = am PC löschen. „Ordner am PC öffnen“ öffnet ihn im Explorer. Der PC öffnet oder startet empfangene Dateien nie selbst; unter Windows sind sie als „aus dem Internet“ markiert. Braucht das Recht „Verwalten“.

## Aufnahmen (Screenshots und Clips)
Seite: /captures
Stichworte: aufnahmen screenshot screenshots clip clips video replay galerie bilder obs nvidia game bar steam favorit schlagwort papierkorb
Alle Screenshots und Clips vom PC an einem Ort: Windows-Bildschirmfotos, Xbox Game Bar (Videos\Captures), Steam-Screenshots, NVIDIA (Videos\<Spiel>, nur Dateien erkannter Spiele – private Videos bleiben verborgen) und OBS (der Ordner kommt automatisch dazu, sobald OBS etwas speichert). Eigene Ordner am PC unter „Ordner“ hinzufügen. Filter Screenshots/Clips/Favoriten, Gruppen nach Spiel, Tag oder Ordner, Suche nach Name, Spiel und Schlagwort. Antippen öffnet das Bild bzw. lädt den Clip (bis 300 MB), „Aufs Gerät“ speichert ihn am Handy, „Papierkorb“ verschiebt ihn am PC in den Papierkorb (wiederherstellbar). Ohne PC: Liste und bereits gesehene Vorschaubilder bleiben auf dem Gerät; Favoriten und Schlagwörter werden vorgemerkt. Vorschaubilder liefert Windows selbst.

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
Am PC: Einstellungen → Installation & Autostart → „Installieren“. Das Programm kommt nach %LOCALAPPDATA%\Programs\Nexus Gaming Hub, bekommt einen Startmenü-Eintrag (optional Desktop-Symbol), startet auf Wunsch mit Windows und erscheint in „Apps & Features“ – ohne Administrator. Danach startet es aus dem neuen Ordner neu; die heruntergeladene Datei kann gelöscht werden. Deinstallieren: dort oder in Windows unter „Apps & Features“ → Nexus Gaming Hub → Deinstallieren; Einstellungen und Daten bleiben, außer man wählt „auch Daten löschen“. Updates funktionieren wie vorher. Ohne Code-Signatur zeigt Windows beim ersten Start evtl. „Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“.

## Spielstart-Animation, bewegter Hintergrund, Übergänge, Atmosphären
Seite: /settings?s=design
Stichworte: ladebildschirm loading screen startanimation animation spielstart kino cinematic vorlage neon portal cyberpunk hologramm galaxie glitch hintergrund bewegt animiert partikel sterne raster übergang übergänge atmosphäre theme fire ice space glass
Einstellungen → Design & Layout. „Spielstart-Animation“: Ladebildschirm beim Spielstart an/aus, 8 Vorlagen, Dauer 1–8 s oder Schnellmodus (1,2 s), eigener Text, Bild des Spiels, „Vorschau“ (startet nichts). Der Startbefehl geht sofort an den PC; Antippen oder Esc überspringt. „Läuft auf dem PC“ steht erst da, wenn der PC das Spiel erkennt. „Bewegter Hintergrund“ (Partikel, Sternenflug, Neon-Raster, Wellen, Funken, Eiskristalle) mit Tempo, Menge, Deckkraft; „Seitenübergänge“ mit Dauer. Atmosphären (Cyberpunk, Neon, Space, Ice, Fire, Fantasy, Retro Arcade, Minimal Dark, Glass, Mono) stehen bei den Themes und setzen Farben, Hintergrund und Ladebildschirm zusammen. Bei „Animationen reduzieren“ oder leichter Darstellung: Standbild. Funktioniert ohne PC.

## Spiele automatisch in der Bibliothek (Steam, Epic, EA, Xbox)
Seite: /games
Stichworte: bibliothek leer keine spiele automatisch hinzufügen installiert erkannt einlesen abgleichen steam epic ea xbox game pass microsoft store xboxgames verknüpfen
Installierte Spiele kommen von selbst in die Bibliothek: Steam, Epic Games, EA app und die Xbox-App (Ordner „XboxGames“ auf allen Laufwerken, auch eigene Ordner aus der Xbox-App). Der PC gleicht kurz nach dem Start und danach alle 10 Minuten ab; deinstallierte Spiele, die so hinzugekommen sind, verschwinden wieder. Ein selbst entferntes Spiel kommt nicht wieder. „Jetzt abgleichen“ (bei leerer Bibliothek) gleicht sofort ab. Die Verknüpfungen sind einmal automatisch eingeschaltet und lassen sich unter Spiele → Steam / Epic / EA / Xbox einzeln ausschalten. Gestartet wird über den jeweiligen Launcher bzw. Windows. Nicht erkannt: ältere Microsoft-Store-Spiele ohne „XboxGames“-Ordner, Spiele anderer Launcher (z. B. Ubisoft, GOG) – die fügst du unter „Hinzufügen“ hinzu („Auf dem PC gefunden“ oder „Datei freigeben“).

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

## Musik-Visualizer und HUD-Layouts
Seite: /overlay-settings
Stichworte: musik visualizer equalizer spektrum balken welle kreis ton audio hud layout overlay anordnung speichern ranked streaming wechseln
Musik-Visualizer: als Widget auf dem Home-Bildschirm („Anpassen“) oder im Overlay hinzufügen. Er bewegt sich nur zu echtem Ton – Quelle wählen: „PC-Ton teilen“ (am PC in Chrome/Edge „Gesamter Bildschirm“ und „Systemaudio teilen“ ankreuzen), „Mikrofon“ oder „Audiodatei“. Nichts wird aufgenommen oder gesendet. HUD-Layouts: Overlay & Aufnahme → Overlay-Inhalt → „HUD-Layouts“: aktuelle Anordnung unter einem Namen speichern (bis 10) und später mit „Anwenden“ wechseln.

## Icon-Werkstatt
Seite: /games
Stichworte: icon werkstatt eigenes icon logo cover gestalten erstellen bild symbol emoji rahmen form kreis sechseck deck taste gamer-pass bild
Eigene Icons (1:1) und Cover (2:3) gestalten: bei einem Spiel oder Programm „Bearbeiten“ → Zauberstab-Knopf neben dem Cover; beim Deck unter „Bild“ → „In der Icon-Werkstatt gestalten“; im Gamer-Pass „Bild gestalten“. Vorlagen (Neon, Retro, Minimal, Gold, Ice, Fire), Symbol (bis 3 Zeichen oder Emoji) oder eigenes Bild mit Zoom, Form, Farben, Verlauf, Rand, Muster, Leuchten. „Übernehmen“ oder „Als Bild speichern“. Eigene Bilder werden im Browser neu gezeichnet (keine Metadaten, kein SVG). Ein eigenes Icon hat Vorrang vor dem Marken-Logo.

## Private Lobby (noch nicht verfügbar)
Seite: /help
Stichworte: lobby party freunde einladen gemeinsam spielen gruppe chat mehrspieler private lobby
Eine private Lobby mit Freunden gibt es noch nicht – dafür braucht es einen eigenen Server im Internet, der Räume und Einladungen zwischen verschiedenen Personen verwaltet. Nexus hat bewusst keinen fremden Server: alles läuft auf deinem PC und deinen Geräten. Zum gemeinsamen Spielen nutze vorerst Discord oder die Party-Funktion von Steam/Xbox.

## PC sperren, Energiesparen, Neustart, Herunterfahren
Seite: /monitor
Stichworte: herunterfahren ausschalten neustart neu starten sperren energiesparen ruhezustand standby pc aus shutdown restart lock sleep handy fernbedienung abbrechen
Vom Handy: Home → „Anpassen“ → Widget „PC-Energie“, oder PC Monitor → „Energie“, oder eine Deck-Taste („PC sperren / ausschalten“). „Sperren“ geht sofort für jedes Gerät, das Spiele starten darf. Energiesparen, Neustart und Herunterfahren fragen vorher; Neustart/Herunterfahren wahlweise sofort oder in 30 s bis 10 min – bis dahin auf jedem Gerät mit „Abbrechen“ zu stoppen. Dafür muss der PC das Recht einmal erlauben: am PC → Geräte → dein Handy → „PC ausschalten“ ankreuzen → Speichern. Geht nur, wenn der PC verbunden ist (wird nie für später gespeichert). Nur mit dem Windows-Begleiter.

## Hardware-Inventar
Seite: /inventory
Stichworte: hardware inventar geräte treiber treiberversion grafikkarte gpu cpu prozessor ram arbeitsspeicher monitor bildschirm laufwerk festplatte headset mikrofon controller maus tastatur netzwerk adapter usb
System → Hardware-Inventar. Zeigt, was der PC selbst auslesen kann: Prozessor, Arbeitsspeicher, Grafikkarte mit Treiberversion und -datum, Audio-Ausgänge und Mikrofone (Headsets am Namen erkannt), Controller mit Akku, Tastaturen und Mäuse (Hersteller, VID/PID), Monitore, Laufwerke mit freiem Platz und Netzwerkadapter. Was nicht lesbar ist, steht mit Grund da (z. B. sonstige USB-Geräte werden noch nicht erfasst). „Neu einlesen“ fragt den PC erneut; ohne PC wird der letzte Stand mit Datum gezeigt. Testton/Mikrofon-Test im Audio Center, Controller-Test unter Controller & RGB. Es wird kein Treiber installiert und nichts geändert.

## Fehlerberichte pro Spiel
Seite: /crashes
Stichworte: absturz abstürze crash crashes fehler fehlerbericht absturzbericht spiel stürzt ab hängt reagiert nicht ausnahmecode modul treiber exportieren vergleichen
System → Fehlerberichte. Nach einem Spiel prüft der PC, ob Windows einen Absturzbericht (Windows-Fehlerberichterstattung) für das Programm des Spiels geschrieben hat, oder ob das Spiel weniger als 2 Minuten lief – dann legt er einen Bericht an und schickt eine Benachrichtigung. Inhalt: Windows-Bericht (Fehlerbaustein, Ausnahmecode, Version), Spielversion, letzter Start, Gaming-Profil, System (Prozessor, Grafiktreiber), Änderungen kurz davor (Mods, Tresor, Profilwechsel). „Mögliche Ursachen“ sind immer Vermutungen mit Begründung. „Bericht erstellen“ macht einen Bericht zur letzten Sitzung eines Spiels; zwei Berichte ankreuzen → „Vergleichen“; „Als Text exportieren“ wahlweise ohne Benutzername, PC-Name und E-Mail. Nichts wird hochgeladen.

## Spiele auf ein anderes Laufwerk verschieben
Seite: /move
Stichworte: verschieben umziehen laufwerk festplatte ssd wechseln platz frei machen steam bibliothek kopieren anderes laufwerk installationsordner
System → Spiele verschieben → Spiel wählen. Zuerst steht der offizielle Weg des Launchers (Steam: Eigenschaften → Installierte Dateien → „Installationsordner verschieben“; Xbox-App: Verwalten → Dateien → Verschieben; Epic: neu installieren oder Ordner kopieren und „Überprüfen“). Für Steam-Spiele gibt es zusätzlich den Assistenten: Ziel = Steam-Bibliothek auf einem anderen Laufwerk (in Steam: Einstellungen → Speicher → „Laufwerk hinzufügen“), Prüfungen (vollständig installiert, Spiel läuft nicht, genug Platz + 1 GB Reserve, keine Verknüpfungen) → „Umzug vorbereiten“ → „Kopieren starten“ (jede Datei mit SHA-256 geprüft, anhalten/fortsetzen möglich) → Steam ganz schließen → „Umstellen“ → Spiel in Steam starten → „Funktioniert – Original löschen“. Bis dahin „Rückgängig“/„Abbrechen“ (Original bleibt immer). Ändert sich das Spiel nach dem Kopieren (Update), muss erst „Fortsetzen“ abgleichen. Ohne PC lässt sich ein Umzug nur vorbereiten.

## Spiele-Journal (Wo war ich?, Zielpfade, Sammlung, Story)
Seite: /journal
Stichworte: wo war ich noch mal erinnerung notizen tagebuch fortschritt zielpfad ziele etappen meilensteine belohnung vorlage archiv quest sammlung fund funde gegenstand geheimnis ort tags favoriten story kapitel figuren offene fragen spoiler spoilerfrei zusammenfassung
Spielbegleiter → Spiele-Journal. Funktioniert ohne PC: alles wird im Browser dieses Geräts gespeichert; ist der PC verbunden, wird mit seiner Kopie abgeglichen (andere Geräte sehen dasselbe, alles ist im PC-Backup). Oben zeigt ein Hinweis den Stand („Auf diesem Gerät gespeichert“, „Mit dem PC abgeglichen“, „… Änderungen nur hier“); antippen zeigt Details und Konflikt-Kopien (wurde ein Eintrag auf zwei Geräten geändert, gilt die neuere Änderung, die andere bleibt als Kopie auf dem PC und lässt sich wiederherstellen). Bereiche: „Wo war ich?“ – nach dem Spielen kurz notieren, was du gemacht hast, wo du bist und was als Nächstes kommt; beim nächsten Spielstart erscheint genau diese Notiz unten rechts (nur selbst Notiertes, nichts wird erraten), auch im Bearbeiten-Fenster des Spiels unter Spiele. „Zielpfade“ – eigene Etappen mit Belohnungen und Meilensteinen, Fortschritt aus den abgehakten Etappen, Vorlagen (Story, 100 %, Besser werden, Bauprojekt) und eigene Vorlagen, Archiv; ohne Druck (keine täglichen Pflichten, keine Fristen). „Sammlung“ – Quests, Gegenstände, Geheimnisse, Orte mit Status offen/gefunden/erledigt (Status antippen schaltet weiter), Tags, Bildern, Favoriten, Suche, Filter und Sortierung. „Story“ – eigene Zusammenfassung mit Kapiteln, Figuren und offenen Fragen; „Dein Stand“ wählen, die spoilerfreie Ansicht verdeckt alles danach und alles als Spoiler Markierte (antippen zum Zeigen). Jeder Eintrag kann mit anderen verknüpft werden (Wiki-Seite, Fund, Erinnerung …). Export/Import als JSON-Datei geht ohne PC. Bilder werden auf höchstens 1600 px verkleinert.

## Gaming-Wiki
Seite: /wiki
Stichworte: wiki seiten nachschlagen links verlinken rückverweise backlinks rezepte strategie boss notizen wissen versionen versionsgeschichte zusammenführen doppelt markdown
Spielbegleiter → Gaming-Wiki. Eigene Seiten, gespeichert auf diesem Gerät (ohne PC nutzbar) und mit dem PC abgeglichen. „Neue Seite“ → Titel und Text; [[Seitenname]] verlinkt eine andere Seite, [[Seitenname|Text]] mit eigenem Linktext. Gibt es die Seite noch nicht, ist der Link gestrichelt – antippen legt sie an. Unter jeder Seite stehen die Rückverweise (Seiten und Einträge, die hierher verlinken). Beim Bearbeiten wird automatisch gespeichert; der Text davor bleibt als Version (höchstens eine je 5 Minuten, die letzten 20) – „Versionen“ zeigt und stellt sie wieder her. Doppelte Titel erscheinen in der Übersicht mit „Zusammenführen“ (Texte werden angehängt, der alte Titel bleibt als „Auch bekannt als“, Links funktionieren weiter). Umbenennen hält Links heil: der alte Titel wird automatisch zu „Auch bekannt als“. Die Übersicht zeigt „Links ohne Ziel“ mit „Anlegen“. Export/Import aller Seiten als JSON, einzelne Seite „Als Markdown“.

## Welten & Bauen (Minecraft-Welten, Bauprojekte, Karten-Marker)
Seite: /worlds
Stichworte: minecraft welt welten koordinaten seed nether oberwelt umrechnen portal basis farm bauprojekt bauen material aufgaben fortschritt karte marker kartenmarker gebiet
Spielbegleiter → Welten & Bauen. Funktioniert ohne PC (im Browser gespeichert, mit dem PC abgeglichen). „Minecraft-Welten“: Name, Edition (Java/Bedrock/unbekannt), Version, Modus, Seed (nur wenn bekannt), Orte mit Dimension und X/Y/Z, Gruppen und Notizen; in der Detailansicht Nether ↔ Oberwelt umrechnen (Faktor 8 bei X und Z, Y bleibt), Abstand zwischen zwei Orten, Bauprojekte dieser Welt; Orte als CSV. Nexus liest keine Spielstände und zeichnet keine Karte. „Bauprojekte“: Welt verknüpfen, Status, Aufgaben (abhaken direkt in der Ansicht), Material (benötigt/vorhanden, was noch fehlt); der Fortschritt kommt nur aus den Aufgaben. Vorlagen Haus und Farm. „Karten-Marker“: Marker mit Gruppe, X/Y, erledigt; als Liste/Tabelle; auf einer Karte nur mit eigenem Kartenbild (Screenshot) – Stelle antippen setzt den Marker. Überall: Suche, Filter, Tabelle/Karten, Archiv, Duplizieren, Verknüpfen, Export/Import (JSON) und CSV.

## Builds & Technik (Builds, Mod-Sammlungen, Grafikvergleich, Steuerung)
Seite: /builds
Stichworte: build builds loadout ausrüstung klasse vergleichen mods modpack modliste versionen grafik grafikvergleich einstellungen screenshot schieber steuerung tastenbelegung controller lexikon offiziell
Spielbegleiter → Builds & Technik. „Builds“: frei wählbare Eigenschaften (Waffe, Talent …), Rolle, Modus, Notizen, Quelle, Favorit; Vorlagen (Waffen-Loadout, Charakter-Build, Fahrzeug-Setup); „Duplizieren“; „Mit anderem Build vergleichen“ zeigt Unterschiede (gelb) und nur bei einem vorhandene Werte. „Mod-Sammlungen“: Mods mit Version, Seite, Notiz und Status, den nur du setzt („Installiert (selbst markiert)“) – Nexus prüft nichts und lädt nichts herunter; Mods im Ordner am PC schalten: Seite Mods. „Grafikvergleich“: zwei eigene Screenshots mit Einstellungen, Schieber zum Vergleichen; FPS werden aus Bildern nie abgeleitet. „Steuerung“: Belegung je Gerät; „Offiziell“ nur mit Quelle, sonst „Eigene Angabe“.

## Freunde & Gruppe (Spieler-Karten, Was spielen wir?, Abstimmungen, Spieleabende, Teams, Turnier, Server)
Seite: /friends
Stichworte: freunde gruppe spieler karte profil avatar plattform zusammen spielen crossplay abstimmung umfrage link antwort gamingabend spieleabend termin einladung zusage absage zeitzone team rollen aufstellung turnier bracket ko doppel gruppenphase jeder gegen jeden freilos server status minecraft steam
Spielbegleiter → Freunde & Gruppe. Alles privat und ohne PC nutzbar (Ausnahmen: Serverstatus und Kalender-Erinnerung brauchen den PC). „Spieler-Karten“: Name, Avatar, Plattformen, Spiele (von Hand – Nexus kennt die Bibliotheken der Freunde nicht), Genres, Modi, Rollen, Verfügbarkeit (freiwillig), Zeitzone; „Darf geteilt werden“ nur mit Zustimmung der Person; „Das bin ich“ für die eigene Karte. „Was spielen wir?“: Personen antippen → Spiele, die alle haben; gleiche Plattform zuerst; bei verschiedenen Plattformen gilt Crossplay nur mit Quelle (Reiter „Spiel-Fakten“), sonst „unbekannt“; fehlt das Spiel jemandem, wird das gesagt. „Abstimmungen“: Optionen, ein oder mehrere Antworten, Frist; „Einladungs-Link“ teilen, Freunde stimmen ab und schicken einen Antwort-Link zurück, den du öffnest oder einfügst (keine Live-Ansicht); „Schließen“ beendet, „Link zurückziehen“ macht alte Links ungültig. „Gaming-Abende“: Datum/Uhrzeit mit Zeitzone (Freunde sehen ihre Ortszeit), Spiele und Alternativen, Eingeladene mit Zusage/Vielleicht/Absage (per Antwort-Link oder selbst eintragen), Notizen, Regeln, Absage; „In den Gaming-Kalender“ (Erinnerung über den PC, ohne PC vorgemerkt), Kalenderdatei .ics; vergangene Abende unter „Vergangen“. „Teams“: frei definierbare Rollen, Spieler/Platzhalter, mehrere Aufstellungen, Vorlagen (Shooter, MMO, Survival, Rennen). „Turniere“: K.-o., Doppel-K.-o. (mit Verliererrunde und ggf. zweitem Finale), Gruppen + Finalrunde, Jeder gegen jeden; Teilnehmer, „Auslosen“, Spiel antippen → Ergebnis eintragen (kein Unentschieden im K.-o., außer mit gewähltem Sieger); Freilose laufen automatisch weiter; ändert sich ein früheres Ergebnis, werden spätere Ergebnisse, bei denen jetzt andere spielen, gemeldet und nicht gezählt; Export CSV/Datei, Drucken/PDF, Historie. Ohne Geld, ohne Wetten. „Server“: Adresse, Port, Spiel, Region, Tags; „Aktualisieren“ fragt den Status über den PC ab – nur Minecraft Java (Server List Ping) und Steam/Source (A2S); sonst „Unbekannt“.

## Medien (Fotomuseum, Erinnerungsbuch, Screenshots sortieren, Clip-Momente, Soundtracks)
Seite: /media
Stichworte: medien fotomuseum galerie screenshot screenshots bilder fotos vollbild sammlung album erinnerungsbuch zeitleiste timeline momente sortieren doppelte duplikate prüfsumme format dateigröße clip clips zeitstempel videolink youtube twitch soundtrack soundtracks musik komponist cover spotify
Spielbegleiter → Medien. Ohne PC nutzbar; nur Aufnahmen vom PC brauchen den PC. „Fotomuseum“: „Bilder importieren“ (vom Gerät; gespeichert wird eine Kopie mit höchstens 1600 px plus kleines Vorschaubild, das Original bleibt); Aufnahmedatum aus den Bilddaten (EXIF) oder dem Dateidatum, änderbar; Spiel, Kategorie, Tags, Favorit, Beschreibung, Aufnahmeeinstellungen; Ansichten Raster, Galerie, Vollbild (Pfeile, Wischen, Tasten ← →); Filter und Sortierung; „Sammlungen verwalten“ (eigene Alben, auch mit PC-Aufnahmen); das gleiche Bild zweimal wird erkannt und nachgefragt; „Ins Erinnerungsbuch“; verknüpfen mit Grafikvergleich, Erinnerungen und Clip-Momenten über „Bearbeiten“ → „Verknüpft mit“. „Erinnerungsbuch“: Einträge mit Titel, Datum, Spiel, Geschichte, Bildern, Medienlinks, Tags, Kategorie, Favorit, Archiv; Zeitleiste nach Jahr und Monat; „Aus „Wo war ich?““ übernimmt eine Notiz aus dem Spiele-Journal. „Sortieren“: Aufnahmen vom PC (nur aus den bekannten Aufnahme-Ordnern) und Bilder des Museums in einer Liste; sortieren nach Datum, Dateiname, Spiel, Größe; filtern nach Quelle, Art, Format, Dateigröße, Spiel, Kategorie, Sammlung, Tag, Favorit; Mehrfachauswahl → Favorit, Tag, Kategorie, Zur Sammlung, Ins Fotomuseum (PC nötig), Ins Erinnerungsbuch, Löschen (nur nach Bestätigung; PC-Dateien in den Papierkorb); „Doppelte finden“ vergleicht den Inhalt (SHA-256, für PC-Dateien am PC berechnet) – „Alle Kopien auswählen (älteste bleibt)“ wählt nur aus, gelöscht wird erst nach Bestätigung; Export als CSV oder JSON. „Clip-Momente“: Videolink oder Aufnahme vom PC, Zeitstempel (1:23, 1:02:03 oder Sekunden) mit Beschreibung, Tag und Favorit; bei YouTube, Twitch-Videos und direkten Videodateien öffnet der Link an der Stelle, andere Seiten am Anfang; PC-Aufnahmen spielen mit verbundenem PC hier ab und springen zur Stelle; Nexus nimmt nichts auf und schneidet nichts. „Soundtracks“: Titel, Spiel, Künstler, Komponist, Album, Cover, Stimmung, Tags, eigene Sammlungen, Links zu offiziellen Diensten (Spotify, Apple Music, YouTube, Bandcamp, Steam …); kein eingebauter Player, nichts wird heruntergeladen.

## Remote Desktop (PC-Bildschirm live steuern)
Seite: /remote
Stichworte: remote desktop fernsteuerung fernsteuern bildschirm übertragen live sehen handy ipad iphone touch maus touchpad tastatur pc steuern spiegeln vollbild
Steuerung → Remote Desktop. Einmal am PC einschalten: Begleiter → Remote Desktop → „Remote Desktop erlauben“ (geht nur direkt am PC), dann unter Geräte → Handy → „Bildschirm ansehen“ (nur sehen) oder „Fernsteuern“ (sehen und steuern) ankreuzen → Speichern. Auf dem Handy/iPad: Remote Desktop → „Verbinden“. Gesten (Touch-Maus): tippen = Klick, zweimal tippen = Doppelklick, halten = Rechtsklick, halten und ziehen = Fenster ziehen, wischen = scrollen, zwei Finger tippen = Rechtsklick. Touchpad-Modus: Finger bewegt den Zeiger. Leiste: Tastatur (mit Strg/Alt/Umschalt/Win und Tastenkombinationen wie Strg+C, Alt+Tab, Task-Manager), Rechtsklick, Loslassen, Zoom 1–3×, Pause, Qualität (gemessene Bildrate, Datenrate, Antwortzeit; Automatisch/Wenig Daten/Ausgewogen/Hohe Qualität), Vollbild, Trennen. Am PC erscheint oben eine Leiste „… steuert diesen PC – Beenden“ und eine Benachrichtigung. Endet automatisch nach der eingestellten Höchstdauer, ohne Eingabe nach der eingestellten Zeit, wenn das Gerät nicht mehr antwortet, im Datenschutzmodus oder mit „Beenden“ am PC. Immer nur ein Gerät gleichzeitig. Ton: in der Leiste „Ton“ antippen (überträgt, was der PC abspielt; Standardgeräte und Mikrofon bleiben unverändert; etwa 0,3 s Verzögerung). Grenzen: Sperrbildschirm/UAC werden nicht übertragen, Programme mit Administratorrechten nehmen keine Fern-Eingaben, Strg+Alt+Entf nur am PC, exklusives Vollbild in Spielen kann schwarz sein (randloses Fenster wählen), Anti-Cheat wird nicht umgangen. Im WLAN direkt; von unterwegs nur über den eingerichteten Tunnel (Tailscale/Cloudflare) oder ein eigenes Relay.

## Spielzustand (Momentaufnahmen)
Seite: /gamestate
Stichworte: momentaufnahme snapshot spielzustand wiederherstellen zurückholen rückgängig vorher einstellungen konfiguration startargumente mods version vergleichen
Spiele → Spielzustand. „Momentaufnahme“ → Spiel wählen: der PC speichert Spielversion (Steam-Build), Startargumente, Arbeitsordner, verknüpftes Gaming-Profil, eine Kopie der Konfigurationsdateien, die im Savegame-Tresor für das Spiel eingetragen sind, Mods an/aus, Plugin-Versionen und Systemdaten. Automatisch vor Mod-Installationen, Mod-Wiederherstellungen und dem Zurückholen von Konfigurationsdateien (höchstens alle 10 Minuten). „Mit jetzt vergleichen“ oder zwei ankreuzen → „Vergleichen“. „Zurückholen …“ zeigt vorher, was sich ändert und was nicht enthalten ist (Spieldateien, Spielstände, gelöschte Mods, Windows); der jetzige Zustand wird vorher als eigene Momentaufnahme gespeichert, solange das Spiel läuft passiert nichts. Das Ergebnis jedes Schritts wird angezeigt und gespeichert. 20 je Spiel werden behalten.

## Datenschutz- und Notfalltaste
Seite: /
Stichworte: datenschutz notfall notfalltaste privat privacy verstecken verdecken mikrofon stumm mute sounds stoppen geräte trennen pausieren benachrichtigungen leise streamer
Schild oben in der Leiste (oder Deck-Taste „Datenschutzmodus an/aus“). „Schritte einstellen“: Soundboard stoppen, Mikrofon-Durchleitung ins virtuelle Kabel aus, Windows-Standard-Mikrofon stummschalten (nur Windows-Begleiter), Benachrichtigungen leise (keine Windows-Hinweise/Push, wahlweise nur bestimmte Kategorien), andere Geräte pausieren (abgemeldet bis zum Ausschalten, Kopplung bleibt), Inhalte verdecken (Benachrichtigungen, Dashboard-Widgets, Chats, Dateien, Aufnahmen; Antippen zeigt kurz). „Jetzt einschalten“ zeigt für jeden Schritt „Wirkt“, „Erledigt“, „Nicht möglich“ oder „Fehlgeschlagen“. „Ausschalten“ stellt nur zurück, was die Taste geändert hat. Discord, Spiele und andere Programme werden nicht stummgeschaltet. Ohne PC lassen sich nur die Inhalte auf dem eigenen Gerät verdecken; nichts wird für später vorgemerkt.

## Savegame-Tresor und Konfigurations-Versionen
Seite: /vault
Stichworte: savegame spielstand spielstände sichern sicherung backup wiederherstellen zurückholen tresor konfiguration config ini cfg json vergleichen version verlauf steam cloud prüfen integrität
Spiele → Savegame-Tresor. „Ort hinzufügen“ → Spiel wählen: der PC schlägt nur sichere Orte vor (Steam-Cloud-Ordner des Spiels, Ordner mit genau dem Namen des Spiels in Gespeicherte Spiele, Dokumente\My Games oder AppData) – nichts wird automatisch eingetragen; eigene Ordner und Konfigurationsdateien nur direkt am PC. Regeln: automatisch nach dem Spielen oder täglich (nur wenn sich etwas geändert hat), wie viele Sicherungen behalten. „Jetzt sichern“, „Prüfen“ (SHA-256 aller Dateien), „Zurückholen …“ zeigt vorher, was ersetzt, zurückkommt oder entfernt wird; der jetzige Stand wird vorher gesichert, solange das Spiel läuft passiert nichts. Konfigurationsdateien: „Mit jetzt vergleichen“ zeigt geänderte, neue und entfernte Einstellungen. Ohne PC lassen sich nur die Regeln ändern.

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

## Weitere eingebaute Widgets
Seite: /
Stichworte: widgets würfel münze foto speicherplatz meistgespielt aufnahmen abstimmung bauprojekte soundtrack challenges plugin fest eingebaut
Fest eingebaut (kein Plugin), über „Anpassen“ einblendbar: „Wo war ich?“ (letzte Notiz zu einem Spiel), „Nächster Gaming-Abend“, „Offene Abstimmung“, „Foto des Tages“ (aus dem Foto-Museum), „Bauprojekte“, „Soundtrack-Tipp“, „Offene Challenges“, „Würfel & Münze“ (W6, W20, Münze – echter Zufall im Browser), „Letzte Aufnahmen“ (Screenshots vom PC), „Speicherplatz“ (freier Platz der PC-Laufwerke) und „Meistgespielt (7 Tage)“. Die ersten acht gehen auch ohne PC.

## Kreativ-Studio
Seite: /studio
Stichworte: kreativ studio sammelkarte karten poster cover banner profilbild header kanalbanner youtube twitch steam ausstellung museum raum abzeichen badges gestalten editor
Fünf Bereiche, alles im Browser gespeichert (auch ohne PC, mit dem PC abgeglichen): „Sammelkarten“ – eigene Karten mit Bild, Name, Beschreibung, Spiel, bis zu 6 eigenen Werten, Farben, Hintergrund und Seltenheit (nur Optik, nichts zu kaufen, kein Zufall); duplizieren, als Bild speichern, teilen (System-Teilen, falls das Gerät es kann). „Poster & Cover“ und „Banner & Profilbild“ – Format wählen (z. B. Steam-Cover 600 × 900, YouTube-Banner 2560 × 1440 mit sichtbarem Bereich, Twitch 1200 × 480, Profilbild mit Kreis) oder eigenes Format, Vorlage nehmen, Text, Formen und eigene Bilder hinzufügen, ziehen und an der Ecke vergrößern, Rückgängig/Wiederholen (auch Strg+Z/Strg+Y), als PNG/JPG speichern. Nexus lädt nichts auf YouTube/Twitch hoch. „Ausstellung“ – Räume mit Stil (Galerie, Museum, Neon, Holz, Raumstation), Karten/Poster/Fotos aufhängen, verschieben, Größe, Rahmen, Beschriftung, Vollbild-Rundgang, Raum als Bild. „Abzeichen“ – werden aus deinen gespeicherten Einträgen gezählt (z. B. erste Sammelkarte, erstes Bauprojekt, zehn Notizen, erstes Bingo); eigene Abzeichen mit Zähler und Ziel.

## Spiele-Infos
Seite: /infos
Stichworte: release releases erscheint erscheinungstermin dlc kalender saison event battle pass patchnotes patch update erklärer faktencheck fakten crossplay koop offline controller cloud ultrawide mods barrierefreiheit untertitel farbenblind kontrast edition editionen deluxe doppelt empfehlung empfehlungen ähnlich gefällt
Sieben Bereiche, alles im Browser gespeichert (auch ohne PC, mit dem PC abgeglichen). „Releases“: Spiele, DLCs, Updates mit Termin „Bestätigt“ (nur mit Quelle), „Unbestätigt“ oder „Nur Zeitraum“; Monatsansicht, Erschienenes getrennt, „In den Kalender“ mit Erinnerung, „Auf die Wunschliste“. „Saisons & Events“: Beginn/Ende mit der Zeitzone der Ankündigung, gezeigt in Ortszeit und laut Ankündigung; ohne Ende steht „Begonnen (Ende unbekannt)“. „Update-Erklärer“: offizielle Steam-Patchnotes laden (braucht den PC, Steam erlaubt die Abfrage nicht direkt aus dem Browser) oder einfügen; Sortierung nach Gameplay/Neue Inhalte/Fehlerbehebungen/Technik nach Stichwörtern und Überschriften – jede Zeile wörtlich, Original bleibt; als gelesen markieren. „Faktencheck“ und „Barrierefreiheit“: je Spiel Ja/Teilweise/Nein/Unbekannt mit Quelle und Stand, Vergleich bis zu 4 Spielen, „Muss haben“-Filter (Unbekannt zählt nie). „Editionen & DLCs“: Inhalte nebeneinander, „Habe ich“ markieren, Doppelkauf-Warnung, Preise nur mit Quelle. „Empfehlungen“: regelbasiert aus eigenen Daten (Genre & Spielgefühl aus dem Faktencheck, Bibliotheks-Kategorien, Spielweise), mit Gründen, keine KI.

## Auswertungen
Seite: /insights
Stichworte: jahresrückblick rückblick jahr statistik spielstil auswertung leistungsarchiv fps messung benchmark
Drei Bereiche, nur aus echten Daten des PCs (Spielverlauf) oder deinen eigenen Einträgen – ohne PC wird nichts geschätzt. „Jahresrückblick“: Spielzeit, Sitzungen, aktive Tage, längste Serie, Spielzeit je Monat, meistgespielte Spiele, längste Sitzung, Lieblingstag, neue Spiele (nur wenn davor schon aufgezeichnet wurde) und Vergleich mit dem Vorjahr; als Bild teilen (Spielnamen und Spielzeit abschaltbar) oder drucken/als PDF speichern. Der PC behält die letzten 1000 Sitzungen. „Spielstil“: Tageszeit und Wochentag, Sitzungslänge, Lieblings-Kategorien, Bewertungen, Favoriten, Backlog – Merkmale erst ab 10 Sitzungen, jede Aussage mit der Zahl dahinter. „Leistungsarchiv“: CPU/GPU/RAM-Last aus Sitzungen übernehmen oder Messungen selbst eintragen (FPS, 1 % Low, Frametime, Temperaturen z. B. aus CapFrameX – der PC misst FPS nicht); zwei Messungen vergleichen.

## Startseiten
Stichworte: startseite seiten dashboard teilen layout home mehrere
Home → „Anpassen“: mehrere eigene Startseiten (bis 20) anlegen, umbenennen, löschen und oben per Tipp wechseln – für Handy und großen Bildschirm getrennt merkbar. „Seite als Link teilen“ oder „Als Datei“ gibt nur die Anordnung der Widgets weiter (keine Einstellungen, Schlüssel oder eigenen Widgets); wer den Link öffnet, sieht zuerst eine Vorschau und fügt die Seite als neue Seite hinzu.

## Datenzentrum
Seite: /settings?s=backup
Stichworte: export import datenzentrum csv pdf json sichern übertragen konflikt
Einstellungen → Backup & Wiederherstellung → Datenzentrum: Sammlungen (nach Bereichen wählbar) und Design/Startseiten dieses Geräts als JSON-Datei, als Tabelle (CSV je Art) oder gedruckt/PDF sichern – ohne PC. Import zeigt vorher, was neu, gleich oder anders ist; bei Unterschieden wählst du: neuere behalten, meine behalten, aus der Datei übernehmen oder beide behalten (als Kopie). Design kann ersetzt oder die Startseiten als neue Seiten hinzugefügt werden.

## Ultimate Gaming Bingo
Seite: /play?tab=bingo
Stichworte: bingo gaming bingo 3x3 4x4 5x5 aufgaben abhaken reihe spalte diagonale schwierigkeit leicht mittel schwer sehr schwer gemischt speed survival boss koop wettbewerb eigene aufgaben deepseek widget overlay internet steam erfolge wikipedia immer erlauben
Unter „Was spiele ich?“ → Bingo. Erstellen per Satz („Erstelle ein 4×4-Bingo für Minecraft auf mittel“) oder Einstellungen: Größe, Schwierigkeit, Spieler, Spielmodus, Aufgabenarten, Anfänger/Erfahrene, Spoiler, freie Mitte, Zeitlimit, eigene Regeln. Geht auch im KI-Assistenten direkt im Chat. Aufgaben kommen ohne KI aus dem eingebauten Katalog (eigene Aufgaben für Minecraft, Elden Ring, PEAK, Terraria, Stardew Valley, Rocket League, CS2, Valorant, Fortnite, Lethal Company, Phasmophobia, Subnautica, Sea of Thieves, Baldur's Gate 3, Forza Horizon, EA SPORTS FC; sonst allgemeine Aufgaben nach Spielart), mit KI am PC spielspezifisch (DeepSeek, Claude oder Ollama – unter KI-Assistent → Einrichten → Bingo-KI; den DeepSeek-Schlüssel gibt man nur am PC ein). Felder antippen = erledigt, nochmal = zurück; Reihen, Spalten und Diagonalen werden erkannt. Mehrspieler als gemeinsame Karte oder Wettbewerb. „Meine Bingos“ speichert Fortschritt, Bewertung und Favoriten. Eigene Aufgaben unter „Eigene Aufgaben“. Als Home-Widget „Bingo“ und im PC-Overlay abhakbar. Für Spiele ohne eigene Aufgaben (z. B. Make Way) fragt der Chat, ob im Internet nachgesehen werden darf („Ja“, „Ja, immer erlauben“, „Nein“): Das geht für jedes Spiel, auch für Spiele mit eigenen Aufgaben (dann für mehr Abwechslung). Der PC sucht das Spiel bei Steam (Erfolge mit Freischaltquote, Genre, Mehrspieler, Beschreibung), sonst im Microsoft Store (Xbox), sonst bei Wikipedia; mit einer Bingo-KI schreibt die KI aus diesen Infos passende Aufgaben. Echte Erfolge, KI-Aufgaben und Aufgaben zur Spielart werden gemischt, Zahlen wechseln (z. B. 3, 5 oder 10 Gegner), und die letzte Karte wird nicht wiederholt – so ist jedes Bingo anders. Google wird nicht abgefragt. Klappt etwas nicht, entsteht die Karte trotzdem mit allgemeinen Aufgaben, und der Grund steht dabei.

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
Persönliche Spielplanung für Spiele aus der Bibliothek: Status (Noch spielen, Als Nächstes, Gerade aktiv, Pausiert, Durchgespielt, Nicht mehr interessant), Priorität (keine/niedrig/mittel/hoch), eigenes Ziel in Stunden mit Fortschritt aus dem Gaming-Verlauf. Filter nach Status, Plattform, Kategorie und Spielzeit; Sortierung nach Priorität, Name, zuletzt gespielt, Spielzeit. „Zufallsauswahl“ zieht ein Spiel aus gewählten Status (höhere Priorität optional öfter). Den Status setzt nur der Nutzer – nichts wird automatisch als durchgespielt markiert; läuft ein Spiel, wird „auf Gerade aktiv setzen“ nur angeboten. Gespeichert auf dem PC (alle Geräte sehen dasselbe, im Backup enthalten). Export als JSON und CSV, Import (JSON) mit Vorschau – Spiele, die es in der Bibliothek nicht gibt, werden übersprungen. Spiele, die man noch nicht besitzt: Wunschliste im Deal Radar. Stift-Knopf je Spiel: Bewertung (1–5 Sterne), Tags, eigene Zeitschätzung gesamt (als Schätzung angezeigt) und „Eine Sitzung dauert etwa … Minuten“ (für den Zeit-Finder), Notizen. „Archivieren“ (im Status-Menü) behält Status und Daten, nimmt das Spiel aber aus der Liste – Chip „Archiv“ zeigt sie, dort „zurückholen“ oder ganz entfernen. „Auswählen“ → mehrere Spiele ankreuzen → Status, Priorität oder Archiv für alle setzen. Steht dasselbe Spiel doppelt in der Bibliothek (z. B. Steam und Xbox), erscheint „Vielleicht doppelt“ mit „Zusammenführen“: Status, Priorität, Bewertung, Tags, Notizen und Schätzungen kommen zum gewählten Eintrag, der andere bleibt zum Starten in der Bibliothek, aber nicht mehr im Backlog. Änderungen ohne PC werden vorgemerkt und beim Verbinden übertragen.

## Was spiele ich? (Zeit-Finder, Challenges, Bingo)
Seite: /play
Stichworte: zeit finder wie viel zeit habe ich minuten was soll ich spielen vorschlag zufall challenge herausforderung generator bingo karte reihe spalte diagonale teilen link bild ki ai automatisch aufgaben vorschlagen generieren
Spielbegleiter → Was spiele ich?. „Zeit-Finder“: verfügbare Zeit wählen (10–15, 30, 45, 60, 90, 120+ Minuten oder eigene), Filter (Backlog-Status, Kategorie, zuletzt gespielt, nur installierte). Vorgeschlagen werden nur Spiele, deren Sitzungsdauer bekannt ist – aus deiner Angabe im Backlog oder dem Median der echten Sitzungen im Gaming-Verlauf (ab 3 Sitzungen von mindestens 5 Minuten); jede Karte nennt die Gründe (z. B. „Als Nächstes“, „Priorität hoch“, „Du hast notiert, wo du warst“). Spiele ohne bekannte Dauer stehen getrennt unter „Dauer unbekannt“. „Zufällig eins davon“ zieht eins (höhere Priorität öfter). „Challenges“: „Vorschläge erzeugen“/„Neu würfeln“ – allgemeine Vorschläge (als solche markiert, „falls das Spiel es erlaubt“) und, wenn gewünscht, Vorschläge aus deinen Daten (lange nicht gespielt, „Als Nächstes“ noch nie gespielt, nächste Etappe eines Zielpfads, offene Funde). Spielspezifische Challenges legst du selbst an („Eigene Challenge“) – Nexus erfindet keine. Speichern, bearbeiten, abhaken. „Bingo“: Neue Karte (3×3, 4×4, 5×5, Mitte frei bei ungerader Größe), Vorlage „Allgemein“ oder „Koop-Abend“ und/oder eigene Aufgaben (eine pro Zeile); „Aufgaben von der KI“: Spiel wählen, Größe (3×3, 4×4 oder 5×5) festlegen, „Aufgaben vorschlagen“ – die KI (Lokale KI/Ollama, 0 €, oder Claude) schreibt so viele Aufgaben zu genau diesem Spiel, wie die Größe braucht; doppelte, zu lange und Überschriften werden aussortiert, die Aufgaben landen bei den eigenen Aufgaben und lassen sich noch ändern (die KI ersetzt dabei die Vorlage). Dafür muss unter KI-Assistent → Einrichten „Lokale KI“ oder „Claude“ gewählt sein, sonst erscheint ein Hinweis; die Karte geht immer auch ohne KI. Felder antippen; volle Reihen, Spalten und Diagonalen werden grün und gemeldet. „Als Bild“ (PNG), „Als Datei“ (JSON), „Link teilen“ (die Karte steckt nur im Link, nichts liegt online – Empfänger kann sie als eigene Karte speichern), „Neu mischen“, „Häkchen zurücksetzen“. Alles funktioniert ohne PC; die Spieleliste ist der zuletzt vom PC bekannte Stand.

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
Stichworte: deal preis angebot sale rabatt wunschliste zielpreis steam günstig xbox microsoft store vergleich hinzufügen name instant gaming eneba keyforsteam gg.deals ggdeals key keys keyshop keyshops tiefstpreis
Ohne PC prüft das Handy die Xbox-Preise selbst beim Microsoft Store („Xbox-Preise prüfen“, auch gleich nach dem Hinzufügen); Steam-Preise ohne PC kommen aus der Steam-Preisliste der Website (rund 3000 beliebte Spiele, alle 6 Stunden erneuert, nur Shop-Land DE) – Steam erlaubt keine Abfrage direkt aus dem Browser; seltene Spiele prüft der PC beim Verbinden. Zuordnung nur zum Spiel selbst oder einer Edition („Minecraft“ wird nicht „Minecraft Legends“). Wunschliste als Kacheln: Originalbild des Spiels, darunter der Preis bei Xbox (Microsoft Store) und bei Steam, der günstigere grün. Kachel antippen = Details mit Preisverlauf, Zielpreis, Links zu den Shops und „Läuft das auf meinem PC?“; dort „Bearbeiten“ für Zielpreis und Notiz. Einstellungen (Preisabfrage, Xbox-Vergleich, Steam-Wunschliste, Shop-Land) sind unten eingeklappt. Zum Hinzufügen reicht der Name des Spiels („Spiel hinzufügen“) – der PC sucht es im Steam-Shop; ohne PC wird der Name vorgemerkt und beim Verbinden gesucht. „Genauer suchen“ zeigt Treffer zur Auswahl. Mit „Steam-Wunschliste automatisch übernehmen“ holt der PC bei jeder Prüfung deine Steam-Wunschliste (sie muss öffentlich sein). „Auch im Microsoft Store (Xbox) vergleichen“ zeigt zusätzlich den Preis aus dem Katalog der Xbox-App und ob er günstiger als Steam ist. Preise werden nur abgefragt, wenn „Preise im Steam-Shop abfragen“ an ist; dann höchstens alle 6 Stunden und nie während eines Spiels. Benachrichtigung, wenn der Zielpreis erreicht ist. Preisverlauf = nur selbst gesehene Preise. Andere Shops (Epic, GOG, Key-Seiten) werden nicht abgefragt. Key-Shops: Mit einem kostenlosen GG.deals-API-Schlüssel (bei gg.deals anmelden → im Konto API-Schlüssel erstellen, gg.deals/api; am PC unter Deal Radar → Einstellungen → „Key-Shop-Preise (GG.deals)“ eintragen, wird geprüft und verschlüsselt gespeichert) zeigt der Deal Radar je Spiel den günstigsten Key-Shop-Preis (Instant Gaming, Eneba und viele mehr), den Tiefstpreis und den günstigsten offiziellen Shop; der Zielpreis-Alarm zählt den Key-Shop-Preis mit. Einzelpreise je Shop zeigt „Alle Angebote bei GG.deals“. Dazu Links „Bei Instant Gaming / Eneba / Keyforsteam ansehen“ (Suche mit Euro-Preisen). Ohne Schlüssel kein Key-Shop-Preis (Instant Gaming, Eneba und Keyforsteam haben keine öffentliche Preisabfrage). Nicht jeder günstigste Key ist ein Steam-Key – Region und Plattform im Shop prüfen.

Preisvergleich (Keyforsteam): Im Deal Radar ein Spiel öffnen → „Preise laden“. Der PC holt die Spieleseite von keyforsteam.de (nur auf Knopfdruck, höchstens alle 5 Sekunden, 6 Stunden gespeichert) und zeigt die Angebote mit Shop, offiziell/Key-Shop, Shop-Bewertung, Edition, Region, Plattform, Preis inklusive günstigster Zahlungsgebühr und Gutschein. Oben: günstigster offizieller Shop und günstigster Key-Shop derselben Edition. Filter: Edition, Region, „Nur offizielle Shops“. Konto-Angebote (fremdes Spielkonto statt Key) sind ausgeblendet und lassen sich einblenden. Findet Keyforsteam das Spiel unter dem Namen nicht, den Link der Spieleseite einfügen. Key-Shops sind Marktplätze – Keys können gesperrt werden; Region und Plattform vor dem Kauf prüfen.

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
Der QR-Code nutzt zuerst einen festen Namen des PCs (Router-Name wie gaming-pc.fritz.box oder Tailscale-Name), dann die WLAN-IP – mit festem Namen bleibt die Kopplung, auch wenn der Router dem PC eine neue IP gibt.

## iPhone/iPad dauerhaft verbunden
Seite: /devices
Stichworte: hilfe tailscale unterwegs mobilfunk feste adresse local bonjour verbindung weg wieder koppeln home-bildschirm app symbol safari andere adresse übertragen zugang website github offline kein pc verbunden ip geändert tailscale fritzbox
Der Browser merkt sich die Kopplung je Adresse getrennt, und auf iPhone/iPad hat die App vom Home-Bildschirm einen eigenen Speicher. Deshalb: Geräte & Verbindungen → „Dauerhaft auf diesem Gerät“. „Als App auf den Home-Bildschirm“ legt einen einmaligen Link (10 Minuten) in die Adresszeile – dann Teilen → „Zum Home-Bildschirm“; die App meldet sich selbst an und steht als eigenes Gerät in der Liste. „Andere Adresse nutzen“ überträgt den Zugang auf eine feste Adresse des PCs. Die Website (https://…github.io) kann den PC im WLAN nicht direkt erreichen (der Browser verbietet https → http); sie bietet dann „Zur PC-App (WLAN)“. Fester Name: Der PC meldet sich im WLAN selbst als nexus-<PC-Name>.local an (Bonjour/mDNS); der QR-Code nutzt diesen Namen, eine neue IP vom Router stört nicht – am Router ist nichts einzustellen. Von unterwegs: Tailscale auf PC und iPhone/iPad (gleiches Konto), einmalig in der Tailscale-Verwaltung MagicDNS + „Enable HTTPS“, dann am PC Einstellungen → Verbindung → „Tailscale-HTTPS einschalten“ (kein Befehl nötig). Schritt-für-Schritt: Einstellungen → Hilfe (geht auch ohne PC). Diagnose zeigt „Adresse dieser Seite“, „Home-Bildschirm-App“, „Dauerhafter Speicher“ und am PC „Feste Adresse“.
Diagnose → „Verbindungs-Check (10 Prüfungen)“: Website, Backend, Relay, WebSocket, Begleiter, Anmeldung, Gerät autorisiert, PC online, Herzschlag, Programme – jeweils mit Ursache, Uhrzeit, Lösung und sicherem Reparatur-Knopf (z. B. „Neu verbinden“, „Gerät koppeln“). Oben rechts steht immer der echte Zustand: Verbunden, Wiederverbinden …, Nicht angemeldet, Nicht autorisiert, PC offline. Die Kopplung läuft nicht ab; nur die Sitzung wird alle 12 Stunden automatisch erneuert. Höchstens 20 Geräte.

## Plugin Center
Seite: /plugins
Stichworte: plugins erweiterungen installieren katalog widgets themes aktionen pomodoro tageslimit weltzeit zufall clip
Plugins aus einem signierten Katalog oder als Datei: Widgets, Themes, Aktionen. Plugins führen nie Code auf dem PC aus; Widgets laufen abgeschottet. Rechte (z. B. Netzwerk) musst du beim Aktivieren erlauben. Prüflabor: „Alle prüfen“ oder Details → „Prüfen“ zeigt Paket-Unversehrtheit, Manifest und Version, unbekannte Einträge, Berechtigungen, Abhängigkeiten, Konflikte mit anderen Plugins, Fehler der letzten 7 Tage, Update und vorherige Version – ohne Plugin-Code auszuführen. Im Katalog (33 Plugins): Spielzeit heute, Top-Spiele der Woche, Wochenstatistik, Weiterspielen, „Was spiele ich?“ (Zufallsspiel), Tageslimit, Spiel-Serie, Meilensteine, Bibliothek in Zahlen, Favoriten-Start, Sound-Pad, Zufallssound, Profil-Wechsler, CPU & RAM Mini, Leistungs-Verlauf, GPU-Temperatur-Ampel, RAM-Wächter, Speicherplatz, Leistung pro Spiel, PC-Check, Pausen-Erinnerung, Fokus-Timer (Pomodoro), Weltzeit-Uhr, Game-Overlay, Aktionen (Gaming-Abend, Discord-Schnellton, Wettkampf-Modus, Clip-Knöpfe für OBS) und Themes (Neon, Retro, Pastell, E-Sport, OLED-Schwarz).

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
„Diagnose ausführen“ prüft Begleiter, Netzwerk, Relay, Audio und den Browser und zeigt Lösungen. Protokolle: `%APPDATA%\PCGameLauncherUltimate\logs`.

## Hilfe
Seite: /help
Stichworte: hilfe anleitung erste schritte
Kurzanleitung: Begleiter starten, Firewall „Private Netzwerke“ erlauben, Gerät koppeln, Spiele hinzufügen. iPhone: in Safari „Teilen → Zum Home-Bildschirm“.

## Suche
Stichworte: suche finden strg k
Strg+K (oder die Lupe) durchsucht Bereiche, Spiele, Programme, Sounds, Profile, Quick Actions und deine Startseiten – und auch ohne PC deine Sammlungen (Wiki-Seiten samt Text, Bingos, Notizen, Builds …). Von dort lässt sich auch der Assistent fragen.

## JARVIS Gaming
Seite: /jarvis
Stichworte: jarvis gaming assistent auftrag befehl ausführen direkt sitzung sprache mehrere schritte
JARVIS ist der Gaming-Assistent der App (Menü „JARVIS“). Ist „JARVIS führt Aufträge direkt aus“ an, erledigt er, was du ausdrücklich nennst: Spiele und Programme starten (und prüfen, ob sie laufen), Profile aktivieren, Sounds abspielen oder stoppen, Quick Actions, Ziele und Wunschliste – und Änderungen an der Website: neue Startseite für ein Spiel, Startseite übersichtlich ordnen, Widgets zeigen, Favoriten nach oben, Spieleübersicht sortieren, Kategorie für Lieblingsspiele, Profil für das nächste Spiel, Startseite zum Profil, Leiste, Design, Sprache. Mehrere Schritte gehen in einem Satz („Öffne Discord und starte dann Minecraft“); schlägt ein Schritt fehl, hört er auf und sagt es. „Warum ruckelt mein Spiel?“ misst jetzt Last, Speicher und Temperaturen. „Welche Spiele sind zu zweit spielbar?“ nutzt deine Kategorien und deinen Faktencheck. Nur was du selbst nennst, läuft direkt – alles andere bleibt ein Knopf; Löschen und Energie (Herunterfahren usw.) nie ohne Rückfrage. Die Sitzung gilt nur, solange die Website offen ist und JARVIS an ist (spätestens nach 15 Minuten ohne Auftrag aus); laufende Spiele bleiben beim Schließen offen. JARVIS ist nur für Gaming da, ändert nie den Programmcode und führt keine Shell-Befehle aus. Er spricht seine Antworten (Stimme an/aus im HUD) und merkt sich, was du sagst („Merk dir, dass …“, „Was weißt du über …?“, „Vergiss …“) – als Seite „JARVIS-Gedächtnis“ im Wiki; was er erledigt hat, steht auf „JARVIS-Protokoll“. Bingo für Spiele ohne eigene Aufgaben: Er fragt, ob er die Steam-Erfolge des Spiels laden darf – daraus werden echte Aufgaben, die Schwierigkeit kommt von der weltweiten Freischaltquote. Ein neues Bingo wiederholt die Aufgaben des letzten nur, wenn es keine anderen mehr gibt.

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

## Handy koppeln, wenn die Seite nicht öffnet
Seite: /pair
Stichworte: qr code öffnet nicht handy verbindet nicht lan kabel wlan firewall öffentliches netzwerk privat gast wlan feste adresse fritz box umziehen
PC am Kabel und Handy im WLAN geht, wenn beide am selben Router hängen. Unter „Gerät koppeln“ steht oben, ob die Windows-Firewall Handys durchlässt; sonst „Für Handys im Heimnetz freigeben“ antippen (Windows fragt einmal; die Regel gilt nur für den Begleiter und seinen Port, ein als „öffentlich“ eingestuftes Heimnetz wird dabei als privat eingestuft). Der QR-Code nutzt zuerst die IP-Adresse – die öffnet jedes Handy ohne extra App. Nach dem Koppeln bietet das Handy „Feste Adresse gefunden – Jetzt umziehen“ an, dann bleibt die Verbindung, auch wenn der Router eine neue IP vergibt. Nicht im Gast-WLAN, nicht über mobile Daten, VPN am Handy aus.

## Seitenleiste ordnen
Seite: /
Stichworte: leiste ordnen bereich entfernen ausblenden hinzufügen weitere funktionen ordner aufräumen kategorien einklappen menü übersichtlich
Am PC oben in der Seitenleiste auf den Stift („Seitenleiste ordnen“), am Handy unter „Mehr“ → „Bearbeiten“. Mit „−“ kommt ein Bereich in den Ordner „Weitere Funktionen“ am Ende der Leiste (dort weiter anklickbar), mit „+“ wieder zurück. Kategorien lassen sich mit einem Klick auf ihre Überschrift einklappen. „Aufräumen (Vorschlag)“ legt selten genutzte Bereiche in den Ordner, „Alle anzeigen“ holt alle zurück. Home, Einstellungen und PC verbinden bleiben immer. Genauso bei den Reitern einer Seite (z. B. Freunde, Medien, Journal): Stift neben den Reitern, „−“ legt einen Reiter unter „Weitere“, „+“ holt ihn zurück.
