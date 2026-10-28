# JARVIS Gaming Intelligence – Stand und Plan

Stand: 2.64.0 (2026-10-28). Diese Datei hält fest, was umgesetzt und getestet ist, welche Quellen benutzt werden und was noch fehlt.

## 1. Bestandsaufnahme (vor 2.64.0)
Folgendes war schon vorhanden und wird weiterverwendet:
- **Steam-Verknüpfung** mit eigenem Web-API-Schlüssel: liefert `playtime_forever` je Spiel.
- **Gaming-Verlauf:** Start, Ende und Dauer jeder Sitzung, die der Begleiter gemessen hat.
- **Spiele-Journal:** Sammlungen auf dem Gerät, die über den PC abgeglichen werden (`journal.pull` / `journal.push`).
- **Zeit-Finder** (2.39).
- **Deal Radar** mit Zielpreisen.
- **Welten und Bauprojekte** für Minecraft (2.40).
- **Bingo** mit Internet-Nachfrage (2.58–2.63).

## 2. Quellen – was erlaubt und nutzbar ist

| Quelle | Wofür | Status |
|---|---|---|
| Steam, am PC `userdata/<Konto>/config/localconfig.vdf` | Gesamtspielzeit je App (Minuten), ohne Internet | **genutzt** (nur gelesen) |
| Steam Web API `GetOwnedGames` | Spielzeit, wenn der Steam-Schlüssel eingetragen ist | **genutzt** (bestehende Verknüpfung) |
| Gaming-Verlauf des Begleiters | gemessene Sitzungen (auch für Spiele, die nicht auf Steam sind) | **genutzt**; laufende Sitzungen zählen höchstens 12 h |
| IGDB „Time to Beat“ (offizielle API, Twitch-Anmeldung) | Durchschnitt Hauptstory, mit Nebenaufgaben und 100 %, Anzahl der Spieler | **genutzt**, nur mit eigener kostenloser Twitch-Anwendung; das Geheimnis liegt nur auf dem PC |
| Eigene Angaben | Fortschritt %, eigene Spielzeit (z. B. Konsole), eigene Dauer | **genutzt**, als „deine Angabe“ gekennzeichnet |
| HowLongToBeat | – | **nicht genutzt**: blockiert automatische Abrufe (403), kein offizielles API |
| Google | – | **nicht genutzt**: kein Scraping; die Custom Search API nimmt keine neuen Kunden an |
| Xbox-Spielzeit | – | **nicht verfügbar**: keine öffentliche Schnittstelle ohne Microsoft-Anmeldung. Dafür gibt es das Feld „Eigene Spielzeit“ |

Jeder Wert wird mit Quelle und Datum gespeichert (`source`, `updatedAt` / `fetchedAt`).

## 3. Aufbau
- **PC (Begleiter):** `PlaytimeService`.
  - RPC `playtime.status` (Ansehen).
  - RPC `playtime.lookup` (Ansehen).
  - RPC `playtime.configure` (nur Admin am PC selbst).
  - Durchschnittsdauern werden 7 Tage in `playtime.json` zwischengespeichert. Das Geheimnis ist DPAPI-geschützt und wird nie zurückgegeben.
- **Website:**
  - `lib/playtime.ts` erkennt Absicht, Schätzung, Tage und Fristen.
  - `lib/playtime-chat.ts` baut die JARVIS-Antwort.
  - `components/playtime-tab.tsx` ist der Reiter Spiele-Journal → Spielzeit.
- **Geräteübergreifend:** Journal-Art `playtime`, abgeglichen über den PC. Auf dem Gerät liegen keine Schlüssel.
- **Ohne PC:**
  - Es gelten die gespeicherten Werte mit Datum.
  - „Vom PC aktualisieren“ ist abgeschaltet.
  - Fortschritt und eigene Angaben bleiben änderbar.

## 4. Schätzregeln (keine erfundenen Werte)
- **Mit Fortschritt:** Ausgangswerte sind Durchschnitt × Rest und dein eigenes Tempo (Spielzeit ÷ Fortschritt, erst ab 5 %). Die Spanne ist ±15 %.
  - Liegen beide Werte mehr als Faktor 1,6 auseinander, zählt dein Tempo, und der Durchschnitt wird genannt.
