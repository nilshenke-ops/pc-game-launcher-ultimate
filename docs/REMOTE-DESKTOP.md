# Remote Desktop – PC-Bildschirm live auf iPhone und iPad

Stand: Version 2.36.0. Diese Anleitung beschreibt, was tatsächlich eingebaut ist, wie du es einrichtest und wo die Grenzen liegen.

## 1. Was die Funktion kann

- Der **echte Windows-Bildschirm** deines PCs erscheint live in der Web-App (Menü **Steuerung → Remote Desktop**).
- Bedienung per **Touch-Maus** oder **Touchpad-Modus**, mit **Bildschirmtastatur** (Umlaute, Sonderzeichen, Strg/Alt/Umschalt/Windows, Tastenkombinationen), mit **Maus und Tastatur** am Computer-Browser.
- **Zoom** 1×/2×/3×, **Pause**, **Vollbild** (wo der Browser es erlaubt), **gemessene** Bildrate, Datenrate und Antwortzeit, **Qualität** automatisch oder fest.
- Funktioniert mit **allen** Programmen auf dem Desktop (Steam, Xbox-App, Discord, Browser, Explorer, Spiele im Fenster) – es ist keine App-Liste, sondern normale Windows-Eingabe.

## 2. So funktioniert es (einfach erklärt)

1. Handy/iPad und PC sind über die **bestehende, angemeldete Verbindung** des Begleiters verbunden (dieselbe wie für Spiele starten, Soundboard usw.).
2. Während einer Sitzung macht der Begleiter **Bilder des Bildschirms** (Windows-Bildschirmkopie inkl. Mauszeiger), verkleinert sie und schickt sie als **JPEG**.
3. Das Handy zeigt das Bild an und schickt **eine Bestätigung pro Bild** zurück – zusammen mit deinen Berührungen und Tasten.
4. Der Begleiter schickt erst dann das nächste Bild, wenn höchstens zwei unterwegs sind. Bei langsamer Leitung wird es also **langsamer, staut sich aber nie**. In „Automatisch“ wird das Bild bei schlechter Antwortzeit kleiner und gröber, bei guter wieder schärfer.
5. Unverändertes Bild wird nicht erneut geschickt; bei Stillstand nimmt der PC nur noch 4 Bilder pro Sekunde auf (spart Leistung, wenn nebenbei ein Spiel läuft).
6. Deine Eingaben werden am PC mit **SendInput** ausgeführt – genau wie von einer echten Maus/Tastatur. Text wird als Unicode-Zeichen getippt, deshalb funktionieren **Umlaute unabhängig vom Tastaturlayout**.

**Warum kein WebRTC/Video-Codec?** Für H.264/WebRTC bräuchte der Begleiter eine zusätzliche native Codec-Bibliothek und für „unterwegs“ einen TURN-Server (meist kostenpflichtig). Beides lässt sich ohne Windows-Rechner hier nicht bauen und testen. Die gewählte Lösung braucht **keinen zusätzlichen Server, keine Kosten** und läuft über jede Verbindung, die du schon hast. Nachteil: mehr Daten und etwas weniger flüssig als ein Video-Stream. Ein späterer Umstieg auf WebRTC ist möglich, ohne die Bedienung zu ändern.

## 3. Einrichten (einmalig)

1. **Begleiter auf dem PC** installieren bzw. aktualisieren (Version 2.36.0 oder neuer): Webseite → Updates & Versionen → „Begleiter herunterladen“, oder im Begleiter „Jetzt aktualisieren“.
2. **Handy/iPad koppeln** (falls noch nicht geschehen): am PC im Begleiter → *Gerät koppeln* → *Neuen Code erzeugen* → QR-Code mit dem Handy scannen (oder Code + PC-Adresse eintippen) → am PC *Erlauben*. Der Code gilt nur kurz und nur einmal.
3. **Remote Desktop am PC erlauben:** im Begleiter-Fenster → *Remote Desktop* → **„Remote Desktop erlauben“** einschalten. Das geht aus Sicherheitsgründen **nur direkt am PC**. Dort stellst du auch die längste Sitzungsdauer (Standard 60 min) und das Ende ohne Eingabe (Standard 15 min) ein.
4. **Recht für das Gerät geben:** am PC → *Geräte* → dein iPhone/iPad → *Bearbeiten* → **„Bildschirm ansehen“** (nur sehen) oder **„Fernsteuern“** (sehen und steuern) ankreuzen → *Speichern*. Neue Geräte bekommen diese Rechte nie automatisch.

