# Dateiübertragung per QR-Code (Dynamic Island File Transfer 2.0)

Stand: 3.64.0 (2026-11-14). Die Übertragung baut auf dem auf, was es schon gab. Es gibt kein zweites System.
- Die Ablage der Insel (Austausch-Ordner, `TransferService`) bleibt der Ort der Dateien.
- Übertragen wird über die bestehende Verbindung zum Begleiter: im WLAN direkt, sonst über Tunnel bzw. Relay.

## Ablauf

**PC → Handy**
1. Dateien auf die Insel ziehen (auch auf die geschlossene) oder in der Ablage auswählen. Frisch abgelegte Dateien sind schon ausgewählt.
2. „Mit Handy übertragen“ antippen. Der Begleiter legt eine Übertragung an, die Insel zeigt den QR-Code mit Ablaufzeit.
3. Das Handy scannt mit der Kamera, Safari öffnet `…/#/x/<id>.<geheimnis>`. Eine App oder ein Konto ist nicht nötig.
4. Das Handy weist nach, dass es das Geheimnis kennt. Es schickt es aber nie mit (HMAC auf eine frische Herausforderung).
5. Am PC fragt die Insel: „iPhone möchte die Dateien empfangen“, mit einem 4-stelligen Code. Derselbe Code steht auf dem Handy. **Erst nach „Erlauben“** sieht das Handy überhaupt die Dateinamen.
6. Auf dem Handy „Dateien empfangen“ antippen:
   - Die Dateien kommen Stück für Stück, verschlüsselt.
   - Angezeigt werden Fortschritt pro Datei und gesamt, Geschwindigkeit, Restzeit, Pause und Abbrechen.
   - „Sichern“ öffnet auf iPhone/iPad das Teilen-Menü („Bild sichern“, „In Dateien sichern“).

**Handy → PC**
- „Vom Handy empfangen“ → QR-Code → Handy scannt → am PC erlauben → am Handy Dateien wählen → „An den PC senden“.
- Die Dateien landen im Empfangsordner, also in der Ablage.
- Programme und Skripte (`.exe`, `.ps1`, `.bat`, `.js`, `.lnk` …) nimmt der PC nicht an.

## Sicherheit
- **Der QR-Code enthält keine dauerhaften Zugangsdaten.**
  - Er enthält nur die Kennung der Übertragung und ein zufälliges 256-Bit-Geheimnis im URL-Fragment. Das Fragment geht an keinen Server.
  - Der Code gilt 1–15 Minuten (Einstellung, Standard 5) und nur für **ein** Gerät.
  - Nach 5 falschen Versuchen wird die Übertragung gesperrt.
- **Den Code zu kennen reicht nicht:** Ohne „Erlauben“ am PC passiert nichts. Mit „Nur gekoppelte Geräte“ geht es zusätzlich nur auf bereits gekoppelten Handys.
- **Verschlüsselung:**
  - Jedes Stück ist mit AES-256-GCM verschlüsselt. Der Schlüssel wird per HKDF-SHA256 aus dem Geheimnis abgeleitet.
  - Jedes Stück ist an Übertragung, Datei und Position gebunden.
  - Damit ist es auch im WLAN über http und durch das Relay unlesbar. Ein verändertes oder verschobenes Stück wird abgelehnt.
  - Auf dem Handy rechnet dafür `@noble/ciphers`/`@noble/hashes`, weil die eingebaute Browser-Krypto auf http-Seiten fehlt.
- **Gerätebindung:**
  - Die Übertragung gehört der Verbindung, die erlaubt wurde.
  - Nach einem Verbindungsabbruch setzt dasselbe Handy mit einem nur ihm geschickten Wiederaufnahme-Token fort.
  - Ein zweites Gerät mit demselben Link wird abgewiesen.
- **Beenden:** „Beenden“ in der Insel widerruft sofort. Ungenutzte Übertragungen laufen ab, aktive enden nach 30 Minuten Ruhe, spätestens nach 3 Stunden. Das Schließen des Fensters beendet sie ebenfalls.
- **Keine Download-Links:** Es gibt keinen öffentlichen Endpunkt. Gelesen werden kann nur, was für diese Übertragung gewählt wurde, und nur von dem erlaubten Gerät.
- **Empfangsordner:** Er ist nur direkt am PC änderbar. Systemordner und ganze Laufwerke sind ausgeschlossen. Empfangene Dateien bekommen unter Windows das „aus dem Internet“-Merkmal, Windows warnt also vor dem Ausführen.

