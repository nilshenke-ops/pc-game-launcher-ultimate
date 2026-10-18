# Abschlussbericht – PC Game Launcher Ultimate 1.0.0

Stand: 17.10.2026. Entwickelt und getestet in einer Linux-Cloud-Umgebung (kein Windows-PC, keine Audiogeräte, kein Discord verfügbar). Die Statusangaben unten folgen genau dieser Einschränkung.

**Legende:** FERTIG UND GETESTET · IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET · TEILWEISE IMPLEMENTIERT · NOCH NICHT IMPLEMENTIERT · NICHT TESTBAR

## 1. Was wurde implementiert?

Eine vollständige Gaming-Zentrale aus drei Programmen:

- **Windows-Companion** (eine EXE): eingebauter Webserver und WebSocket-API, Kopplung und Geräteverwaltung, Spiele-/Programmbibliothek mit Steam-, Epic- und Startmenü-Erkennung, Spielerkennung über Prozesse, Gaming-Profile mit Auto-Wechsel, Quick Actions, Automatisierungen, globale Hotkeys, Soundboard mit NAudio, Mikrofon-Durchleitung für Discord, PC-Monitor, Netzwerk-/Audio-Diagnose, Benachrichtigungen, Updatecenter, Backup/Wiederherstellung, Autostart, Tray, WebView2-Fenster.
- **Web-App** (React/TypeScript/PWA) für Handy, Tablet und PC: 17 Bereiche, Dashboard mit anpassbaren Widgets und Layouts, Design-Editor, globale Suche (Strg+K), Deutsch/Englisch, mobile Navigation, Offline-/Fehlerzustände.
- **Relay** (Node.js, optional) für den Zugriff von unterwegs und als Download-Server.

Wichtigste Architekturentscheidung: Der Companion liefert die Web-App selbst aus. Im Heimnetz ist **kein separates Relay** mehr nötig – die Fehlermeldung „Fehler bei der Verbindung“ aus den alten Screenshots (Companion fand das Relay nicht) kann so nicht mehr entstehen. Die alte WinForms-Oberfläche mit grauen Tabs ist durch dieselbe moderne Oberfläche wie auf dem Handy ersetzt.

## 2. Komponenten

| Komponente | Pfad | Technik |
|---|---|---|
| Companion-Kern | `companion/src/Companion.Core` | C#, .NET 8, ASP.NET Core |
| Windows-App | `companion/src/Companion.Windows` | .NET 8 WinForms, WebView2, NAudio |
| Headless-Companion | `companion/src/Companion.Headless` | .NET 8 (Entwicklung/Tests) |
| Web-App | `web/` | React 19, Vite 6, TypeScript 5.9 |
| Relay | `relay/` | Node.js 20+, TypeScript, ws |
| Protokoll | `protocol/protocol.json` | JSON (einzige Quelle aller Methoden + Berechtigungen) |
| Tests | `companion/tests`, `web/src/**/*.test.ts`, `web/e2e`, `relay/test` | xUnit, Vitest, Playwright, node:test |

## 3./4./5. Tests – was wurde ausgeführt, was war erfolgreich, was ist fehlgeschlagen?

Letzter vollständiger Lauf mit `scripts/test-all.sh`: **alle erfolgreich, 0 fehlgeschlagen.**

