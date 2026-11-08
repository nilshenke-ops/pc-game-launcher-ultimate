# Cloud-Konto und Synchronisierung

## Was es löst

Ohne Cloud liegt das Konto (Design, Gamer-Pass, Zähler, Pausen-Erinnerung …) verschlüsselt auf dem PC. Anmelden und Synchronisieren gehen dann nur, solange der PC an ist und der Companion läuft – auch von unterwegs über Tailscale/Cloudflare.

Mit einem eigenen Supabase-Projekt liegt **derselbe verschlüsselte Datensatz** in der Cloud:

- Anmelden funktioniert bei ausgeschaltetem PC, auf jedem Gerät.
- Änderungen werden automatisch gespeichert; war das Netz weg, bleibt die Änderung lokal vorgemerkt und wird beim nächsten Kontakt nachgesendet.
- **Nicht** in der Cloud: Spielebibliothek, installierte Spiele, Profile, Kalender, Dateien, Aufnahmen, PC-Steuerung. Dafür braucht es weiterhin den PC, und die Cloud-Anmeldung gibt **keine** Rechte am PC.

## Einrichtung

1. Kostenloses Projekt auf https://supabase.com anlegen (Region z. B. Frankfurt).
2. Im Projekt **SQL Editor** den Inhalt von `supabase/migrations/20261108000000_account_blobs.sql` ausführen.
   Das legt `public.account_blobs` an und schaltet Row Level Security ein: Jeder angemeldete Nutzer erreicht genau seine eigene Zeile, anonyme Zugriffe gibt es nicht.
3. **Authentication → Providers → Email** eingeschaltet lassen. Ist „Confirm email“ aktiv, muss nach der Registrierung erst der Link in der E-Mail bestätigt werden; die App sagt das klar an.
4. **Project Settings → API**: `Project URL` und `anon public` kopieren. Der `service_role`-Schlüssel gehört **nie** in die Web-App.
5. Beim Bauen setzen:

   ```bash
   cd web
   VITE_SUPABASE_URL="https://<projekt>.supabase.co" \
   VITE_SUPABASE_ANON_KEY="<anon-key>" \
   npm run build:hosted
   ```

   Für die im Companion eingebettete Oberfläche genauso mit `npm run build`.
6. Für die automatische Website-Veröffentlichung die beiden Werte als GitHub-Secrets `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` hinterlegen; `.github/workflows/release.yml` gibt sie an beide Builds weiter.

Ohne diese Werte verhält sich die App wie bisher: Das Konto liegt auf dem PC, und die Oberfläche sagt das offen.

## Verschlüsselung

Der Browser leitet aus E-Mail + Passwort mit PBKDF2 (250 000 Runden, SHA-256) zwei Schlüssel ab:

- einen **Anmelde-Schlüssel** – Supabase prüft damit das Konto,
- einen **AES-GCM-Schlüssel**, der das Gerät nie verlässt.

In der Cloud liegt nur der verschlüsselte Datensatz. Weder Supabase noch der PC können ihn lesen; das Passwort wird nie übertragen. Auf dem Gerät bleiben für die dauerhafte Anmeldung nur der Refresh-Token der Sitzung und der Datenschlüssel – beides entfernt „Abmelden“.

**Passwort vergessen = Daten nicht wiederherstellbar.** Am PC lässt sich das alte PC-Konto unter Einstellungen → Konto löschen.

## Grenzen

- Bestehende Konten auf dem PC wandern **nicht** automatisch in die Cloud. Nach der Einrichtung einmal mit der Cloud anmelden/registrieren und das Design neu speichern (es liegt lokal weiter vor).
- Ein Konto gehört zu genau einem Supabase-Projekt. Ein Projektwechsel ist ein Umzug, kein automatischer Abgleich.
- Die Cloud ersetzt keinen Tunnel: Alles, was den PC braucht (Spiele starten, Dateien, Fernsteuerung, Kalender), funktioniert weiterhin nur bei erreichbarem PC.