- **Ohne Fortschritt:** Durchschnitt minus Spielzeit, Spanne 60–140 %. Das ist als „grob“ gekennzeichnet und mit der Bitte um deinen Fortschritt versehen.
  - Ist die Spielzeit schon größer als der Durchschnitt, gibt es keine Zahl.
- **Nur Durchschnitt:** Gesamtdauer ±15 %.
- **Nichts Verlässliches:** keine Zahl, dafür die Angabe, was fehlt.
- **Weniger als 5 Spielerangaben:** wird als „unsicher“ markiert.
- **Die bisherige Spielzeit wird nie einfach abgezogen,** wenn ein Fortschritt bekannt ist.

## 5. Testszenarien (Auftrag Punkt 9)

| # | Szenario | Ergebnis |
|---|---|---|
| 1 | Gemessene Spielzeit + Durchschnitt + Fortschritt | Spanne aus Tempo und Durchschnitt – Unit-Test, Browser-Test (Mock-IGDB) |
| 2 | Spielzeit + Durchschnitt, kein Fortschritt | „grob“, Bitte um Fortschritt – Unit-Test |
| 3 | Spielzeit länger als Durchschnitt, kein Fortschritt | keine Zahl – Unit-Test |
| 4 | Keine Spielzeitquelle | nur Gesamtdauer, fehlende Angaben genannt – Unit-Test |
| 5 | Keine verlässliche Recherche | keine Zahl; unbekanntes Spiel im Browser: „IGDB kennt … nicht eindeutig“ |
| 6 | Tagesbudget / Frist | „bei 45 Min. pro Tag: …“, „Bis Freitag … pro Tag nötig“, Urteil bei bekanntem Budget – Unit-, Browser- und e2e-Test |
| 7 | Handy ohne PC | gespeicherte Werte mit Datum, Banner, Aktualisieren aus – Browser-Test (gehostete Seite) |
| 8 | Verbindung bricht während der Frage ab | Hinweis „Verbindung … abgebrochen – das sind die gespeicherten Werte“ – Browser-Test (Begleiter beendet) |
| 9 | Zweites Gerät | Fortschritt und Werte erscheinen über den PC – Browser-Test |
| 10 | Löschen | Eintrag weg (Gerät und PC beim Abgleich) – Browser- und e2e-Test |

Nicht testbar hier: echte IGDB-Antworten (es gibt keine Twitch-Anwendung in dieser Umgebung; getestet mit einem Mock in genau dem API-Format) und Steams `localconfig.vdf` auf einem echten Windows-PC (getestet ist der Parser mit dem echten Dateiformat).

## 6. Weitere Funktionen A–J – noch offen
Diese Punkte sind **noch nicht umgesetzt**. Für jeden steht, worauf er aufbauen kann:
- **A Zeitplaner:** Zeit-Finder und Kalender plus die Spielzeitanalyse.
- **B Fortschrittsassistent:** Journal „Wo war ich?“ und die Fortschrittsangabe.
- **C Questplaner:** fehlt noch; braucht eigene Listen, da es keine erlaubte Quest-Datenquelle gibt.
- **D 100-%-Planer:** Steam-Erfolge (vorhanden) und Dauer „100 %“.
- **E Problemdiagnose:** Fehlerberichte je Spiel und Kompatibilitäts-Check (vorhanden).
- **F Mods:** Mod-Ordner und Sicherungen (vorhanden).
- **G Koop:** Gruppen-Finder und Gaming-Abend (vorhanden).
- **H Berater:** die gespeicherten Daten sind schon jetzt sichtbar, änderbar und löschbar (Spielzeit-Reiter).
- **I Preise, Updates und News:** Deal Radar mit Alarm nur nach Einrichten (vorhanden).
- **J Minecraft:** Welten und Bauprojekte (vorhanden).
- **Allgemeine Websuche in JARVIS:** nur über eine erlaubte API mit eigenem Schlüssel (z. B. Brave Search), noch nicht eingebaut.
