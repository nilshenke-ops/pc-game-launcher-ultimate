# Datenschutz – Nexus Gaming Hub

Kurz gesagt: Es gibt keine Telemetrie, keine Werbung und kein Konto. Alles Wichtige liegt auf deinem PC. Einige Funktionen sprechen aber Online-Dienste an. Welche das sind, steht hier vollständig, damit du selbst entscheiden kannst.

## 1. Was auf dem PC gespeichert wird

Die Daten liegen im Datenordner `%APPDATA%\PCGameLauncherUltimate`. Der Name ist aus technischen Gründen der alte, damit Updates weiter funktionieren.

| Daten | Datei | Löschen |
|---|---|---|
| Bibliothek (Spiele, Programme, Startziele, Notizen, Bewertungen, Backlog-Status, Priorität, Ziel in Stunden) | `library.json` | in der App einzeln, oder Datei löschen |
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
