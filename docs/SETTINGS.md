# Einstellungen – Bestandsaufnahme, neue Struktur und Stand

Stand: 3.62.0 (2026-11-13). Grundlage ist der Auftrag „Ultimate Settings Simplification & Performance Overhaul“.
Gebaut wurde nur, was fehlte. Vorhandene Einstellungen wurden umsortiert und verlinkt, keine wurde entfernt.

## 1. Bestandsaufnahme (vor 3.62, geprüft im Quellcode)

| Ort | Was | Speicher |
|---|---|---|
| `pages/Settings.tsx` | 11 Bereiche: Allgemein, Konto, Design & Layout, Verbindung, Sicherheit, Benachrichtigungen, Installation & Autostart, Updates, Backup, Datenschutz, Hilfe | Begleiter (`settings.save`) bzw. Gerät (`prefs`) |
| Begleiter-Modell `Settings` | 83 Felder (Name, Port, WLAN, Relay, Update-Quelle, Verlauf, Benachrichtigungen, Prüfintervall …) | `settings.json` am PC, Geheimnisse DPAPI-geschützt |
| Website-Einstellungen `prefs` | 22 Felder oben, dazu Design (`theme`), Effekte (`fx`), Layouts, Navigation | Browser, zusätzlich am PC und in der Cloud |
| `pages/OverlaySettings.tsx` | Overlay, Tastenkürzel, OBS, Replay, Aufnahme-Programm, Insel | Begleiter |
| `components/assistant-settings.tsx` | KI-Router, Ollama, Claude, Websuche, Bingo-KI, Kostenwächter | Begleiter (Schlüssel nur dort) bzw. verschlüsselt auf dem Gerät |
| `components/island-settings.tsx` | Insel am PC/in der App, Sichtbarkeit, Aussehen, Widgets | Begleiter bzw. Gerät |
| `pages/AudioCenter.tsx` | Soundboard-Ausgabe, Monitoring, Mikrofon mitsenden, Discord, Diagnose | Begleiter |
| `pages/Profile.tsx`, `pages/Devices.tsx`, `pages/Profiles.tsx` | Konten/Cloud, gekoppelte Geräte und Rechte, Profile mit Spielmodus | Begleiter bzw. Cloud |

Was fehlte oder störte:
- Es gab keine Suche über Einstellungen. Die Befehlspalette kannte nur 9 Bereiche, keine einzelne Einstellung.
- Leistungs-Schalter lagen zwischen Designfragen. „Animationen reduzieren“ und „Leichte Darstellung“ standen in „Design & Layout“, das Prüfintervall der Spielerkennung unter „Allgemein“.
- Es gab keine Presets.
- Expertenfelder wie eigener Relay-Server, WebSocket-Adresse und Update-Quelle waren für alle sichtbar.
- Einstellungen auf eigenen Seiten (Audio, KI, Overlay, Profile) waren von den Einstellungen aus nicht auffindbar.
- Nur optisch vorhandene Einstellungen gab es keine: Jeder Schalter wird gespeichert und wirkt.

## 2. Neue Struktur (3.62)

Kategorien in der Seitenleiste:
Allgemein · Personalisierung · Gaming · Audio · JARVIS · Dynamic Island · Verbindung & Geräte · Cloud & Sync ·
Datenschutz & Sicherheit · Performance · Erweitert · Hilfe.

**Eine Quelle je Einstellung.** Jede Einstellung hat genau einen Ort.
- Funktionsnahe Einstellungen bleiben auf ihrer Seite: Audio Center, JARVIS „KI & Einstellungen“, Overlay, Profile und Geräte.
- Die Kategorie zeigt dann eine verlinkte Übersicht mit kurzer Erklärung.
- Ausnahme: Die Insel-Einstellungen erscheinen unter „Dynamic Island“ als dieselbe Komponente wie auf den anderen Seiten. Sie haben denselben Speicher, es entsteht kein zweiter Wert.

Verschoben wurde:
- „Animationen reduzieren“, „Systemeinstellung beachten“ und „Leichte Darstellung“: von Design nach **Performance**.
- Das Prüfintervall der Spielerkennung: von Allgemein nach **Performance** (nur erweiterte Ansicht).
- Konto und Backup: nach **Cloud & Sync**.
- Sicherheit: nach **Datenschutz & Sicherheit**.
- Benachrichtigungen und Autostart: nach **Allgemein**.
- Update-Quelle und Plugin-Katalog: nach **Erweitert**.

Alte Links (`?s=backup`, `?s=account`, `?s=security`, `?s=notifications`, `?s=autostart`, `?s=updates`) öffnen die neue Kategorie.

