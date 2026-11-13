# JARVIS 3.0 – Bestandsaufnahme, Plan und Stand

Stand: 3.59.0 (2026-11-13). Grundlage sind die beiden Aufträge „JARVIS 3.0 – intelligenter Gaming-Assistent“ und
„Master-Prompt JARVIS Gaming 3.0“ sowie Abschnitt 18 „Maximale Performance“. Die Aufträge überschneiden sich stark, darum sind
sie hier zusammengeführt. Gebaut wird nur, was im Code wirklich fehlt; Vorhandenes wird erweitert, nicht neu gebaut.

## 1. Bestandsaufnahme (vor 3.59.0, geprüft im Quellcode)

| Bereich | Stand | Wo |
|---|---|---|
| KI-Modelle | **vorhanden**: eingebauter Assistent (ohne KI), Ollama (lokal), Claude (eigener Schlüssel), KI-Router (OpenRouter, Groq, Cerebras, Mistral, Pollinations, OmniRoute/LiteLLM), DeepSeek für Bingo | `Assistant/*.cs`, `lib/free-ai*.ts` |
| Modellwahl und Ausweichkette | **vorhanden**: „Automatisch“, Reihenfolge, Betriebsarten Ersatz/Schnellster/Einzeln, Kostenwächter, Selbsttest, Anzeige des antwortenden Modells | `FreeAi.cs`, KI-Verwaltung |
| Schlüssel | **vorhanden**: nur am PC, DPAPI-geschützt, nie zurückgegeben, nie in Backups; auf dem Gerät verschlüsselt mit Geräteschlüssel | `AssistantService`, `lib/device-key*` |
| Werkzeuge der KI | **vorhanden, nur lesend**: PC-Status, Bibliothek, Sounds, Profile, Spielzeit, Quests, Deals, Benachrichtigungen, Netzwerk, Updates, Einstellungen, Hilfe; Aktionen nur als Knöpfe | `AssistantTools.cs` |
| Direkte Ausführung | **vorhanden, eng begrenzt**: nur mit JARVIS-Sitzung, nur Gaming-Aktionen aus fester Liste, nur was in der Nachricht genannt wurde | `Jarvis.cs` |
| Gedächtnis | **vorhanden**: Obsidian-Vault (Markdown am PC), Merken, Nachfragen bei Widersprüchen, Suche, Löschen nur mit Recht; kleines Browser-Gedächtnis ohne PC | `MemoryVault.cs`, `jarvis-memory.ts` |
| Webrecherche | **vorhanden**: Tavily/Serper/Exa/Brave/SearXNG am PC, Claude-Websuche, offene Wikis; Quellen mit Link, Abbruch, Grenzen | `ResearchService.cs`, `research-chat.ts` |
| Spielwissen | **vorhanden**: Spielzeit-Schätzung, Quest-Coach, Patch-Erklärer, Wiki-Nachschlagen mit Quelle | `JARVIS-GAMING-INTELLIGENCE.md` |
| Sprache | **vorhanden**: Spracheingabe, Gesprächsmodus, Steuerwörter („Stopp“), Vorlesen, ElevenLabs-Stimme; Unterbrechen der Sprachausgabe | `jarvis-voice.ts`, `island-voice.ts` |
| Diagnose | **vorhanden, aber getrennt**: Audio-Diagnose, Netzwerkprüfung, „Gaming-Doktor“ (Ruckler), Fehlerberichte, Update-Zentrale, Fehlerprotokoll | jeweils eigene Seiten |
| Automatisierungen | **vorhanden**: Auslöser (Spiel/Programm startet, Profil, Zeitplan …), Aktionsschritte, Schleifenschutz bei Profilen | `AutomationEngine` |
| Mehrstufige Aufgaben mit Plan | **fehlte** | – |
| Diagnose über alle Bereiche, mit Belegen und erneuter Prüfung | **fehlte** | – |
| Auftragsverlauf | **fehlte** (nur Chat im Tab und Start-Verlauf) | – |
| Seitenkontext | **fehlte** (JARVIS wusste nicht, wo man gerade ist) | – |
| Bildschirm-/Screenshot-Analyse | **fehlt** (kein multimodaler Aufruf) | – |
| Gedächtnis mit Status Fakt/Vermutung/veraltet | **teilweise** (Widersprüche werden erkannt, ein Status fehlt) | – |
| Eigene JARVIS-Befehle | **teilweise** (Quick Actions sind mehrstufig, haben aber keinen Sprachsatz) | – |
| Proaktive Hinweise mit Einstellung je Art | **teilweise** (Benachrichtigungen mit Kategorien und Ruhemodus) | – |
| Session-Zusammenfassung | **teilweise** (Sitzungen, Leistungsarchiv vorhanden; keine Zusammenfassung durch JARVIS) | – |
| Nur optisch vorhanden | keine Fundstelle; Knöpfe ohne Funktion wurden in früheren Audits entfernt | – |