## 4. Benutzen auf iPhone und iPad

1. Web-App öffnen → **Steuerung → Remote Desktop** → **Verbinden**.
2. Am PC erscheint oben eine Leiste **„iPad steuert diesen PC – Beenden“** und eine Benachrichtigung. Die Leiste ist im übertragenen Bild ausgeblendet, am PC aber immer sichtbar.
3. Gesten **Touch-Maus**: tippen = Klick · zweimal tippen = Doppelklick · gedrückt halten = Rechtsklick · halten und ziehen = Ziehen (Fenster verschieben) · wischen = scrollen · mit zwei Fingern tippen = Rechtsklick.
4. Gesten **Touchpad**: Finger bewegen = Zeiger bewegen · tippen = Klick am Zeiger · zwei Finger = scrollen · tippen und gleich wieder halten = Ziehen.
5. Leiste: **Tastatur** (mit Strg/Alt/⇧/Win zum Antippen, dann Taste = Kombination; dazu Esc, Tab, Enter, ⌫, Entf, Pfeile, Pos1/Ende, Bild↑/↓, F1–F12, Strg+C/V/X/Z/A, Alt+Tab, Win+D, Win+E, Task-Manager) · **Rechtsklick** (nächstes Tippen ist ein Rechtsklick) · **Loslassen** (falls eine Taste/Maustaste hängt) · **Zoom** · **Pause** · **Qualität** · **Vollbild** · **Trennen**.
6. Wechselst du die App oder sperrst du das iPad, pausiert die Übertragung automatisch. Bei einem kurzen Abbruch verbindet sich die Seite von selbst neu (abschaltbar).
7. **Tipp iPhone:** Webseiten dürfen dort kein echtes Vollbild. In Safari *Teilen → Zum Home-Bildschirm* – dann läuft die App ohne Adressleiste. Querformat gibt mehr Platz.

Die Einstellungen (Qualität, Bildrate, Breite, Steuerung, Leiste, Vollbild, automatische Wiederverbindung) werden **auf dem Gerät** gespeichert und gehen auch ohne PC. Die Einstellungen am PC (erlauben, Dauer) gibt es nur am PC.

## 5. Im WLAN und von unterwegs

- **Im selben WLAN:** Handy öffnet `http://<PC-Adresse>:8787` (steht unter „Gerät koppeln“). Direkte Verbindung, am schnellsten.
- **Von unterwegs:** nur über das, was du eingerichtet hast – **Tailscale Funnel** oder **Cloudflare Tunnel** (kostenlos, https) oder ein **eigenes Relay** auf einem Server (siehe INSTALLATION.md). Es gibt **keine** offene Portfreigabe und **kein** vom Projekt betriebenes Relay. Die Seite zeigt an, ob „direkt im WLAN“, „über den Tunnel“ oder „über das Relay“ verbunden ist.
- Die feste Webseite **github.io** kann aus Sicherheitsgründen (https) nicht direkt auf `http://192.168…` zugreifen – von dort klappt es nur mit Tunnel/Relay.
- Über das Internet ist die Bildrate geringer (mehr Daten pro Bild als bei Video). „Wenig Daten“ oder „Automatisch“ wählen.

## 6. Sicherheit und Datenschutz

