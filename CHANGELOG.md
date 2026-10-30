# Änderungsprotokoll

Format: `## MAJOR.MINOR.PATCH – Datum`, darunter `### Neu`, `### Verbessert`, `### Behoben` mit je einem Punkt pro Zeile.
Die Version selbst steht nur in der Datei `VERSION`. `scripts/release-manifest.mjs` liest diesen Eintrag
für die Update-Zentrale (Webseite und Begleiter) und für die Release-Notizen.

## 2.83.1 – 2026-10-30
### Behoben
- Gerät koppeln: Die Tailscale-Adresse (https://…ts.net) fehlte bis zu 5 Minuten, wenn Windows den Begleiter vor Tailscale gestartet hatte. Der Begleiter sieht jetzt jede Minute nach, solange Tailscale installiert, aber noch nicht gefunden ist, und sofort beim Öffnen der Koppeln-Seite – die Adresse erscheint dort von selbst, sobald Tailscale verbunden ist

## 2.83.0 – 2026-10-29
### Neu – KI-Router (kostenlos möglich)
- KI-Router für JARVIS: OpenRouter, Groq, MixRoute oder ein eigener Router im Heimnetz (OmniRoute, LiteLLM) – am PC unter KI-Assistent → Einrichten; Vorlagen mit Adresse und Hinweisen zu Kosten und Limits
- Modelle werden live vom Router geladen („Nur kostenlose Modelle“ vorausgewählt), bis zu drei in Wunschreihenfolge; ist eins besetzt oder am Limit, antwortet das nächste – unter der Antwort steht das Modell, das wirklich geantwortet hat, ein Ausweichmodell wird genannt
- Router-Schlüssel nur am PC, verschlüsselt, nie angezeigt, nie im Backup; nur https (oder http im Heimnetz); eigenes Monatslimit
- „Wer antwortet?“ bietet jetzt auch Gemini (kostenlos) und den KI-Router als Standard-KI; der Router ist auch in der Modellwahl im Chat und für die Recherche-Zusammenfassung wählbar
- Neuer Befehl `assistant.routerModels`
### Verbessert – Nachrichten bauen aufeinander auf
- Direkt nach einem Bingo ändert eine Rückmeldung die Karte („es soll Mittel sein und ich bin Impostor“, „größer“, „für zwei Spieler“, „andere Aufgaben“) – statt eine Wiki-Suche zu starten
- Among Us im Bingo-Katalog mit getrennten Aufgaben für Impostor und Crewmate; die Rolle geht auch als Regel an die KI
- Folgefragen ohne Spielnamen nutzen das zuletzt besprochene Spiel; die Recherche bekommt die letzten 4 Nachrichten als Kontext
### Behoben
- Rückmeldungen wie „das macht keinen Sinn“ oder „ich bin Impostor“ wurden als Suchbegriff nachgeschlagen („Ohne PC habe ich nur offene Wikis durchsucht …“)
- Mit JARVIS an stand unter KI-Antworten „Lokal · 0 €“ statt des Modells, das wirklich geantwortet hat – jetzt steht dort das echte Modell (auch ein Ausweichmodell des Routers)

## 2.82.0 – 2026-10-29
### Neu – Gaming-KI-Chat mit echter Webrecherche
- Entscheidung vor jeder Antwort: Wissensfrage direkt an das gewählte Modell, aktuelle Fragen (Neuigkeiten, Patchnotes, Updates, Release, Version) mit echter Suche, eigene Notizen aus dem Journal, Funktionen nur über die eingebaute Funktion, mehrere Schritte nacheinander; ohne erkennbares Spiel fragt JARVIS nach („Zu welchem Spiel ist die Quest?“)
- Echte Websuche mit Claude (offizielle Claude-Websuche, höchstens 3 Suchen je Frage, ca. 0,01 $ je Suche im Monatslimit): Antwort mit nummerierten, anklickbaren Quellen, Datum, zitierter Stelle; Bestätigtes, Schlussfolgerungen und Widersprüche getrennt; Webinhalte gelten nie als Anweisung
- Ohne Claude: offizielle Minecraft-Patchnotes (Mojang-Feed), Steam-Ankündigungen und offene Wikis – zusammengefasst von der KI am PC (Gemini kostenlos, Ollama, DeepSeek) oder als Fundstelle wörtlich; „Keine Internetsuche durchgeführt“, wenn keine lief
- Chat: Modellwahl (nur eingerichtete KIs, Gemini jetzt auch als Chat), Schalter „Im Internet suchen“, Phasen „Suche läuft / Quellen werden ausgewertet / Antwort wird erstellt“, Live-Text mit Claude, Abbrechen (stoppt die Anfrage am PC), Quellenbereich, Kopieren, Neu erzeugen, Fortsetzen
- Neue Befehle `assistant.research`, `assistant.cancel`; `assistant.ask` mit Modellwahl und Abbruch
- Doku `docs/KI-CHAT.md` (Bestandsanalyse, Architektur, Routing, Sicherheit, Einrichtung, Tests)
### Behoben
- Verbindungs-Check: Prüfung 6 (Anmeldung) meldete direkt nach dem Öffnen manchmal „Fehler“, obwohl die Anmeldung noch lief – der Check wartet jetzt kurz darauf

## 2.81.0 – 2026-10-29
### Neu
- JARVIS gibt nicht mehr bei „Das weiß ich nicht“ auf: Kennt er etwas nicht – auch einen bloßen Begriff oder Spielnamen ohne Frageform („Ship or Burn“) –, schlägt er nach (Spiele-Wikis, Wikipedia, Arqade …) bzw. fragt die KI, statt nur auf die App-Hilfe zu verweisen; mit und ohne PC
- Einstellung „Antworten auf Wissensfragen“ (JARVIS → Stimme & Ton): „Aus Quellen“ (Standard; KI per Knopf), „Quellen, sonst KI“ (findet er nichts, fragt er sofort die KI am PC) und „Direkt von der KI“ (gleich die KI am PC, z. B. das kostenlose Gemini; mit Knopf „In Quellen nachsehen“) – KI-Antworten bleiben als „ohne Quelle“ markiert
- Ohne PC-Verbindung oder ohne eingerichtete KI sieht er in den Quellen nach und sagt das
### Unverändert
- Vor dem ersten Gang ins Internet fragt JARVIS weiter („Ja“, „Ja, immer erlauben“, „Nein“); nach „Immer erlauben“ sucht er sofort ohne Rückfrage

## 2.80.0 – 2026-10-29
### Neu
- Kostenlose KI für JARVIS: Gemini von Google mit deinem eigenen, kostenlosen Schlüssel aus Google AI Studio (am PC unter KI-Assistent → „Kostenlose KI für JARVIS-Recherche (Gemini)“, verschlüsselt gespeichert, nie angezeigt, nie im Backup; Modell gemini-3.5-flash-lite, eigenes Monatslimit)
- Gemini fasst die gefundenen Quellen auf Deutsch mit Quellennummern zusammen, wenn kein Claude/keine lokale KI als Modus gewählt ist (Reihenfolge: Claude/Ollama nach Modus → Gemini → DeepSeek; die Antwort nennt immer, welche KI geschrieben hat)
- „KI fragen (ohne Quelle)“: findet JARVIS keine Quelle, kann er auf deinen Tipp die KI am PC aus ihrem eigenen Wissen antworten lassen – deutlich als ungeprüft markiert, mit „nicht sicher“-Hinweis der KI, und nicht als Wissen gespeichert (neuer Befehl `assistant.freeAnswer`)
- Verständliche Fehlermeldungen für Gemini: falscher Schlüssel, unbekanntes Modell, kostenloses Kontingent aufgebraucht, Region nicht verfügbar
### Hinweise
- Die Google-Suche über Gemini ist im kostenlosen Tarif nicht enthalten und wird nicht genutzt; im kostenlosen Tarif darf Google die gesendeten Texte (Frage + öffentliche Wiki-Stellen) zur Produktverbesserung nutzen
- ChatGPT hat keinen kostenlosen Zugang für Apps; die kostenlose ChatGPT-Webseite automatisch zu bedienen erlauben die OpenAI-Bedingungen nicht – deshalb nicht eingebaut

## 2.79.0 – 2026-10-29
### Neu
- JARVIS kennt jetzt die Wikis von über 80 Spielen (vorher 10), jedes einzeln geprüft: u. a. Hollow Knight, Valheim, Zelda, Pokémon (Bulbapedia), League of Legends (offiziell), Genshin Impact, Rocket League, Fallout, Witcher, Dark Souls, Hogwarts Legacy, Among Us, Apex, Valorant, Overwatch, Counter-Strike, Rainbow Six, Call of Duty, Sims, Satisfactory, Factorio, RimWorld, Subnautica, Hades, Dead by Daylight, Rust, ARK, Don't Starve, Path of Exile, Warframe, Sea of Thieves, No Man's Sky, Borderlands, Assassin's Creed, Red Dead, Mario, Halo, World of Warcraft, Hearthstone, Lethal Company, Helldivers 2, Monster Hunter, Sekiro, Bloodborne, Starfield, Diablo, Dota 2, Resident Evil, Forza, Need for Speed, Smash Bros., God of War, The Last of Us, Final Fantasy, Kingdom Hearts …
- Neue Themenquellen außerhalb von Spielen: Klexikon (Kinder-Lexikon, einfach erklärt), Wikivoyage (Reisen), Super User (PC-Probleme mit Antworten und Stimmen), Board & Card Games (Brettspiel-Regeln)
- Spiele werden überall im Satz erkannt („Wie besiege ich Hornet in Hollow Knight?“), mehrdeutige Namen (Rust, Halo, Hades …) nur nach „in/bei …“
- Neue Frageformen: „Was tun, wenn …“, „Wie kann ich …“, „Welche … gibt es …“, „Wie behebe/repariere ich …“
### Verbessert
- Trefferwahl: die Seite mit genau dem gefragten Namen zuerst (auch wenn die Suche sie nicht oben zeigt), keine Unterseiten wie „…/Netflix series“, keine Wiki-Bausteine als Antwort; bis zu drei Treffer je Quelle werden versucht
- „… in Rom“ ist ein Ort, kein Spiel: dann werden die allgemeinen Quellen gefragt

## 2.78.0 – 2026-10-29
### Neu
- JARVIS fragt viele Quellen gleichzeitig und nimmt die beste: Spiele-Wikis (neu: Skyrim/UESP und Elder Scrolls Wiki, Fortnite, Cyberpunk 2077, GTA, Palworld, Baldur's Gate 3), Wikipedia (deutsch und englisch) und bei Spieler-Fragen („stärkste“, „beste“, „wie/wo …“) Arqade (Stack Exchange) mit Antworten und Stimmen von Spielern (CC BY-SA, mit Autor)
- Spiele, die nicht im Katalog stehen, erkennt er am Satzende („… in Skyrim“, „… bei Hollow Knight“); deutsche Spielwörter werden für englische Quellen übersetzt (stärkste Waffe → strongest weapon)
- Mit verbundenem PC: deutsche Antwort, die die KI am PC nur aus den gefundenen Quellen schreibt, mit Quellennummern [1], [2] … (neuer Befehl `assistant.summarize`; ohne KI am PC zeigt JARVIS die beste Textstelle); dazu passende YouTube-Videos über deinen eigenen YouTube-Schlüssel
- „Beste Quelle“ und „Weitere Quellen“ in jeder Antwort; Suche bei YouTube, TikTok, Reddit und Instagram als Knöpfe zum Selbst-Ansehen (diese Seiten erlauben kein automatisches Durchsuchen – JARVIS liest sie nicht aus)
- Neue Fragen: „Wo finde ich …“, „Wie besiege ich …“, „Wie bekomme ich …“
### Behoben
- „Was ist die stärkst WAFFE in Skyrim“ fand nichts: das Spiel blieb im Suchbegriff und nur Wikipedia wurde gefragt

## 2.77.0 – 2026-10-29
### Neu
- JARVIS schlägt nach, was ihm niemand beigebracht hat: Fragen wie „Was ist ein Creeper in Minecraft?“, „Wer ist Malenia in Elden Ring?“, „Such im Internet nach Moon Lord“ oder „Wikipedia: Hidetaka Miyazaki“ beantwortet er aus offenen Wissensquellen mit offizieller Schnittstelle – zuerst das Wiki des Spiels (Minecraft Wiki, Terraria Wiki, Stardew Valley Wiki, Elden Ring Wiki), dann Wikipedia (deutsch, dann englisch) – immer mit Quelle und Link; englische Texte werden als solche gekennzeichnet
- Vorher fragen: beim ersten Mal „Darf ich im Internet nachsehen?“ mit „Ja, nachsehen“, „Ja, immer erlauben“, „Nein“; umstellbar in JARVIS → Stimme & Ton → „Unbekanntes nachschlagen“ (Vorher fragen / Immer / Nie). Gesendet wird nur der Suchbegriff, keine Suchmaschine wird ausgelesen
- JARVIS lernt dazu: Nachgeschlagenes steht mit Quelle und Datum auf der Wiki-Seite „JARVIS-Wissen (nachgeschlagen)“ (änderbar, löschbar, über den PC auf alle Geräte) – bei der nächsten gleichen Frage antwortet er von dort, ohne erneut ins Internet zu gehen; „Was hast du nachgeschlagen?“
- Ehrlich bei Lücken: Findet er nichts wirklich Passendes, sagt er das und notiert die Frage unter „JARVIS: offene Fragen“ – „Welche Fragen konntest du nicht beantworten?“
### Verbessert
- Wissensfragen öffnen keine Seite mehr („Was ist ein Creeper in Minecraft?“ sprang zu „Welten & Bauen“) und starten nichts; passt die eingebaute App-Hilfe nicht zum Thema, schlägt JARVIS nach statt eine unpassende Antwort zu geben

## 2.76.0 – 2026-10-28
### Neu
- Soundboard: Icon (Emoji) je Sound-Kachel, „Zufallssound“ (aus der aktuellen Auswahl), Vorschläge für Soundboard-Profile beim Anlegen einer Sammlung (Minecraft, Elden Ring, Discord, Horror-Gaming, Lustige Sounds, Eigene Sammlung)
- Audio Center → Discord einrichten: Discord-Check mit fünf Schritten live aus deiner Auswahl (Kabel installiert, Soundboard aufs Kabel, Mikrofon im Kabel, selbst mithören, Discord-Eingabegerät) – der letzte Schritt ehrlich als „kann keine App prüfen“; „Testton ins Kabel“
- Abschlussbericht des Ausbaus in docs/AUSBAU-SECHS-FUNKTIONEN.md
### Verbessert
- Das Kabel selbst als Mikrofon gewählt wird erkannt und erklärt

## 2.75.0 – 2026-10-28
### Neu
- PC-Steuerung (Steuerung → PC-Steuerung): Verbindungsstatus mit letztem Kontakt und Fehlermeldung, Live-Werte (CPU, RAM, GPU, Laufwerke – alle 5 s nur solange die Seite offen ist), laufende Spiele/Programme mit „Beenden“ (mit Bestätigung, sanft wie das X), Favoriten und zuletzt Gestartetes mit einem Tipp, Programme mit dem meisten Speicher/CPU (nur auf Tipp gemessen), Links zu Verbindungs-Check, Geräten & Rechten, Verbindungseinstellungen und Remote Desktop
- Spielsitzungen vergleichen: zwei Sitzungen mit CPU/RAM/GPU-Werten nebeneinander (vom PC während des Spielens gemessen)
- JARVIS Leistungsanalyse: „Warum läuft mein Spiel langsam?“, „Welche Programme verbrauchen am meisten RAM?“, „Ist meine GPU aktuell stark ausgelastet?“, „Was könnte meine FPS beeinträchtigen?“, „Wie warm ist meine GPU?“ – getrennt in 📊 Gemessen, 💡 Vermutung und ✅ sichere nächste Schritte; nichts wird automatisch geändert oder geschlossen
- Begleiter: library.close (Spiel/Programm aus der Bibliothek sanft schließen), monitor.now (eine Messung für Fragen), system.topProcesses (Speicher/CPU je Programm, nur auf Anfrage, 5 s zwischengespeichert)
### Verbessert
- FPS werden weiterhin nur als „nicht verfügbar“ angezeigt, solange kein zuverlässiger Frame-Zähler eingebunden ist; JARVIS nennt das ausdrücklich
- Windows-Prozesse, Treiber, Launcher, Anti-Cheat und Sicherheitssoftware werden nie zum Schließen vorgeschlagen
### Behoben
- Anmelde-Sperre zählt nur noch fehlgeschlagene Versuche: Mehrere Geräte hinter einem Router, Relay oder Tailscale, die sich oft neu verbinden, wurden nach 20 gültigen Anmeldungen in 5 Minuten fälschlich abgewiesen („Nicht angemeldet“). Schutz gegen Raten bleibt (20 Fehlversuche → kurze Sperre)

## 2.74.0 – 2026-10-28
### Neu
- KI-Design-Editor: JARVIS versteht Design-Wünsche in normaler Sprache und kombiniert sie – „Mach mein Dashboard etwas heller“, „Gestalte die Website im Cyberpunk-Stil“, „Minecraft-Theme mit grünen Akzenten“, „Mach das Design minimalistischer“, „dunkles Design mit lila Neon-Akzenten“, „Schaltflächen größer für mein iPad“, dazu runder/eckiger, mehr/weniger Abstand, Schatten, Rahmen, Schrift, Animationen, durchsichtigere/deckendere Karten
- Vorschau vor dem Speichern: Änderungen werden erst angezeigt („Design-Vorschau – noch nicht gespeichert“), dann „Übernehmen“ oder „Verwerfen“ (Leiste unten oder per Chat); „Letzte Designänderung rückgängig“ und „Ursprüngliches Design wiederherstellen“ (Chat und Einstellungen → Design)
- Neue Themes: Minecraft, Purple Gaming, Blue Gaming (zusätzlich zu Neon, Minimal Dark, Cyberpunk, Schwarz-Weiß, Light Mode …)
- Einstellungen → Darstellung: Abstände (kompakt/normal/luftig), Schatten (keine/weich/kräftig), Rahmen (dezent/deutlich), große Schaltflächen für iPad/Touch
### Verbessert
- Auch die bisherigen Design-Befehle („Mach das Design hell“, „Hintergrund Weltall“ …) zeigen jetzt zuerst eine Vorschau statt sofort zu speichern
- Lesbarkeit geschützt: zu schwache Akzentfarben werden angepasst oder nicht übernommen (mit Hinweis); Menü, Widgets und Funktionen ändert der Design-Editor nie

## 2.73.0 – 2026-10-28
### Neu
- JARVIS Challenge-Generator im Chat: „Erstelle fünf mittelschwere Minecraft-Challenges“, „Ich habe nur 20 Minuten – gib mir eine Herausforderung“, „sehr schwere Elden-Ring-Challenge ohne Story-Spoiler“, „drei lustige für einen Gaming-Abend mit Freunden“, „Horror-Challenge“, „Mach die aktuelle Challenge schwieriger/leichter“, „noch eine“, „Challenge geschafft“, „Bewerte die Challenge mit 4 Sternen“, „Meine offenen Challenges“ – Schwierigkeit (leicht bis sehr schwer, gemischt), Kategorie, Zeit und Mitspieler werden erkannt
- Die Aufgaben kommen aus demselben geprüften Katalog wie das Gaming-Bingo (nichts Erfundenes); neu im Katalog: GTA V/Online, Roblox, Palworld, Cyberpunk 2077, Lords of the Fallen, Age of Empires. Gespeicherte und geschaffte Challenges werden nicht wiederholt
- Gaming-Gedächtnis: „Merke dir, dass ich als Nächstes mein Minecraft-Haus fertigbauen möchte“ wird dem Spiel zugeordnet; „Wo war ich zuletzt in Minecraft?“, „Was sollte ich heute in Elden Ring machen?“ (mit Plan, Zielpfaden, offenen Funden, Bauprojekten, offenen Challenges und der letzten Spielsitzung vom PC), „Zeig mir alle offenen Projekte in meinen Spielen“, „Was weißt du über mich als Gamer?“, „Was spiele ich am meisten?“, „Was habe ich zuletzt gespielt?“
- Meine Challenges: Stufe und Herkunft sichtbar, Sterne-Bewertung, geschaffte Challenges optional als erledigtes Ziel im Gedächtnis des Spiels
### Verbessert
- JARVIS kennzeichnet die Herkunft: [vom PC gemessen], [deine Angabe], [Schätzung] – und sagt ausdrücklich, dass er keinen Spielstand ausliest

## 2.72.0 – 2026-10-28
### Neu
- Automatisierungen: neue Auslöser „Wenn ein Programm startet / beendet wird“ (z. B. Discord öffnet → Spotify öffnen), „Zu einer Uhrzeit“ mit Wochentagen und „Wenn der PC startet“ (Begleiter startet mit Windows)
- Neue Schritte für Quick Actions und Automatisierungen: „Spiel/Programm schließen“ (z. B. beim Spielstart nur Minecraft schließen), „Alle anderen Spiele schließen“ (das auslösende Spiel bleibt offen), „Alle Spiele schließen“, „Quick Action ausführen“
- Neue Bedingungen: „Nur weiter zur Uhrzeit …“ (auch über Mitternacht), „Nur weiter an Wochentagen …“, „Nur weiter, wenn ein / kein Spiel läuft“
- Vorlagen unter Automatisierungen: Spiel startet → Minecraft schließen / andere Spiele schließen / Discord öffnen, Programm öffnet → anderes Programm öffnen, PC startet → Apps öffnen, Spiel beendet → Programm schließen, abends Pausen-Hinweis, Wochenend-Profil – alles danach frei änderbar
### Verbessert
- Schrittauswahl nach Gruppen geordnet (Spiele & Programme, Bedingungen & Ablauf, Profile & Hinweise, Ton, Aufnahme & Licht)
- „Wenn ein Spiel startet“ reagiert nur noch auf Spiele; Programme haben einen eigenen Auslöser (ältere Regeln mit einem gewählten Programm laufen weiter)
- Schließen ist immer sanft wie das X des Fensters (Spiele dürfen nach dem Speichern fragen), nie erzwungen; Windows-Prozesse, Spiele-Launcher/Anti-Cheat und der Begleiter selbst werden nie geschlossen. Eine aufgerufene Quick Action mit Rückfrage startet nicht automatisch, Quick Actions rufen sich nicht endlos gegenseitig auf

## 2.71.0 – 2026-10-28
### Neu
- Medal als Aufnahmeprogramm (Overlay & Aufnahme): „Replay speichern“ drückt die Medal-Clip-Taste F8 (Werkseinstellung, änderbar); die Taste für „Aufnahme starten/stoppen“ wird wie in Medal eingetragen
- Aufnahmen: Clips und Screenshots aus Medal erscheinen automatisch – der Begleiter findet den in Medal gewählten Aufnahmeordner (aus Medals eigenen Dateien unter %APPDATA%\Medal\store) sowie die üblichen Orte (C:\Medal, Videos\Medal) und sortiert nach Medals Spielordnern, auch für Spiele, die nicht in der Bibliothek sind
### Verbessert
- Medals Vorschaubilder, Editor- und Cache-Dateien werden nicht als Aufnahmen gezeigt

## 2.70.0 – 2026-10-28
### Neu
- Programme: Alle installierten Apps erscheinen automatisch – ohne „Hinzufügen“. Der Begleiter liest das Windows-Startmenü (Desktop-Programme aus dem Web-Installer wie Discord, Apps aus dem Microsoft Store, Xbox-Apps) beim Start und danach alle 10 Minuten; jede App startet mit einem Tipp
- Schalter „Installierte Apps automatisch anzeigen“ und „Jetzt prüfen“ oben unter Programme (Standard: an)
### Verbessert
- Deinstallierte Apps verschwinden wieder; selbst entfernte bleiben ausgeblendet, bis sie deinstalliert werden. Schon vorhandene Einträge (gleicher Name oder gleiches Ziel) kommen nicht doppelt. Nicht aufgenommen werden Deinstallationsprogramme, Liesmich-/Hilfe-/Web-Verknüpfungen und Windows-Systemwerkzeuge
- Ein Xbox-/Store-Spiel, das zuerst als App auftauchte, wird beim Xbox-Abgleich zum Spiel

## 2.69.0 – 2026-10-28
### Neu
- JARVIS → „Stimme & Ton“: Stimme wählen – die menschlichsten Stimmen des Geräts stehen oben und sind gekennzeichnet („Sehr natürlich“: Microsoft „… Online (Natural)“ in Edge, Apple „Premium/Erweitert“, sonst Google), dazu Tempo, Tonhöhe und „Probe hören“
- Ton „Locker (mit Sprüchen)“: nach erledigten Aufträgen ein frecher Spruch unter der Antwort (spät nachts mit Hinweis auf die Uhrzeit) – Zahlen und Fakten bleiben unverändert, bei Fehlern und Rückfragen kein Spruch; per Chat umschaltbar („Sei lockerer“ / „Sprich wieder sachlich“). JARVIS ahmt keine echte Person nach
### Verbessert
- Emojis werden nicht mehr vorgelesen

## 2.68.1 – 2026-10-28
### Behoben
- Handy koppeln mit eingeschaltetem Tailscale-HTTPS: Der QR-Code führte zur Website mit dem Tailscale-Namen (…ts.net) – den findet ein Handy ohne laufendes Tailscale nicht („ERR_NAME_NOT_RESOLVED“). Jetzt öffnet der QR-Code zuerst die WLAN-IP (funktioniert immer im selben WLAN); der Tailscale-Link bleibt für unterwegs auswählbar
- „Beim PC öffnen und koppeln“ sprang bei einer …ts.net-Adresse auf http://…ts.net (falsch) – solche Namen werden jetzt direkt über https verbunden
- Als „PC-Adresse“ wird ohne https-Adresse die WLAN-IP angeboten statt gaming.fritz.box – Router-Namen findet Android mit „Privates DNS“ oder einem VPN oft nicht
### Verbessert
- Einstellungen → Verbindung: Adressen beschriftet („WLAN – zu Hause“ / „Tailscale – unterwegs“), WLAN zuerst
- Hinweis beim Umzug auf den festen Namen: mit VPN/Tailscale/„Privates DNS“ am Handy lieber bei der IP bleiben (die IP-Seite bleibt gekoppelt)
- Fehlermeldung bei nicht erreichbarer …ts.net-Adresse nennt die Ursache (Tailscale-App am Handy aus)

## 2.68.0 – 2026-10-28
### Neu
- JARVIS Quest-Coach – nutzt dein Gaming-Gedächtnis (Spiele-Journal) statt jede Frage ohne Zusammenhang zu beantworten; nichts wird erfunden:
- „Wo war ich (in Hogwarts Legacy) stehen geblieben?“ – letzte Notiz, Stelle, Plan fürs nächste Mal, Fortschritt, nächste Etappe deiner Zielpfade, offene Quests
- „Was sollte ich in … als Nächstes machen?“ – dein eigener Plan, nächste Etappe, offene Aufgaben und die geschätzte Restzeit; ohne Einträge sagt JARVIS das statt etwas zu empfehlen
- „Ich bin in … gerade bei …“, „Speichere diesen Hinweis für …: …“, „Erinnere mich daran, dass ich in … noch die Nebenquest … machen will“ – landet in „Wo war ich?“ bzw. als offener Eintrag in der Sammlung (ansehen, ändern, löschen)
- Spoiler-Stufe je Spiel („Keine Spoiler für …“, „Nur Hinweise …“, „Ausführliche Lösung für …“) – gilt für „Wie komme ich in … weiter bei …?“: ohne bekannte Stelle fragt JARVIS nach, statt Späteres zu verraten; Links zu Tipps/Lösungen passend zur Stufe (mit YouTube-Schlüssel auch die Videos)
- „Fasse die Story von … bis zu meinem Stand zusammen“ – nur aus deinen Story-Notizen, bis zu deinem Kapitel, Spoiler ausgeblendet
- „Ich habe heute 20 Minuten“ / „Welches Spiel passt in 30 Minuten?“ – passende Spiele aus Bibliothek, Verlauf und Backlog (Zeit-Finder)
- „Ich möchte … abschließen. Wie lange brauche ich noch, und was sollte ich als Nächstes machen?“ – beides in einer Antwort
- Spielzeit-Reiter: Spoiler-Stufe, Plattform und bevorzugte Spielweise je Spiel
### Behoben
- „Was sollte ich … als Nächstes machen?“ wurde an „als Nächstes“ in zwei Aufträge zerlegt

## 2.67.0 – 2026-10-28
### Neu
- JARVIS nutzt jetzt auch Epic, Xbox, Twitch und YouTube – nur auf deine Frage, über die offiziellen bzw. öffentlichen Schnittstellen, mit Quelle:
- Epic: „Was gibt es bei Epic gratis?“ – die Gratis-Spiele von jetzt und von nächster Woche direkt vom Epic Games Store (über den PC; ohne PC über GamerPower)
- Xbox: „Was kostet Forza Horizon 5 im Microsoft Store / auf Xbox?“ – Preis der günstigsten kaufbaren Edition (auch ohne PC); „Ist Starfield im Game Pass?“ – aus dem PC-Game-Pass-Katalog
- Twitch: „Wer streamt gerade Elden Ring?“ – die Live-Streams mit den meisten Zuschauern über Twitchs eigene Schnittstelle (dieselbe kostenlose Twitch-Anwendung wie für IGDB); ohne Zugang die Twitch-Suche als Link
- YouTube: „Zeig mir einen Guide für Hollow Knight“ / „… den Trailer zu …“ – mit eigenem kostenlosen YouTube-API-Schlüssel (am PC, verschlüsselt) die passenden Videos im Chat, sonst die YouTube-Suche als Link; YouTube wird nicht ausgelesen
### Verbessert
- „Was gibt es bei Epic gratis?“ wird auch ohne das Wort „Spiele“ verstanden

## 2.66.0 – 2026-10-28
### Neu
- JARVIS recherchiert selbst – nur auf deine Frage, nur über offene, erlaubte Schnittstellen (kein Google-Auslesen), immer mit Quelle:
- „Was ist Hollow Knight für ein Spiel?“, „Erzähl mir was über …“, „Wer hat … entwickelt?“, „Wann ist … erschienen?“, „Lohnt sich …?“ – Beschreibung, Genre, Entwickler, Erscheinungsdatum, Steam-Preis, Metacritic-Wertung, Plattformen (auch Steam Deck/Linux) und wie viele gerade spielen; ohne PC aus Microsoft Store/Wikipedia
- „Was kostet Hades?“ / „Ist … im Angebot?“ – aktueller Steam-Preis mit Rabatt, Weg zum Deal Radar
- „Wie viele Leute spielen gerade Counter-Strike 2?“ – aktuelle Spielerzahl auf Steam
- „Läuft Cyberpunk 2077 auf meinem PC?“ – Steams Systemanforderungen neben den echten Werten deines PCs (✓/✗ je Punkt)
- „Was ist der Weltrekord in Celeste?“ – bestätigte Speedrun-Rekorde je Kategorie von speedrun.com, mit Läufer und Datum
- „Gute Free-to-Play-Shooter?“ – beliebte kostenlose PC-Spiele nach Art (Shooter, MMORPG, MOBA, Battle Royale, für schwache PCs …) von FreeToGame.com

## 2.65.0 – 2026-10-28
### Neu
- JARVIS kennt jetzt Gaming über die App hinaus – immer nur auf deine Frage, mit Quelle:
- Gratis-Spiele: „Welche Spiele gibt es gerade gratis (auf Epic/Steam/GOG/Xbox …)?“ – aktuelle Angebote von GamerPower.com mit Plattform, Normalpreis und Enddatum (abgelaufene werden ausgeblendet), auch ohne PC; eingelöst wird nichts
- Neuigkeiten: „Was ist neu in Hades?“ / „Gibt es ein Update für …?“ – die offiziellen Steam-Ankündigungen des Entwicklers, Spiel per Name gefunden (nur dasselbe Spiel), über den PC
- Sensitivität umrechnen: „Rechne meine CS2-Sensitivität 1,2 bei 800 DPI in Valorant um“ und cm/360 – für Counter-Strike 2, Apex Legends, Valorant und Overwatch 2, gerechnet mit den festen Engine-Werten
- Ratgeber mit Quellen: Augen (20-20-20, AAO), Haltung (OSHA), gesund zocken, Bildschirm & FPS-Limit mit G-Sync/FreeSync (Blur Busters), Lag, Controller-Drift, Headset/Mikrofon – mit Weg zur passenden Seite (Ping Doctor, Controller-Test, Audio Center); ersetzt keinen Arzt
- Ausgaben: „Ich habe 19,99 € für Hades ausgegeben“, „Wie viel habe ich diesen Monat für Spiele ausgegeben?“ – nur deine Angaben, neuer Reiter Spiele-Journal → Ausgaben zum Ansehen, Eintragen und Löschen
### Verbessert
- Links zu Quellen und Angeboten öffnen sich aus dem Chat in einem neuen Tab

## 2.64.0 – 2026-10-28
### Neu
- JARVIS Spielzeitanalyse: „Wie lange brauche ich noch für …?“, „Wie lange dauert … insgesamt?“, „… für 100 %?“, „… bei 45 Minuten täglich?“, „Schaffe ich … bis Freitag?“ – mit Spanne statt exakter Zahl, Tagen beim eigenen Tagesbudget, Bedarf pro Tag bis zur Frist und Quellen
- Gemessen, recherchiert und geschätzt sind getrennt gekennzeichnet: Spielzeit aus Steam (am PC aus Steams eigener Datei, sonst über das Steam-Konto) oder aus den vom Begleiter gemessenen Sitzungen; Durchschnittsdauern (Hauptstory, mit Nebenaufgaben, 100 %) aus der offiziellen IGDB-Schnittstelle „Time to Beat“ mit Anzahl der Spieler und Datum
- Fortschritt sagen: „Ich bin bei 40 % in …“ – wird mit Datum gemerkt und für die Schätzung genutzt (eigenes Tempo und Durchschnitt)
- Spiele-Journal → Spielzeit: alles sehen, ändern (Fortschritt, eigene Spielzeit z. B. von der Konsole, eigene Dauer) und löschen; wird über den PC zwischen Geräten abgeglichen
- Am PC: IGDB-Zugang mit eigener kostenloser Twitch-Anwendung eintragen (Geheimnis verschlüsselt nur auf dem PC, wird nie angezeigt)
### Verbessert
- Ohne PC zeigt JARVIS die gespeicherten Werte mit Datum; bricht die Verbindung während der Frage ab, sagt er das
- Liegen eigenes Tempo und Durchschnitt weit auseinander, zählt dein Tempo und der Durchschnitt wird genannt (statt einer nutzlosen Riesen-Spanne)
### Behoben
- „… bis morgen bei 2 Stunden pro Tag“ wurde als Design-Wunsch („Tag“ → helles Design) verstanden

## 2.63.0 – 2026-10-28
### Neu
- Bingo mit Internet auch ohne PC: Ist der PC nicht verbunden, fragt JARVIS trotzdem, ob er nachsehen darf – dann sieht das Handy selbst im Microsoft Store (Xbox) und bei Wikipedia nach, was für ein Spiel es ist (Steam-Erfolge gibt es weiter nur über den PC, Steam erlaubt Websites keine direkten Abfragen)
- Neue Aufgaben-Sets für Schleichen, Rätsel, Jump'n'Run, Rollenspiel, Roguelike, Sandbox & Bauen, Kampfspiel und Simulation
### Verbessert
- Aus der Beschreibung werden bis zu drei Spielarten erkannt und gemischt (z. B. Hello Neighbor: Schleichen + Horror + Rätsel) statt nur einer
- Allgemeine Aufgaben füllen nur noch auf, wenn die passenden nicht reichen
- Klappt die Suche über den PC nicht, sieht das Gerät selbst nach

## 2.62.0 – 2026-10-27
### Neu
- Reiter auf den Seiten ordnen (Journal, Was spiele ich?, Welten, Builds, Freunde, Medien, Spiele-Infos, Kreativ-Studio, Auswertungen): Stift neben den Reitern, „−“ legt einen Reiter unter „Weitere“, „+“ holt ihn zurück – gelöscht wird nichts, „Weitere“ klappt die Reiter auf, Links auf einen Reiter funktionieren weiter
### Verbessert
- Alle Seiten mit Reitern nutzen jetzt denselben Baustein – gleiches Aussehen und gleiche Bedienung; die Auswahl wird mit dem Design gespeichert und mit dem PC abgeglichen

## 2.61.0 – 2026-10-27
### Neu
- Seitenleiste ordnen direkt in der Leiste (Stift oben neben dem Logo): mit „−“ kommt ein Bereich in den Ordner „Weitere Funktionen“ am Ende der Leiste, mit „+“ wieder zurück – gelöscht wird nichts, der Ordner bleibt aufklappbar und alles bleibt über die Suche erreichbar
- Dasselbe am Handy unter „Mehr“ → „Bearbeiten“
- Kategorien in der Seitenleiste lassen sich einklappen (mit Anzahl), „Aufräumen (Vorschlag)“ und „Alle anzeigen“ mit einem Klick
### Verbessert
- Übersichtlicher Start: selten genutzte Bereiche liegen anfangs im Ordner „Weitere Funktionen“ (einmalig auch für bestehende Leisten, die nie angepasst wurden – eigene Einstellungen bleiben unverändert)

## 2.60.0 – 2026-10-27
### Neu
- „Gerät koppeln“ prüft vorher, ob Handys den PC überhaupt erreichen dürfen (Windows-Firewall, Netzwerk als „öffentlich“ eingestuft) – mit dem Knopf „Für Handys im Heimnetz freigeben“ erledigt der PC das selbst (Windows fragt einmal nach Erlaubnis)
- Nach dem Koppeln über die IP-Adresse prüft das Handy selbst, ob es den PC auch unter seinem festen Namen (z. B. …fritz.box) erreicht, und bietet „Jetzt umziehen“ an – danach bleibt die Verbindung, auch wenn der Router dem PC eine neue IP gibt
- Hilfe unter dem QR-Code, falls sich die Seite am Handy nicht öffnet (Gast-WLAN, mobile Daten, VPN)
### Verbessert
- QR-Code: zuerst die Heimnetz-IP – die öffnet jedes Handy im selben Netz ohne extra App (auch Android, das „.local“-Namen oft nicht kennt); der feste Name wird danach automatisch angeboten
- Adresswahl: der Netzwerkadapter mit Router zuerst (PC am Kabel, Handy im WLAN); Tailscale-, VPN-, virtuelle und 169.254-Adressen landen nie mehr im QR-Code
- Diagnose zeigt die Firewall-Freigabe für Handys im Heimnetz

## 2.59.0 – 2026-10-27
### Neu
- Bingo für jedes Spiel von Steam und Xbox: Gibt es ein Spiel nicht auf Steam, schaut der PC im Microsoft Store (Xbox) nach, sonst bei Wikipedia
- Mit einer KI am PC (DeepSeek, Claude oder Ollama): Die KI bekommt, was im Internet über das Spiel steht (Genre, Beschreibung, echte Erfolge), und schreibt daraus Aufgaben, die zu genau diesem Spiel passen
- Auch für Spiele mit eigenen Aufgaben (z. B. Minecraft) fragt JARVIS, ob er zusätzlich im Internet nachsehen darf – für mehr Abwechslung
### Verbessert
- Mehr Abwechslung bei gleicher Schwierigkeit: deutlich größere Aufgaben-Sets je Spielart, Aufgaben mit wechselnden Zahlen („Besiege 3 / 5 / 10 Gegner“), echte Erfolge, KI- und eingebaute Aufgaben werden gemischt; die letzte Karte wird nicht wiederholt
- Die Karte sagt, woraus sie besteht (z. B. „6 echte Steam-Erfolge, 3 Aufgaben von der KI“)
### Behoben
- „Minecraft“ wurde bei Steam als „Minecraft Dungeons“ gefunden (falsche Erfolge) – jetzt zählt nur dasselbe Spiel (Reihenname davor und Editionen wie „Special Edition“ sind erlaubt)

## 2.58.0 – 2026-10-27
### Neu
- JARVIS/Assistent: Bingo für jedes Spiel direkt im Chat – der PC sieht im Internet nach, was das für ein Spiel ist (Steam: Erfolge, Genre, Mehrspieler, Beschreibung; nicht auf Steam: Wikipedia) und macht passende Aufgaben daraus
- „Ja, immer erlauben“: Danach fragt JARVIS beim Bingo nicht mehr, ob er im Internet nachsehen darf (im Bingo-Maker ist das Häkchen dann vorausgewählt)
### Verbessert
- Wenige Steam-Erfolge: Die Karte wird mit Aufgaben zur erkannten Spielart aufgefüllt (z. B. Rennspiel für Make Way)
- Die Karte trägt den gefundenen Namen („Makeway“ → „Make Way“), und der Chat sagt, was über das Spiel gefunden wurde
### Behoben
- Bingo für ein Spiel ohne eigene Aufgaben (z. B. Make Way) schickte zur Bingo-Seite, wo das Erstellen dann auch scheiterte – jetzt entsteht die Karte immer im Chat; klappt KI oder Internet nicht, wird mit allgemeinen Aufgaben erstellt und der Grund steht dabei
- Steam ausgelastet: Es wird trotzdem bei Wikipedia nachgesehen; Fehlermeldungen nennen die richtige Seite

## 2.57.0 – 2026-10-27
### Neu
- „Handy manuell verbinden“ am PC (Gerät koppeln): Schritt für Schritt, welche Adresse im Handy-Browser einzutippen ist, der Code, und wie die Kopplung dauerhaft bleibt – zu Hause im WLAN ohne Tailscale
- Handy-Website: Adresse und Code direkt auf der Offline-Seite eingeben („Handy manuell verbinden“)
### Behoben
- github.io-Seite: Eine Heimnetz-Adresse (z. B. 192.168.178.116) führte zu „nicht erreichbar“ – der Browser verbietet einer https-Seite den Zugriff auf http im Heimnetz. Jetzt öffnet „PC verbinden“ direkt die Seite deines PCs mit dem Code; ohne „http://“ und ohne Port eingetippt wird automatisch http und Port 8787 genommen
- Feste Adresse: Der Begleiter fragt den Router (z. B. FRITZ!Box) auch nach dem Namen zur eigenen IP – so wird ….fritz.box gefunden, auch wenn der PC dort anders heißt als in Windows

## 2.56.0 – 2026-10-27
### Neu
- Bingo für jedes Spiel: Spiele ohne eigene Katalog-Aufgaben bekommen echte Aufgaben aus ihren Steam-Erfolgen – JARVIS fragt vorher, ob er dafür ins Internet darf; die Schwierigkeit kommt aus dem Anteil der Spieler, die den Erfolg haben (ab 35 % leicht, ab 12 % mittel, ab 3 % schwer, darunter sehr schwer); versteckte Erfolge nur mit „mit Spoiler“
- Bingo-Seite: Häkchen „Echte Aufgaben aus dem Internet laden (Steam-Erfolge)“ für Spiele ohne Katalog
- Kein Bingo gleicht dem letzten: Aufgaben der letzten Karte eines Spiels kommen nur noch, wenn es keine anderen mehr gibt (dann steht es auf der Karte), ältere Karten werden vorher wiederholt
- JARVIS spricht: Antworten werden mit der Stimme des Geräts vorgelesen (abschaltbar, „Stopp“ unterbricht); Spracheingabe wie bisher über das Mikrofon
- JARVIS-Gedächtnis: „Merk dir, dass …“, „Was weißt du über …?“, „Vergiss …“ (nur nach Rückfrage) – gespeichert als Markdown-Seite „JARVIS-Gedächtnis“ im eigenen Gaming-Wiki
- JARVIS-Protokoll: was JARVIS erledigt hat, als Wiki-Seite; „Was hast du heute gemacht?“
- JARVIS-HUD: Kugel zeigt Zuhören, Arbeiten, Sprechen; PC-Verbindung, laufendes Spiel, Profil, Erinnerungen und Fähigkeiten auf einen Blick
### Behoben
- Bingo: „3x3 Bingo für Celeste leicht“ nahm „Celeste leicht“ als Spielnamen; „Bingo für heute Abend“ nahm „Heute Abend“ als Spiel – jetzt wird nach dem Spiel gefragt
- Bingo: Kann die eingestellte KI nicht antworten, bietet JARVIS jetzt Internet oder Katalog an, statt nur einen Fehler zu zeigen

## 2.55.0 – 2026-10-27
### Neu
- JARVIS Gaming: der Assistent heißt jetzt JARVIS (Menü „JARVIS“, auch unter /jarvis) und führt klare Aufträge direkt aus, statt nur Knöpfe anzubieten – Spiele und Programme starten, Profile aktivieren, Sounds abspielen/stoppen, Quick Actions, Ziele, Wunschliste
- Ergebnis wird geprüft: ein gestartetes Spiel muss vom PC als laufend erkannt werden, ein Profil als aktiv – sonst sagt JARVIS ehrlich, was fehlt
- Mehrere Schritte in einem Satz („Öffne Discord und starte anschließend mein Spiel“); schlägt ein Schritt fehl, hört JARVIS auf und sagt es
- Website auf Zuruf ändern: neue Startseite für ein Spiel, Startseite übersichtlich ordnen, Favoriten nach oben, Spieleübersicht sortieren (bleibt gespeichert), Kategorie für Lieblingsspiele, Profil für das nächste Spiel, Startseite zum Profil – mit „Rückgängig“
- „Warum ruckelt mein Spiel?“: misst jetzt Prozessor, Arbeitsspeicher, Grafikkarte, Grafikspeicher, Temperaturen und Laufwerke und nennt nur echte Engstellen (bei Lag auch das Netzwerk)
- „Welche Spiele sind zu zweit spielbar?“ aus deinen Kategorien und deinem Faktencheck – Unbekanntes wird gezählt, nicht geraten
- „Starte mein Spiel“ nimmt das zuletzt gespielte Spiel und sagt, welches
- Nur Gaming: andere Themen lehnt JARVIS freundlich ab; Code-Änderungen macht er nie zur Laufzeit
- JARVIS-Sitzung: gilt nur, solange die Website offen und JARVIS eingeschaltet ist (spätestens nach 15 Minuten ohne Auftrag aus); ausgeschaltet gibt es wie bisher nur Knöpfe
### Sicherheit
- Direkt ausgeführt wird nur, was du in deiner Nachricht selbst nennst, aus einer festen Liste von Gaming-Aktionen; was eine KI selbst vorschlägt oder in Spielnamen, Notizen oder Patchnotes liest, bleibt ein Knopf. Energie (Herunterfahren usw.), Löschen und Quick Actions mit Rückfrage laufen nie ohne Bestätigung; keine Shell-Befehle
### Verbessert
- Spieleübersicht merkt sich die Sortierung

## 2.54.0 – 2026-10-27
### Neu
- Deal Radar: Preisvergleich von Keyforsteam direkt im Spiel – „Preise laden“ zeigt alle Angebote mit Shop (offiziell oder Key-Shop), Shop-Bewertung, Edition, Region, Plattform, Preis inklusive Zahlungsgebühr und Gutschein
- Zusammenfassung: günstigster offizieller Shop und günstigster Key-Shop derselben Edition; Filter nach Edition, Region und „Nur offizielle Shops“
- Konto-Angebote (fremdes Spielkonto statt Key) sind standardmäßig ausgeblendet und deutlich markiert
- Findet Keyforsteam das Spiel unter seinem Namen nicht, lässt sich der Link der Spieleseite einfügen
- Abruf nur auf Knopfdruck über den PC, höchstens eine Seite alle 5 Sekunden (wie es keyforsteam.de in robots.txt verlangt), 6 Stunden zwischengespeichert

## 2.53.0 – 2026-10-27
### Neu
- Neue Seite „Auswertungen“ (Spielbegleiter) mit Jahresrückblick, Spielstil und Leistungsarchiv – nur aus dem Spielverlauf des PCs und eigenen Einträgen, nichts wird geschätzt
- Jahresrückblick: Spielzeit, Sitzungen, aktive Tage, längste Serie, Spielzeit je Monat, meistgespielte Spiele, längste Sitzung, Lieblingstag, neue Spiele und Vergleich mit dem Vorjahr; ehrlicher Hinweis, wenn die Aufzeichnung erst im Jahr begann; als Bild teilen (Spielnamen/Spielzeit abschaltbar) oder drucken/als PDF
- Spielstil: Tageszeit, Wochentag, Sitzungslänge, Lieblings-Kategorien, Bewertungen, Favoriten und Backlog; Merkmale erst ab 10 Sitzungen, jede Aussage mit der Zahl dahinter
- Leistungsarchiv: gemessene CPU/GPU/RAM-Last aus Sitzungen übernehmen oder Messungen selbst eintragen (FPS, 1 % Low, Frametime, Temperaturen), zwei Messungen vergleichen, Verlauf je Wert, Verknüpfung mit dem Grafikvergleich
- Mehrere eigene Startseiten: anlegen, umbenennen, löschen und per Tipp wechseln (Handy und großer Bildschirm getrennt)
- Startseite als Link oder Datei teilen – nur die Widget-Anordnung, mit Vorschau vor dem Hinzufügen als neue Seite
- Datenzentrum (Einstellungen → Backup): Bereiche wählen, als JSON-Datei, Tabelle (CSV) oder PDF sichern; Import mit Vorschau und eigener Wahl bei Unterschieden (neuere behalten, meine, aus der Datei, beide behalten)
- Suche (Strg+K) findet auch ohne PC deine Sammlungen samt Text (Wiki, Bingos, Notizen …) und deine Startseiten
- Wiki: „Links ohne Ziel“ in der Übersicht mit „Anlegen“
### Verbessert
- Wiki: Umbenennen einer Seite behält den alten Titel als „Auch bekannt als“, Links darauf funktionieren weiter
### Behoben
- Einstellungen auf dem Handy: lange Inhalte (z. B. der Datenordner) machten die Seite breiter als den Bildschirm

## 2.52.0 – 2026-10-27
### Neu
- Ultimate Gaming Bingo (Was spiele ich? → Bingo): per Satz („Erstelle ein 4×4-Bingo für Minecraft auf mittel“) oder Einstellungen – 3×3, 4×4, 5×5; Leicht, Mittel, Schwer, Sehr schwer, Gemischt; Spielmodi (Speed, Survival, Challenge, Fun, Exploration, Boss, Achievement, Co-op, Random, Custom – nur die, die zum Spiel passen); bevorzugte Aufgabenarten; Anfänger/Erfahrene; Spoiler an/aus; freie Mitte optional (standardmäßig aus); Zeitlimit; eigene Regeln; Spielfortschritt
- Eingebauter Aufgabenkatalog, von Hand geschrieben für Minecraft, Elden Ring, PEAK, Terraria, Stardew Valley, Rocket League, Counter-Strike 2, Valorant, Fortnite, Lethal Company, Phasmophobia, Subnautica, Sea of Thieves, Baldur's Gate 3, Forza Horizon und EA SPORTS FC – plus allgemeine Sätze für Survival, Horror, Open World, Rennspiele, Shooter, Koop, Strategie und Sport; funktioniert ohne PC und ohne KI
- Mit KI am PC (DeepSeek, Claude oder Ollama): spielspezifische Aufgaben als geprüftes JSON mit Schwierigkeit, Kategorie und Begründung; unbekannte Spiele werden ehrlich als „allgemein“ markiert
- DeepSeek als Bingo-KI (Modell „deepseek-flash“ = DeepSeek-V4.1-Flash laut DeepSeek): Schlüssel nur am PC, verschlüsselt, nie im Backup; Monatsgrenze für Anfragen; JSON-Modus
- Spielfeld: abhaken und zurücknehmen, Fortschritt in Prozent, erledigte/offene Aufgaben, Reihen, Spalten und Diagonalen, Bingo-Animation (abschaltbar, respektiert „weniger Bewegung“), Aufgabe ersetzen (mit Begründung der Schwierigkeit), neu mischen, zurücksetzen mit Bestätigung, neues Bingo ohne Wiederholung, Speed-Countdown
- Mehrspieler: gemeinsame Karte (wer was erledigt hat) oder Wettbewerb (jeder hakt für sich ab, Rangliste); Abgleich in Echtzeit über deinen PC für alle gekoppelten Geräte
- Meine Bingos: Status, Fortschritt, Bewertung, Notiz, Favoriten, Suche, Filter nach Spiel/Schwierigkeit/Status, Sortierung, kopieren, als Vorlage, löschen, Link teilen, als Bild, als Datei
- Eigene Aufgaben je Spiel oder für alle Spiele (Schwierigkeit, Kategorie, Beschreibung, Favorit); beim Erstellen wählbar: KI/Katalog, gemischt oder nur eigene
- KI-Assistent: Bingos direkt im Chat erstellen und spielen, „Mach das vorherige Bingo schwieriger“, „ohne Wiederholung“, Rückfrage wenn das Spiel fehlt – auch ohne PC
- Bingo als Home-Widget und im PC-Overlay: abhaken, ohne die App zu öffnen
### Behoben
- Sammlungen/Journal: Eine Änderung direkt vor dem Schließen oder Neuladen der Seite konnte verloren gehen (Speichern wurde vom Browser abgebrochen). Jetzt wird erst nach abgeschlossenem Speichern bestätigt und eine Sicherheitskopie beim nächsten Start nachgetragen
- Sammlungen/Journal: Während eines laufenden Abgleichs mit dem PC konnte eine gleichzeitig gemachte neuere Änderung im Browser von der älteren überschrieben werden

## 2.51.0 – 2026-10-27
### Neu
- Neue Seite „Spiele-Infos“ (Spielbegleiter): Releases, Saisons & Events, Update-Erklärer, Faktencheck, Barrierefreiheit, Editionen & DLCs und Empfehlungen – alles ohne PC nutzbar und mit dem PC abgeglichen
- Releases: Spiele, DLCs, Updates und Saisons mit Termin „Bestätigt“ (nur mit Quelle), „Unbestätigt“ oder „Nur Zeitraum“ (z. B. Q1 2027); Monatsansicht „Was kommt“, Erschienenes getrennt, Favoriten, Kategorien, „In den Kalender“ mit Erinnerung und „Auf die Wunschliste“
- Saisons & Events: Beginn/Ende mit der Zeitzone aus der Ankündigung; angezeigt in deiner Ortszeit und laut Ankündigung, Status kommt/läuft/vorbei – ohne Ende wird nie behauptet, dass etwas noch läuft; Start und Ende in den Kalender
- Update-Erklärer: offizielle Patchnotes direkt von Steam laden (über den PC, nur die Entwickler-Ankündigungen) oder einfügen; sortiert nach Gameplay, Neue Inhalte, Fehlerbehebungen, Technik – jede Zeile wörtlich aus dem Original, Kurzfassung nur aus Originalsätzen, Original immer abrufbar; Version, Datum, Quelle, eigene Notizen, gelesen/ungelesen
- Faktencheck: Einzel-/Mehrspieler, Crossplay, Koop, lokal/online, offline, Controller, Cloud-Speicher, Ultrawide, Mods, Barrierefreiheit – mit Quelle und Stand; Vergleich bis zu 4 Spielen mit markierten Unterschieden und „Muss haben“-Filter; Unbekanntes zählt nie als Ja
- Barrierefreiheit: Untertitel (auch Größe), freie Tastenbelegung, Farbenblind-Modi, Kontrast, Textgröße, Schwierigkeit, Hilfen, Controller, Spieltempo, visuelle Ton-Hinweise, Halten/Umschalten – vergleichen und filtern
- Editionen & DLCs: Inhalte nebeneinander, „Habe ich“ selbst markieren, Warnung vor Doppelkäufen; Preise nur mit Quelle
- Empfehlungen „Wenn dir dieses Spiel gefällt …“: regelbasiert aus deinen Daten (Genre & Spielgefühl, Bibliotheks-Kategorien, Spielweise), jeder Grund sichtbar, gespielte ausblendbar, Plattform- und Budgetfilter, Vorlieben (mag ich / mag ich nicht), Empfehlungen merken
- Wunschliste: Art (Spiel/DLC mit Hauptspiel), Priorität, eigene Kategorien, eigener Shop-Link (nur https); Suche, Filter, Höchstpreis (Einträge ohne gemessenen Preis werden gezählt statt versteckt), Sortierung; Preisverlauf als Diagramm mit Datum, höchstem und niedrigstem selbst gemessenem Preis; ehrliche Anzeige, ob die Zielpreis-Benachrichtigung aktiv ist
### Verbessert
- Sammlungen: neues Feldformat „Datum und Uhrzeit“, Sortierung „früheste zuerst“; beim Bearbeiten älterer Einträge werden neu hinzugekommene Felder mit „Unbekannt“ vorbelegt
- Spiel-Fakten sind jetzt der Faktencheck unter Spiele-Infos (alte Links leiten weiter); der Gruppen-Finder nutzt sie wie bisher
- Klickbare Listenzeilen (z. B. Format-Auswahl im Studio) sehen jetzt wie Listen aus statt wie graue Standard-Knöpfe
### Behoben
- Deal Radar: Offline bearbeitete Einträge zeigten den Preisverlauf bis zum Abgleich als leer an
- Deal Radar: Bei geändertem Zielpreis wurde die Key-Shop-Benachrichtigung nicht zurückgesetzt

## 2.50.0 – 2026-10-26
### Neu
- Fester Name im WLAN ohne Router-Einstellung: Der PC meldet sich selbst per Bonjour/mDNS als „nexus-<PC-Name>.local“ an. Der QR-Code nutzt diesen Namen – bekommt der PC eine neue IP, finden iPhone und iPad ihn trotzdem
- Einstellungen → Verbindung → „Unterwegs mit Tailscale“: zeigt, ob Tailscale installiert und angemeldet ist, und schaltet die sichere https-Adresse mit einem Klick am PC ein oder aus (kein Befehl tippen); meldet ehrlich, wenn Tailscale ablehnt, und warum
- Einstellungen → Hilfe (funktioniert ohne PC): koppeln, fester Name im WLAN, Tailscale Schritt für Schritt (inkl. einmaliger Freigabe in der Tailscale-Verwaltung), Hilfe bei Problemen
### Verbessert
- „Zugriff von unterwegs“ heißt jetzt „Eigener Server (für Fortgeschrittene)“ – für den Alltag reicht Tailscale

## 2.49.0 – 2026-10-26
### Neu
- Diagnose: „Verbindungs-Check“ mit 10 Prüfungen (Website, Backend, Relay, WebSocket, Begleiter, Anmeldung, Gerät autorisiert, PC online, Herzschlag, Programme) – mit Ursache, Uhrzeit, Lösung und sicheren Reparatur-Knöpfen; erkennt ein VPN, das das Heimnetz blockiert
- Geräte & Verbindungen: der PC selbst als eigene Zeile (online, Version), Gerätetyp, „x von 20 Geräten“, „Online über VPN (Tailscale)“, „Offline · zuletzt verbunden …“, Knopf „Neu verbinden“
- Sitzungen werden alle 12 Stunden automatisch mit dem Geräteschlüssel erneuert – ohne neue Kopplung; widerrufene Geräte bekommen keine neue Sitzung
- Jeder Befehl hat eine eigene ID: kommt er doppelt an, wird er nur einmal ausgeführt
### Verbessert
- Statusanzeige oben zeigt den echten Zustand: Verbunden, Wiederverbinden …, Nicht angemeldet, Nicht autorisiert, PC offline (vorher „Lokal“, sobald irgendeine Verbindung offen war)
- Klare Fehlermeldungen: Programm nicht installiert, Aktion nicht erlaubt, Gerät nicht autorisiert, Aktion fehlgeschlagen
- Wiederverbinden bei langem Ausfall sparsamer (nach 10 s alle 2 s, nach 2 min alle 5 s); Begleiter → Relay mit Zufallsabweichung
- Höchstens 20 gekoppelte Geräte, mit verständlicher Meldung
### Behoben
- Beim Beenden des Begleiters blieben offene Verbindungen bis zu 30 s bestehen – Handys hielten den PC noch für erreichbar. Jetzt werden sie sofort geschlossen

## 2.48.0 – 2026-10-26
### Neu
- Kreativ-Studio (neue Seite unter „Spielbegleiter“), funktioniert ohne PC und wird mit dem PC abgeglichen:
- Eigene Sammelkarten: Bild, Name, Beschreibung, Spiel, bis zu 6 eigene Werte, Farben, Hintergrundmuster und Seltenheits-Optik (nur Aussehen – nichts zu kaufen, keine Zufallsziehung); Sammlungen, Favoriten, Filter, duplizieren, als Bild speichern und über das Teilen-Menü des Geräts teilen
- Poster- und Cover-Designer sowie Banner- und Profilbild-Werkstatt: Formate wie Steam-Cover 600 × 900 und „Library Hero“ (laut Steamworks), YouTube-Kanalbanner mit sichtbarem Bereich und Twitch-Banner (Angaben aus Ratgebern, so gekennzeichnet), Profilbild mit Kreis, eigene Formate; Vorlagen, Text, Formen und eigene Bilder; ziehen und vergrößern mit Finger oder Maus, Rückgängig/Wiederholen, Ebenen-Reihenfolge, Export als PNG oder JPG
- Virtuelle Ausstellung: Räume mit fünf Stilen, Karten, Poster und Museumsfotos aufhängen, verschieben, vergrößern, rahmen und beschriften, Vollbild-Rundgang, Raum als Bild speichern
- Abzeichen: zwölf eingebaute und eigene Abzeichen, gezählt aus deinen echten Einträgen, mit Bedingung und Fortschritt; wird ein Eintrag gelöscht, ist das Abzeichen wieder offen

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