## 2. Umgesetzt in 3.59.0 – JARVIS-Steuerzentrale (Etappe 1)

- **Plan → Bestätigen → Ausführen → Prüfen** (`Assistant/JarvisAgent.cs`, `components/agent-plan.tsx`).
  - Arten: Vorbereitung („Bereite meinen PC für eine Runde Counter-Strike vor“), Diagnose („Warum funktioniert mein Soundboard nicht?“) und Ablauf („Wenn ich Counter-Strike starte, öffne Discord und aktiviere mein Profil“).
  - Die Pläne baut **keine KI**, sondern feste Regeln aus deinen eigenen Daten (Bibliothek, Profile, Verlauf). Deshalb kann kein Satz aus einer Webseite, einem Spielnamen oder einem Dokument einen Schritt hinzufügen (Schutz gegen Prompt-Injection).
  - Jeder Schritt hat eine Stufe: **Nur ansehen**, **Ausführen** oder **Kritisch**. Kritisch heißt, er ändert Windows-Standardgeräte oder schließt Programme.
  - Schritte lassen sich abwählen oder ändern (anderes Profil, anderes Spiel). Kritische Schritte brauchen ein eigenes Häkchen.
  - Am PC wird **jeder Schritt gegen die Rechte des Geräts geprüft**. Ein Gerät mit nur „Ansehen“ kann planen, aber kein Profil schalten.
  - Ein Plan läuft nie doppelt. Pro Person läuft nur ein Auftrag gleichzeitig. „Stopp“ beendet ihn vor dem nächsten Schritt.
- **Diagnose mit echten Werten.** Sie führt Audio-Diagnose, Netzwerkprüfung, Relay-Status, PC-Messung (Gaming-Doktor), Prozessliste, Update-Zentrale, Fehlerberichte der letzten 7 Tage und das Fehlerprotokoll seit dem Begleiter-Start zusammen.
  - Jeder Befund nennt den gemessenen Wert und die Quelle. Sortiert wird nach Schwere; die wahrscheinlichste Ursache steht oben.
  - Für die Lösung gibt es Schritte (z. B. „Meine Stimme mitsenden“, „Alles zurück auf normal“, ein Programm schließen) und danach **„Erneut prüfen“** mit dem Vergleich „vorher n, jetzt m Auffälligkeiten“.
  - Eine Spielfrage wie „Warum ist Elden Ring so schwer?“ bleibt eine Frage an den Chat. Eine Diagnose braucht ein technisches Thema oder eine Seite mit Thema.
