# Datenschutz – Nexus Gaming Hub

Kurz gesagt: Es gibt keine Telemetrie, keine Werbung und kein Konto. Alles Wichtige liegt auf deinem PC. Einige Funktionen sprechen aber Online-Dienste an. Welche das sind, steht hier vollständig, damit du selbst entscheiden kannst.

## 1. Was auf dem PC gespeichert wird

Die Daten liegen im Datenordner `%APPDATA%\PCGameLauncherUltimate`. Der Name ist aus technischen Gründen der alte, damit Updates weiter funktionieren.

| Daten | Datei | Löschen |
|---|---|---|
| Bibliothek (Spiele, Programme, Startziele, Notizen, Bewertungen, Backlog-Status, Priorität, Ziel in Stunden) | `library.json` | in der App einzeln, oder Datei löschen |
| Installierte Apps (Name und Startziel aus dem Windows-Startmenü, nur lokal gelesen, nichts wird gesendet) – nur bei „Installierte Apps automatisch anzeigen“ | `library.json` | Programme → Schalter aus, einzelne Einträge entfernen |
| Medal: Pfade zum Aufnahmeordner aus Medals Dateien (%APPDATA%\Medal\store), nur lokal gelesen, nichts gespeichert oder gesendet | – | – |
| JARVIS-Recherche (nur nach deinem „Ja“, „Immer erlauben“ oder dem Schalter „Im Internet suchen“): mit Claude-Modus geht die Frage vom PC an Anthropic (Claude-Websuche, Anthropic sucht im Web und liefert Seiten mit Zitaten); ohne Claude holt der PC offizielle Patchnotes von `launchercontent.mojang.com` bzw. Steam-Ankündigungen von `api.steampowered.com` und gibt die Fundstellen an die am PC gewählte KI | nichts dauerhaft – Antwort und Quellen nur im Chat dieses Tabs; Kosten/Anzahl im Monatszähler am PC | Schalter aus lassen; JARVIS → Stimme & Ton → „Unbekanntes nachschlagen: Nie“ |
| JARVIS-Insel (Windows, nur wenn eingeschaltet): JARVIS' Status, seine letzte Antwort (gekürzt) und eine Rückfrage gehen nur an Fenster auf diesem PC (Berechtigung „lokal“), nie an andere Geräte; nichts wird gespeichert | nur im Fenster, solange es offen ist; Einstellungen in `settings.json` | Schalter „Auf dem Desktop und in Programmen anzeigen“ aus |
| JARVIS-Insel, Tanzen zur Musik (nur solange die Insel sichtbar ist): der Begleiter liest den Ton, den der PC abspielt (WASAPI-Loopback), und rechnet je 0,1 Sekunde nur Lautstärke und Takt aus; die Töne selbst werden sofort verworfen – keine Aufnahme, keine Speicherung, kein Versand; nur die Zahl geht an die Fenster dieses PCs | nichts | Schalter „Auf dem Desktop und in Programmen anzeigen“ aus |
| JARVIS-Insel, Aussehen und Widgets: Vorlage, Augenfarbe/-größe, Position, Deckkraft und die Auswahl der Widgets stehen in den Einstellungen des PCs (nur diese Werte, keine Inhalte) und können von Geräten mit Administrator-Recht geändert werden. „PC-Werte“, „Temperatur & FPS“ und „Netzwerk“ messen nur, solange die geöffnete Insel zu sehen ist; die „Notiz“ liegt nur im Speicher des Insel-Fensters am PC (nie auf dem Handy, nie in Backups). FPS werden nicht erfunden (ohne Frame-Capture-Dienst „n. v.“) | die Auswahl in den Einstellungen des PCs; die Notiz am PC | nichts | Widgets in den Einstellungen abschalten; Notiz leeren |
| JARVIS-Insel, Live-Anzeigen und weitere Widgets (2.94.0): Fokus-Timer, Pomodoro und Stoppuhr laufen im Insel-Fenster und zeigen sich auch bei geschlossenem Panel (nur Zeit, nichts wird gesendet oder gespeichert); neue Meldungen des PCs (Titel) erscheinen kurz in der Leiste; „Zuletzt gespielt starten“, „Profile“ und „Sounds“ lesen nur Namen aus Bibliothek, Profilen und Soundboard des PCs und lösen Aktionen nur auf deinen Tipp aus (ein Profil erst nach „Erlauben“) | nichts – nur im Speicher des Fensters | nichts | Widgets in den Einstellungen abschalten |
| JARVIS-Insel, „Wo die Insel erscheint“ und „Läuft gerade“ (2.99.0, Windows): der Begleiter prüft alle 0,5 s nur die ART des vorderen Fensters (Desktop, diese App oder Programm) – kein Fenstertitel, kein Programmname, nichts wird gespeichert oder gesendet; Titel, Interpret und App der aktuellen Wiedergabe liest er aus den Windows-Mediensitzungen und gibt sie nur an Fenster, die diesen PC fragen (Berechtigung „Ansicht“), kurz im Speicher gehalten (1,5 s) | nichts | nichts | Bereich „Nur in der App“ wählen; Widget „Musik am PC“ abschalten |
| JARVIS-Insel, Mikrofon (3.0.0): Die Spracheingabe startet nur, wenn du das Mikrofon in der Insel antippst, und hört nur diesen einen Satz. Erkannt wird mit der Spracherkennung deines Browsers (Web Speech API): In Chrome und Edge wird dafür das Audio dieses Satzes vom Dienst des Browser-Herstellers verarbeitet – nicht von dieser App, nichts wird hier gespeichert. Es gibt kein Aktivierungswort und kein Zuhören im Hintergrund. Antworten werden nur laut vorgelesen, wenn die Frage gesprochen war | nichts | nichts | Mikrofon nicht antippen / Browser-Berechtigung verweigern; „Stimme“ in den JARVIS-Einstellungen aus |
| JARVIS-Insel, Titelbild und Fortschritt (3.0.0, Windows): Zusätzlich zu Titel, Interpret und App liest der Begleiter Position und Länge des Titels und ein kleines Titelbild (128 × 128 Pixel, wenige KB) aus der Windows-Mediensitzung; das Bild wird pro Titel einmal gelesen und nur an Fenster gegeben, die diesen PC fragen („Ansicht“), nicht gespeichert; aus dem Bild wird im Browser eine Akzentfarbe berechnet | nichts | nichts | Widget „Musik am PC“ abschalten |
| JARVIS-Insel, Verlauf (3.0.0): Die Insel merkt sich auf diesem Gerät die letzten 60 Ereignisse (Spiel gestartet/beendet, Verbindung verloren/wiederhergestellt, Timer, Antworten von JARVIS – nur den kurzen Text) | nur im Speicher des Browsers/Fensters (localStorage), nie auf dem PC, nie auf anderen Geräten | nichts | Im Reiter „Meldungen“ „Verlauf leeren“ |
| Freie KI ohne PC (3.1.0): Ist kein PC verbunden und hast du auf diesem Gerät „Ja, freie KI nutzen“ gewählt, geht eine allgemeine Frage mit den letzten 6 Nachrichten dieses Chats an den kostenlosen Textdienst Pollinations (text.pollinations.ai, ohne Konto, ohne Schlüssel) – ohne Cookies, ohne Referrer, ohne Daten deines PCs; Pollinations ist ein Dienst eines Dritten, was dort mit der Frage geschieht, bestimmt er; höchstens 20 Fragen pro Stunde | nur deine Entscheidung „Ja/Nein“ im Browser (localStorage) | nichts | „Nein“ wählen (Browser-Speicher der Seite löschen setzt die Frage zurück); mit verbundenem PC wird dieser Dienst nie benutzt |
| Nachricht schreiben (3.1.1): Der Text steht nur in der Karte auf diesem Gerät; erst dein Tipp auf „Öffnen“ übergibt ihn per Link an WhatsApp, Telegram, Nachrichten oder E-Mail (wa.me / t.me werden vom Messenger-Dienst selbst geöffnet). Diese App sendet nichts selbst und liest keine Kontakte | nur die zuletzt gewählte Messenger-App im Browser | nichts | Karte leer lassen; Teilen-Blatt des Geräts nutzen |
| KI-Verwaltung / „Automatisch“ (3.2.0): Allgemeine Fragen gehen – nach deinen Einstellungen in dieser Reihenfolge – an OpenRouter und das Unternehmen hinter dem gewählten kostenlosen Modell (Gratis-Modelle dürfen Eingaben protokollieren oder zum Training nutzen), an Groq (USA), an Pollinations (Dritter, ohne Konto, nur mit deiner Zustimmung) oder an Ollama (bleibt auf dem PC). Gesendet werden nur die Frage, die letzten Nachrichten des Chats und ein kurzer System-Text – ohne Gerätenamen, ohne Daten des PCs. Befehle und PC-Werte bleiben am PC | Schlüssel geschützt nur am PC (nie im Browser, nie in Backups, nie in GitHub); Reihenfolge und Schalter am PC | nichts | Anbieter ausschalten oder Schlüssel entfernen; „Eingebaut“ im KI-Umschalter wählen |
| JARVIS-Stimme von ElevenLabs (nur wenn am PC eingeschaltet, sonst aus): der Text, den JARVIS spricht (höchstens 600 Zeichen je Antwort), geht über den Begleiter an ElevenLabs (api.elevenlabs.io, USA) und kommt als Sprachausgabe (MP3) zurück; der Schlüssel wird nur am PC eingegeben, dort verschlüsselt gespeichert und nie an Handy oder Webseite gesendet; nur Standardstimmen (keine geklonten), Monatslimit in Zeichen; die Sprachausgabe wird nicht gespeichert | Schlüssel (verschlüsselt), Stimme, Lautstärke, Limit und Monatszähler in den Einstellungen des PCs | nichts | Schalter „ElevenLabs-Stimme benutzen“ aus oder Schlüssel entfernen; dann spricht nur die Browser-Stimme (bleibt auf dem Gerät) |
| KI-Router (nur wenn du ihn am PC einrichtest und als Modus oder im Chat wählst): deine Frage und der bisherige Gesprächsverlauf gehen vom PC an die eingetragene Router-Adresse – je nach Wahl `openrouter.ai`, `api.groq.com`, `api.mixroute.ai` oder dein eigener Router im Heimnetz (OmniRoute/LiteLLM) – und von dort an das gewählte Modell; kostenlose Modelle dürfen Eingaben laut Anbietern teils zum Training nutzen; Router-Schlüssel nur am PC eingetragen, verschlüsselt (DPAPI), nie angezeigt, nie im Backup. Bei Recherche geht zusätzlich der kurze Chat-Verlauf (höchstens 4 Nachrichten à 400 Zeichen) als Kontext an die KI am PC | Adresse, Modelle, Anzahl im Monatszähler am PC (`assistant.json`) | KI-Assistent → Einrichten → KI-Router → „Router entfernen“ |
| JARVIS-Nachschlagen (nur nach deinem „Ja“ oder „Immer erlauben“): der Suchbegriff geht direkt vom Gerät an Wikipedia (de/en), das Wiki des gefragten Spiels (über 80, vollständige Liste in `web/src/lib/knowledge-sources.ts`: u. a. de.minecraft.wiki, en.uesp.net, *.fandom.com, *.wiki.gg, zeldawiki.wiki, bulbapedia.bulbagarden.net, wiki.leagueoflegends.com, mariowiki.com, halopedia.org, wiki.factorio.com, rimworldwiki.com, ssbwiki.com, bg3.wiki), je nach Frage an klexikon.zum.de, de.wikivoyage.org und api.stackexchange.com (Arqade, Super User, Board & Card Games); mit verbundenem PC zusätzlich über deinen eigenen YouTube-Schlüssel an YouTube und die gefundenen Textstellen an die am PC gewählte KI (lokal über Ollama, Claude, kostenlos Gemini mit deinem eigenen Google-AI-Studio-Schlüssel an `generativelanguage.googleapis.com`, sonst DeepSeek – nach deiner Einstellung) für eine Zusammenfassung; nur wenn du „KI fragen (ohne Quelle)“ tippst, geht deine Frage allein an diese KI; im kostenlosen Gemini-Tarif darf Google die gesendeten Texte laut Preisseite zur Produktverbesserung nutzen; TikTok, Instagram und Reddit werden nicht abgefragt, nur als Such-Link geöffnet, wenn du tippst; Gefundenes mit Quelle | Wiki-Seite „JARVIS-Wissen (nachgeschlagen)“, Fragen ohne Antwort „JARVIS: offene Fragen“ | Seiten im Wiki löschen; JARVIS → Stimme & Ton → „Unbekanntes nachschlagen: Nie“ |
| Profile (inkl. eigenem Theme je Profil), Quick Actions, Automatisierungen (inkl. letzte 10 Ausführungen), Hotkeys | `profiles.json`, `quickactions.json`, `automations.json`, `hotkeys.json` | in der App |
| Sounds (Audiodateien und Namen) | `sounds\`, `sounds.json` | Soundboard → Löschen |
| Spielverlauf (Start/Ende, Dauer, optional CPU/RAM/GPU-Mittelwerte) | `history.json` | Gaming-Verlauf → „Verlauf löschen“; abschaltbar unter Einstellungen → Datenschutz |
| Eigene Widgets, Decks (Tasten, Beschriftungen, kleine Tastenbilder), Overlay-Anordnung, eigene Ping-Ziele, Design je Gerät | `widgets.json`, `decks.json`, `settings.json`, `devices.json` | in der App |
| Gekoppelte Geräte: Name, Rechte, letzte IP, **nur ein Hash** des Geräteschlüssels | `devices.json` | Geräte → Entfernen |
| Geheimnisse: Relay-Schlüssel, Steam-API-Schlüssel, OBS-Passwort | `settings.json`, mit Windows-DPAPI verschlüsselt | Einstellungen → Feld leeren |
| GameQuest: Ziele, selbst eingetragene Matches, verdiente XP | `quests.json` | GameQuest → Ziel/Match löschen, oder Datei löschen |
| Deal Radar: Wunschliste, Zielpreise, selbst gesehene Preise | `deals.json` | Deal Radar → Entfernen |
| KI-Assistent: Modus, Modell, Ollama-Adresse, Monatslimit, Kosten je Monat, **Anthropic-Schlüssel nur DPAPI-geschützt** | `assistant.json` | Assistent → Einrichten → Schlüssel löschen, oder Datei löschen |
| Benachrichtigungen mit Verlauf (gelesen/geschlossen, höchstens 200, älter als 30 Tage wird gelöscht) | `notifications.json` | Benachrichtigungen → Verlauf löschen |
| Spielmodus: Programmliste, Schalter und – während eines Spiels – die Pfade der geschlossenen Programme (zum Wiederöffnen) | `gamemode-programs.json` | Profile → Spielmodus |
| Zuletzt gesehene WLAN-Adresse(n) des PCs (um eine Änderung zu melden) | `lan-address.json` | Datei löschen |
| Update-Wächter: Version, ob sie stabil lief, Zahl fehlgeschlagener Starts | `update-guard.json` | Datei löschen |
| Kalender-Termine und bereits gezeigte Erinnerungen | `calendar.json` | Kalender → Termin löschen oder Datei löschen |
| Eigener Status (Text, Dauer, Freigabe). Wird nur an gekoppelte Geräte gegeben – an Geräte mit nur Leserechten erst nach Freigabe; nie ins Internet | `activity.json` | Datei löschen |
| Dateien vom/zum Handy | `Downloads\Nexus Gaming Hub\` (mit eigenem Datenordner: `transfer\`) | Dateien → Löschen oder im Explorer |
| Aufnahmen: eigene Ordner, Favoriten, Schlagwörter | `captures.json` | Datei löschen |
| Vorschaubilder der Aufnahmen (höchstens 3000) | `thumbs\` | Ordner löschen |
| Push: eigener Schlüssel des PCs (privat geschützt) und die Push-Adressen der Geräte | `webpush.json` | Benachrichtigungen → Push ausschalten oder Datei löschen |
| Systemanforderungen aus dem Steam-Shop (höchstens 300 Spiele) | `compat.json` | Datei löschen |
| Mods: eingestellte Mod-Ordner je Spiel | `mods.json` | Datei löschen |
| Sicherungen der Mod-Ordner (je Spiel die letzten 5) | `mod-backups\` | Ordner löschen |
| Fenster-Layouts (Programmname, Monitor, Position) | `window-layouts.json` | Fenster-Layouts → Löschen |
| Tastenbelegung (Profile, Programmnamen, welche Taste was wird) – **keine** Tastendrücke, nichts wird mitgeschrieben | `input-remap.json` | Tastatur & Maus belegen → Löschen |
| Spielzeitanalyse: IGDB-/Twitch-Zugang (Client-ID; **Geheimnis nur DPAPI-geschützt**), optional YouTube-API-Schlüssel (**nur DPAPI-geschützt**), abgerufene Durchschnittsdauern je Spiel (7 Tage) | `playtime.json` | Spiele-Journal → Spielzeit → „Entfernen“, oder Datei löschen |
| Spielzeit je Spiel: Fortschritt, eigene Angaben, zuletzt vom PC geholte Werte (mit Quelle und Datum) | `journal.json` (Art „playtime“) und im Browser des Geräts | Spiele-Journal → Spielzeit → Löschen |
| Ausgaben für Spiele (Betrag, Spiel, Datum – nur deine Angaben, keine Shop-Konten) | `journal.json` (Art „spend“) und im Browser des Geräts | Spiele-Journal → Ausgaben → Löschen |
| Gamer-Pass: Name und Symbol | nur im Browser des Geräts (`localStorage`, `pgl.gamerpass`) | Feld leeren oder Browserdaten löschen |
| Konten: Benutzername, Hash des Anmelde-Schlüssels, **verschlüsseltes** Design samt Gamer-Pass/Zähler/Pausen-Erinnerung (der PC kann es nicht lesen; das Passwort wird nie übertragen) | `design-accounts.json` | Einstellungen → Design → Profil löschen, oder Datei löschen |
| Widgets Zähler/Pausen-Erinnerung, vom Handy geprüfte Xbox-Preise | nur im Browser des Geräts (`pgl.widget.*`, `pgl.deals.ms`) | Browserdaten löschen |
| OpenRGB-Verbindung (Adresse, Port) | `rgb.json` | Datei löschen |
| Plugins | `plugins\` | Plugin Center → Entfernen |
| Logs (Fehler/Ereignisse, ohne Nachrichteninhalte) | `logs\` (rotierend) | Ordner löschen |
| Backups und Wiederherstellungspunkte | `backups\` (automatisch die neuesten 5) | Einstellungen → Backup oder Ordner löschen |

**Assistent-Gespräche** liegen nur im Arbeitsspeicher und sind nach einem Neustart weg (spätestens nach 3 Stunden). Auf dem Gerät steht der Chat nur im Speicher des Browser-Tabs.

## 2. Was auf dem Handy, Tablet oder im Browser gespeichert wird

- **Gerätekennung und Geräteschlüssel** (Browser-Speicher). Wer das Gerät entsperrt benutzt, kann damit den PC steuern. Ein verlorenes Gerät deshalb am PC unter „Geräte“ entfernen.
- **Design, Layouts, Navigation, Sprache.** Diese Daten liegen zusätzlich auf dem PC, damit sie mit dem Gerät mitwandern.
- **Zugangscode der Webseite:** nur als gesalzener Hash. Er ist eine Sichtsperre, kein Schutz des PCs.
- **Zwischenspeicher für den Offline-Betrieb:** Listen (Bibliothek, Sounds, Profile …), wartende Änderungen, noch nicht übertragene Sounds und Plugin-Dateien.
  - Ein OBS-Passwort, das offline eingegeben wurde, wartet hier **unverschlüsselt**, bis der PC es übernimmt.
- **Kalender-Erinnerungen:** welche Erinnerungen dieses Gerät schon gezeigt hat (`pgl.calendar.reminded`, höchstens 300 Einträge).
- **Letzter Stand (`pgl.cache.*`):** zuletzt geladene Listen (Spiele, Steam, Game Pass, Deck, Einstellungen …) und die Übersicht des PCs (PC-Name, Profil, Zähler – ohne was gerade läuft oder spielt), damit alles auch bei ausgeschaltetem PC mit „Stand …“-Datum zu sehen ist. Keine Zugangsdaten darin. Wird beim Abmelden und beim Entfernen des Geräts gelöscht.
- **Dateien und Vorschaubilder:** zum Senden vorgemerkte und „offline behaltene“ Dateien (IndexedDB `pgl-files`, zusammen höchstens 500 MB) und gesehene Vorschaubilder der Aufnahmen (`pgl-thumbs`, höchstens 600). Entfernen über den Bereich „Dateien“ bzw. die Website-Daten des Browsers.
- **Service Worker:** die App-Dateien, damit die Seite auch bei ausgeschaltetem PC öffnet. Bei jedem Update wird aufgeräumt.

Alles löschen: Browser-Daten der Seite löschen oder in der App „PC verbinden“ → „Abmelden“.

## 3. Was zwischen PC und Geräten übertragen wird

- **Im WLAN:** direkt per http/ws. Die Anmeldung ist geschützt (Challenge-Response), der **Inhalt aber unverschlüsselt**. Im eigenen Heimnetz ist das vertretbar, in fremden Netzen nicht.
- **Über einen eigenen Tunnel** (z. B. Cloudflare Tunnel): TLS bis zum Tunnel.
- **Über das Relay:** TLS bis zum Relay. Das Relay leitet nur weiter und speichert nichts dauerhaft.
  - Die Anmeldung ist Ende-zu-Ende geschützt, der Inhalt danach aber nicht: Der Betreiber eines Relays könnte ihn technisch mitlesen. Ein Relay deshalb nur selbst oder bei jemandem betreiben, dem du vertraust.

## 4. Optionale Online-Dienste (wer etwas erfährt)

- **Kompatibilitäts-Check (nur auf Knopfdruck):** Der PC fragt den Steam-Shop nach den Anforderungen eines Spiels (`store.steampowered.com`, nur die App-ID). Steam erfährt, dass von deiner IP-Adresse diese Seite abgerufen wurde.
- **Push-Benachrichtigungen (nur wenn auf einem Gerät eingeschaltet):** Der PC schickt Meldungen an den Push-Dienst des Browsers (Google, Mozilla, Apple oder Microsoft). Inhalt ist Ende-zu-Ende verschlüsselt; der Dienst sieht Zeitpunkt, Größe und das Ziel-Gerät. Andere Adressen werden nie angesprochen.

| Funktion | Ziel | Was gesendet wird | Abschalten |
|---|---|---|---|
| Update-Prüfung (2 min nach Start, dann täglich; nicht während eines Spiels) | `nilshenke-ops.github.io` (GitHub Pages) | normale HTTP-Anfrage (IP-Adresse) | Einstellungen → Updates → Quelle leeren |
| Plugin-Katalog (täglich) | `nilshenke-ops.github.io` | dito | Einstellungen → Katalog-Adresse leeren |
| Cover-Suche | Steam-Shop, Microsoft Store | Spielname | Einstellungen → Datenschutz → „Cover automatisch suchen“ |
| Steam-Cover anzeigen | `steamstatic.com` (Steam-CDN) | IP-Adresse deines Geräts | Einstellungen → Datenschutz → „Steam-Cover aus dem Steam-CDN“ |
| Steam-Bibliothek | Steam Web API | dein eigener API-Schlüssel und deine Steam-ID | Steam-Verknüpfung entfernen |
| Deal Radar (aus, bis du es einschaltest; höchstens alle 6 h, nie während eines Spiels; Suche nur auf Knopfdruck) | Steam-Shop `store.steampowered.com` | IP-Adresse des PCs, App-IDs der Wunschliste bzw. der Suchbegriff, Shop-Land | Deal Radar → „Preise im Steam-Shop abfragen“ aus |
| Deal Radar – Steam-Wunschliste (nur wenn Preisabfrage und „Steam-Wunschliste automatisch übernehmen“ an sind; mit jeder Prüfung) | Steam-Web-API `api.steampowered.com` (ohne API-Schlüssel) | IP-Adresse des PCs, deine Steam-ID, App-IDs für die Namen | Deal Radar → „Steam-Wunschliste automatisch übernehmen“ aus |
| Deal Radar – Microsoft Store (nur wenn Preisabfrage und „Auch im Microsoft Store (Xbox) vergleichen“ an sind; mit jeder Prüfung) | Microsoft-Katalog `displaycatalog.mp.microsoft.com` | IP-Adresse des PCs, Spielname der Wunschliste, Shop-Land | Deal Radar → „Auch im Microsoft Store (Xbox) vergleichen“ aus |
| Deal Radar ohne PC (nur wenn Preisabfrage und Xbox-Vergleich an sind; auf Knopfdruck oder nach dem Hinzufügen) | Microsoft-Katalog `displaycatalog.mp.microsoft.com`, **direkt vom Handy** | IP-Adresse des Handys, Spielname, Shop-Land | Deal Radar → „Auch im Microsoft Store (Xbox) vergleichen“ aus |
| Deal Radar – Preisvergleich Keyforsteam (nur auf Knopfdruck im Spiel; höchstens alle 5 s, 6 h gespeichert) | `www.keyforsteam.de` (eine Spieleseite) | IP-Adresse des PCs, Name des Spiels in der Adresse | nicht antippen |
| Bingo aus dem Internet (nur nach deinem „Ja“, „Ja, immer erlauben“ oder Häkchen; je Spiel 24 h gespeichert) | `store.steampowered.com` (Suche, Genre, Beschreibung), `steamcommunity.com` (Erfolge), `api.steampowered.com` (Freischaltquoten); nicht auf Steam: `displaycatalog.mp.microsoft.com` (Microsoft Store/Xbox: Suche, Beschreibung, Kategorie), sonst `de.wikipedia.org` (Titelsuche, Kurzbeschreibung); ist eine Bingo-KI eingerichtet, gehen diese gefundenen Infos (Spielname, Genre, Beschreibung, Erfolgsnamen) zusätzlich an diese KI (DeepSeek/Claude bzw. lokal Ollama) | IP-Adresse des PCs, Spielname bzw. App-ID | nicht zustimmen; „immer erlauben“ zurücknehmen: im Bingo-Maker das Häkchen „aus dem Internet“ abwählen bzw. Browserdaten `pgl.bingo.web` löschen |
| JARVIS „Was ist … für ein Spiel / was kostet … / wie viele spielen … / läuft … auf meinem PC?“ (nur auf diese Frage, über den PC) | `store.steampowered.com` (Suche, Shop-Daten, Systemanforderungen), `api.steampowered.com` (aktuelle Spielerzahl); ohne PC: `displaycatalog.mp.microsoft.com`, `de.wikipedia.org` | IP-Adresse des PCs bzw. Geräts, Spielname | nicht fragen |
| JARVIS „Was gibt es bei Epic gratis?“ (nur auf diese Frage, über den PC) | `store-site-backend-static.ak.epicgames.com` (öffentliche Gratis-Liste des Epic-Stores) | IP-Adresse des PCs | nicht fragen |
| JARVIS „Was kostet … auf Xbox?“ (nur auf diese Frage) | direkt vom Browser: `displaycatalog.mp.microsoft.com` | IP-Adresse des Geräts, Spielname | nicht fragen |
| JARVIS „Wer streamt gerade …?“ (nur auf diese Frage, nur mit deiner Twitch-Anwendung, über den PC) | `id.twitch.tv`, `api.twitch.tv` (Helix: Kategorie-Suche, Live-Streams) | IP-Adresse des PCs, Spielname, deine Client-ID | Twitch-Anwendung entfernen |
| JARVIS „Zeig mir ein Video zu …“ (nur auf diese Frage) | mit deinem YouTube-Schlüssel über den PC: `www.googleapis.com` (YouTube Data API, Suche); ohne Schlüssel nur ein Link zur YouTube-Suche – öffnest du ihn, gilt YouTubes Datenschutz | IP-Adresse des PCs, Suchbegriff | YouTube-Schlüssel entfernen |
| JARVIS „Weltrekord in …“ und „Free-to-Play-Spiele“ (nur auf diese Frage) | direkt vom Browser: `www.speedrun.com` (Spielsuche, Rekorde), `www.freetogame.com` (Liste kostenloser Spiele) | IP-Adresse des Geräts, Spielname bzw. Art | nicht fragen |
| JARVIS „Was ist gerade gratis?“ (nur auf diese Frage) | direkt vom Browser: `www.gamerpower.com` (Liste der Gratis-Angebote) | IP-Adresse des Geräts, gewählte Plattform | nicht fragen |
| JARVIS „Was ist neu in …?“ (nur auf diese Frage, über den PC) | `store.steampowered.com` (Spielsuche per Name), `api.steampowered.com` (offizielle Ankündigungen) | IP-Adresse des PCs, Spielname | nicht fragen |
| Spielzeitanalyse: Durchschnittsdauern (nur wenn du am PC einen IGDB-Zugang eingetragen hast und JARVIS nach der Dauer fragst) | `id.twitch.tv` (Anmeldung mit deiner Twitch-Anwendung), `api.igdb.com` (Spielsuche, „Time to Beat“) | IP-Adresse des PCs, Spielname, deine Client-ID | IGDB-Zugang entfernen |
| Spielzeit aus Steam | **nichts Neues im Internet:** am PC wird Steams eigene Datei `userdata\…\config\localconfig.vdf` nur gelesen; ist der Steam-Schlüssel eingetragen, kommt die Spielzeit wie bisher aus deinem Steam-Konto (`api.steampowered.com`) | – | Steam-Schlüssel leeren |
| Bingo aus dem Internet ohne PC (nur nach deinem „Ja“ bzw. „Ja, immer erlauben“) | direkt vom Browser: `displaycatalog.mp.microsoft.com` (Microsoft Store: Suche, Beschreibung, Kategorie), `de.wikipedia.org`/`en.wikipedia.org` (Titelsuche, Artikeltext) | IP-Adresse des Geräts, Spielname | nicht zustimmen |
| Steam-Preise und -Bilder ohne PC | Dateien `prices/steam-de.json` und `prices/apps/<Buchstabe>.json` auf der eigenen Website (GitHub Pages) – erstellt von einer GitHub Action, die Steam fragt | nur der übliche Seitenabruf (IP-Adresse an GitHub); **keine** Angaben zur Wunschliste | Preisabfrage aus |
| KI-Assistent „Lokale KI“ (Ollama) | die eingetragene Ollama-Adresse – normalerweise dieser PC (`127.0.0.1:11434`), sonst ein Gerät im Heimnetz; Internet-Adressen werden abgelehnt | Frage, Verlauf und abgefragte Daten – bleiben auf dem PC bzw. im Heimnetz | Assistent → Einrichten → „Lokal“ |
| KI-Assistent mit Claude (nur wenn du einen Schlüssel einträgst und „Claude“ wählst; lokaler Modus sendet nichts) | Anthropic (`api.anthropic.com`) | deine Frage, der Gesprächsverlauf, die Wissensbasis der App und die Daten, die Claude dafür über Werkzeuge abfragt (z. B. Spielnamen, PC-Werte, Spielzeit, Wunschliste, Gerätename). Nie: Schlüssel, Passwörter, Tokens | Assistent → Einrichten → „Lokal“ oder Schlüssel löschen |
| Game Pass | `catalog.gamepass.com`, `displaycatalog.mp.microsoft.com` | Markt (z. B. DE) | Game Pass ausschalten |
| Netzwerkdiagnose | Ping zu `1.1.1.1` (Cloudflare) und `8.8.8.8` (Google); eigene Ziele; Diagnose: DNS `www.msftconnecttest.com` | ICMP-Ping bzw. DNS-Anfrage, nur solange die Seite offen ist | Seite nicht öffnen |
| Sound-Import per Link | die eingegebene Adresse (z. B. MyInstants) | normale Anfrage | nicht benutzen |
| OBS | die eingetragene OBS-Adresse (meist dieser PC) | Steuerbefehle | OBS-Verbindung leeren |
| Eigene Widgets mit Bild-Adresse | die eingetragene https-Adresse | IP-Adresse | Bild hochladen statt verlinken |
| Plugins mit Recht „Netzwerk“ | vom Plugin gewählte https-Ziele | was das Plugin sendet | Plugin deaktivieren |

**Wichtig – öffentliche Steam-Liste:** Der GitHub-Workflow `steam-library.yml` veröffentlicht, wenn die Secrets `STEAM_API_KEY` und `STEAM_ID` gesetzt sind, alle 6 Stunden `steam.json` auf GitHub Pages.
- Die Datei enthält Spielenamen, Spielzeit und den Steam-Anzeigenamen.
- Sie ist **für jeden im Internet lesbar**.
- Abschalten: das Secret `STEAM_API_KEY` im Repository löschen oder den Workflow deaktivieren und `steam.json` aus `gh-pages` entfernen.

## 5. Was ohne Internet, Relay und Cloud funktioniert

Im WLAN funktioniert alles, was zwischen Handy und PC passiert, ohne Internet:
- Starten, Soundboard, Profile, Hotkeys, Automatisierungen, Monitor, Overlay, Widgets, Backups.

Ohne Internet fehlen nur:
- Update- und Plugin-Katalog-Prüfung, Cover-Suche, Steam, Game Pass und die Preise im Deal Radar.
- Die Internet-Ziele der Netzwerkdiagnose.

## Energie-Aktionen (2.32)
Sperren, Energiesparen, Neustart und Herunterfahren laufen nur über die verschlüsselte Verbindung zu deinem eigenen PC. Der PC protokolliert, welches gekoppelte Gerät die Aktion ausgelöst hat (Log und Benachrichtigung am PC). Nichts davon verlässt den PC.
