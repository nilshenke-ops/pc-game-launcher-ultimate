# Cloud-Konto auf Cloudflare

## Was es löst

Ohne Cloud liegt das Konto (Design, Gamer-Pass, Zähler, Pausen-Erinnerung …) verschlüsselt auf dem PC. Anmelden und Synchronisieren gehen dann nur, solange der PC an ist.

Das Cloud-Konto liegt stattdessen in einem eigenen kleinen Dienst auf **Cloudflare Workers mit D1**:

- Anmelden funktioniert bei ausgeschaltetem PC, auf jedem Gerät – ohne fremdes Konto, ohne E-Mail.
- Änderungen werden automatisch gespeichert; war das Netz weg, bleibt die Änderung lokal vorgemerkt und wird beim nächsten Kontakt nachgesendet.
- **Nicht** in der Cloud: Spielebibliothek, Profile, Kalender, Dateien, Aufnahmen, PC-Steuerung. Dafür braucht es weiterhin den PC, und die Cloud-Anmeldung gibt **keine** Rechte am PC.

## Der Dienst

| Was | Wo |
|---|---|
| Worker-Code | [`cloud-account-worker/src/index.js`](../cloud-account-worker/src/index.js) |
| Deploy-Manifest | [`cloud-account-worker/deploy.json`](../cloud-account-worker/deploy.json) |
| Datenbank | D1-Bindung `DB`, Tabellen `accounts` und `login_fails` (legt der Worker beim ersten Aufruf an) |
| Herkunftsfreigabe | Umgebungsvariable `ALLOWED_ORIGINS` (kommagetrennt), z. B. `https://nilshenke-ops.github.io` |

Schnittstelle (alles JSON per POST unter `/api/account/…`):

| Aufruf | Inhalt | Antwort |
|---|---|---|
| `register` | `{ user, key, blob }` | legt das Konto an, `conflict` wenn der Name vergeben ist |
| `login` | `{ user, key }` | prüft den Anmelde-Schlüssel |
| `load` | `{ user, key }` | `{ blob, updatedAt }` |
| `save` | `{ user, key, blob }` | ersetzt den Datensatz |
| `delete` | `{ user, key }` | löscht das Konto |
| `health` | – | `{ ok: true }` (auch per GET) |

Regeln im Dienst: Benutzername `^[a-z0-9._-]{3,24}$`, Schlüssel 64 Hex-Zeichen, verschlüsselter Datensatz höchstens 900 000 Zeichen; nach 8 Fehlversuchen je Name und IP ist 15 Minuten gesperrt; gleiche Antwortzeit für unbekannte Namen.

## Verschlüsselung

Der Browser leitet aus Benutzername + Passwort mit PBKDF2 (250 000 Runden, SHA-256) zwei Schlüssel ab:

- einen **Anmelde-Schlüssel** – der Dienst speichert davon nur einen weiteren PBKDF2-Hash mit eigenem Salz,
- einen **AES-GCM-Schlüssel**, der das Gerät nie verlässt.

Bei Cloudflare liegt also nur der verschlüsselte Datensatz. Weder Cloudflare noch der PC können ihn lesen; das Passwort wird nie übertragen. Auf dem Gerät bleiben für die dauerhafte Anmeldung Benutzername, Anmelde-Schlüssel und Datenschlüssel im Browser-Speicher – „Abmelden“ entfernt sie.

**Passwort vergessen = Daten nicht wiederherstellbar.**

## Bauen und veröffentlichen

Ein einziger Worker liefert die gehostete Website **und** die API aus. Auch die GitHub-Pages-Seite nutzt denselben Worker als API; `ALLOWED_ORIGINS` ist deshalb auf `*` gesetzt (jeder Aufruf braucht ohnehin den Kontoschlüssel).

```bash
# Website bauen
cd web && npm ci && npm run build:hosted

# D1 anlegen/migrieren, Worker veröffentlichen, Health prüfen
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run deploy:cloud
```

`scripts/deploy-cloud-worker.sh` legt die Datenbank `nexus-accounts` nur an, wenn sie fehlt, wendet `cloud-account-worker/migrations/*.sql` an und schreibt die Datenbank-ID ausschließlich in die nicht versionierte `.wrangler/cloud-worker.json`. Token und Datenbank-ID gehören nie ins Repository.

### Cloudflare-Dashboard (bestehendes Git-Deployment)