## Verbindung
- **Gleiches WLAN:** Der QR-Code zeigt auf die PC-Adresse im WLAN (direkt). Voraussetzung ist „Im WLAN erreichbar“.
- **Anderes Netz:** Der QR-Code zeigt auf die öffentliche Adresse (Tunnel) oder die feste Webseite. Das Handy erreicht den PC dann über den vorhandenen Weg (Relay/Tailscale). Ohne gekoppeltes Handy und ohne Tunnel ist das nicht möglich, und die Seite sagt das.
- **PC aus / Begleiter nicht erreichbar:** Die Handy-Seite zeigt „PC nicht erreichbar“ und macht weiter, sobald der PC da ist.
- **Abbruch während der Übertragung:** Das Handy versucht dasselbe Stück erneut und meldet sich mit dem Token wieder an. Fertige Dateien werden nicht erneut übertragen; „Erneut versuchen“ überträgt nur die fehlgeschlagenen.

## Performance
- Dateien gehen in 512-KB-Stücken, nie ganz im Speicher des PCs, und Datei für Datei nacheinander.
- Vorschaubilder entstehen erst, wenn ein Bild da ist; sie lassen sich abschalten.
- Kein Hintergrundprozess, solange keine Übertragung läuft.
- **Grenze auf dem Handy:** Empfangene Dateien liegen bis zum „Sichern“ im Speicher des Browsers. Deshalb gibt es die einstellbare Größengrenze (Standard 200 MB pro Datei).

## Einstellungen (Verbindung & Geräte → Dateiübertragung)
- Empfangsordner (nur am PC).
- Größte Datei (50–4096 MB).
- Gültigkeit des QR-Codes (1–15 min).
- Nur gekoppelte Geräte.
- Vorschaubilder am Handy.
- Benachrichtigung bei Abschluss.
- Verlauf speichern / löschen.
- Alte Dateien in der Ablage automatisch löschen (nie / 1 / 7 / 30 / 90 Tage).

## Tests
| Prüfpunkt | Ergebnis |
|---|---|
| Begleiter `ShareTests`: Geheimnis nötig, Bestätigung nötig, nur gewählte Dateien, nur das erlaubte Gerät, verschlüsselte Stücke, verschobenes Stück abgelehnt, Wiederaufnahme mit Token, fremdes Gerät abgewiesen, Upload in den Ordner, Programme abgelehnt, falscher Schlüssel abgelehnt, doppeltes Stück nur einmal geschrieben, Widerruf, 5 Fehlversuche, nur gekoppelte Geräte, Gültigkeit, Empfangsordner-Prüfung, Größengrenze | **bestanden** |
| Website und Begleiter rechnen gleich (Schlüssel, Nachweis, Code, Stück aus dem Browser vom Begleiter gelesen) | **bestanden** |
| Browser `e2e/share-transfer.spec.ts` gegen den echten Headless-Begleiter: Insel → QR → „Handy“ (eigener Browser ohne Konto) → gleicher Code → Erlauben → 1,3 MB Datei byte-genau empfangen | **bestanden** |
| Handy → PC: 2 Dateien (u. a. 3 MB) angekommen, `.exe` abgelehnt | **bestanden** |
| Erfundener Link, abgeschnittener Link, falsches Geheimnis, Ablehnen am PC, zweites Gerät, Beenden | **bestanden** |
| Mit echtem iPhone / iPad (Kamera, Safari, „In Dateien sichern“) | **nicht getestet** – kein echtes Gerät im Testaufbau |
| Sehr große Dateien (mehrere GB), Verbindung mitten in der Übertragung trennen, Begleiter-Neustart währenddessen | **nicht im Browser getestet**; Wiederaufnahme ist im Begleiter-Test abgedeckt |
| Ablauf des QR-Codes nach der eingestellten Zeit | im Begleiter geprüft (Zeit wird gesetzt), nicht durch echtes Warten im Browser |
