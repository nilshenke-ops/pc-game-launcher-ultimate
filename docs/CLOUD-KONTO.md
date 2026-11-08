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

```bash
cd web
VITE_CLOUD_API="https://<dienst>.freebuff.page" npm run build:hosted   # Website
VITE_CLOUD_API="https://<dienst>.freebuff.page" npm run build          # im Companion eingebettet
```

Für GitHub Actions: Secret `VITE_CLOUD_API`. Ohne diesen Wert zeigt die App das Konto wie bisher auf dem PC – die Oberfläche sagt das offen.

## Auf ein eigenes Cloudflare-Konto umziehen (optional)

1. `npm i -D wrangler` (oder `npx wrangler`).
2. D1 anlegen: `npx wrangler d1 create nexus-accounts`, die `database_id` in eine `wrangler.toml` mit `binding = "DB"` eintragen.
3. `ALLOWED_ORIGINS` als Variable setzen (siehe Tabelle oben).
4. `npx wrangler deploy cloud-account-worker/src/index.js` (bzw. eigener Einstiegspunkt) und die neue Adresse als `VITE_CLOUD_API` verwenden.

Ein Umzug ist ein Wechsel des Speicherorts, kein automatischer Abgleich: Konten im alten Dienst bleiben dort.

## Grenzen

- Bestehende Konten auf dem PC wandern **nicht** automatisch in die Cloud. Nach der Einrichtung einmal mit der Cloud registrieren/anmelden und das Design neu speichern (es liegt lokal weiter vor).
- Der Dienst speichert nur Kontodaten. Alles, was den PC braucht (Spiele starten, Dateien, Fernsteuerung, Kalender), funktioniert weiterhin nur bei erreichbarem PC.