| Testpaket | Anzahl | Ergebnis | Inhalt |
|---|---|---|---|
| Web Unit-Tests (Vitest) | 12 | ✅ 12/12 | SHA-256/HMAC gegen Node-Crypto, Login-Beweis identisch zum C#-Server, Übersetzungen vollständig (≈750 Texte), Platzhalter, alle aufgerufenen API-Methoden existieren im Protokoll, Eingabebereinigung der Designdaten, Kontrastberechnung, Suche, Hotkey-Aufnahme |
| Relay (node:test) | 6 | ✅ 6/6 | falscher Schlüssel abgelehnt, Offline-/Online-Status, Weiterleitung in beide Richtungen, fremde Origins/unbekannter PC abgelehnt, statische Dateien + Pfad-Traversal-Schutz + Sicherheitsheader, Download nur bei passendem Manifest, Ersetzen einer Companion-Verbindung |
| Companion (xUnit) | 71 | ✅ 71/71 | Kopplung (Format, Einmaligkeit, Ablauf, Sperre, Rate-Limit, Claim), Challenge-Response/Replay, Widerruf, Berechtigungen, Admin nur lokal, Protokoll-Vollständigkeit, Startziel-Validierung, Steam-/Epic-Parser, Spielerkennung, Hotkey-Normalisierung/Konflikte, Audio-Formaterkennung, Duplikate, SSRF-Schutz, Automatisierungs-Schleifenschutz/Cooldown/Widersprüche, Profile, Einstellungsvalidierung, Backup (Roundtrip, keine Geheimnisse, beschädigte/manipulierte Dateien), beschädigte JSON-Dateien, echter Programmstart (Linux-Skript) |
| End-to-End (Playwright/Chromium) | 11 | ✅ 11/11 | Echter Headless-Companion + echtes Relay + Browser (Desktop und iPhone-/Pixel-Emulation): PC-Ansicht, ungekoppeltes Handy, falscher Code, **Kopplung per QR-Link mit Bestätigung am PC**, Sitzung übersteht Neuladen, **Programm am PC freigeben und vom Handy starten (Start nachgewiesen)**, Handy kann keine EXE freigeben, globale Suche, Design bleibt nach Neuladen, **Kopplung und Nutzung über das Relay**, **Widerruf entzieht sofort den Zugriff**, ehrlicher Download-Status, **PC aus → App öffnet aus dem Offline-Speicher, Design änderbar, verbindet sich nach PC-Start automatisch** |
| Windows-Build | – | ✅ | Cross-Compile von `Companion.Windows` ohne Fehler |
| EXE-Prüfung | – | ✅ | PE32+, x64, Windows-GUI-Subsystem; Web-App als Ressource enthalten |
| Download über Relay | – | ✅ | `/download/info` und Download der echten EXE: Größe (84 241 415 Bytes) und SHA-256 stimmen mit der Datei überein (curl + sha256sum) |

Während der Tests gefundene und behobene Fehler (Auswahl): statische CSS/JS-Dateien wurden vom Companion nicht ausgeliefert (Routing), Companion ignorierte SIGTERM, Epic-Prozessnamen falsch zerlegt, neuer QR-Code im selben Tab übernahm den Code nicht, nach Kopplung blieb das Handy auf der Kopplungsseite, Formular-Labels nicht mit Feldern verknüpft (Screenreader), Hinweis „Kopplung aufgehoben“ ging verloren, Endlos-Neuverbindung im Relay-Modus, endloses „Verbinde …“ bei inkompatibler Version.

## Status je Funktion

