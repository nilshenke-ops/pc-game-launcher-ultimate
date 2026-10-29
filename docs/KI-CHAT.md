# JARVIS – Gaming-KI-Chat mit echter Webrecherche (ab 2.82.0)

## 1. Bestandsanalyse (vor dem Umbau, Stand 2.81.0)

| Baustein | Wo | Echt oder simuliert? |
|---|---|---|
| Eingebauter Assistent | Begleiter `LocalAssistant.cs`, im Browser `assistant-offline.ts` | regelbasiert, feste Wissensbasis (`knowledge.md`) + Live-Daten des PCs – **keine KI**, das war und ist so gekennzeichnet („Lokal · 0 €“) |
| Claude | Begleiter `ClaudeAssistant.cs` (offizielles Anthropic-SDK) | **echte API** mit Werkzeugen (PC-Daten lesen, Aktionen als Knopf vorschlagen), Kostenzählung, Monatslimit |
| Lokale KI (Ollama) | `OllamaAssistant.cs` | **echt**, läuft auf dem PC oder im Heimnetz |
| Gemini, DeepSeek | `GeminiClient.cs`, `DeepSeekClient.cs` | **echt**, bisher nur für Zusammenfassen bzw. Bingo |
| Wissens-Nachschlagen | Browser `web-lookup.ts` + `knowledge-sources.ts` | **echte** offene Schnittstellen (80+ Spiele-Wikis, Wikipedia, Stack Exchange) |
| Websuche | – | **fehlte**: keine allgemeine Internetsuche, keine Nachrichten/Patchnotes außer Steam-Ankündigungen |
| Oberfläche | `pages/Assistant.tsx` | Verlauf ja; keine Modellwahl im Chat, kein Abbrechen, keine Quellenliste, kein Kopieren/Neu |

## 2. Architektur

**Backend = der Begleiter auf deinem PC** (nicht Vercel). Begründung:
- Er ist bereits ein serverseitiges Backend mit Anmeldung, Geräte-Rechten, Ratenbegrenzung und verschlüsselter Schlüsselablage (Windows-DPAPI).
- Eine Vercel-Funktion wäre ein öffentlicher Endpunkt mit deinem Anthropic-Schlüssel – sie bräuchte eigene Anmeldung und Missbrauchsschutz, die Schlüssel lägen bei einem Drittanbieter, und es gibt dafür weder Zugang noch Schlüssel in diesem Projekt. Die GitHub-Pages-Seite bleibt unverändert statisch und spricht mit dem PC wie bisher (WLAN, Tailscale oder Relay).
- Ohne PC funktioniert der Chat weiter im Browser (eingebaute Hilfe, offene Wikis) – und sagt dann, dass keine Websuche lief.

**Zentraler KI-Dienst**: `AssistantService` (Begleiter) – ein Einstieg für alle Modelle, Limits, Kosten, Fehlertexte.
**Recherche-Dienst**: `ResearchService` – eine Schnittstelle, mehrere Suchanbieter:

| Suchanbieter | Voraussetzung | Was er liefert |
|---|---|---|
| Claude-Websuche (`web_search_20250305`, Anthropic) | Claude-Schlüssel + Modus Claude | echte Websuche, höchstens 3 Suchen je Frage, Zitate mit URL, Titel, zitiertem Text, Seitenalter |
| Mojang-Patchnotes (offizieller Launcher-Feed) | – | neueste Minecraft-Vollversion und Vorabversion (Java/Bedrock) mit Datum |
| Steam-Ankündigungen (ISteamNews) | – | offizielle Ankündigungen/Patchnotes eines Steam-Spiels mit Datum |
| Offene Wikis (im Browser) | – | 80+ Spiele-Wikis, Wikipedia, Klexikon, Wikivoyage, Arqade/Super User |

Ohne Claude fasst die am PC eingerichtete KI (Ollama, Gemini kostenlos, DeepSeek) die Fundstellen zusammen – nur aus den Quellen, mit [Nummer]. Ohne KI zeigt JARVIS die beste Fundstelle wörtlich.

## 3. Entscheidung vor jeder Antwort (`web/src/lib/research-chat.ts`)

| Weg | Wann | Was passiert |
|---|---|---|
| A Wissen | stabile Wissensfrage („Unterschied RAM und VRAM“) | direkt an das gewählte Modell |
| B Recherche | Neuigkeiten, Patchnotes, Updates, Release, Version, Preis … zu einem Spiel; „Such im Internet …“; Schalter „Im Internet suchen“ | erst Erlaubnis (außer Schalter/„immer erlauben“), dann echte Suche, Antwort mit Quellen |
| C Notizen | „Wo war ich in …“, „meine Projekte“, „Was weißt du über mich“ | aus dem Spiele-Journal/JARVIS-Gedächtnis |
| D Funktion | „Starte …“, „Öffne …“ … | nur die eingebaute Funktion, Ergebnis wird geprüft (wie bisher) |
| E mehrere Schritte | „… und dann …“ | Schritte nacheinander, bei Fehler Stopp (wie bisher) |
| Rückfrage | Quest/Boss/Build ohne erkennbares Spiel | „Zu welchem Spiel?“ mit Vorschlägen – dann spoilerfrei |

„Mein Spiel“ = das zuletzt am PC gespielte Spiel (gemessene Spielzeit); unbekannt → Rückfrage.

## 4. Oberfläche

