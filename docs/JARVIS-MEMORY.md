# JARVIS MEMORY – Obsidian-Vault als Langzeitgedächtnis (3.21.0)

## So funktioniert es
Das Gedächtnis ist ein **Ordner mit Markdown-Dateien** auf dem PC. Ein Obsidian-Vault ist nichts anderes. JARVIS liest und schreibt diese Dateien über den PC-Begleiter; **Obsidian muss dafür weder offen noch installiert sein.** Wer Obsidian hat, öffnet denselben Ordner dort mit „Ordner als Vault öffnen“ und sieht dieselben Notizen (Verknüpfungen `[[Name]]` werden verstanden).

```
JARVIS-MEMORY/
  00-System/ (Gedächtnis-Regeln, Verlauf = alte Fassungen)
  01-Personen/Nutzerprofil.md
  02-Projekte/ (PC-Launcher, Minecraft, Website, …)
  03-Gaming/ (Spiele, Fortschritte, Spielwissen)
  04-Gespräche/  05-Wissen/ (Technik, Anleitungen)  06-Aufgaben/ (Offen, Erledigt)
```

* **Merken**: „Merk dir, dass mein Minecraft-Projekt noch nicht fertig ist.“ Die Aussage wird der passenden Notiz zugeordnet (Projekt, Spiel, Aufgabe, Wissen, Profil). Dieselbe Aussage zweimal erzeugt keinen zweiten Eintrag; ein geänderter Status („jetzt fertig“) ersetzt die Statuszeile, der alte Stand bleibt als Zeile im Verlauf stehen.
* **Erinnern**: „Wo war ich bei meinem Minecraft-Projekt stehen geblieben?“ wird ohne KI aus den Notizen beantwortet, mit Pfad der Quelle. Steht nichts dazu da, sagt JARVIS das. Allgemeine Wörter wie „Projekt“ allein führen nicht zu einem Treffer.
* **Suche (RAG)**: lokale Volltextsuche (Titel stärker gewichtet, einfache deutsche Wortstämme, neue Notizen leicht bevorzugt). Bei Fragen an eine KI werden nur wenige passende Ausschnitte (ca. 1,5 KB) als *Daten* mitgegeben, nie der ganze Vault. Embeddings sind nicht eingebaut (siehe „Später“).
* **Automatik** (Einstellung): „Nur was ich sage“ / „JARVIS fragt“ (Standard, Vorschlag „Merk dir das“) / „Klares gleich speichern“.
* **Pflege**: Die Seite zeigt Doppelte, seit über 60 Tagen unberührte offene Projekte und Notizen ohne Status. JARVIS schlägt nur vor und ändert dabei nichts.

## Einrichten
1. PC-Begleiter auf 3.21.0 aktualisieren.
2. Am PC die Seite **JARVIS MEMORY** öffnen, einen Ordner eintragen (z. B. `C:\Users\Name\Documents\JARVIS-MEMORY`), „Übernehmen“. Den Ordner kann nur der PC selbst setzen, nicht ein Handy.
3. Optional in Obsidian: „Ordner als Vault öffnen“ → derselbe Ordner.
4. Handy/iPad nutzen dieselbe Seite über die normale gesicherte Verbindung.

## Sicherheit
* Der Vault ist nie Teil der Webseite oder von GitHub Pages. Er ist nur über Befehle des PC-Begleiters erreichbar, die eine angemeldete Verbindung brauchen: lesen/suchen = Ansehen, schreiben = Verwalten, Löschen und Einstellungen = Admin.
* Jeder Dateizugriff läuft durch **eine** Pfadprüfung: nur `.md` im Vault, höchstens 4 Ebenen, kein `..`, kein Laufwerk/`:`/absoluter Pfad, keine versteckten Ordner (`.obsidian`, `.trash`), keine reservierten Windows-Namen, keine Verknüpfungen/Symlinks heraus. Als Vault werden Laufwerks-Wurzeln, Systemordner und Netzwerkpfade abgelehnt.
* Schreiben wird mit dem Änderungsstand abgeglichen (wurde die Datei zwischendurch geändert, wird nicht überschrieben); die alte Fassung landet unter `00-System/Verlauf`.
* **Löschen** ist standardmäßig aus. Eingeschaltet braucht es zusätzlich eine ausdrückliche Bestätigung; gelöscht wird nur in `.trash` (zurückholbar). JARVIS löscht nie von selbst; „Vergiss …“ wird mit Erklärung abgelehnt.
* Keine API-Schlüssel im Frontend; die Webseite kennt nur den Pfad-Status, den der PC meldet.
* Pairing/QR bleiben unberührt (keine Änderung an diesen Dateien).
* Ist der Ordner weg (Laufwerk getrennt, gelöscht): Status „Nicht erreichbar“, JARVIS antwortet normal ohne Gedächtnis; sobald der Ordner wieder da ist, geht es ohne Neustart weiter.

