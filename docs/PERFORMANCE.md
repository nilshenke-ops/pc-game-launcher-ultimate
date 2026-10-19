# Leistung – Messplan und Messwerte

Ziel: Die App soll auf dem Gaming-PC und auf Handys so wenig Ressourcen wie möglich brauchen. Hier steht, **was gemessen wurde, wie, und was (noch) nicht gemessen werden konnte.** Verbesserungen gelten nur, wenn sie hier gemessen sind.

## Umgebung und Grenzen

Gemessen wurde in einer Linux-Cloud-Umgebung: Chromium (Playwright) und der **Headless-Companion** (dieselbe Kernlogik wie unter Windows, aber ohne Windows-Fenster, WebView2, NAudio, nvidia-smi).

**Nicht messbar** waren Werte unter Windows: echter Gaming-PC, WebView2-Fenster, GPU-Abfragen, Spiel-FPS mit und ohne Begleiter, Akku eines echten Handys. Dafür steht unten ein Messplan, der auf einem Windows-PC wiederholt werden kann.

## Reproduzierbare Messungen

| Messung | Werkzeug | Vorgehen |
|---|---|---|
| Startzeit der Web-App | `scripts/perf/web-start.mjs` | Kaltstart ohne Cache, Dashboard bis „Gaming-Zentrale“ und erste Karte sichtbar. Je 3 Läufe, Median. Desktop (1440×900) und „Handy“ (390×844, CPU 4× gedrosselt, ~16 Mbit/s). Angemeldet wie das PC-Fenster. Sprache de-DE bzw. en-US. |
| Übertragene Daten, JS-Heap | dito | Summe der Netzwerkantworten; `performance.memory.usedJSHeapSize` 1,5 s nach dem Start |
| Bundle-Größe | `npm run build` | Größe des Haupt-Chunks roh und gzip |
| Companion-Leerlauf | `scripts/perf/companion-idle.sh <pid> <admin-token> web` | CPU-Zeit des Prozesses (`/proc/<pid>/stat`) über 60 s und RSS: (1) ohne Client, (2) mit offenem Dashboard (Live-Werte alle 2 s) |

## Ergebnisse 2.1.0 (19.10.2026)

**Web-App** – Vorher: Stand 2.0.0, Testbrowser en-US; die Oberfläche war trotzdem deutsch, weil die gespeicherten Einstellungen Deutsch waren, und der englische Text war im Haupt-Bundle immer enthalten.

| | Vorher (2.0.0) | Nachher (2.1.0), Deutsch | Nachher (2.1.0), Englisch |
|---|---|---|---|
| Haupt-Chunk | 503 KB (162 KB gzip) | 359 KB (114 KB gzip) | 359 KB + 132 KB Englisch (45 KB gzip) |
| Übertragen beim Kaltstart | 665 KB | 526 KB (−21 %) | 643 KB |
| Nutzbar, Desktop | 365 ms | 283 ms | 509 ms ¹ |
| Nutzbar, Handy (gedrosselt) | 1377 ms | 1331 ms (im Rauschen) | 1293 ms |
| JS-Heap nach Start | 10 MB | 10 MB | 10 MB |

¹ Englische Nutzer warten auf die Datei mit den englischen Texten, bevor die Seite erscheint (statt erst Deutsch zu sehen). Das kostet auf dem Desktop eine zusätzliche Anfrage. Auf dem gedrosselten Handy war kein Nachteil messbar.

**Companion (Headless, Linux), CPU-Anteil eines Kerns über 60 s**

| | Vorher | Nachher |
|---|---|---|
| Leerlauf, kein Gerät verbunden | 0,05 % · 111 MB | 0,08 % · 98 MB |
| Dashboard offen (Live-Werte) | 0,28 % · 128 MB | 0,20 % · 116 MB |

Diese Werte liegen im Messrauschen einer 60-Sekunden-Messung. Aussage: Der Kern ist im Leerlauf praktisch kostenlos. Eine gezielte Verbesserung des Companions ist damit **nicht** belegt.

## Was in 2.1.0 geändert wurde (mit erwarteter Wirkung)

- **Gemessen:**
  - Englische Texte (132 KB) und Demo-Daten (14 KB) werden nur bei Bedarf geladen.
- **Nicht separat gemessen:**
  - Laufende Sounds haben einen eigenen kleinen Speicher. Bisher zeichnete jedes Abspielen und Stoppen die ganze Oberfläche neu, jetzt nur noch die Sound-Anzeigen.
  - Der Ping zum PC läuft alle 60 statt alle 15 Sekunden, solange die Seite verborgen ist (Bildschirm aus, anderer Tab). Die Antwortzeit wird nur bei spürbarer Änderung neu veröffentlicht (vorher alle 15 s ein Neuzeichnen).
  - Uhren und Countdowns ticken nicht bei verborgener Seite.
- **Live-Abos mit Zähler:** Mehrere Ansichten teilen sich ein Abo. Das behebt einen Fehler, keine Messgröße.
- **Service Worker:** löscht Dateien alter Builds und cacht nur noch die App-Seite. Das verhindert, dass der Speicher auf dem Gerät mit jedem Update wächst.

## Messplan für einen Windows-PC (noch offen)

1. Leerlauf: Task-Manager → Details → `PCGameLauncherCompanion.exe`, CPU und Arbeitsspeicher über 5 min.
   - Fall A: Fenster im Tray.
   - Fall B: Dashboard auf dem Handy offen.
   - Fall C: Overlay offen.
2. Spiel mit fester Szene (z. B. Benchmark eines Spiels), jeweils 3 Läufe, FPS-Mittel und 1 %-Perzentil mit PresentMon/CapFrameX:
   - (a) Companion beendet
   - (b) Companion im Tray, kein Gerät
   - (c) Dashboard auf dem Handy offen
   - (d) Mini-Overlay an
3. Mikrofon-Durchleitung: Latenz mit einem Klatsch-Test messen (Aufnahme von Original und Kabel-Ausgang).
4. Langzeit: 8 h laufen lassen, Arbeitsspeicher alle 30 min notieren (Speicherleck?).
