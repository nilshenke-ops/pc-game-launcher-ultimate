# Sicherheitsdurchsicht (AP 08, Stand 2.88.1)

Geprüft in der Cloud-Umgebung am Quelltext. Nicht geprüft werden konnte: Verhalten am echten Windows-PC (DPAPI-Speicher, Firewall), echtes Netzwerk.

| Bereich | Befund | Status |
|---|---|---|
| CORS | `Access-Control-Allow-Origin: *` steht nur an `/healthz` (Version, Instanz-ID, „ok“); alle anderen Wege sind ohne CORS-Freigabe. Der WebSocket prüft die Herkunft (`OriginAllowed`) und lehnt fremde ab (mit Log). | in Ordnung, belegt |
| Rechte je Methode | Jede RPC-Methode steht in `protocol/protocol.json` mit Recht (`view`, `admin`, `local` …); `web/src/lib/core.test.ts` und die Begleiter-Tests prüfen, dass nichts ohne Eintrag erreichbar ist. | in Ordnung, belegt |
| Geheimnisse im Repo | Suche nach Schlüssel-Mustern (Anthropic, Google, GitHub, Slack, private Schlüssel): nur ausgedachte Testwerte in Begleiter-Tests; `secrets/` steht in `.gitignore`; keine `.pem`/`.env`/`.pfx` versioniert. | in Ordnung, belegt |
| Logs | Keine Log-Aufrufe (`Log.Info/Warn/Error/Debug`) mit Token, Passwort, API-Schlüssel oder Secret im Text. | in Ordnung, belegt |
| Sicherheits-Header | `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, Content-Security-Policy mit `script-src 'self'`; Plugin-Widgets nur in sandboxed iframe mit eigener CSP. | in Ordnung, belegt |
| Token auf dem Handy | Geräte-Token liegt in `localStorage` (`pgl.cred`); Schutz davor ist die CSP (`script-src 'self'`) und dass Plugins nie im Haupt-Fenster laufen. Das Token wird nie geloggt. Beim Abmelden/Entfernen wird es samt gespeichertem Stand gelöscht. | akzeptiertes Restrisiko (Browser kennt keinen sicheren Speicher für Webseiten), dokumentiert |
| Breite CSP | `img-src https:` und `connect-src https:` sind weit gefasst (Spiele-Cover und externe Quellen). Das ist nötig; bei einer Schwachstelle im Frontend könnten Daten nach außen gehen. Maßnahme: weiterhin keine Fremdskripte (`script-src 'self'`), Plugin-Code nie im Haupt-Fenster. | Restrisiko, dokumentiert |
| Pairing | 8 Zeichen (40 Bit), 5 Minuten gültig, einmalig, Ratenbegrenzung je Adresse und gesamt, Bestätigung am PC nötig; Test auf Ablauf, Wiederverwendung, Sperre vorhanden. | in Ordnung, belegt |

Offene Prüfaufträge (brauchen echten PC): DPAPI-Schutz der Schlüssel auf einem frischen Windows, Firewall-Regel nur für private Netzwerke.