## Tatsächliche Testergebnisse (Linux-Sandbox, 2026-11-06)
Nichts davon ist simuliert; die Tests arbeiten mit echten Ordnern und Dateien.

| Prüfung | Ergebnis |
|---|---|
| C#-Tests `MemoryVaultTests` (34 Fälle): Struktur anlegen, lesen, schreiben, aktualisieren inkl. Verlauf und Konflikt, Pfadangriffe (`../`, `/etc/passwd`, `C:\`, `.obsidian`, `CON`, zu tief …), Symlink hinaus, Vault-Ordner nur am PC und nur sinnvolle Pfade, Suche (Titel/Inhalt/Mehrzahl), Notizen verknüpfen, Merken ohne Doppelte, Statusänderung nachvollziehbar, Erinnern/„weiß ich nicht“, Neustart (neue Instanz auf demselben Ordner), Ordner fehlt, Löschen nur mit Recht+Bestätigung → `.trash`, Nur-Lesen-Modus, Pflege-Hinweise ändern nichts, Sprach-Absichten | alle bestanden (34/34) |
| Web-Unit-Tests inkl. Übersetzungs-Vollständigkeit | 539/539 bestanden |
| E2E mit echtem Begleiter (`JARVIS MEMORY: …`): Ordner einrichten, „Merk dir …“ → Datei auf der Platte geändert, Wiederholung ändert nichts, „Wo war ich …?“ antwortet aus der Notiz, unbekanntes Projekt wird nicht erfunden, Statuswechsel, 5 Pfadangriffe über die Schnittstelle abgelehnt, Löschen ohne Recht abgelehnt und „Vergiss …“ löscht nichts, Seite zeigt Status/Projekte/Suche, Notiz anlegen und bearbeiten (Datei prüft), Ordner weg → „missing“ und JARVIS antwortet weiter, Ordner zurück → geht wieder | bestanden |

Beim Testen gefundene und behobene Fehler: absolute Pfade wurden nur entschärft statt abgelehnt; das Wort „Projekt“ allein lieferte jedes Projekt als Treffer (JARVIS hätte zu einem unbekannten „Raumschiff-Projekt“ den Minecraft-Stand genannt); Projektnamen mit großem „Mein“ wurden falsch erkannt; die Trefferzeile zeigte Kopfdaten statt Inhalt.

## Nicht getestet / offene Punkte (ehrlich)
* **Windows**: Pfadprüfung für Laufwerksbuchstaben und Verknüpfungen (Junctions) ist programmiert und unter Linux nur indirekt geprüft; auf dem echten Windows-PC noch nicht ausprobiert.
* **Echtes Handy/iPad**: nicht auf Geräten getestet, nur im Browser mit demselben Berechtigungsweg.
* **Obsidian-App**: nicht installiert in der Sandbox; dass die Dateien dort sichtbar sind, folgt aus dem Format (Markdown, `[[Links]]`), wurde aber nicht in Obsidian selbst gesehen.
* **Gleichzeitiges Bearbeiten in Obsidian und durch JARVIS** wird nur durch den Änderungsstand-Abgleich abgefangen (kein Live-Zusammenführen).
* **Widersprüche**: Statuswechsel bei Projekten werden erkannt und nachvollziehbar eingetragen; allgemeine Widersprüche zwischen freien Aussagen erkennt JARVIS noch nicht – er fragt nicht automatisch nach.
* Die Web-KI-Antworten mit Gedächtnis-Auszug ließen sich ohne echten KI-Schlüssel nicht live prüfen; geprüft ist, welche Ausschnitte mitgegeben werden.

## Später
Embedding-Suche (optional, lokal), Zusammenfassen alter Gespräche in 04-Gespräche, Vorschläge zur Verknüpfung, Obsidian-Synchronisierung über mehrere PCs, Widerspruchsabfrage bei freien Aussagen.

## Geänderte Dateien
Companion: `Assistant/MemoryVault.cs`, `Assistant/MemoryIntents.cs`, `Assistant/AssistantService.cs`, `Hosting/CompanionServices.cs`, `Api/RpcApi.cs`, `protocol/protocol.json`. Web: `pages/Memory.tsx`, `App.tsx`, `lib/nav.tsx`, `lib/jarvis-chat.ts`, `lib/en.ts`, `styles.css`. Tests: `MemoryVaultTests.cs`, `e2e/app.spec.ts`.
