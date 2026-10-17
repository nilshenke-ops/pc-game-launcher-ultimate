# Fehlerbehebung

Erster Schritt bei jedem Problem: **Diagnose → Diagnose ausführen**. Sie trennt „kein Internet“, „WLAN-Problem“, „Companion nicht erreichbar“, „Relay-Problem“ und „Audio-Problem“.

## Das Handy zeigt „PC nicht erreichbar“
| Ursache | Lösung |
|---|---|
| Companion läuft nicht | Symbol im Infobereich (^) prüfen, EXE starten |
| Anderes Netz | Handy ins selbe WLAN, mobile Daten aus |
| Firewall blockiert | Windows-Sicherheit → Firewall → „App durch die Firewall zulassen“ → PCGameLauncherCompanion für **Privat** erlauben. Netzwerkprofil des WLANs muss „Privat“ sein |
| Falsche/alte Adresse | Aktuelle Adresse steht im Companion unter „Gerät koppeln“. Vorschau-Links aus Entwicklungsumgebungen (`…style.dev`, `trycloudflare.com` nach Neustart) funktionieren nicht dauerhaft |
| WLAN-Zugriff ausgeschaltet | Einstellungen → Verbindung → „Im WLAN erreichbar“, danach Companion neu starten |
| Gast-WLAN / Client-Isolation | Router trennt Geräte voneinander → normales WLAN nutzen |

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