| Einstellung | Wert |
|---|---|
| Build-Befehl | `npm run build:cloud` |
| Deploy-Befehl | `npx wrangler deploy` |
| D1-Bindung | Variable `DB` → Datenbank `nexus-accounts` |
| Variable | `ALLOWED_ORIGINS` = `*` (oder die genauen Adressen von GitHub Pages und Worker) |
| Konfiguration | `wrangler.json` – Assets aus `web/dist-hosted`, API unter `/api/*` |

`GET /api/account/health` antwortet mit `{ "ok": true, "database": "ok", ... }`. Fehlt die D1-Bindung, kommt `503` mit `database: "unavailable"` und einem klaren Satz; die Cloud-Seite zeigt genau diesen Hinweis statt „Dienst antwortet nicht“.

### Automatisch über GitHub

`.github/workflows/cloud-worker.yml` veröffentlicht den Worker bei Änderungen an Worker, Cloud-Seite oder Konfiguration. Dafür die Repository-Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` setzen (optional `CLOUDFLARE_D1_DATABASE_ID`). Ohne Token überspringt sich der Lauf mit einem Hinweis, statt rot zu werden.

## Mehrere Konten und was mitreist

Auf einem Gerät lassen sich mehrere Konten speichern (`pgl.designAccounts`, höchstens sechs). Die Schlüssel jedes Kontos liegen verschlüsselt dort, deshalb wechselt „Cloud → Konten auf diesem Gerät → Wechseln“ ohne Passwort; die Daten des Zielkontos werden vorher geladen, sonst bleibt alles beim alten. Ein Benutzername ist serverseitig eindeutig: `register` antwortet bei einem vergebenen Namen mit `conflict` („Diesen Benutzernamen gibt es schon“).

Mit dem Konto reisen Design, Startseite und Leiste, Sprache, Gamer-Pass, Zähler, Pausen-Erinnerung, Raum-Einstellung, Wetter-Ort sowie Ordner und Regeln von JARVIS MEMORY (`pgl.memory`) und die KI-Auswahl – welcher freie Anbieter zuerst antwortet und wie sie zusammenarbeiten (`pgl.aiChoice`). Sobald der PC verbunden ist, übernimmt er Ordner und Regeln von selbst – ohne Knopfdruck (`web/src/lib/memory-sync.ts`, läuft nach jeder Anmeldung und jedem Kontowechsel); der Knopf in der Karte bleibt nur zum erneuten Übernehmen. Derselbe Weg setzt auch den Wetter-Ort auf dem PC (`pgl.homePlace` → `assistant.homePlace`, `web/src/lib/home-place-sync.ts`) – Wetterfragen ohne genannten Ort nutzen ihn dort, ohne dass du ihn erneut sagst. KI- und API-Schlüssel gehören bewusst nicht dazu: sie liegen verschlüsselt auf dem Gerät (`pgl.localai`) und werden nur beim Verbinden an den PC übergeben.

## In der App

Navigation → Verbindung → **Cloud** (oder über die Suche „cloud“): dort stehen Konto anlegen/anmelden/abmelden, die Adresse des Dienstes, der Status samt wartender Änderung, „Jetzt synchronisieren“ und eine ehrliche Liste, was in der Cloud liegt und was am PC bleibt. Konto löschen geht ebenfalls dort. Der Link „Cloud speichern“ führt zur Cloudflare-Seite; die Android-APK steht auch unter „Updates & Versionen“.

Die Seite prüft außerdem, ob der Dienst gerade erreichbar ist (öffentliche Health-Route, unabhängig von der Anmeldung) – so lässt sich „Dienst ist down“ von „Passwort falsch“ unterscheiden. Eine eigene Karte zeigt, welche KI- und API-Schlüssel auf diesem Gerät liegen (bereit oder gesperrt) und stellt klar: Anmelden, Abmelden, Kontowechsel und Konto löschen fassen sie nicht an. Ins Konto reist nur die KI-Auswahl, nie ein Schlüssel.

Ein Backup-Knopf lädt den Stand des Kontos auf diesem Gerät als lesbare JSON-Datei herunter (Design, Einstellungen, JARVIS-MEMORY, Wetter-Ort, KI-Auswahl). KI- und API-Schlüssel sind auch hier nicht enthalten; die Datei ist nicht verschlüsselt und sollte sicher aufbewahrt werden.

## Grenzen

- Bestehende Konten auf dem PC wandern **nicht** automatisch in die Cloud. Nach der Einrichtung einmal mit der Cloud registrieren/anmelden und das Design neu speichern (es liegt lokal weiter vor).
- Der Dienst speichert nur Kontodaten. Alles, was den PC braucht (Spiele starten, Dateien, Fernsteuerung, Kalender), funktioniert weiterhin nur bei erreichbarem PC.


## Automatische Synchronisierung (PC → Cloud → alle Geräte)

Zusätzlich zum Konto-Datensatz hält die Cloud den letzten Stand des PCs bereit, damit jedes Gerät desselben Kontos ihn auch bei ausgeschaltetem PC sieht (Code: [`cloud-account-worker/src/sync.js`](../cloud-account-worker/src/sync.js), [`CloudSyncService.cs`](../companion/src/Companion.Core/Services/CloudSyncService.cs), [`web/src/lib/cloud-sync.ts`](../web/src/lib/cloud-sync.ts)).

| Aufruf (`POST /api/sync/…`) | Wer | Zweck |
|---|---|---|
| `token` | PC, Gerät | Kontoschlüssel einmal prüfen (wie `login`, mit Fehlversuch-Sperre) → langer zufälliger Geräte-Token (in D1 nur dessen SHA-256) |
| `push` | PC | Stand einzelner Teile (`library.list`, `settings.get` …) – mehrteilig in einer Transaktion, nie halb sichtbar |
| `pull` | Geräte, PC | geänderte Teile und offene Änderungen; mit der letzten Änderungsnummer antwortet er in einer Abfrage „nichts Neues“ |
| `op` | Geräte | verschlüsselte Änderung (nur `library.update`, `settings.save`), je ID genau einmal gespeichert |
| `ack` | PC | Änderung übernommen → aus der Cloud entfernt |
| `revoke` | PC, Gerät | Token zurückziehen |

**Sicherheit:** Alles Inhaltliche ist mit dem AES-GCM-Schlüssel des Kontos versiegelt (gzip + AES-256-GCM, Format `g1.` + Base64), die Cloud sieht nur Chiffretext, Teilenamen und Zeiten. Der PC bekommt Anmelde- und Datenschlüssel vom Browser (am Handy versiegelt mit dem Gerätekey der PC-Kopplung, nur Admin-Geräte) und speichert sie mit dem Betriebssystem-Schutz (DPAPI). Der PC liest seine Daten mit den Rechten eines gekoppelten Geräts (nie „nur am PC“) und übernimmt aus der Cloud nur `library.update` und `settings.save` – nie Starten, Beenden oder PC-Steuerung.

**Konflikte:** Jede Änderung trägt den Wert, den das Feld vorher hatte. Der PC setzt ein Feld nur, wenn es noch diesen Wert hat; was am PC inzwischen anders geändert wurde, bleibt (Hinweis unter „Cloud“).

**Test:** `npm run test:cloud` startet den echten Worker (workerd, D1 auf Platte), einen zweiten Begleiter und zwei Browser und prüft: Upload verschlüsselt, zweites Gerät ohne PC-Kopplung sieht alles, PC aus, Änderungen ohne PC, Cloud-Ausfall und Rückkehr, PC übernimmt genau einmal.

## Automatische PC-Verbindung über die Cloud (ab 3.52.0)

Ziel: einmal mit dem JARVIS-Konto anmelden, danach findet jedes Gerät den PC von selbst – ohne QR-Code, ohne Verbindungscode, ohne Tailscale, ohne Portfreigabe.

**So läuft es ab**

1. Der Begleiter startet mit Windows (Autostart) und ist mit dem Konto verbunden (`cloud.link`; passiert von selbst, sobald das Konto in der PC-App angemeldet ist).
2. Er baut **ausgehend** eine WebSocket-Verbindung zum Cloud-Dienst auf: `wss://…/api/link/companion?user=<konto>` und weist sich mit seinem Geräte-Token aus (dasselbe Token wie für die Synchronisierung; in D1 liegt nur dessen SHA-256).
3. Ein Gerät, das im selben Konto angemeldet ist, verbindet sich mit `wss://…/api/link/ws?user=<konto>` und seinem eigenen Geräte-Token.
4. Der Dienst (ein Durable Object je Konto, [`cloud-account-worker/src/link.js`](../cloud-account-worker/src/link.js)) leitet die Nachrichten nur weiter – dieselben Rahmen wie das selbst betriebene Relay (`open`/`msg`/`close`). Er meldet dem Gerät `companion-online` bzw. `companion-offline`.
5. Ist der PC aus, bleibt die Verbindung des Geräts zur Cloud einfach offen. Es wird **nichts** wiederholt versucht; sobald der Begleiter läuft, meldet die Cloud das und die Sitzung beginnt auf derselben Verbindung.
6. Anmeldung am PC bleibt Ende-zu-Ende: Ein noch nicht gekoppeltes Gerät beweist mit `pairing.account`, dass es den Datenschlüssel des Kontos kennt (HMAC über die Nonce dieser Verbindung – der Schlüssel selbst wird nie gesendet), und bekommt einen eigenen Geräteschlüssel. Danach meldet es sich wie jedes gekoppelte Gerät an.

