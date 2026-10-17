# Installation und Start

## 1. Windows-Companion (für Nutzer)

**Voraussetzungen:** Windows 10 (64 Bit) oder Windows 11. Kein .NET nötig (die EXE ist „self-contained“). Für das eingebaute Fenster wird die Microsoft Edge **WebView2-Runtime** genutzt (bei Windows 11 und aktuellem Windows 10 vorhanden); fehlt sie, bietet der Companion „Im Browser öffnen“ an.

1. ZIP `PCGameLauncherCompanion-<Version>-win-x64.zip` entpacken, z. B. nach `Dokumente\GameLauncher`.
2. Optional Prüfsumme kontrollieren: `certutil -hashfile PCGameLauncherCompanion.exe SHA256` → muss mit `SHA256SUMS.txt` übereinstimmen.
3. `PCGameLauncherCompanion.exe` starten. Die Datei ist nicht code-signiert; SmartScreen zeigt ggf. „Weitere Informationen → Trotzdem ausführen“.
4. **Firewall-Abfrage:** „Private Netzwerke“ erlauben. Ohne diese Freigabe erreicht das Handy den PC nicht.
5. Optional unter **Einstellungen → Autostart & Hintergrund** „Mit Windows starten“ aktivieren (nur für dein Benutzerkonto).

Alle Daten liegen in `%APPDATA%\PCGameLauncherUltimate` (getrennt von der EXE – Updates ersetzen nur die EXE).

## 2. Smartphone/Tablet koppeln

1. Im Companion **Gerät koppeln → Neuen Code erzeugen**.
2. Mit der Handykamera den **QR-Code** scannen (oder die angezeigte Adresse `http://<PC-IP>:8787` im Browser öffnen und den Code eintippen).
3. Am PC erscheint „Neue Kopplungsanfrage“ → **Erlauben**.
4. iPhone/iPad: in Safari „Teilen → Zum Home-Bildschirm“ – die App startet dann wie eine normale App.

Der Code gilt 5 Minuten, ist einmalig verwendbar und wird nach 5 Fehlversuchen gesperrt.

## 3. Zugriff von unterwegs (optional)

Standardmäßig ist der PC **nur im Heimnetz** erreichbar; es werden keine Router-Ports geöffnet. Zwei sichere Wege für unterwegs:

### a) Tailscale Funnel (empfohlen: kostenlos, ohne Domain, fester https-Link)
1. Tailscale für Windows installieren (https://tailscale.com/download/windows) und anmelden.
2. PowerShell: `tailscale funnel --bg 8787` – beim ersten Mal den angezeigten Freischalt-Link öffnen und Funnel erlauben, dann den Befehl wiederholen.
3. Der angezeigte Link (`https://<pc-name>.<tailnet>.ts.net`) bleibt dauerhaft gleich. Im Companion unter **Einstellungen → Verbindung → Öffentliche Adresse** eintragen.
4. Auf dem Handy/iPad diesen Link öffnen (kein Tailscale auf dem Handy nötig) und einmal koppeln.

**Offline-Speicher:** Über https speichert sich die Web-App beim ersten Besuch komplett auf dem Gerät. Danach öffnet sich der Link auch, wenn der PC aus ist: Design und Layout lassen sich ändern, und sobald der PC an ist, verbindet sich die App automatisch. Am zuverlässigsten auf iPhone/iPad über Safari → „Zum Home-Bildschirm“.

### Feste Webseite „PC verbinden“ (immer erreichbar, auch wenn der PC aus ist)
Die Web-App kann zusätzlich als feste Webseite bei einem kostenlosen Anbieter liegen. Sie zeigt „PC verbinden“; man scannt am PC den QR-Code oder tippt Code und PC-Adresse ab und ist dann über den Tailscale-Link mit dem PC verbunden.

1. `scripts/build-hosted-site.sh` erzeugt `artifacts/GameLauncher-Webseite-<Version>.zip` (oder die fertige ZIP aus dem Release verwenden).
2. **Cloudflare Pages** (kostenlos, keine Domain nötig): https://dash.cloudflare.com → kostenlos registrieren → *Workers & Pages* → *Erstellen* → *Pages* → *Assets hochladen* → Projektname wählen (z. B. `mein-gamelauncher`) → ZIP hochladen → *Bereitstellen*. Die Adresse lautet dann `https://mein-gamelauncher.pages.dev`.
   Alternativ: GitHub Pages oder Netlify – jeder Anbieter für statische Webseiten mit https funktioniert.
3. Im Companion: **Einstellungen → Verbindung**
   - „Öffentliche Adresse der Web-App“ = Tailscale-Funnel-Link (`https://…ts.net`)
   - „Adresse der gehosteten Web-App“ = `https://mein-gamelauncher.pages.dev`
4. Ab jetzt öffnet der QR-Code unter „Gerät koppeln“ die feste Webseite – Code und PC-Adresse sind schon eingetragen. Ohne QR: Code und die angezeigte „PC-Adresse (zum Abschreiben)“ eintippen.

Die feste Webseite verbindet sich nur über https (Tailscale Funnel); `http://192.168…` ist von einer https-Seite aus technisch nicht erlaubt.

### b) Cloudflare Tunnel (ohne eigenen Server)
1. `cloudflared` installieren (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
2. Schnelltest (temporäre Adresse, ändert sich bei jedem Start!): `cloudflared tunnel --url http://localhost:8787`
3. Dauerhaft: benannter Tunnel mit eigener Domain, Ziel `http://localhost:8787`.
4. Die https-Adresse im Companion unter **Einstellungen → Verbindung → Öffentliche Adresse** eintragen (dann zeigt der QR-Code diese Adresse, und die Herkunftsprüfung erlaubt sie).

Hinweis: Über den Tunnel gilt dieselbe Kopplung/Anmeldung. Die PC-Ansicht (Admin) ist über den Tunnel **nicht** möglich – sie funktioniert nur direkt am PC.

### c) Eigenes Relay (eigener Server mit Node.js 20+)
```bash
cd relay
npm ci && npm run build
npm run hash-secret            # erzeugt Relay-Schlüssel + Hash
cp relay.config.example.json relay.config.json   # Hash und eine Companion-ID eintragen
npm start                      # lauscht auf Port 8788
```
Davor einen Reverse-Proxy mit TLS (z. B. Caddy/nginx) setzen, `trustProxy: true` aktivieren. Im Companion unter **Einstellungen → Verbindung**: Relay-Adresse `wss://relay.deinedomain.de`, Companion-ID und Schlüssel eintragen, „Mit eigenem Relay verbinden“ einschalten. Die Web-App ist dann unter `https://relay.deinedomain.de/` erreichbar; das Relay liefert auch `Begleiter herunterladen` aus (Datei aus `relay/downloads`, erzeugt von `scripts/publish-companion.sh`).

## 4. Aus dem Quellcode bauen (Entwickler)

Voraussetzungen: **Node.js 20+**, **.NET 8 SDK**, optional `zip`.

| Befehl | Wirkung |
|---|---|
| `npm run install:all` | npm-Abhängigkeiten für `web/` und `relay/` |
| `npm run build:web` | Web-App nach `web/dist` |
| `npm run build:companion` (= `scripts/publish-companion.sh`) | Web-App bauen, Windows-EXE nach `artifacts/companion`, ZIP + SHA-256 nach `artifacts/`, Kopie nach `relay/downloads` |
| `scripts\publish-companion.ps1` | dasselbe unter Windows/PowerShell |
| `npm run dev` | Headless-Companion (Port 8787) + Vite (Port 5173, Hot Reload) |
| `npm run start:headless` | Companion ohne Windows-Funktionen (Linux/macOS) |
| `npm run start:relay` | Relay starten |
| `npm test` | alle automatisierten Tests |

Reihenfolge beim manuellen Start: zuerst Companion, dann (optional) Relay – der Companion verbindet sich automatisch neu, wenn das Relay später startet.

Der Windows-Companion lässt sich auch unter Linux/macOS bauen (Cross-Compile, `EnableWindowsTargeting`). Ausführen kann man ihn nur unter Windows.