### Suche
- Ein Suchfeld oben auf der Einstellungsseite zeigt schon beim Tippen Treffer.
- Grundlage ist eine feste Liste in `lib/settings-index.ts` mit 92 Einstellungen, Ort und Alltagswörtern. Die Suche läuft lokal, ohne Anfrage und ohne Netz.
- Umlaute und Schreibweisen werden angeglichen („Größe“ = „groesse“). Wortanfänge zählen ab 3 Buchstaben.
- Synonyme wie „dunkel“, „laggt“, „Akku“, „Handy“, „mic“, „Kennwort“ oder „englisch“ finden die passende Einstellung.
- Ein Treffer öffnet die Seite und hebt die Einstellung kurz hervor. Bei reduzierter Bewegung geschieht das ohne Animation.
- Dieselben Einträge stehen in der Befehlspalette (Strg+K).

### Einfach / Erweitert
- Der Schalter oben je Kategorie ist **nur eine Ansicht**. Er ändert keinen Wert und gilt nur für dieses Gerät.
- „Einfach“ (Standard) blendet aus: eigenen Relay-Server, Server-Adresse für den Browser, Update-Quelle mit Plugin-Katalog und das Prüfintervall.
- Die Seite sagt, wie viele Einstellungen ausgeblendet sind.
- Führt die Suche zu einer erweiterten Einstellung, schaltet die Ansicht auf „Erweitert“, damit der Treffer sichtbar ist.

### Leistungs-Presets (Performance)
| Preset | Leichte Darstellung | Animationen reduzieren | 3D-Neigen | Bewegter Hintergrund | Seitenübergang |
|---|---|---|---|---|---|
| Energiesparend | an | an | aus | aus | keiner |
| Ausgewogen (Standard) | aus | aus | aus | aus | Einblenden |
| Maximale Effekte | aus | aus | an | Partikel | Gleiten |

- Vor dem Übernehmen zeigt die Seite genau die Werte, die sich ändern („Leichte Darstellung: aus → an“). Die Auswahl allein ändert nichts.
- Nach dem Übernehmen setzt **„Rückgängig“** die vorherigen Werte zurück.
- Presets gelten nur für dieses Gerät. Farben, Layout und Spielstart-Animation bleiben unverändert.

### Export, Import, Zurücksetzen
Das gab es schon. Es wurde nicht doppelt gebaut, sondern in „Cloud & Sync“ zusammengeführt und ist über die Suche zu finden.
- **Backup** (PC-Einstellungen als ZIP): ohne gekoppelte Geräte, Schlüssel und Relay-Zugang. Dazu kommen Wiederherstellungspunkte.
- **Datenzentrum** (Design und Sammlungen dieses Geräts): Datei mit Vorschau beim Import.
- **Zurücksetzen:**
  - Personalisierung: „Standard-Design wiederherstellen“, dazu „Rückgängig“ und „ursprüngliches Design“ im KI-Design-Editor.
  - Performance: Preset „Ausgewogen“.
  - Insel und KI: auf ihren Seiten.
  - Ein Zurücksetzen *aller* PC-Einstellungen gibt es bewusst nicht. Es würde Kopplungen und Zugänge mitreißen. Dafür gibt es die Wiederherstellungspunkte.

## 3. Performance
- Die Suche ist eine statische Liste mit etwa 90 Einträgen und wird bei jedem Tastendruck synchron durchsucht. Es gibt keine Anfrage und keinen Timer.
- Der Hervorhebungs-Zeitgeber läuft nur nach einem Treffer und höchstens 6 s.
- Jede Kategorie rendert nur ihre eigenen Karten wie bisher. Die Übersichtskarten sind einfache Links ohne Daten.
- Messwerte zum Bündel stehen in `CHANGELOG.md` unter 3.62.0.

## 4. Tests
| Test | Ergebnis |
|---|---|
| Web-Unit `settings-index.test.ts`: Treffer über eigene Wörter, Umlaute, Wortanfang, Synonyme, alle Wörter müssen passen, leere Eingabe, eindeutige IDs, alte Links, Preset-Vorschau nur mit echten Änderungen, Übernehmen + Rückgängig ohne Nebenwirkung | **bestanden** |
| Browser `e2e/settings.spec.ts` gegen den echten Headless-Begleiter: alle Kategorien, „laggt“ → Leistungs-Preset (Seite und Hervorhebung), Treffer auf eigener Seite (Geräte), „nichts gefunden“, alte Links, Einfach/Erweitert, Suche öffnet erweiterte Einstellung, Preset-Vorschau → Übernehmen → bleibt nach Neuladen → Rückgängig | **bestanden** |
| Bestehende Browser-Tests (Design, Backup, Konto, Bewegung) | siehe Abschnitt 3.62.0 im Änderungsprotokoll |
| Echtes iPhone/iPad | **nicht durchgeführt**; im Browser Handy-Breite geprüft |
| Audio-Treffer am echten Windows-PC | **nicht durchgeführt** (Audio Center ist im Linux-Testbegleiter gesperrt) |
