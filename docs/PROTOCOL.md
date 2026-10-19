# Protokoll (Version 1)

Transport: WebSocket, Textnachrichten mit JSON. Lokal: `ws://<PC>:8787/ws`. Über Relay: `wss://<relay>/ws?pc=<companion-id>`. Die vollständige Methodenliste mit Berechtigungen steht in [`protocol/protocol.json`](../protocol/protocol.json) – sie ist die einzige Quelle; Companion und Web-App werden in Tests dagegen geprüft.

## Nachrichten

| Richtung | Form |
|---|---|
| Anfrage | `{"v":1,"id":<streng steigende Zahl>,"m":"<methode>","p":{…}}`, optional `"op":"<Kennung>"` (bis 64 Zeichen) für vorgemerkte Änderungen: der PC führt dieselbe `op` je Gerät und Methode nur einmal aus und liefert bei Wiederholung die gespeicherte Antwort (auch wenn die Kopie eintrifft, während die erste noch läuft; im Arbeitsspeicher, die letzten 2000) |
| Antwort | `{"v":1,"id":n,"ok":true,"r":…}` oder `{"v":1,"id":n,"ok":false,"e":{"code":"…","message":"…"}}` |
| Ereignis | `{"v":1,"ev":"<name>","d":…}` |
| Relay-Status (nur über Relay) | `{"type":"relay","state":"companion-online"|"companion-offline"}` |

Fehlercodes u. a.: `unauthenticated`, `forbidden`, `replay`, `rate-limited`, `invalid-params`, `not-found`, `code-invalid`, `code-expired`, `code-locked`, `no-code`, `auth-failed`, `conflict`, `unsupported`, `timeout` (Client).

## Ablauf

1. `hello` → `{protocol, nonce, transport, info:{app, version, pcName, platform, features}}`
2. Anmeldung
   - Gerät: `auth.login {deviceId, proof}` mit `proof = hex(HMAC-SHA256(key = SHA-256(utf8(token)), msg = bytes(nonce)))`
   - PC-Fenster: `auth.login {adminToken}` (nur direkte Loopback-Verbindung)
3. Kopplung (ohne Anmeldung): `pairing.request {code, deviceName, platform}` → `{state:"awaiting-confirmation", requestId, claimSecret}`. Nach Bestätigung am PC Ereignis `pairing.result {approved, token, deviceId}`; nach Verbindungsabbruch `pairing.claim {requestId, claimSecret}`.

## Ereignisse
`changed {topic}` (library, profiles, sounds, audio, settings, devices, quick, automations, hotkeys, history, notifications, updates, pairing, autostart), `session`, `profile.active`, `sounds.playing`, `notification`, `monitor.sample` (nur für Abonnenten), `audio.level`, `pairing.pending` (nur PC), `pairing.result`, `auth.revoked`, `update.progress`, `relay.status`.

## Relay ↔ Companion
Companion verbindet sich zu `wss://<relay>/companion` und sendet `{"t":"auth","id","secret","protocol":1}` → `{"t":"ok"}`. Danach: Relay → Companion `{"t":"open","ch","ip"}`, `{"t":"msg","ch","d":"<Client-Nachricht>"}`, `{"t":"close","ch"}`; Companion → Relay `{"t":"msg","ch","d"}`, `{"t":"close","ch","reason"}`.

## Versionierung
`v` ist in jeder Nachricht enthalten. Eine inkompatible Änderung erhöht die Version; der Companion lehnt fremde Versionen mit `protocol` ab, die Web-App zeigt dann einen Hinweis.
