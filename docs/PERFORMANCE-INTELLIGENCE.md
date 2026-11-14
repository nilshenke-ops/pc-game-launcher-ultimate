# Performance Intelligence & Monitoring (3.66.0)

Erweitert das bestehende Monitoring (Messwerte, Ping-Monitor, Speicherseite, Leistungsaufzeichnung je Sitzung, JARVIS-Leistungsfragen) – nichts davon wurde doppelt gebaut.

## Was es gibt

| Bereich | Umsetzung | Quelle der Werte |
|---|---|---|
| FPS automatisch | startet mit jedem Spiel, endet mit dem letzten; keine Einstellung je Spiel | Intel PresentMon (ETW), eingebettet in den Windows-Begleiter |
| FPS-Werte | aktuell, Durchschnitt, 1 %-Low, 0,1 %-Low (Mittel der langsamsten Bilder), Bildzeit + Verlauf, Ruckler, GPU-beschäftigt, Grafik-API | PresentMon-CSV, Spalten aus dem Kopf (1.x und 2.x) |
| FPS-Sitzungen | gespeichert (`fps-sessions.json`, max. 200), Vergleich nur bei gleicher API und ≥ 2 min | Begleiter |
| Insel: alles anklickbar | Analyse, FPS, CPU, GPU, VRAM, RAM, Speicher, Netzwerk, Ping, Akku – Detailansicht ohne Seitenwechsel, Zeitraum 1 min / 10 min / 1 h | `monitor.*`, `fps.*`, `perf.insights`, `network.history`, `disk.health` |
| Verlauf | 1 Stunde im Begleiter, nur was gemessen wurde (Lücken bleiben Lücken) | MonitorService |
| Laufwerke | frei/gesamt/belegt, Lesen/Schreiben in MB/s, Aktivität, SMART-Zustand auf Knopfdruck | LogicalDisk-Leistungsindikatoren, `Get-StorageReliabilityCounter`; Linux `/proc/diskstats` |
| Netzwerk | Download/Upload in **Mbit/s**, Verbindungsart (WLAN/LAN) und -geschwindigkeit, Daten seit Begleiter-Start; Ping/Jitter/Verlust | Adapter-Zähler, ICMP |
| Analyse | CPU-/GPU-Limit, Hintergrundlast, RAM/VRAM voll, Temperaturen, Bildzeit-Schwankung, Ruckler, Laufwerk voll/ausgelastet, Paketverlust/Ping, Last des Begleiters – jeweils *was*, *warum*, *was hilft*, *Risiko*; „gemessen“ vs. „Vermutung“ | PerfAdvisor (reine Regeln, getestet) |
| Eigenverbrauch | CPU % und RAM des Begleiters in jeder Messung | Prozesszeit |

Einheiten: Netzwerk Mbit/s, Dateien/Laufwerke MB/s, Mengen MB/GB (`web/src/lib/units.ts`).

## FPS-Messung: Ablauf und Grenzen
1. Release-Build lädt PresentMon (feste Version, Fallback neueste 2.x) und prüft die **Intel-Signatur**; ohne gültige Signatur wird es nicht eingebettet.
2. Der Begleiter entpackt es einmal nach `%LOCALAPPDATA%\PCGameLauncher\tools` und prüft die Signatur vor **jedem** Start erneut (WinVerifyTrust + Herausgeber Intel).
3. Windows erlaubt das Mitlesen nur Administratoren und der Gruppe „Leistungsprotokollbenutzer“. Fehlt das, zeigt die FPS-Ansicht **„Erlauben“** (nur am PC selbst): Windows fragt per UAC, der Benutzer wird dieser Gruppe hinzugefügt – sonst ändert sich nichts. Wirksam ab der nächsten Anmeldung.
4. PresentMon liest Ereignisse von Windows und greift nicht in Spiele ein; Anticheat wird nicht umgangen. Beendet PresentMon sich (z. B. Berechtigung), steht der Grund in der Ansicht.
5. Gemessen wird das Programm mit den meisten Bildern; Desktop (dwm), Browser, Overlays und der Begleiter zählen nicht.
6. Eingabeverzögerung wird nicht gezeigt (nicht zuverlässig messbar ohne Zusatzhardware).

## Sicherheit / was nicht passiert
Keine Registry-Eingriffe, keine Änderung an Sicherheitsfunktionen, kein Beenden von Windows-Prozessen, nichts wird automatisch gelöscht. Programme schließen nur mit Bestätigung (wie bisher). Keine FPS-Versprechen.

## Tests
| Prüfung | Ergebnis |
|---|---|
| Begleiter `PerfIntelTests`: CSV 1.x/2.x, Statistik (Ø, 1 %/0,1 %-Low, Ruckler, GPU-busy), zu wenige Bilder → keine Lows, Sitzung startet/endet mit Spiel, Spiel statt dwm/Browser, kurze Sitzung nicht gespeichert, Berechtigung/aus/nicht verfügbar/abgebrochen, Vergleich nur wenn vergleichbar, Ratgeber (CPU-Limit als Vermutung, Hintergrundlast ohne Spiel/Windows-Prozesse, RAM, Hitze, Laufwerk, Paketverlust, Ruhe wenn alles gut, deutsche Zahlen), `/proc/diskstats`, Mbit-Umrechnung | **bestanden** (754 Begleiter-Tests gesamt) |
| Web: Einheiten | **bestanden** |
| Browser `e2e/perf-366.spec.ts` gegen echten Headless-Begleiter: CPU/RAM/Netz/Speicher/FPS/Analyse/Ping-Details, Verlauf vom PC, Mbit/s, FPS ehrlich „nicht verfügbar“ unter Linux, Einstellung aus/an | **bestanden** |
| Windows-Build (PresentMon-Start, Signaturprüfung, Laufwerkszähler, SMART) | kompiliert; **nicht auf echter Windows-Hardware getestet** |
| FPS mit echten Spielen (DX11/DX12/Vulkan/OpenGL, NVIDIA/AMD/Intel), FPS vorher/nachher, Neustart | **nicht getestet** – kein Windows-PC mit GPU im Testaufbau |

## 3.67: Wofür wird es gebraucht + Kennzeichnung
- Programme nach **RAM, CPU und GPU** (GPU-Last und eigener Grafikspeicher je Programm: Windows-Leistungsindikatoren „GPU Engine“ / „GPU Process Memory“, nur Windows-Begleiter).
- **FPS:** alle Programme mit Bildausgabe und deren FPS; das gemessene Spiel ist markiert.
- **Speicher:** größte Spiele/Programme (aus der Speicher-Seite), Windows-Laufwerk markiert.
- **Kennzeichnung:** `windows` (Teil von Windows, nicht beendbar), `driver` (Treiber, Warnung vor dem Schließen), `companion` (Nexus), `app`. Bekannte Windows-Prozesse und Treiber haben eine kurze Erklärung (`ProcessUsageService.RoleOf`).
- Tests: `ProcessKindTests` (Kennzeichnung, Erklärung, GPU-Liste sortiert / nicht unterstützt), `e2e/perf-366.spec.ts` (Programmliste mit Legende, GPU-Hinweis unter Linux, Speicher-Liste).
