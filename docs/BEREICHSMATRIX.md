# Bereichsmatrix: welcher Bereich ist durch welchen Test abgedeckt? (AP 09, Stand 2.88.1)

Spalte „Neu laden/Neustart“ meint: gespeichert → Seite neu laden bzw. Begleiter neu starten → Daten noch da.
Tests: `web/e2e/app.spec.ts` (Browser, echter Begleiter), `web/e2e/connection.spec.ts` (Verbindung), `web/src/lib/*.test.ts` (Logik), `companion/tests/*` (Begleiter).

| Bereich | Browser-Test (Titel gekürzt) | Neu laden/Neustart geprüft | Lücke |
|---|---|---|---|
| Home | „PC-Ansicht zeigt den echten Zustand“; „Leiste bearbeiten“; „PC aus: App öffnet trotzdem …“ | ja (Leiste, PC aus) | Home-Widgets anordnen: nur über „Widget-Baukasten“ |
| Spiele | „Programm am PC freigeben und vom Handy starten“; „Globale Suche findet das Spiel“ | Start ja | Filter/Sortierung (Name, Zuletzt, Hinzugefügt, Bewertung) ohne eigenen Test |
| Apps / Programmbibliothek | „Programme: installierte Apps automatisch anzeigen …“ | – | Hinzufügen/Entfernen von Hand nur indirekt |
| Favoriten | im Plugin-Test „Als Favorit markieren / Favorit entfernen“ (Zeile ~336) | – | Favorit bleibt nach Neustart: nicht eigens geprüft |
| Zuletzt verwendet | – | – | **Lücke**: kein Browser-Test für „Zuletzt“ (Sortierung/Liste) |
| Gaming-Profile | „Tastenbelegung: Profil für ein Spiel …“; „Automatisierungen …“ | ja (auf dem PC gespeichert) | Profil-Umschaltung (Auto-Wechsel) nur im Begleiter-Test |
| Soundboard | Offline-Sound-Test (Sound vormerken → PC übernimmt), Plugin „Sound-Pad“ | ja (Vormerkung kommt nach dem Koppeln an) | Lautstärke/Einzel-Stopp nicht eigens |
| Design-Editor | „Design wird gespeichert und übersteht das Neuladen“; „KI-Design-Editor …“; „Designs: schlichte Themes …“; „Cartoon-Hintergrund …“ | ja | – |
| Audio-Einstellungen | „PC-Steuerung und Leistungsanalyse“ (nur Anzeige); Begleiter-Tests Audio | teilweise | **Lücke**: Ausgabegerät/Testton im Browser nicht prüfbar ohne Windows |
| Verbindung & Sicherheit | `connection.spec.ts` (16 Tests), „Datenschutztaste“, „Widerrufenes Gerät …“, „Zugangscode …“ | ja | echte Netze/Geräte: offen (siehe Plan Block 2) |
| Backup | „Auswertungen …“ prüft nur das Datenzentrum (öffnet fehlerfrei); Begleiter-Tests für Wiederherstellungspunkte | Begleiter ja | **Lücke**: Browser-Test „Wiederherstellungspunkt erstellen → ändern → wiederherstellen“ fehlt |
| JARVIS | 12 Browser-Tests (Gedächtnis, Challenge, Spielzeit, Quest-Coach, KI-Chat, Router, Insel, Recherche) | ja (Gedächtnis, Router) | echte Schlüssel/Modelle: offen (Block 2) |
| Auswertungen | „Auswertungen: drei Reiter laden …“ (neu 2.88.1) | – | Werte mit echten Spieldaten: offen |

## Ergebnis
Lücken, die in der Cloud schließbar sind: **Zuletzt/Filter/Sortierung der Spielebibliothek**, **Favorit nach Neuladen**, **Backup-Wiederherstellungspunkt im Browser**. Diese drei bleiben als eigene Arbeitspakete (AP 09a–c) im Plan.

## Master-Prompt 2 (Aufgabe #66, 28 Funktionen) – Ist-Abgleich aus dem Änderungsprotokoll (AP 10)
Der Wortlaut der 28 Funktionen steht **nicht im Repository** (er stammt aus einer früheren Nachricht des Nutzers). Aus `CHANGELOG.md` lässt sich nur ablesen, welche Nummern schon ausgeliefert wurden:

| Nummer | Ausgeliefert in | Inhalt laut Changelog |
|---|---|---|
| F5, F18, F19, F20, F25, F26, F27, F28 | 2.53.0 | Jahresrückblick, Leistungsarchiv, Startseiten teilen, Wiki-Links, Datenzentrum, Suche, Spielstil |
| F6–F10 | 2.48.0 | Kreativ-Studio (Sammelkarten, Abzeichen, Poster, Banner, Ausstellung) |
| F11–F17, F24 | 2.51.0 | Wunschliste+, Releases, Events, Patch-Erklärer, Faktencheck, Barrierefreiheit, Editionen, Empfehlungen |
| Medien (2.42), installierte Spiele (2.43), Home-Widgets (2.45) | 2.42–2.45 | Teil von Stufe 1–2 |
| **F1–F4, F21–F23** | unklar | Namen unbekannt, weil der Prompt nicht im Repo steht |

**Nächster Schritt:** Der Nutzer legt den Text von Master-Prompt 2 in `docs/` ab (oder fügt ihn in den Chat ein); danach wird je Funktion „vorhanden / teilweise / fehlt“ entschieden. Bis dahin ist Aufgabe #66 nicht planbar.
