# Sicherheit – Nexus Gaming Hub

Ausführliche Bestandsaufnahme: `docs/BESTANDSAUFNAHME.md`. Datenschutz: `docs/DATENSCHUTZ.md`.

## Grundprinzipien
1. **Keine beliebige Befehlsausführung.** Es gibt keine Methode, die Shell-Befehle oder frei wählbare Pfade ausführt. Gestartet werden nur Einträge der Bibliothek (Freigabeliste).
2. **Neue ausführbare Dateien nur am PC.** `library.addPath` und `library.updateTarget` (Pfad, Startparameter) haben die Berechtigung `local`, die ausschließlich die PC-Sitzung besitzt. Kommandozeilen/Skript-Hosts (cmd, PowerShell, wscript, mshta, rundll32 …) werden abgelehnt.
3. **Strikte Startziel-Validierung** (`LaunchValidator`): Steam-IDs nur Ziffern, Epic-/App-IDs per Whitelist-Regex, keine Anführungszeichen/Zeilenumbrüche, Argumente werden nie über eine Shell interpretiert.
4. **Minimale Rechte:** läuft als normaler Benutzer (`asInvoker`), Autostart nur unter HKCU, keine Treiberinstallation.

## Kopplung und Anmeldung
- Kopplungscode: 8 Zeichen aus 32 Symbolen (40 Bit), 5 Minuten gültig, **einmalig**. Nach 5 Fehlversuchen ist die jeweilige **Adresse** für diesen Code gesperrt (ein Gerät im WLAN kann so nicht die Kopplung für alle blockieren); nach 50 Fehlversuchen insgesamt wird der Code zurückgezogen. Rate-Limit pro IP (8/5 min) und global (30/min). Zusätzlich muss **jede** Anfrage am PC bestätigt werden.
- Pro Gerät ein zufälliger 256-Bit-Token. Der Companion speichert nur `SHA-256(Token)`, unter Windows zusätzlich mit **DPAPI** (Benutzerkonto) verschlüsselt.
- **Challenge-Response-Login:** Der Server sendet pro Verbindung eine zufällige Nonce; das Gerät antwortet mit `HMAC-SHA256(SHA-256(Token), Nonce)`. Ein mitgeschnittener Login ist auf einer anderen Verbindung wertlos (Replay-Schutz). Zusätzlich müssen Anfrage-IDs pro Verbindung streng steigen; Duplikate werden verworfen.
- Widerruf eines Geräts schließt sofort alle seine Verbindungen; der Hash wird gelöscht.
- PC-Sitzung (Admin): zufälliges Geheimnis pro Programmstart, wird nur in das eigene Fenster injiziert bzw. als URL-Fragment übergeben und nur auf **direkten Loopback-Verbindungen ohne Proxy-Header** akzeptiert (nicht über Tunnel/Relay).

## Berechtigungen
`view` (ansehen), `launch` (Spiele/Programme starten, Quick Actions, Hotkeys testen), `soundboard` (Sounds), `manage` (Einstellungen, Profile, Automatisierungen, Plugins verwalten), `admin` (Backup, Energie, Geräte), alle pro Gerät vergebbar, und `local` (nur direkt am PC: Kopplung bestätigen, neue Programme freigeben, Updates installieren, Geräterechte). Jede API-Methode hat genau eine Berechtigung, zentral in `protocol/protocol.json`; Tests stellen sicher, dass jede Methode registriert ist und die Web-App nur definierte Methoden aufruft.

Nur direkt am PC änderbar – auch Geräte mit `admin` dürfen das nicht: WLAN-Zugriff, Port, Relay, **Update-Quelle, Plugin-Katalog und erlaubte Web-Adressen** (sonst könnte ein Gerät auf unsignierte Updates oder eine fremde Seite umstellen).