- Aus, bis du es **am PC** erlaubst; nur Geräte mit dem Recht „Bildschirm ansehen“/„Fernsteuern“; immer nur **ein** Gerät gleichzeitig.
- Am PC jederzeit sichtbar (Leiste + Benachrichtigung) und mit **„Beenden“** sofort zu stoppen; auch auf der Remote-Desktop-Seite am PC: „Sitzung beenden“.
- Endet automatisch: nach der Höchstdauer, ohne Eingabe nach der eingestellten Zeit, wenn das Gerät 20 s nicht antwortet, wenn die Verbindung abbricht, wenn das Recht entzogen oder das Gerät entfernt wird, im **Datenschutzmodus** (Notfalltaste) und wenn „Remote Desktop erlauben“ ausgeschaltet wird. Danach werden alle gedrückten Tasten und Maustasten losgelassen.
- **Keine Speicherung** von Bildschirmbildern (weder am PC noch im Relay), keine Weitergabe an Dritte, keine Shell-Befehle: das Gerät darf nur Mausbewegungen, Klicks, Scrollen, Text und eine feste Liste von Tasten senden. **Strg+Alt+Entf** ist gesperrt.
- Sperrbildschirm, Anmeldung und Benutzerkontensteuerung (sichere Anzeige) werden **nicht** übertragen – die App sagt das, statt ein altes Bild zu zeigen.

## 7. Grenzen (ehrlich)

- **Ton** wird noch nicht übertragen.
- Programme, die **als Administrator** laufen, nehmen von Windows aus keine Fern-Eingaben an (Windows-Schutz „UIPI“).
- Spiele im **exklusiven Vollbild** und geschützte Videos können **schwarz** erscheinen → im Spiel „Randloses Fenster“ wählen. Spiele mit **Anti-Cheat** sind evtl. nicht steuerbar; das wird bewusst nicht umgangen.
- Kein Mehrfinger-Zoom (Zoom über die Leiste), keine Bildschirmauswahl während der Sitzung (vorher in den Einstellungen wählen).
- Nicht als Spiele-Streaming gedacht (dafür: Steam Link / Moonlight).

## 8. Was getestet ist – und was nicht

**Getestet** (ohne Windows, mit der Entwickler-Testquelle des Begleiters, die ein als „Testbild – kein echter Bildschirm“ gekennzeichnetes Bild liefert und Klickpositionen einzeichnet):
- C#: Rechte und Freigabe, nur ansehen vs. steuern, Bilder mit Flusskontrolle, Eingaben am richtigen Punkt, abgelehnte Eingaben (Strg+Alt+Entf, unbekannte Tasten, zu viel/zu lang, ungültige Position), Pause, ein Gerät gleichzeitig, alle Arten des Beendens, Zeitlimits.
- Browser (Chromium als iPad, iPhone quer, PC): Verbinden, Tippen/Klicken landet pixelgenau, Rechtsklick, Text mit Umlauten, Strg+C, Strg (Leiste) + z = Strg+Z, Pause, Trennen; E2E mit echt gekoppeltem Handy (Recht am PC geben, Tippen, am PC beenden).
- Leistung (Testquelle, Linux): siehe docs/PERFORMANCE.md.

**Nicht getestet** (braucht deinen Windows-PC): die echte Windows-Bildschirmaufnahme (GDI + JPEG), SendInput am echten Desktop, die Leiste am PC, Mehrmonitor, Sperrbildschirm-Erkennung, Bildrate/CPU auf dem HP Victus, Safari auf echtem iPhone/iPad.

## 9. Fehlerbehebung

| Anzeige | Was tun |
|---|---|
| „Begleiter nicht erreichbar“ | PC an? Begleiter läuft (Symbol im Infobereich)? Gleiches WLAN? Von unterwegs: Tunnel/Relay aktiv? |
| „Am PC ausgeschaltet“ | Am PC: Remote Desktop → „Remote Desktop erlauben“. |
| „Diesem Gerät fehlt das Recht“ | Am PC: Geräte → Gerät → „Bildschirm ansehen“/„Fernsteuern“ → Speichern. |
| „Gerade ist … verbunden“ | Am PC die andere Sitzung beenden oder warten. |
| Schwarzes Bild im Spiel | Spiel auf „Randloses Fenster“ stellen. |
| Klicks wirken in einem Programm nicht | Läuft es als Administrator? Dann geht Fernsteuerung dort nicht. |
| „Windows zeigt gerade den Sperrbildschirm …“ | Am PC entsperren bzw. die Sicherheitsabfrage bestätigen. |
| Ruckelt | „Wenig Daten“ wählen, Bildbreite verringern, im WLAN statt unterwegs nutzen. |
| Taste hängt | „Loslassen“ in der Leiste. |