- **Abläufe nutzen die vorhandenen Automatisierungen.** Es gibt kein zweites System. Eine gleiche Regel wird nicht doppelt angelegt.
- **Seitenkontext.** Die Website merkt sich die zuletzt besuchte Seite; „Warum geht das nicht?“ im Audio Center ist eine Audio-Diagnose.
- **Auftragsverlauf** (Reiter „Aufträge“). Er zeigt Auftrag, Zeit, Modell, Schritte, Ergebnisse, Fehler, Dauer und Kosten.
  - Er ist durchsuchbar und filterbar; Einträge lassen sich einzeln oder alle löschen.
  - Abschaltbar: entweder ganz, oder nur der Auftragstext wird nicht gespeichert.
  - Schlüssel, Tokens und „Passwort: …“ werden vor dem Speichern entfernt.
- **Insel.** Ein Plan aus der Insel zeigt die Zusammenfassung und „Plan ansehen“. Bestätigt wird auf der JARVIS-Seite.

### Schnittstellen (Begleiter)
- `jarvis.plan`, `jarvis.execute`, `jarvis.cancelTask`, `jarvis.stop`, `jarvis.history`: Recht „Ansehen“; jeder Schritt prüft dazu sein eigenes Recht.
- `jarvis.historyDelete`, `jarvis.historyClear`, `jarvis.historyConfigure`: Recht „Verwalten“.
- Ereignis `jarvis.task`: Live-Stand, nur an das ausführende Gerät.

## 3. Tests (3.59.0)

| Test | Ergebnis |
|---|---|
| Begleiter `JarvisAgentTests` (19): Erkennung, Seitenkontext, Plan ohne Ausführung, nur gewählte Schritte, Rechte je Schritt (auch über RPC), kritische Schritte nur mit Bestätigung, Behebung + erneute Prüfung, Automatisierung ohne Duplikat, Verlauf ohne Geheimnisse, Löschen, Abschalten | **bestanden** |
| Web-Unit `jarvis-agent.test.ts` | **bestanden** |
| Browser `e2e/jarvis-agent.spec.ts` gegen den echten Headless-Begleiter: Plan ansehen, nur einen Schritt ausführen (Profil bleibt unverändert), Diagnose mit Quelle, Spielfrage ohne Diagnose, Verlauf durchsuchen, Geheimnis nicht im Verlauf, alles löschen | **bestanden** |
| Audio-Behebung auf echtem Windows mit Discord | **nicht durchgeführt** (braucht echte Hardware) |
| Darstellung auf echtem iPhone/iPad | **nicht durchgeführt**; im Browser nur Desktop-Breite geprüft |

## 4. Noch offen (nächste Etappen)

- **Etappe 2:**
  - Gedächtnis mit Kategorie und Status (Fakt / Vermutung / veraltet) sowie Duplikaterkennung.
  - Eigene JARVIS-Befehle: Sprachsatz → Quick Action mit Rechten je Schritt.
  - Proaktive Hinweise mit Einstellung je Art.
  - Session-Zusammenfassung aus Sitzung und Leistungsarchiv.
- **Etappe 3:**
  - Screenshot-Analyse (nur nach Freigabe, sichtbare Vorschau) über ein multimodales Modell. Das braucht einen Claude-Schlüssel oder ein Ollama-Vision-Modell (z. B. `llava`) und wird ohne diese ehrlich als „nicht verfügbar“ angezeigt.
  - Sprachzustände (Zuhören, Planen, Wartet auf Bestätigung …) auch in der Insel.
- **Performance (Abschnitt 18):** Messung vorher/nachher (Leerlauf-CPU, RAM nach langer Nutzung, Bildrate der Insel), danach gezielte Optimierungen. Ergebnisse kommen in `docs/PERFORMANCE.md`, nur mit echten Messwerten.

## 5. Technisch nicht möglich (ehrlich)
- **Discord-Eingabegerät:** Welches Gerät Discord als Mikrofon nutzt, kann keine App von außen lesen oder ändern.
- **FPS:** Bilder pro Sekunde misst der Begleiter nicht, solange kein Frame-Capture-Dienst (z. B. PresentMon) eingebunden ist. JARVIS nennt deshalb keine FPS-Werte.
