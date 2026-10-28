# Nexus Gaming Hub – Ausbau um sechs Funktionen

Auftrag: „Nexus Gaming Hub Ultimate – Erweiterung um 6 intelligente Gaming-Funktionen“ (Gedächtnis, PC-Steuerung,
Challenge-Generator, KI-Design-Editor, Performance-Analyse, Soundboard). Die genannte KI ist **JARVIS**.
Dieses Dokument hält fest, was es vorher schon gab, was neu gebaut wird und was technisch nicht geht.

## 1. Bestandsaufnahme (Stand 2.72.0)

Architektur: Web-App (React/Vite/TypeScript, GitHub Pages, auch als App auf iPhone/iPad) + Windows-Begleiter (.NET 8,
läuft auf dem PC, liefert die Web-App im WLAN aus, führt Aktionen aus). Verbindung: WLAN direkt, unterwegs über
Tailscale oder ein eigenes Relay; Kopplung per QR/6-stelligem Einmalcode (läuft ab, wird nur einmal angenommen), danach
Geräte-Token pro Gerät, am PC widerrufbar, Rechte pro Gerät (ansehen / steuern / verwalten / Admin). Daten der Web-App
liegen im Browser und werden über den PC zwischen Geräten abgeglichen (Journal-Sync); Einstellungen des PCs liegen am PC.

| Funktion | Schon vorhanden | Lücke → wird gebaut |
|---|---|---|
| 1 Gaming-Gedächtnis | Spiele-Journal je Spiel: „Wo war ich?“ (Stand, Nächstes, Notizen), Zielpfade, Sammlung (offene Aufgaben/Funde), Story, Builds, Bauprojekte, Welten; JARVIS-Quest-Coach („Wo war ich in X?“, „Was als Nächstes?“, Hinweis/To-do merken, Spoiler-Stufe); Spielzeit vom PC; Bearbeiten, Löschen, Suche, Export/Import; Sync über den PC | „Merke dir, dass ich als Nächstes … (Spiel im Satz)“ dem Spiel zuordnen; „Wo war ich zuletzt in X?“, „Was sollte ich heute in X machen?“; „Alle offenen Projekte in meinen Spielen“; Gamer-Profil („Was weißt du über mich als Gamer?“, meistgespielt, zuletzt gespielt); Herkunft jeder Angabe sichtbar (vom PC gemessen / deine Eingabe / JARVIS-Vorschlag); geschaffte Challenge optional als erledigtes Ziel im Gedächtnis; letzte Spielsitzung aus dem PC-Verlauf |
| 3 PC-Steuerung | Spiele/Programme starten, laufende anzeigen, Favoriten, Quick Actions, Deck, Automatisierungen, sanftes Schließen (2.72), installierte Apps automatisch (2.70), PC-Monitor, Verbindungsstatus mit letztem Kontakt, Geräteverwaltung, Verbindungs-Check (10 Prüfungen), Remote Desktop mit Touch-Maus/Tastatur/Scrollen/Vollbild (2.36) | Steuerzentrale auf einer Seite (Status, laufend + Schließen, Favoriten, Zuletzt, Links zu Geräten/Diagnose/Remote Desktop); „Programm beenden“ direkt in der Liste der laufenden Programme (mit Bestätigung) |
| 5 Challenge-Generator + Bingo | Challenge-Generator (allgemein + aus deinen Daten) unter „Was spiele ich?“; Ultimate Bingo: 3×3/4×4/5×5, 5 Schwierigkeiten, Kategorien, geprüfter Spielekatalog, Felder ersetzen, zurücksetzen, Reihen/Spalten/Diagonalen, Speichern, Archiv, Mehrspieler, im JARVIS-Chat | Challenges im JARVIS-Chat aus demselben geprüften Katalog: Anzahl, Schwierigkeit, Kategorie, Zeit („nur 20 Minuten“), ohne Spoiler, mit Freunden, „schwieriger/leichter“, „noch eine“, „geschafft“, bewerten; erledigte und gespeicherte werden nicht wiederholt; Katalog um weitere Spiele aus dem Auftrag ergänzt |
| 6 KI-Design-Editor | JARVIS ändert Design, Farben, Leiste, Startseite per Satz (mit „Rückgängig“); Theme-Presets, Design-Profil, Atmosphären, Hintergründe | Vorschau vor dem Übernehmen (Übernehmen / Verwerfen), „ursprüngliches Design wiederherstellen“, weitere Parameter (Eckenradius, Abstände, Schriftgröße, Schaltflächengröße, Animationen) und die genannten Themes |
| 7 Performance-Analyse | Begleiter misst CPU, RAM, GPU (Auslastung, Speicher, Temperatur über nvidia-smi), Datenträger; Messwerte einzeln abschaltbar; Leistungsdaten pro Spielsitzung; Netzwerkdiagnose; Startzeit-Analyse | Programme mit dem meisten RAM/CPU (auf Anfrage, nicht dauernd), JARVIS-Fragen „Warum läuft mein Spiel langsam?“ mit Trennung Messwert/Vermutung, Vergleich zweier Sitzungen; FPS nur wenn zuverlässig messbar (sonst „nicht verfügbar“) |
| 12 Soundboard | Sounds importieren (auch vom Handy, Größe/Format geprüft, am PC gespeichert), Kategorien/Sammlungen, Favoriten, Lautstärke je Sound, Abspielen am PC, alles stoppen, Ausgabe auf ein virtuelles Kabel + Mikrofon-Durchleitung für Discord, Testton, Mikrofon-Test, Geräteprüfung | Farbe/Icon je Kachel, Zufallssound, Suche, Profile-Zuordnung prüfen; Discord-Weg verständlich als Assistent (welches Gerät wo einstellen), ohne ungefragt Windows-Einstellungen zu ändern |

## 2. Reihenfolge

1. Gaming-Gedächtnis + Challenge-Generator in JARVIS (reine Web-App, keine neue Abhängigkeit) – **2.73.0**
2. KI-Design-Editor mit Vorschau (baut auf den vorhandenen Design-Einstellungen auf)
3. PC-Steuerzentrale + Performance-Analyse (brauchen den Windows-Begleiter)
4. Soundboard-Ausbau + Discord-Assistent

## 3. Grenzen (ehrlich)

- Spielstände werden nicht ausgelesen; das Gedächtnis kennt nur, was du einträgst, was der PC misst (Spielzeit,
  Sitzungen) und was JARVIS als Vorschlag kennzeichnet.
- Ausgeschaltete PCs lassen sich über die Website nicht steuern (Wake-on-LAN nur im selben Netz und nur, wenn die
  Hardware es kann).
- Damit Discord-Mitspieler Sounds hören, braucht es ein virtuelles Audiogerät (z. B. VB-CABLE) – das installiert der
  Nutzer selbst; der Begleiter installiert keine Treiber und ändert die Windows-Standardgeräte nicht.
- iOS/iPadOS: Die Website im WLAN braucht die Erlaubnis „Lokales Netzwerk“ für Safari bzw. die Home-Bildschirm-App;
  unterwegs nur über Tailscale/Relay.