| Bereich | Status | Anmerkung |
|---|---|---|
| Web-App, Navigation, Designsystem, mobile Bedienung | FERTIG UND GETESTET | E2E Desktop + iPhone/Android-Emulation; nicht auf echten Geräten |
| Sichere Kopplung, QR-Code, Geräteverwaltung, Widerruf | FERTIG UND GETESTET | Unit + E2E |
| Lokaler WLAN-Modus | FERTIG UND GETESTET | im Container über 127.0.0.1; echtes WLAN NICHT TESTBAR |
| Relay / Zugriff von unterwegs | FERTIG UND GETESTET | mit ws:// lokal; TLS-Betrieb hinter Proxy NICHT TESTBAR hier |
| Download des Companions | FERTIG UND GETESTET | über Relay und `/download/*`; Companion bietet sich selbst zum Download an (nur als echte EXE) |
| Bibliothek: EXE-Freigabe und Start | FERTIG UND GETESTET (Linux) / IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET (Windows) | Windows-Start (ShellExecute, .lnk) nicht ausgeführt |
| Steam-/Epic-Erkennung | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | Parser mit Testdaten geprüft; echte Installationen nicht vorhanden |
| Steam-/Epic-/Store-/Xbox-Start | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | über `steam://`, Epic-URI, `shell:AppsFolder` – nur unter Windows ausführbar |
| Startmenü-/Store-/Xbox-Apps auflisten | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | Shell-COM, nur Windows |
| Spielerkennung, Verlauf, Statistik | FERTIG UND GETESTET | Logik getestet; Windows-Prozesspfade (QueryFullProcessImageName) nicht ausgeführt |
| Gaming-Profile inkl. Auto-Wechsel | FERTIG UND GETESTET | Logik; Anwendung auf Audiogeräte nur Windows |
| Quick Actions, globale Suche | FERTIG UND GETESTET | |
| Automatisierungen | FERTIG UND GETESTET | Schleifenschutz, Cooldown, Widerspruchserkennung |
| Globale Hotkeys | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | Konfiguration/Konflikte getestet; RegisterHotKey nur Windows |
| Soundboard: Import, Validierung, Sammlungen | FERTIG UND GETESTET | Upload, Duplikate, Formatprüfung, SSRF-Schutz |
| MyInstants-Import | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | aus der Testumgebung nicht gegen die echte Seite geprüft; nutzt den öffentlich in der Seite enthaltenen MP3-Pfad |
| Audio-Wiedergabe, Monitoring, Testton, Mikrofon-Durchleitung | NICHT TESTBAR | NAudio/WASAPI benötigt Windows + Audiogeräte |
| Discord-Workflow | NICHT TESTBAR | ob andere Teilnehmer den Sound hören, wird bewusst nicht behauptet |
| PC-Monitor | TEILWEISE IMPLEMENTIERT | CPU/RAM/Datenträger echt; GPU über Leistungsindikatoren bzw. nvidia-smi (Windows, nicht getestet); **CPU-Temperatur und FPS/Frametime: nicht verfügbar** (ehrlich gekennzeichnet) |
| Netzwerkdiagnose | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | läuft; Internet-Checks hängen von der Umgebung ab |
| Benachrichtigungen | FERTIG UND GETESTET | Entstehung über echte Ereignisse; Toasts unter Windows nicht getestet |
| Design-/Layout-Editor | FERTIG UND GETESTET | Persistenz lokal + auf dem PC |
| Deutsch/Englisch | FERTIG UND GETESTET | Meldungen des Companions selbst nur Deutsch |
| Backup/Wiederherstellung | FERTIG UND GETESTET | |
| Updatecenter | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | Prüfung/Download/SHA-256 implementiert; keine echte Update-Quelle vorhanden; Selbstersetzung nur Windows |
| Autostart, Tray, WebView2-Fenster, DPAPI | IMPLEMENTIERT, NOCH NICHT VOLLSTÄNDIG GETESTET | kompiliert, nicht unter Windows ausgeführt |
| Code-Signatur, Installer (MSI) | NOCH NICHT IMPLEMENTIERT | kein Zertifikat; EXE läuft ohne Installation |
| Push-Benachrichtigungen aufs Handy | NOCH NICHT IMPLEMENTIERT | Meldungen erscheinen in der App, nicht als System-Push |

## Nachträge
- **Offline-Modus:** Gekoppelte Geräte öffnen die App auch bei ausgeschaltetem PC (Service Worker, nur über https/localhost). Design und Layout sind änderbar; nach dem PC-Start verbindet sich die App automatisch (Wiederholung alle ≤ 15 s). Neue Geräte können über „App ohne PC öffnen“ vorab das Design einstellen. FERTIG UND GETESTET (E2E, Chromium); auf echtem iPad/Opera NICHT TESTBAR hier.
- **Demo-Vorschau:** Eigene Demo-Version mit Beispieldaten (deutlich gekennzeichnet, führt nichts aus), veröffentlicht als privates claude.ai-Artifact: https://claude.ai/artifact/EkJyHeUFFKo68VGXuFNxWB. Kann sich bauartbedingt nicht mit dem PC verbinden. Lokal im Browser getestet; die Darstellung im Artifact-Viewer selbst konnte ich nicht prüfen.
- **Feste Webseite „PC verbinden“:** eigene Build-Variante (`npm run build:hosted`, ZIP über `scripts/build-hosted-site.sh`) für kostenlose statische Hoster. Ohne gespeicherten PC zeigt sie „PC verbinden“; QR-Code (füllt Code + PC-Adresse aus) oder manuelle Eingabe, Bestätigung am PC, danach automatische Verbindung. Der Companion hat dafür die Einstellung „Adresse der gehosteten Web-App“ (QR-Ziel + erlaubte Herkunft) und zeigt die PC-Adresse zum Abschreiben. FERTIG UND GETESTET (E2E mit eigenem Origin). Das tatsächliche Hochladen zu Cloudflare Pages und der Betrieb über Tailscale Funnel: NICHT TESTBAR hier (benötigt deine Konten).
- **Fernzugriff ohne Domain:** Anleitung für Tailscale Funnel (INSTALLATION.md).
- Behoben: Seitlicher Überlauf auf Handys bei langen Namen (untere Leiste verschwand), leere Seite bei nicht zwischengespeicherten Bereichen (jetzt Fehlermeldung + vollständiger Offline-Speicher).

