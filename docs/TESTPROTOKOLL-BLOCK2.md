# Testprotokoll Block 2 – am echten Windows-PC und am Handy

Block 2 (AP 20–26 im `UMSETZUNGSPLAN-FABLE-5-1.md`) lässt sich **nur an deinem PC und deinen Geräten** prüfen; in der Cloud gibt es weder Windows noch Handy.
Dieses Blatt macht daraus eine Checkliste zum Abhaken. Trag bei jedem Punkt **Gerät / Version / Ergebnis** ein (ok · Fehler + was passiert ist). Fehler schickst du mir mit Screenshot – dann behebe ich sie.

**Vorab:** Am PC unter „Updates“ die neueste Version des Nexus Gaming Hub installieren (Stand: 3.19). Ist das Programm am PC älter als die Webseite, kennt es neuere Funktionen nicht (z. B. Groq, Cerebras, Mistral) – die Insel zeigt dann einen Hinweis.

| Version PC | Version Webseite | Handy/Tablet (Modell, Browser) | Datum |
|------------|------------------|--------------------------------|-------|
|            |                  |                                |       |

## AP 20 – Insel am echten PC
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Spiel im Vollbild starten, Insel einblenden | Insel liegt darüber, Spiel verliert den Fokus **nicht** (Tasten gehen weiter ins Spiel) | |
| 2 | Zwei Monitore: Insel auf dem Hauptmonitor, dann verschieben | Bleibt am gewählten Monitor, nicht halb außerhalb | |
| 3 | Windows-Skalierung 125 % und 150 % | Text nicht abgeschnitten, Fenster nicht größer als der Monitor | |
| 4 | Ruhemodus („Auf dem Desktop anzeigen“ aus/an) | Verschwindet/erscheint sofort, kein Flackern | |
| 5 | Insel antippen/anklicken, Widget wechseln, wieder zuklappen (Tipp auf die Oberkante) | Öffnet/schließt weich, keine Doppelklicks nötig | |

## AP 21 – Musik-Tanzen mit echtem Audio
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Musik (Spotify) abspielen | Figur tanzt im Takt-Bereich, nicht dauernd | |
| 2 | Stille / Pause | Figur steht, kein Dauerzappeln | |
| 3 | Nur Systemtöne (Windows-Klang, Benachrichtigung) | Figur tanzt **nicht** | |
| 4 | Spielton laut, keine Musik | Figur tanzt nicht ohne Musik | |

## AP 22 – Dauerbetrieb
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Windows neu starten | Begleiter startet von selbst (Tray-Symbol), Handy verbindet sich ohne neuen Code | |
| 2 | PC in den Ruhezustand, nach 10 Min. aufwecken | Verbindung kommt von selbst zurück (Handy zeigt „Verbunden“) | |
| 3 | Aufgabenmanager nach 1 h, 4 h, 8 h: CPU und Arbeitsspeicher des Begleiters notieren | CPU im Leerlauf nahe 0–2 %, Speicher wächst nicht stetig | 1 h: / 4 h: / 8 h: |

## AP 23 – HTTPS/Tailscale
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Handy **mit** Tailscale (VPN an): Website öffnen, per QR koppeln | Kopplung klappt über den Tailscale-Namen | |
| 2 | App schließen, Stunden später öffnen (VPN weiter an) | Noch gekoppelt, verbindet sich selbst | |
| 3 | VPN aus: Website öffnen | Steht „Du musst nicht neu koppeln – der PC ist nur gerade nicht erreichbar“, **keine** neue Kopplung nötig | |
| 4 | VPN wieder an | Nach kurzer Zeit automatisch verbunden | |
| 5 | Kopplung schlägt fehl (z. B. VPN aus beim Scannen) | Knopf „Im WLAN beim PC koppeln“ erscheint und funktioniert (selbes WLAN) | |

## AP 24 – JARVIS mit echten Schlüsseln
Schlüssel **nur am PC** eintragen, nie im Chat.
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Je KI (OpenRouter, Groq, Cerebras, Mistral): „Speichern & testen“ | „Verbindung steht – Antwort von …“ | |
| 2 | Falscher Schlüssel | Klare Meldung „Das sieht nicht nach einem … aus“ / „abgelehnt“ | |
| 3 | Eine KI am Limit (viele Fragen schnell) | JARVIS springt zur nächsten, Antwort nennt, wer geantwortet hat | |
| 4 | Internet am PC trennen, Frage stellen | Ehrliche Meldung, kein Hängen | |
| 5 | Frage abbrechen / dieselbe Frage doppelt senden | Nichts doppelt, Abbruch sofort | |
| 6 | „Wer spielt gegen Bayern als Nächstes?“ / „Wie wird das Wetter in <Ort>?“ | Antwort mit Quelle „Sportdaten: OpenLigaDB“ / „Wetterdaten: Open-Meteo“ | |
| 7 | „Ich wohne in <Ort>“, danach „Wie wird das Wetter morgen?“ | Wetter für den gemerkten Ort | |
| 8 | „Was war meine letzte Spielzeit?“ | Letzte Spielsitzung mit Spiel und Dauer | |

## AP 25 – JARVIS-Aktionen wirklich ausgeführt
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | „Starte <Spiel>“ in der Insel | Spiel startet sofort | |
| 2 | „Mach leiser“ / Lautstärke setzen | Windows-Lautstärke ändert sich sichtbar | |
| 3 | „Profil <Name> aktivieren“ | Profil ist aktiv | |
| 4 | Etwas Unbenanntes / Gefährliches („Lösche …“) | Wird nicht ausgeführt, JARVIS fragt nach oder lehnt ab | |

## AP 26 – Handy-Tests
| # | Prüfen | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | App stundenlang im Hintergrund, dann öffnen | Verbindet sich ohne neue Kopplung | |
| 2 | Handy neu starten | Noch gekoppelt | |
| 3 | PC aus dem Ruhezustand | Handy verbindet sich nach dem Aufwachen wieder | |
| 4 | WLAN → Mobilfunk wechseln | Verbindung über Tailscale/Relay, kein neuer Code | |
| 5 | Zum Home-Bildschirm hinzufügen (iPhone/iPad), von dort starten | Bleibt angemeldet; Spracheingabe: bei fehlender Browser-Erkennung „Bessere Spracherkennung (Whisper)“ nutzen | |
| 6 | Alle QR-Wege: PC-Seite (WLAN), Website mit Tailscale, Design-Code | Jeder Weg koppelt oder erklärt, was fehlt | |

## Was ich von dir brauche, damit der Rest weitergeht
- **Block 2 selbst:** Dieses Blatt ausfüllen (oder mir die Fehler mit Screenshot schicken). Alternativ den PC in einer Sitzung per Remote Control anhängen – dann kann ich Teile direkt dort prüfen.
- **AP 10 / 35:** Der Text von „Master-Prompt 2“ (28 Funktionen) steht nicht im Repository. Schick ihn mir, dann gleiche ich ihn Funktion für Funktion ab.
- **AP 40:** Das GitHub-Secret `PGL_UPDATE_SIGNING_KEY` ist ungültig; bis zur Erneuerung signiere ich Veröffentlichungen lokal (funktioniert).
