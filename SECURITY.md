# Sicherheit

## Grundprinzipien
1. **Keine beliebige Befehlsausführung.** Es gibt keine Methode, die Shell-Befehle oder frei wählbare Pfade ausführt. Gestartet werden nur Einträge der Bibliothek (Freigabeliste).
2. **Neue ausführbare Dateien nur am PC.** `library.addPath` und `library.updateTarget` (Pfad, Startparameter) haben die Berechtigung `local`, die ausschließlich die PC-Sitzung besitzt. Kommandozeilen/Skript-Hosts (cmd, PowerShell, wscript, mshta, rundll32 …) werden abgelehnt.
3. **Strikte Startziel-Validierung** (`LaunchValidator`): Steam-IDs nur Ziffern, Epic-/App-IDs per Whitelist-Regex, keine Anführungszeichen/Zeilenumbrüche, Argumente werden nie über eine Shell interpretiert.
4. **Minimale Rechte:** läuft als normaler Benutzer (`asInvoker`), Autostart nur unter HKCU, keine Treiberinstallation.

## Kopplung und Anmeldung
- Kopplungscode: 8 Zeichen aus 32 Symbolen (40 Bit), 5 Minuten gültig, **einmalig**, Sperre nach 5 Fehlversuchen, Rate-Limit pro IP (8/5 min) und global (30/min). Zusätzlich muss **jede** Anfrage am PC bestätigt werden.
- Pro Gerät ein zufälliger 256-Bit-Token. Der Companion speichert nur `SHA-256(Token)`, unter Windows zusätzlich mit **DPAPI** (Benutzerkonto) verschlüsselt.
- **Challenge-Response-Login:** Der Server sendet pro Verbindung eine zufällige Nonce; das Gerät antwortet mit `HMAC-SHA256(SHA-256(Token), Nonce)`. Ein mitgeschnittener Login ist auf einer anderen Verbindung wertlos (Replay-Schutz). Zusätzlich müssen Anfrage-IDs pro Verbindung streng steigen; Duplikate werden verworfen.
- Widerruf eines Geräts schließt sofort alle seine Verbindungen; der Hash wird gelöscht.
- PC-Sitzung (Admin): zufälliges Geheimnis pro Programmstart, wird nur in das eigene Fenster injiziert bzw. als URL-Fragment übergeben und nur auf **direkten Loopback-Verbindungen ohne Proxy-Header** akzeptiert (nicht über Tunnel/Relay).

## Berechtigungen
`view`, `launch`, `soundboard`, `manage`, `admin` (vergebbar) und `local` (nur PC). Jede API-Methode hat genau eine Berechtigung, zentral in `protocol/protocol.json`; Tests stellen sicher, dass jede Methode registriert ist und die Web-App nur definierte Methoden aufruft. Netzwerk-Einstellungen (WLAN, Port, Relay) können nur am PC geändert werden – auch Geräte mit `admin` dürfen das nicht.

## Netzwerk
- **WLAN-Modus:** http/ws im lokalen Netz. Anmeldungen sind per Challenge-Response geschützt, der Inhalt ist aber **nicht verschlüsselt** – im eigenen Heimnetz akzeptabel, in fremden WLANs nicht empfehlenswert. Selbstsignierte Zertifikate würden auf iPhones Warnungen erzeugen und wurden deshalb nicht eingesetzt.
- **Von außen** nur über TLS (Cloudflare Tunnel oder Relay hinter https). Es werden keine Router-Ports geöffnet, kein UPnP.
- **Origin-Prüfung** für WebSockets (Schutz gegen Cross-Site-WebSocket-Hijacking), Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`.
- Rate-Limits: Verbindungen pro IP, Nachrichten pro Sitzung, Anmeldeversuche pro IP; Nachrichtengröße max. 1 MB (Relay 2 MB).
- **Sound-Import (SSRF-Schutz):** URL-Importe dürfen keine privaten/lokalen Adressen erreichen (geprüft nach DNS-Auflösung), max. 20 MB, Format per Dateisignatur geprüft.

## Relay
Das Relay leitet nur Frames weiter. Es kennt keine Gerätetokens und kann sich nicht selbst am Companion anmelden. Companions authentifizieren sich mit ID + Schlüssel (das Relay speichert nur den SHA-256-Hash, Vergleich zeitkonstant). Logs enthalten keine Nachrichteninhalte.

## Updates und Downloads
Updates nur aus einer vom Nutzer eingetragenen **https**-Manifest-URL, Prüfung per SHA-256, Installation nur nach Bestätigung am PC. Downloads der Web-App zeigen die SHA-256 an und prüfen sie im Browser. Die EXE ist **nicht code-signiert** (kein Zertifikat vorhanden) – das ist ein bekanntes Restrisiko (SmartScreen-Warnung, Authentizität nur über Prüfsumme und vertrauenswürdige Quelle).

## Backups
Gerätetokens, Geräteliste und der Relay-Schlüssel werden **nie** exportiert. Importe werden vollständig validiert (Format, Version, Startziele, Dateinamen gegen Pfad-Traversal, Audiosignaturen), bevor etwas geändert wird; vorher wird eine Sicherung des aktuellen Stands angelegt. Netzwerk-Einstellungen werden aus Backups nicht übernommen.

## Bekannte Restrisiken
- Unverschlüsseltes http im WLAN (siehe oben).
- Wer Zugriff auf das Windows-Benutzerkonto hat, hat Zugriff auf die Companion-Daten.
- Ein gekoppeltes Gerät mit `launch` kann alle freigegebenen Einträge starten – nur vertrauenswürdige Geräte koppeln, nicht benötigte Rechte entziehen.
- Unsignierte EXE.

## Sicherheitsprobleme melden
Bitte nicht öffentlich posten, sondern direkt an den Projektinhaber wenden.
