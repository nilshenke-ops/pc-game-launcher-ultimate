# Kostenlose KI einrichten – Anleitung für iPad und Windows-PC

JARVIS fragt kostenlose KI-Dienste in dieser Reihenfolge: **OpenRouter → Groq → Pollinations → Ollama**. Ist einer voll oder gestört, fragt er den nächsten. Es wird nie etwas bezahlt: nur kostenlose Modelle, kein Aufladen, kein bezahlter Ausweich. Ist nichts erreichbar, sagt JARVIS „Momentan ist keine kostenlose externe KI erreichbar.“ und antwortet mit dem eingebauten Assistenten.

## Wo trage ich den OpenRouter-Schlüssel ein?

**JARVIS-Seite → Karte „KI-Verwaltung“ → Anbieter „OpenRouter“ → „Einrichten“ → Feld „OpenRouter-Schlüssel“ → „Speichern & testen“.**
Dasselbe geht in der Dynamic Island: Reiter **JARVIS** → ganz unten „KI-Verwaltung“. Auf dem iPad, dem iPhone und am Windows-PC sieht es gleich aus.

## Auf dem iPad (oder iPhone)

1. Der Windows-PC muss an sein, und die Website muss mit ihm verbunden sein (Verbinden-Seite, QR-Code). Die Schlüssel werden auf dem PC gespeichert – nie auf dem iPad.
2. Schlüssel gibt der PC nur über eine **verschlüsselte Verbindung** an (Relay, also von außerhalb deines WLANs oder über den festen Namen) oder direkt am PC. Im Heimnetz ohne Verschlüsselung meldet die App das und bittet dich, den Schlüssel am PC einzutippen.
3. **OpenRouter** (empfohlen, zuerst):
   - Öffne openrouter.ai/keys, melde dich an (kostenlos, keine Karte nötig), tippe „Create Key“ und kopiere den Schlüssel (beginnt mit `sk-or-`).
   - In JARVIS → KI-Verwaltung → OpenRouter → Schlüssel einfügen → „Speichern & testen“. Es erscheint „Verbindung steht – Antwort von …“.
   - **Lade bei OpenRouter niemals Guthaben auf und schalte kein „Auto Top-Up“ ein.** JARVIS braucht es nicht.
   - Grenzen der Gratis-Nutzung bei OpenRouter: 20 Anfragen pro Minute und 50 pro Tag (ohne gekauftes Guthaben). Die App zeigt „Heute noch frei: …“.
4. **Groq** (zweite Wahl): console.groq.com/keys → Schlüssel (beginnt mit `gsk_`), Haken bei „Mein Groq-Konto ist im kostenlosen Tarif …“ setzen, einfügen, „Speichern & testen“. Hinterlege bei Groq kein Zahlungsmittel und wechsle nicht auf einen bezahlten Tarif.
5. **Pollinations** (dritte Wahl): nur wenn du den Haken bei „Ich stimme zu …“ setzt. Es braucht keinen Schlüssel, ist aber ein Dienst eines Dritten und kann ausgelastet sein.
6. **Ollama** (vierte Wahl): läuft auf deinem Windows-PC. Installiere Ollama (ollama.com), wähle am PC unter „KI-Assistent“ ein Modell – dann erscheint es in der KI-Verwaltung.
7. Mit den Pfeilen änderst du die Reihenfolge, mit dem Schalter schaltest du einen Anbieter ein oder aus, „Verbindung testen“ prüft ihn echt.

## Am Windows-PC

Genauso: Website öffnen (am PC mit dem Begleiter) → JARVIS → KI-Verwaltung. Der Schlüssel wird mit dem Windows-Benutzerkonto verschlüsselt gespeichert (DPAPI) und steht in keiner Datei im Klartext, nie im Browser, nie in GitHub.

## Ohne PC (iPad im Café)

Dann kann nur Pollinations antworten – und nur, wenn du es auf diesem Gerät erlaubt hast (KI-Verwaltung → „Pollinations ohne PC erlauben“). Ist der Dienst aufgebraucht, sagt JARVIS das, statt etwas zu erfinden.

## Noch zu tun (nur du kannst das)

- OpenRouter-Konto und -Schlüssel erstellen und in der KI-Verwaltung eintragen (zum Testen mit einer echten Antwort).
- Bei OpenRouter prüfen: kein Guthaben aufgeladen, „Auto Top-Up“ aus.
- Optional Groq einrichten (kostenloser Tarif) und Ollama am PC installieren.
- Den neuen Begleiter (3.2.0) auf dem Windows-PC installieren bzw. per Update holen – die Website allein reicht nicht, der PC muss die KI-Verwaltung kennen.
