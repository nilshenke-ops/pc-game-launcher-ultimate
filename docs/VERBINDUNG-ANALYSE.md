# Verbindung iPhone/iPad ↔ PC – Fehleranalyse (Stand 2.46.0)

Grundlage: Quellcode, nachgestellter Ablauf im Browser (Chromium, Playwright) gegen einen echten Begleiter, Screenshot
des Nutzers (iPad auf `https://nilshenke-ops.github.io/pc-game-launcher-ultimate/`, „Offline – kein PC verbunden · 11
Änderungen warten auf den PC“). Was nicht nachgestellt werden konnte (iOS selbst, Windows), steht ausdrücklich dabei.

## Was schon richtig gebaut ist (geprüft im Code)

- Dauerhafte Geräte-Identität: jedes Gerät bekommt beim Koppeln einen zufälligen 256-Bit-Schlüssel; der PC speichert
  nur dessen SHA-256 (Windows: DPAPI). Anmeldung per Challenge-Response (HMAC über eine Nonce je Verbindung) –
  `Security/Pairing.cs` (`DeviceStore.VerifyLogin`), `web/src/lib/rpc.ts` (`authenticate`).
- Der QR-Code ist nur für die erste Kopplung: Code 5 Minuten gültig, einmal verwendbar, Bestätigung am PC nötig.
- Geräteverwaltung: umbenennen, Rechte ändern, entfernen (sofortiger Rauswurf), online/zuletzt aktiv – `Devices.tsx`.
- Wiederverbinden: Exponential Backoff mit Jitter (1–15 s im Hintergrund, 0,25/0,5 s sichtbar), Ping alle 15 s
  (versteckt 60 s), sofortiger Neuversuch bei `online` und Rückkehr in den Vordergrund.
- Mehrere PCs je Gerät, Relay (selbst betrieben) mit Ende-zu-Ende-Anmeldung, 127.0.0.1-Schutz auf der Website.
- Doppelte Ausführung gequeueter Änderungen wird am PC über eine Operations-ID verhindert (`op`).

## Ursachen (belegt)

### U1 – Zugangsdaten gelten nur für die Adresse, unter der gekoppelt wurde (Hauptursache)
Browser trennen den Speicher nach Herkunft (Schema + Host + Port). Der Gerät-Schlüssel liegt in `localStorage`
(`pgl.cred`, `rpc.ts`). Der QR-Code des PCs zeigt ohne öffentliche https-Adresse **nicht** auf die Website, sondern auf
`http://<WLAN-IP>:8787/#/pair?code=…` (`RpcApi.PairingUrls`: die Website wird nur genommen, wenn der PC eine
https-Adresse hat). **Nachgestellt:** Begleiter mit Test-WLAN-Adresse, `pairing.create` liefert nur
`http://127.0.0.2:8787/#/pair?code=…`; Gerät dort gekoppelt → `pgl.cred` vorhanden; derselbe Browser öffnet denselben
PC unter `http://localhost:8787` → kein `pgl.cred`, Anzeige „Offline – no PC connected“. Genau dieser Zustand steht
auf dem Screenshot: Die Website `github.io` hat nie Zugangsdaten bekommen.

### U2 – Die https-Website kann den PC im WLAN grundsätzlich nicht erreichen
Eine https-Seite darf keine unverschlüsselte `ws://`-Verbindung öffnen (Mixed Content). Der Begleiter spricht im WLAN
nur `http/ws` (`WebHost.LanUrls`). Die Website kann den PC also nur über eine `wss://`-Adresse erreichen
(eigenes Relay oder Tailscale-HTTPS). Ohne so eine Adresse bleibt sie dauerhaft „offline“ – egal wie oft gekoppelt
wird. Im Code bereits so behandelt (`Pair.tsx` lehnt `ws://` auf https ab und bietet „Beim PC öffnen und koppeln“).

### U3 – Wechselnde WLAN-Adresse = neue Herkunft = Kopplung weg
Bekommt der PC vom Router eine andere IP, ist `http://192.168.178.116:8787` eine andere Herkunft als die neue Adresse.
Die gespeicherte Kopplung liegt unter der alten, die App unter der neuen Adresse kennt sie nicht. Der Begleiter warnt
(`LanAddressWatch`), bot aber keinen festen Namen an, obwohl er `<PC-Name>.fritz.box` bereits als eigenen Namen
akzeptiert (`RequestOrigin.HostAllowed`). Tailscale-Namen (`*.ts.net`) wurden für die App-Seite abgelehnt.

### U4 – iOS: Home-Bildschirm-App hat eigenen Speicher (nicht nachstellbar, Plattformverhalten)
Auf iPhone/iPad hat eine zum Home-Bildschirm hinzugefügte Web-App einen eigenen Speicher, getrennt von Safari. Wer in
Safari koppelt und danach das Symbol nutzt, ist dort nicht gekoppelt. Zusammen mit dem einmaligen Code wirkt das wie
„QR-Code funktioniert nur einmal“. Das ließ sich hier nicht auf echtem iOS prüfen.

### U5 – Mögliche doppelte Verbindung beim Wiederverbinden (Code-Fehler)
`connect()` wartet bei Folgeversuchen auf eine HTTP-Probe. Kommt währenddessen `reconnectNow()` (Vordergrund/online),
startet ein zweiter `connect()` ohne die Versuchsnummer zu erhöhen; die ältere Probe kann danach noch einen zweiten
WebSocket öffnen, wenn der neue schon wieder geschlossen ist. Außerdem fehlte `pageshow` (Safari stellt Seiten aus dem
Zurück-Cache wieder her, ohne `visibilitychange`).

### „ws://127.0.0.1:8787/ws“ und „Relay nicht erreichbar“
127.0.0.1 bedeutet immer „dieses Gerät“ – auf dem iPad also das iPad. Die Website lehnt diese Adresse seit 2.x ab;
die Fehlermeldung stammt aus einer Sitzung, in der diese Adresse gespeichert war. „Relay nicht erreichbar“: Es ist kein
öffentliches Relay eingerichtet; das Relay muss selbst betrieben werden (INSTALLATION.md, Abschnitt c).

## Lösung (umgesetzt in 2.47.0)

1. **Feste Adresse:** Der Begleiter ermittelt einen festen Namen – eigene https-Adresse, sonst Tailscale-Name
   (`tailscale status --json`, nur lesen), sonst `<PC-Name>.fritz.box`, wenn der Name im Heimnetz wirklich auf diesen PC
   zeigt. Der QR-Code nutzt diesen Namen zuerst, die IP bleibt als Ausweich-Chip.
2. **Zugang übertragen:** Ein gekoppeltes Gerät erzeugt einen einmaligen 10-Minuten-Übertragungscode; damit wird ein
   neuer Zugang (eigener Eintrag in der Geräteliste, gleiche oder weniger Rechte, sofort widerrufbar) angelegt – für die
   Home-Bildschirm-App (U4), eine feste Adresse (U3) oder die Website mit https-Adresse (U1/U2).
3. **Website merkt sich die PC-Seite im WLAN** und bietet „Zur PC-App (WLAN)“ an, statt nur „offline“.
4. **Wiederverbinden:** kein zweiter Socket mehr (U5), `pageshow`, klare Zustände.
5. **Diagnose** im Browser um Herkunft, Home-Bildschirm-App, dauerhaften Speicher und feste Adresse erweitert.