**Reihenfolge der Wege (Website und App):** zuerst die direkte Adresse (WLAN, Tailscale, eigenes Relay); antwortet sie zweimal nicht, übernimmt die Cloud-Verbindung. Während dort auf den PC gewartet wird, prüft die Seite alle 25 s, ob die direkte Adresse wieder antwortet, und schickt einen Herzschlag (tote Verbindung nach WLAN-Wechsel oder Schlaf → neuer Aufbau). Antwortet die Cloud selbst nicht, wird mit wachsender Pause (2 s … 60 s) erneut versucht. Der Begleiter verbindet sich nach einem Abbruch mit 2 s … 60 s Pause und ±20 % Streuung neu.

**Anzeige:** „PC verbunden“ (mit „über die Cloud“), „PC wird gesucht“, „Cloud verbunden · PC offline“, „Cloud nicht erreichbar“, „Verbindung unterbrochen – automatische Wiederverbindung“ – immer aus dem echten Zustand der Verbindung (`web/src/lib/conn-state.ts`).

**Sicherheit**

- Kein offener Port am Router, keine öffentliche Steuer-Adresse: Beide Seiten verbinden sich ausgehend, jede Verbindung braucht ein gültiges Geräte-Token des Kontos (falsches Token → `auth-failed`, Verbindung zu; ohne Anmeldung wird nach spätestens 30 s getrennt).
- Die Cloud kann sich am PC nicht anmelden und keine Befehle erzeugen, die der PC annimmt: Der PC führt nur aus, was ein angemeldetes Gerät sendet (Challenge-Response mit dem Geräteschlüssel).
- Der über das Konto entstandene Zugang ist ein normaler Eintrag unter „Geräte & Verbindungen“ mit Standardrechten (ansehen, starten, Soundboard, verwalten – **kein** Admin, keine Energie-/Fernsteuer-Rechte), umbenennbar und jederzeit entfernbar; der PC zeigt dazu eine Benachrichtigung.
- Widerruf: Gerät am PC entfernen (sofort getrennt), Cloud-Token zurückziehen (`revoke`), Konto-Passwort ändern, oder den Schalter „Automatische PC-Verbindung“ am PC ausschalten (`settings.saveSecurity { cloudLink: false }`, nur direkt am PC).
- Wer das Konto-Passwort kennt, kann über das Konto einen Zugang zum PC bekommen – das Passwort ist damit der Schlüssel zum PC. Ein starkes Passwort ist Pflicht; wer das nicht will, schaltet die Funktion am PC aus und koppelt klassisch.
- Geräte-Tokens werden jetzt nach „zuletzt benutzt“ aufgeräumt (höchstens 30 je Konto). Vorher flog nach 30 neuen Anmeldungen das älteste – also das des PCs – heraus.

**Test:** `web/e2e/cloud-link.spec.ts` (läuft mit `PGL_WRANGLER`, echter Worker mit Durable Object, echter Begleiter, Browser): PC an → Handy nur mit Konto verbindet sich und startet ein Spiel · PC aus → „PC offline“, Cloud-Daten bleiben · PC wieder an → von selbst verbunden · Browser-Neustart · Cloud-Ausfall und Rückkehr · zweites Gerät · falsches Token/falscher Kontoschlüssel abgewiesen · Gerät entfernt · Schalter aus.

**Nicht geprüft (hier nicht möglich):** echtes Windows (Autostart nach Neustart), echtes iPhone/iPad/Android, Wechsel WLAN ↔ Mobilfunk am echten Gerät. Die Logik dafür (Herzschlag, Neuaufbau bei `online`/Vordergrund) ist dieselbe wie im Test mit Cloud-Ausfall.

**Kosten/Grenzen:** Durable Objects mit WebSocket-Hibernation – eine wartende Verbindung kostet keine Rechenzeit. Der Fernzugriff auf den Bildschirm (Remote Desktop) läuft über die Cloud-Verbindung mit, verbraucht dort aber viele Nachrichten; dafür bleibt Tailscale die bessere Wahl.