- **Modellwahl** im Chat: nur, was am PC eingerichtet ist (Automatisch, Eingebaut, lokale KI, Gemini, Claude-Modelle). Unter jeder Antwort steht das Modell, das wirklich geantwortet hat (bei Ersatzmodell mit Hinweis).
- **Schalter „Im Internet suchen“** (merkt sich das Gerät).
- **Phasen**: „Suche läuft“, „Quellen werden ausgewertet“, „Antwort wird erstellt“; mit Claude erscheint der Text **live**, während er geschrieben wird.
- **Abbrechen**: stoppt die Anfrage am PC (nur das fragende Gerät darf abbrechen); eine späte Antwort wird verworfen.
- **Quellenbereich** unter recherchierten Antworten (aufklappbar): nummeriert, anklickbar (nur https), Anbieter, Datum, zitierte Stelle, weitere nicht zitierte Treffer, gesuchte Begriffe, Suchfehler – oder „Keine Internetsuche durchgeführt“.
- **Kopieren**, **Neu erzeugen**, **Fortsetzen** unter der letzten Antwort; Verlauf bleibt im Tab, der PC hält den Gesprächskontext.
- Handy, iPad, PC: im Browser-Test ohne seitliches Scrollen geprüft.

## 5. Sicherheit

- API-Schlüssel (Anthropic, Gemini, DeepSeek) nur am PC eintragbar, verschlüsselt gespeichert, nie an den Browser, nie in Backups, nie im Code/Repo/Local Storage.
- Eingaben geprüft: Frage 3–500 Zeichen (Chat 2000), höchstens 8 Fundstellen à 1500 Zeichen, nur https-Links, Modellnamen/Engines nur aus Listen.
- Zeitlimit 120 s je Anfrage; höchstens 3 Websuchen je Frage; Monatslimits (Claude in $, inkl. 0,01 $ je Suche; Gemini/DeepSeek in Anfragen).
- Fehler an den Browser nur als verständliche Meldung (kein Stacktrace, kein Schlüssel).
- Webseiteninhalte sind Daten: Die Regeln an die KI sagen ausdrücklich, Anweisungen aus Suchergebnissen nicht zu befolgen; Links/Markup aus KI-Antworten werden entfernt, Quellennummern nur, wenn es die Quelle gibt.
- Keine fremden Schnittstellen ohne Erlaubnis: nur offizielle APIs (Anthropic, Google Gemini, MediaWiki, Stack Exchange, Steam, Mojang-Feed). Kein Scraping von Suchmaschinen, TikTok, Instagram, Reddit.

## 6. Einrichtung

1. Begleiter am PC auf 2.82.0 aktualisieren.
2. **Echte Websuche**: am PC unter KI-Assistent → Einrichten einen Anthropic-API-Schlüssel eintragen (console.anthropic.com), Modus „Claude“ wählen, Monatslimit setzen. Die Websuche muss im Anthropic-Konto erlaubt sein (Console → Settings → Capabilities, standardmäßig an).
3. **Kostenlos ohne Websuche**: Gemini-Schlüssel (aistudio.google.com) oder Ollama einrichten – dann Zusammenfassung der freien Quellen.

Umgebungsvariablen (nur für Tests/eigene Server, nicht nötig im Normalbetrieb): `PGL_MOJANG_BASE`, `PGL_STEAM_NEWS_BASE`, `PGL_STEAM_STORE_BASE`, `PGL_GEMINI_BASE`, `PGL_DEEPSEEK_BASE` lenken die jeweiligen Dienste auf Testserver um. Schlüssel werden **nicht** über Umgebungsvariablen gesetzt, sondern verschlüsselt am PC.

## 7. Tests (automatisiert)

| Fall | Test |
|---|---|
| 1 „Unterschied RAM und VRAM“ → Weg A, keine Suche | `research-chat.test.ts`, Browser-Test „KI-Chat: Weiche …“ |
| 2 „neueste offizielle Patchnotes für Minecraft“ → Suche | `ResearchTests` (Claude-Websuche mit Zitat + Datum; Mojang-Feed ohne Claude), Browser-Test |
| 3 „Neues zu meinem angegebenen Spiel“ | `research-chat.test.ts` (Weg B, „mein Spiel“ = zuletzt gespielt, sonst Rückfrage) |
| 4 „Quest spoilerfrei“ ohne Spiel → Rückfrage | `research-chat.test.ts`, Browser-Test |
| 5 Suchanbieter ohne Treffer | `ResearchTests` (leere Treffer, Suchfehler), `research-chat.test.ts` |
| 6 Schlüssel fehlt/ungültig | `ResearchTests` (401), `GeminiTests`, Modellwahl ohne Schlüssel |
| 7 Quellen widersprechen sich | `ResearchTests` (Regel an die KI, beide Quellen mit Datum im Auftrag, nur gültige Nummern) |
| 8 Abbrechen | `ResearchTests` (nur das fragende Gerät), Browser-Test (späte Antwort verworfen) |
| 9 Backend nicht erreichbar | `research-chat.test.ts` (Fehler kommt an, keine Ersatzantwort), Browser-Test ohne PC |
| 10 Handy, iPad, PC | Browser-Test mit 390×844, 820×1180, 1440×900 ohne seitliches Scrollen |

## 8. Grenzen (ehrlich)

- Eine **echte allgemeine Websuche** gibt es nur mit Claude (kostenpflichtig, ca. 0,01 $ je Suche + Tokens). Gemini-Suche ist im kostenlosen Tarif nicht enthalten, ChatGPT hat keinen kostenlosen App-Zugang.
- Ohne Claude: Nachrichten nur aus offiziellen Feeds (Minecraft, Steam-Spiele) und Wikis – andere Spiele-News (Konsolen, Epic) nicht.
- Live-Text beim Schreiben nur mit Claude; Gemini/Ollama/DeepSeek antworten am Stück (Phasenanzeige ja).
- Mit echtem Claude-/Gemini-Schlüssel wurde in der Entwicklungsumgebung nicht getestet (keine Schlüssel vorhanden) – geprüft gegen Nachbildungen der offiziellen Schnittstellen und gegen die echte Fehlerantwort von Google.