- **Veröffentlicht (GitHub Pages, geprüft):** Webseite https://nilshenke-ops.github.io/pc-game-launcher-ultimate/ lädt fehlerfrei (Chromium, iPad-Größe). Download https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/PCGameLauncherCompanion-1.0.0-win-x64.zip bzw. `/download/PCGameLauncherCompanion.exe` – per curl heruntergeladen, Größe 84 241 415 Bytes und SHA-256 `20190d0d…e86e` stimmen.
- **Vorschau ohne PC + Punkt „Verbinden“:** Ohne gekoppelten PC öffnet die Webseite direkt die ganze App mit deutlich gekennzeichneten Beispielinhalten („Vorschau – noch kein PC verbunden“). Design und Layout funktionieren lokal; jede Aktion (Starten, Sounds, Speichern …) öffnet stattdessen „Erst PC verbinden“ mit Weg zur Verbindungsseite. Die untere Leiste hat den neuen Punkt „Verbinden“ (Status-Punkt rot/grün): QR-Code/Code + PC-Adresse, bei bestehender Verbindung Status und Abmelden. Gekoppelte Geräte sehen bei ausgeschaltetem PC keine Beispieldaten, sondern „Warte auf deinen PC …“. Behoben dabei: Der eingegebene Code ging beim Verbinden verloren (Bereich wurde neu aufgebaut). FERTIG UND GETESTET (E2E: Vorschau, Hinweisfenster, Design ohne PC, Kopplung über die Webseite; alle 11 Tests grün).
- **Verbindungsreparatur (Ursache ws://127.0.0.1:8787/ws):** Mit dem echten Headless-Begleiter reproduziert: Relay-Adresse = eigener /ws-Endpunkt → Begleiter verbindet sich mit sich selbst → „Relay hat die Anmeldung abgelehnt“ in Endlosschleife. Behoben: Adresse wird beim Speichern abgelehnt und bei alten Einstellungen beim Start blockiert (mit Erklärung); WLAN-Adressen fallen nie mehr auf 127.0.0.1 zurück; Öffentliche Adresse darf nicht loopback sein; Relay-Fehler werden verständlich übersetzt; Web-App lehnt 127.0.0.1 als PC-Adresse ab; tote Verbindungen werden per Ping-Zeitüberschreitung (8 s) erkannt und neu aufgebaut, nach dem Aufwachen sofort geprüft. FERTIG UND GETESTET (C#-Tests, E2E, Reproduktion).
- **Diagnose mit Lösungen:** WebSocket-Endpunkt, iPad-Adresse (WLAN), Webseite→PC (https), Relay, Kopplung, verbundene Geräte, Berechtigungen, Autostart – auf dem PC; Adresse, WebSocket, Ping, Kopplung, Berechtigungen auf dem iPad selbst. Jeder Fehler mit Ursache und „Lösung“. FERTIG UND GETESTET (Linux/Chromium).
- **Offline statt Beispieldaten:** Ohne verbundenen PC zeigen alle Bereiche „Offline“ und „PC verbinden“; bei Verbindungsverlust werden angezeigte Daten (z. B. laufendes Spiel) verworfen; „Online“ nur bei echter Verbindung. FERTIG UND GETESTET (E2E).
- **Funktionsprüfung (Code-Audit) und Korrekturen:** keine erfundenen Werte gefunden. Behoben: Profil-Quick-Actions erscheinen jetzt im Dashboard; Rückwechsel stellt Lautstärke/Ausgabegerät/Sammlung wieder her (Test); Quick Actions aus Dashboard/Suche fragen bei Bestätigungspflicht und melden fehlgeschlagene Schritte; Update-Fehler werden als Fehler gemeldet und lösen den Auslöser „Update fehlgeschlagen“ aus; Mikrofon-Durchleitung startet nur bei Mikrofon-Änderungen neu; „Alle stoppen“ startet keinen Sound aus der Warteschlange mehr; Lautstärkeregler nur mit Berechtigung „Verwalten“. Offen: Testton nutzt gespeicherte (nicht ungespeicherte) Auswahl; keine Live-Erkennung beim Ab-/Anstecken von Audiogeräten; Profil-Dashboard-Layout gilt nur auf dem Gerät, auf dem es angelegt wurde.
- **Sounds ohne PC hinzufügen:** Dateien (MP3/WAV/FLAC/M4A/WMA, max. 20 MB, Format wird vorab geprüft) oder Links werden im Gerätespeicher des Browsers (IndexedDB) abgelegt und als „Wartet auf PC“ angezeigt (auf dem Gerät anhörbar, löschbar). Nach jeder Anmeldung am PC mit Berechtigung „Verwalten“ werden sie automatisch übertragen; Ablehnungen des PCs (z. B. Duplikat) bleiben mit Grund sichtbar. Die Liste gilt pro Webadresse (github.io-Seite und WLAN-Adresse getrennt). FERTIG UND GETESTET (E2E: hinzufügen ohne PC, übersteht Neuladen, automatische Übertragung nach Kopplung).
- **Xbox Game Pass:** Spiele → Kategorie „Game Pass“ (einschaltbar, standardmäßig aus). Der Begleiter liest alle 12 h den öffentlichen PC-Game-Pass-Katalog von Microsoft (catalog.gamepass.com + displaycatalog.mp.microsoft.com; Titel, Cover, Paketname), zeigt alle Spiele (installierte markiert mit „Spielen“, andere mit „Installieren“ → Xbox-App/Store), markiert neu hinzugekommene 14 Tage als „Neu“. Installierte Game-Pass-Spiele (Abgleich Paketname ↔ Startmenü-Apps, alle 15 min bzw. beim Öffnen) werden automatisch in die Bibliothek übernommen und bei Deinstallation oder Entfernung aus dem Game Pass wieder entfernt; von Hand hinzugefügte Spiele bekommen/verlieren nur die Kategorie. Schutz: bei unvollständiger Katalog-Antwort bleibt die Bibliothek unverändert. Getestet: echter Katalogabruf (600 PC-Spiele, Markt DE, Cover, Suche) mit dem Headless-Begleiter; Abgleich, „Neu“-Logik und Schutz per C#-Tests. NICHT TESTBAR hier: Erkennung installierter Spiele und Öffnen der Xbox-App (nur Windows). Grenzen: Spiele über die EA app werden nicht als installiert erkannt; ob ein Spiel gekauft oder per Game Pass genutzt wird, lässt sich lokal nicht unterscheiden.
- **Ohne PC ansehen:** Kategorie „Game Pass“ zeigt ohne PC eine Kopie des Katalogs auf der Webseite (`gamepass.json`, täglich per GitHub Action `.github/workflows/gamepass-catalog.yml` aus `scripts/gamepass-snapshot.mjs` erneuert; „Neu“ über gespeicherte Erstsichtung). Der Browser kann die Game-Pass-Liste nicht direkt laden (Microsoft erlaubt dort keinen Zugriff fremder Webseiten/CORS). Die zuletzt vom PC geladene Spieleliste und Game-Pass-Ansicht werden auf dem Gerät gespeichert und ohne PC mit „Stand …“ angezeigt; Starten/Installieren öffnet „Erst PC verbinden“. Beim Abmelden/Entfernen des Geräts wird der Zwischenspeicher gelöscht. FERTIG UND GETESTET (Chromium; Katalog-Kopie mit echten Daten).
- **Echte Cover:** Der Begleiter sucht für Spiele ohne Bild das Cover: Store/Xbox-Apps über den Paketnamen (exakt), sonst Steam-Suche und Microsoft-Store-Suche nur bei exakt gleichem Titel (kein „Hades II“ für „Hades“). Einmal pro Spiel, Wiederholung nach 30 Tagen; abschaltbar (Einstellungen → Datenschutz); Knopf „Cover automatisch suchen“ beim Bearbeiten; eigene Bilder werden nie überschrieben. Echt geprüft: Rocket League, Fortnite, Valorant, Hades, Sea of Thieves → Cover gefunden; Minecraft (Store-Titel weicht ab) und unbekannte Spiele → bleiben bei Initialen. FERTIG UND GETESTET (C#-Tests + echter Abruf).
- **Steam-Verknüpfung:** Spiele → Kategorie „Steam“ → „Verknüpfen“ (standardmäßig aus). Installierte Steam-Spiele (aus libraryfolders.vdf/appmanifest, ohne Anmeldung) werden automatisch in die Bibliothek übernommen und bei Deinstallation entfernt (alle 10 min bzw. beim Öffnen); fehlt der Steam-Ordner ganz, wird nichts entfernt; von Hand hinzugefügte Spiele bleiben. Optional „Ganze Bibliothek verbinden“ über die offizielle Steam-Web-API (eigener Schlüssel von steamcommunity.com/dev/apikey + Profil, auf dem PC vorausgefüllt aus loginusers.vdf; „Spieldetails“ muss öffentlich sein): auch nicht installierte Spiele mit „Installieren“ (steam://install), Spielzeit. Schlüssel nur verschlüsselt auf dem PC, Verbinden nur am PC/mit Admin-Recht, nie in settings.get/settings.save/Backup. Kein Steam-Passwort. Behoben dabei: settings.save gab die verschlüsselte Relay-Schlüssel-Angabe zurück. Getestet: C#-Tests (Abgleich, Konto-Erkennung, Web-API mit Testserver, Schlüsselschutz) und echter Lauf mit nachgebautem Steam-Ordner + echten Steam-Covern. NICHT TESTBAR hier: echter Web-API-Abruf mit deinem Schlüssel, steam://install unter Windows.
- **Steam ohne PC:** Steam erlaubt keinen Browser-Abruf der Spieleliste (kein CORS). Weg A: nach einmaliger Verbindung zeigt das Gerät die gespeicherte Liste. Weg B ganz ohne PC: GitHub Action `.github/workflows/steam-library.yml` (alle 6 h) ruft mit den Repository-Secrets STEAM_API_KEY und STEAM_ID über `scripts/steam-snapshot.mjs` die Bibliothek ab und veröffentlicht `steam.json` (nur Spielname, Spielzeit, zuletzt gespielt, Profilname – der Schlüssel nie). Ohne Secrets tut die Action nichts. Getestet: Skript gegen Steam-Testserver (Profil-Link-Auflösung, Fehler bei falschem Schlüssel, Schlüssel nicht in Ausgabe), Anzeige im Browser. NICHT TESTBAR hier: Abruf mit deinem echten Schlüssel.

## 6. Offene Punkte
1. **Test auf einem echten Windows-PC** (Fenster, Tray, Audio, Hotkeys, Steam/Epic-Start, Autostart, Firewall-Abfrage). Das ist der wichtigste nächste Schritt.
2. Test auf echtem iPhone/iPad/Android im WLAN.
3. FPS/Frametime (bräuchte PresentMon/ETW-Integration) und CPU-Temperatur (bräuchte Hersteller-Treiber/LibreHardwareMonitor mit Adminrechten) – bewusst nicht vorgetäuscht.
4. Code-Signatur und optional Installer.
5. Übersetzung der Companion-Fehlermeldungen ins Englische.

## 7. Externe Voraussetzungen
- Windows 10/11 x64; WebView2-Runtime (meist vorhanden).
- Firewall-Freigabe „Private Netzwerke“ beim ersten Start.
- Für Discord-Sounds: virtuelles Audiokabel (z. B. VB-Audio Virtual Cable) – wird nicht automatisch installiert.
- Für Zugriff von unterwegs: Cloudflare Tunnel (eigene Domain für dauerhafte Adresse) **oder** ein eigener Server für das Relay mit https.
- Zum Bauen: Node.js 20+, .NET 8 SDK.

## 8. Projekt starten (Entwicklung)
```bash
npm run install:all
npm run dev        # Companion (Headless) + Web-App mit Hot Reload
npm test           # alle Tests
```

## 9. Companion starten
`PCGameLauncherCompanion.exe` doppelklicken (aus `PCGameLauncherCompanion-1.0.0-win-x64.zip`). Firewall „Private Netzwerke“ erlauben. Details in INSTALLATION.md.

## 10. Smartphone und PC verbinden
Companion → **Gerät koppeln** → **Neuen Code erzeugen** → QR-Code mit dem Handy scannen → am PC **Erlauben**. Das Handy und der PC müssen im selben WLAN sein. Die Adresse lautet `http://<IP-des-PCs>:8787`.

## 11. Download
- Die Schaltfläche **„Begleiter herunterladen“** liefert genau die Datei, die der jeweilige Server bereitstellt: der Companion bietet seine eigene laufende EXE an, das Relay die Datei aus `relay/downloads` (Manifest mit Größe und SHA-256, erzeugt von `scripts/publish-companion.sh`). Ist keine Datei gebaut, zeigt die App „Companion noch nicht gebaut“ statt eines toten Links.
- Getestet: Relay-Download der echten EXE mit identischer Größe und Prüfsumme (siehe oben).
- **Es gibt keinen dauerhaften öffentlichen Download-Link.** Ich habe keinen Server oder Release-Dienst eingerichtet. Die EXE wurde dir direkt als Datei übergeben. Für einen dauerhaften Link: das Projekt in ein GitHub-Repository hochladen und das ZIP als Release anhängen, oder das Relay auf einem eigenen Server betreiben.

## 12. Wo liegen die Dateien?
| Datei | Pfad |
|---|---|
| Windows-EXE | `artifacts/companion/PCGameLauncherCompanion.exe` (84 241 415 Bytes) |
| ZIP für Nutzer | `artifacts/PCGameLauncherCompanion-1.0.0-win-x64.zip` (+ `.sha256`) |
| SHA-256 der EXE | `20190d0d48ebb4c305b41418eecb10dc70d1a38ca6731dad5e76881af272e86e` |
| Quellcode | gesamtes Repository (`git log` zeigt die Entwicklungsschritte) |

`artifacts/` ist nicht im Git-Repository (Build-Ergebnis); mit `scripts/publish-companion.sh` reproduzierbar.

## 13. Verbleibende Sicherheitsrisiken
- WLAN-Modus nutzt unverschlüsseltes http (Anmeldung trotzdem replay-geschützt). Für fremde Netze/unterwegs nur https/wss verwenden.
- EXE ist nicht signiert (SmartScreen-Warnung; Authentizität nur über Prüfsumme).
- Ein gekoppeltes Gerät mit Start-Berechtigung kann alle freigegebenen Einträge starten.
- Wer das Windows-Benutzerkonto kontrolliert, kontrolliert die Companion-Daten.
Details: SECURITY.md.

## 14. Bekannte Einschränkungen
- Windows-spezifische Funktionen wurden kompiliert, aber nicht unter Windows ausgeführt (siehe Statustabelle).
- OGG/Opus-Sounds werden abgelehnt (Windows-Codec fehlt); MP3/WAV/FLAC/M4A/WMA werden unterstützt.
- Mikrofon-Durchleitung hat systembedingt ca. 60–120 ms Verzögerung (Schätzung aus Puffergrößen, **nicht gemessen**).
- Xbox-/Store-Apps werden als Startmenü-Einträge angeboten; ob ein Eintrag ein Spiel ist, wählt der Nutzer beim Hinzufügen.
- Der Service Worker (Offline-Cache) funktioniert nur über https/localhost, nicht über `http://<IP>` im WLAN – die App selbst funktioniert dort trotzdem.
- Die Größe der EXE (≈84 MB) kommt von der eingebetteten .NET-Laufzeit; eine kleinere Variante (`--framework-dependent`) setzt installierte .NET-8-Desktop- und ASP.NET-Core-Runtimes voraus.
