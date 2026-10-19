# Fehlerbehebung

Erster Schritt bei jedem Problem: **Diagnose → Diagnose ausführen**. Sie trennt „kein Internet“, „WLAN-Problem“, „Companion nicht erreichbar“, „Relay-Problem“ und „Audio-Problem“.

## Das Handy zeigt „PC nicht erreichbar“
| Ursache | Lösung |
|---|---|
| Companion läuft nicht | Symbol im Infobereich (^) prüfen, EXE starten |
| Anderes Netz | Handy ins selbe WLAN, mobile Daten aus |
| Firewall blockiert | Windows-Sicherheit → Firewall → „App durch die Firewall zulassen“ → PCGameLauncherCompanion für **Privat** erlauben. Netzwerkprofil des WLANs muss „Privat“ sein |
| Falsche/alte Adresse | Aktuelle Adresse steht im Companion unter „Gerät koppeln“. Vorschau-Links aus Entwicklungsumgebungen (`…style.dev`, `trycloudflare.com` nach Neustart) funktionieren nicht dauerhaft |
| PC hat vom Router eine neue IP-Adresse bekommen (ging vorher, Handy wurde nie abgemeldet) | Der PC meldet das als Benachrichtigung „WLAN-Adresse des PCs hat sich geändert“. QR-Code unter „Gerät koppeln“ einmal neu scannen. Dauerhaft: im Router dem PC immer dieselbe IP geben (FRITZ!Box: Heimnetz → Netzwerk → Gerät bearbeiten → „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“) |
| WLAN-Zugriff ausgeschaltet | Einstellungen → Verbindung → „Im WLAN erreichbar“, danach Companion neu starten |
| Gast-WLAN / Client-Isolation | Router trennt Geräte voneinander → normales WLAN nutzen |

## Relay-Fehler mit `ws://127.0.0.1:8787/ws` („Relay hat die Anmeldung abgelehnt“)
Ursache: Als Relay-Adresse war die Adresse des PC-Begleiters selbst eingetragen. `ws://…:8787/ws` ist der Endpunkt, mit dem sich Browser (iPad, Handy) mit dem Begleiter verbinden – kein Relay. Der Begleiter hat sich mit sich selbst verbunden und wurde abgewiesen.
Lösung: Im WLAN wird **kein Relay** gebraucht → Einstellungen → Verbindung → „Mit eigenem Relay verbinden“ ausschalten. Für unterwegs Tailscale Funnel nutzen (siehe INSTALLATION.md). Ein Relay ist ein eigener Server (`npm run start:relay`, Standard-Port 8788, Endpunkt `/companion`). Ab dieser Version lehnt der Begleiter solche Adressen ab und erklärt das in der Diagnose.

## iPad findet den PC nicht / Adresse `127.0.0.1` oder `localhost`
`127.0.0.1` und `localhost` bedeuten auf jedem Gerät „dieses Gerät selbst“. Auf dem iPad eingetippt sucht das iPad sich selbst. Verwende die WLAN-Adresse aus dem PC Game Launcher („Gerät koppeln“, z. B. `http://192.168.178.116:8787`) oder die Tailscale-Adresse (`https://…ts.net`). Der Begleiter zeigt `127.0.0.1` nicht mehr als Adresse für andere Geräte an; die Web-App lehnt sie mit Erklärung ab.

## Die Webseite (github.io) verbindet sich nicht mit `http://192.168…`
Eine https-Seite darf im Browser keine unverschlüsselte Verbindung (`ws://`) öffnen. Entweder im WLAN den QR-Code am PC scannen (öffnet die App direkt vom PC über http) oder Tailscale Funnel einrichten und die `https://…ts.net`-Adresse als „Öffentliche Adresse“ eintragen. Die Diagnoseseite zeigt diesen Fall mit Lösung an.

## „Preview unavailable“ oder leere Seite nach Link aus WhatsApp
Der Link zeigte auf eine temporäre Entwicklungsvorschau. Verwende die Adresse aus dem Companion (`http://<PC-IP>:8787`) oder eine eigene dauerhafte https-Adresse (Cloudflare Tunnel mit eigener Domain oder eigenes Relay), siehe INSTALLATION.md.

## Kopplung
- **„Code ist ungültig“** – genau wie angezeigt eingeben (Groß/Klein egal, Bindestrich optional).
- **„Code abgelaufen“ / „gesperrt“** – Codes gelten 5 Minuten, nach 5 Fehlversuchen gesperrt → neuen Code erzeugen.
- **„Zu viele Versuche“** – einige Minuten warten (Schutz gegen Durchprobieren).
- **Gerät nach Browser-Löschen abgemeldet** – Kopplung liegt im Browser-Speicher; im privaten Modus wird sie beim Schließen vergessen. Neu koppeln, alten Eintrag unter „Geräte“ entfernen.

## Spiel/Programm startet nicht
- Fehlermeldung steht als Hinweis und unter **Gaming-Verlauf → Letzte Startfehler**.
- Steam/Epic: Launcher installiert und angemeldet? „Steam ist nicht installiert“ bedeutet: das `steam://`-Protokoll ist nicht registriert.
- EXE: „Datei nicht gefunden“ → Programm verschoben/deinstalliert; Eintrag am PC neu freigeben.
- Spiele, die Administratorrechte verlangen, zeigen die Windows-Abfrage **am PC**.

## Laufendes Spiel wird nicht erkannt / Profil wechselt nicht
Im Spiel-Eintrag „Prozessnamen zur Erkennung“ eintragen (Task-Manager → Details, ohne `.exe`). Steam/Epic-Spiele werden zusätzlich über den Installationsordner erkannt. Automatischer Wechsel muss unter Gaming-Profile aktiv sein.

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
Die Datei wird vollständig geprüft, bevor etwas geändert wird. Meldet die Prüfung einen Fehler, bleibt die Konfiguration unverändert. Vor jeder Wiederherstellung wird automatisch `backups\vor-wiederherstellung-*.zip` angelegt.

## Protokolle
`%APPDATA%\PCGameLauncherUltimate\logs\companion-JJJJ-MM-TT.log` (7 Tage) und **Diagnose → Protokoll**. Tokens und Codes werden nie protokolliert.
