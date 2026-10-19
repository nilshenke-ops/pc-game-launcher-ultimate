# Datenschutz – Nexus Gaming Hub

Kurz gesagt: Es gibt keine Telemetrie, keine Werbung und kein Konto. Alles Wichtige liegt auf deinem PC. Einige Funktionen sprechen aber Online-Dienste an. Welche das sind, steht hier vollständig, damit du selbst entscheiden kannst.

## 1. Was auf dem PC gespeichert wird

Die Daten liegen im Datenordner `%APPDATA%\PCGameLauncherUltimate`. Der Name ist aus technischen Gründen der alte, damit Updates weiter funktionieren.

| Daten | Datei | Löschen |
|---|---|---|
| Bibliothek (Spiele, Programme, Startziele, Notizen, Bewertungen) | `library.json` | in der App einzeln, oder Datei löschen |
| Profile, Quick Actions, Automatisierungen (inkl. letzte 10 Ausführungen), Hotkeys | `profiles.json`, `quickactions.json`, `automations.json`, `hotkeys.json` | in der App |
| Sounds (Audiodateien und Namen) | `sounds\`, `sounds.json` | Soundboard → Löschen |
| Spielverlauf (Start/Ende, Dauer, optional CPU/RAM/GPU-Mittelwerte) | `history.json` | Gaming-Verlauf → „Verlauf löschen“; abschaltbar unter Einstellungen → Datenschutz |
| Eigene Widgets, Overlay-Anordnung, eigene Ping-Ziele, Design je Gerät | `widgets.json`, `settings.json`, `devices.json` | in der App |
| Gekoppelte Geräte: Name, Rechte, letzte IP, **nur ein Hash** des Geräteschlüssels | `devices.json` | Geräte → Entfernen |
| Geheimnisse: Relay-Schlüssel, Steam-API-Schlüssel, OBS-Passwort | `settings.json`, mit Windows-DPAPI verschlüsselt | Einstellungen → Feld leeren |
| GameQuest: Ziele, selbst eingetragene Matches, verdiente XP | `quests.json` | GameQuest → Ziel/Match löschen, oder Datei löschen |
| Deal Radar: Wunschliste, Zielpreise, selbst gesehene Preise | `deals.json` | Deal Radar → Entfernen |
| Plugins | `plugins\` | Plugin Center → Entfernen |
| Logs (Fehler/Ereignisse, ohne Nachrichteninhalte) | `logs\` (rotierend) | Ordner löschen |
| Backups und Wiederherstellungspunkte | `backups\` (automatisch die neuesten 5) | Einstellungen → Backup oder Ordner löschen |

**Benachrichtigungen** liegen nur im Arbeitsspeicher und sind nach einem Neustart weg.

## 2. Was auf dem Handy, Tablet oder im Browser gespeichert wird

- **Gerätekennung und Geräteschlüssel** (Browser-Speicher). Wer das Gerät entsperrt benutzt, kann damit den PC steuern. Ein verlorenes Gerät deshalb am PC unter „Geräte“ entfernen.
- **Design, Layouts, Navigation, Sprache.** Diese Daten liegen zusätzlich auf dem PC, damit sie mit dem Gerät mitwandern.
- **Zugangscode der Webseite:** nur als gesalzener Hash. Er ist eine Sichtsperre, kein Schutz des PCs.
- **Zwischenspeicher für den Offline-Betrieb:** Listen (Bibliothek, Sounds, Profile …), wartende Änderungen, noch nicht übertragene Sounds und Plugin-Dateien.
  - Ein OBS-Passwort, das offline eingegeben wurde, wartet hier **unverschlüsselt**, bis der PC es übernimmt.
- **Service Worker:** die App-Dateien, damit die Seite auch bei ausgeschaltetem PC öffnet. Bei jedem Update wird aufgeräumt.

Alles löschen: Browser-Daten der Seite löschen oder in der App „PC verbinden“ → „Abmelden“.

## 3. Was zwischen PC und Geräten übertragen wird

- **Im WLAN:** direkt per http/ws. Die Anmeldung ist geschützt (Challenge-Response), der **Inhalt aber unverschlüsselt**. Im eigenen Heimnetz ist das vertretbar, in fremden Netzen nicht.
- **Über einen eigenen Tunnel** (z. B. Cloudflare Tunnel): TLS bis zum Tunnel.
- **Über das Relay:** TLS bis zum Relay. Das Relay leitet nur weiter und speichert nichts dauerhaft.
  - Die Anmeldung ist Ende-zu-Ende geschützt, der Inhalt danach aber nicht: Der Betreiber eines Relays könnte ihn technisch mitlesen. Ein Relay deshalb nur selbst oder bei jemandem betreiben, dem du vertraust.

## 4. Optionale Online-Dienste (wer etwas erfährt)

| Funktion | Ziel | Was gesendet wird | Abschalten |
|---|---|---|---|
| Update-Prüfung (2 min nach Start, dann täglich; nicht während eines Spiels) | `nilshenke-ops.github.io` (GitHub Pages) | normale HTTP-Anfrage (IP-Adresse) | Einstellungen → Updates → Quelle leeren |
| Plugin-Katalog (täglich) | `nilshenke-ops.github.io` | dito | Einstellungen → Katalog-Adresse leeren |
| Cover-Suche | Steam-Shop, Microsoft Store | Spielname | Einstellungen → Datenschutz → „Cover automatisch suchen“ |
| Steam-Cover anzeigen | `steamstatic.com` (Steam-CDN) | IP-Adresse deines Geräts | Einstellungen → Datenschutz → „Steam-Cover aus dem Steam-CDN“ |
| Steam-Bibliothek | Steam Web API | dein eigener API-Schlüssel und deine Steam-ID | Steam-Verknüpfung entfernen |
| Deal Radar (aus, bis du es einschaltest; höchstens alle 6 h, nie während eines Spiels; Suche nur auf Knopfdruck) | Steam-Shop `store.steampowered.com` | IP-Adresse des PCs, App-IDs der Wunschliste bzw. der Suchbegriff, Shop-Land | Deal Radar → „Preise im Steam-Shop abfragen“ aus |
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