## Netzwerk
- **WLAN-Modus:** http/ws im lokalen Netz. Anmeldungen sind per Challenge-Response geschützt, der Inhalt ist aber **nicht verschlüsselt** – im eigenen Heimnetz akzeptabel, in fremden WLANs nicht empfehlenswert. Selbstsignierte Zertifikate würden auf iPhones Warnungen erzeugen und wurden deshalb nicht eingesetzt.
- **Von außen** nur über TLS (Cloudflare Tunnel oder Relay hinter https). Es werden keine Router-Ports geöffnet, kein UPnP.
- **Origin-Prüfung** für WebSockets (Schutz gegen Cross-Site-WebSocket-Hijacking) und **Host-Prüfung gegen DNS-Rebinding**: Die eigene Seite zählt nur unter einer Adresse dieses PCs (IP, `localhost`, PC-Name, eingetragene öffentliche Adresse). Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`.
- **Proxy-Header** (`X-Forwarded-For`, `CF-Connecting-IP` …) werden nur von einem Proxy auf diesem PC selbst geglaubt (z. B. Tunnel). Ein Gerät im WLAN kann sich so keine fremde Adresse geben und die Bremsen pro Adresse nicht umgehen.
- Rate-Limits: Verbindungen pro IP, Nachrichten pro Sitzung, Anmeldeversuche pro IP; Nachrichtengröße max. 1 MB (Relay 2 MB).
- **Sound-Import (SSRF-Schutz):** URL-Importe dürfen keine privaten/lokalen Adressen erreichen (geprüft nach DNS-Auflösung), max. 20 MB, Format per Dateisignatur geprüft.

## Relay
Das Relay leitet nur Frames weiter. Es kennt keine Gerätetokens und kann sich nicht selbst am Companion anmelden. **Grenze:** Ende-zu-Ende geschützt ist nur die Anmeldung (Challenge-Response); danach sind die Nachrichten nur per TLS bis zum Relay geschützt – der Betreiber eines Relays könnte sie technisch lesen oder verändern. Deshalb ein Relay nur selbst oder bei einer vertrauenswürdigen Person betreiben. Ein fehlerhafter Verbindungsaufbau (z. B. `Origin: null`) wird abgelehnt und kann das Relay nicht zum Absturz bringen. Companions authentifizieren sich mit ID + Schlüssel (das Relay speichert nur den SHA-256-Hash, Vergleich zeitkonstant). Logs enthalten keine Nachrichteninhalte.

## Updates und Downloads
Standard-Quelle ist GitHub Pages dieses Projekts (änderbar nur am PC, nur https). Updates der offiziellen Quelle müssen eine **ECDSA-Signatur** (P-256) über Version, SHA-256 und Größe tragen; der öffentliche Schlüssel ist im Programm eingebaut, der private liegt nur als GitHub-Secret `PGL_UPDATE_SIGNING_KEY`. Unsignierte oder gefälschte Updates werden abgelehnt (Tests). Der Download wird per SHA-256 und Dateikopf geprüft, die Installation nur nach Bestätigung am PC; vorher wird ein Wiederherstellungspunkt angelegt, die alte Version bleibt als `.old` für den Rollback. Der Plugin-Katalog ist ebenso signiert. Downloads der Web-App zeigen die SHA-256 an und prüfen sie im Browser. Die EXE ist **nicht code-signiert** (kein Zertifikat vorhanden) – das ist ein bekanntes Restrisiko (SmartScreen-Warnung, Authentizität nur über Prüfsumme und vertrauenswürdige Quelle).

## Plugins
Plugins bringen **keinen Code auf den PC**: Pakete dürfen nur Daten- und Webdateien enthalten. Aktionen eines Plugins sind 1–10 der eingebauten, geprüften Schritte (dieselben wie Quick Actions) und brauchen jeweils eine passende Berechtigung, die vor dem Aktivieren angezeigt und bestätigt wird. Widgets laufen in einem `<iframe sandbox="allow-scripts">` ohne eigenen Ursprung, mit strenger CSP (`connect-src 'none'`, außer mit Recht „Netzwerk“); die Brücke zur App ist eine Whitelist mit Rechteprüfung und Rate-Limit. **Grenze:** Das ist keine vollständige Sandbox im Sinn eines eigenen Prozesses – ein Plugin mit `library.launch` kann jeden freigegebenen Bibliothekseintrag starten. Plugins nur aus vertrauenswürdiger Quelle aktivieren.

## Wartende Änderungen (ohne PC gemacht)
Sofort-Aktionen (Starten, Abspielen, Energie, Updates) werden nie vorgemerkt. Vorgemerkte Änderungen tragen eine eindeutige Kennung (`op`); der PC wendet jede nur einmal an, auch wenn sie nach einer verlorenen Antwort erneut oder doppelt gleichzeitig ankommt (gespeichert im Arbeitsspeicher, nach einem PC-Neustart nicht mehr). Änderungen, die Plugins installieren oder Rechte vergeben, und Änderungen älter als 7 Tage werden **erst nach erneuter Bestätigung** gesendet.

## Weitere Geheimnisse
- **OBS-Passwort, Steam-API-Schlüssel, Relay-Schlüssel:** auf dem PC mit DPAPI verschlüsselt, nie an Geräte zurückgegeben, nie im Backup. Wird die OBS-Adresse geändert, wird das gespeicherte Passwort verworfen (es kann nicht an einen anderen Rechner umgeleitet werden).
- **Zugangscode der Webseite (4 Ziffern):** nur eine Sichtsperre im Browser, **kein Schutz des PCs** – geschützt wird der PC durch Kopplung und Anmeldung.
- **Geräteschlüssel im Browser** liegt im Browser-Speicher; ein verlorenes Gerät am PC unter „Geräte“ entfernen.

## Backups
Gerätetokens, Geräteliste und der Relay-Schlüssel werden **nie** exportiert. Importe werden vollständig validiert (Format, Version, Startziele, Dateinamen gegen Pfad-Traversal, Audiosignaturen), bevor etwas geändert wird; vorher wird eine Sicherung des aktuellen Stands angelegt. Netzwerk-Einstellungen werden aus Backups nicht übernommen.

## Bekannte Restrisiken
- Unverschlüsseltes http im WLAN (siehe oben).
- Wer Zugriff auf das Windows-Benutzerkonto hat, hat Zugriff auf die Companion-Daten.
- Ein gekoppeltes Gerät mit `launch` kann alle freigegebenen Einträge starten – nur vertrauenswürdige Geräte koppeln, nicht benötigte Rechte entziehen.
- Unsignierte EXE (kein Code-Signatur-Zertifikat vorhanden) – SmartScreen-Warnung.
- Relay: Inhalte nach der Anmeldung nicht Ende-zu-Ende verschlüsselt (siehe oben).
- Der Windows-Teil (Fenster, Hotkeys, Audio, EXE-Tausch) ist nicht automatisiert unter Windows getestet.

## Sicherheitsprobleme melden
Bitte nicht öffentlich posten, sondern direkt an den Projektinhaber wenden.
