# Bestandsaufnahme – Nexus Gaming Hub 2.0.0 (19.10.2026)

Grundlage: Quellcode, Tests (C# 173, Web 20, E2E 20, Relay), Dokumentation und Abschlussbericht. Es zählt der Code, nicht die Beschreibung.

Was diese Prüfung **nicht** konnte: Die Windows-Teile (`Companion.Windows`: Fenster, Hotkeys, Maus-Hook, NAudio, EXE-Tausch, WebView2) laufen hier nicht. Es gibt kein Windows-System, kein Android-/iPad-Gerät, keinen Discord-Client und kein Audiogerät. Diese Teile sind deshalb höchstens „implementiert, nicht ausreichend getestet“.

## 1. Funktioniert nachweislich (automatisierte Tests)

- **Kopplung:**
  - Code mit 40 Bit, 5 Minuten gültig, nur einmal nutzbar; Bestätigung am PC.
  - Widerruf trennt laufende Sitzungen sofort.
  - Schutz gegen wiederholte Anfragen (Nonce und steigende Anfragenummern).
- **Rechte:** Rechtesystem pro Methode (`view`, `launch`, `soundboard`, `manage`, `admin`, `local`). Jede Methode muss im Protokoll stehen.
- **Signierte Updates:**
  - ECDSA-Signatur und SHA-256; gefälschte und beschädigte Downloads werden abgelehnt.
  - Signierter Plugin-Katalog.
- **Backup:**
  - Ohne Geheimnisse, Vorschau vor dem Einspielen, Teilbereiche einzeln wählbar.
  - Sicherung vor dem Überschreiben, wöchentliche Wiederherstellungspunkte.
- **Wartende Änderungen ohne PC:**
  - Werden der Reihe nach übertragen.
  - Abgelehnte Änderungen bleiben mit Grund sichtbar.
  - Sofort-Aktionen (Starten, Abspielen, Energie) werden nie gespeichert.
- **Automatisierungen:**
  - Schleifenschutz, Drosselung, Konflikterkennung.
  - Bausteine Warten und Bedingung, Verlauf, kein Doppelstart.
- **Hotkeys:** Erkennung von Doppelbelegungen und Windows-Reservierungen, Normalisierung.
- **Plugins:**
  - Paketprüfung (nur Daten- und Webdateien, kein Code auf dem PC).
  - Widget-Iframe mit `sandbox="allow-scripts"` und eigener CSP; Bridge nur mit Whitelist und Rate-Limit.
- **Leistung:** Spielmodus des Begleiters (Logik), Aufschieben von Hintergrundarbeit, Netzwerkstatistik.
- **Oberfläche:** Design mit Dunkel/Hell, Presets, eigenen Farben und Kontrastprüfung für Text auf der Akzentfarbe.

## 2. Implementiert, aber nicht ausreichend getestet

- **Ganzer Windows-Teil:**
  - Single-Instance-Mutex, Autostart (HKCU Run), globale Hotkeys, Maus-Seitentasten-Hook.
  - NAudio-Wiedergabe und Mikrofon-Durchleitung, Medientasten, Overlay- und Desktop-Widget-Fenster.
  - EXE-Tausch bei Updates und Rollback per Tray.
- **Discord-Weg** über ein virtuelles Kabel (VB-Cable): Ob andere Teilnehmer etwas hören, ist **nicht nachgewiesen**.
- **Verbindung:** Wiederverbindung nach WLAN-Ausfall (1/2/4/8/15 s, nach PC-Neustart per E2E getestet) und `op`-Kennung gegen doppelte Ausführung (Speicher nur im RAM).

## 3. Teilweise implementiert

- **Updates:** Rollback nur von Hand. Kein Erkennen eines fehlgeschlagenen Starts, kein Fortsetzen eines abgebrochenen Downloads.
- **Benachrichtigungen:**
  - Nur im Speicher (nach Neustart weg), Stummschalten nur pro Meldung.
  - Kein „gelesen“-Status, Tray-Hinweis ignoriert den Ruhemodus.
- **Monitoring:**
  - CPU, RAM, Laufwerke und GPU-Last vorhanden; VRAM und GPU-Temperatur nur mit NVIDIA.
  - Keine CPU-Temperatur, kein Netzwerkdurchsatz, keine FPS; einzelne Werte lassen sich nicht abschalten.
- **Datenschutz:**
  - Nur eine Karte in den Einstellungen, die mehrere Online-Ziele nicht nennt (Steam-CDN, Game-Pass-Katalog, Ping zu 1.1.1.1/8.8.8.8, Update-Prüfung bei GitHub Pages).
  - Das GitHub-Workflow `steam-library.yml` veröffentlicht `steam.json` öffentlich lesbar.
- **Service Worker:** Alte Builds werden nie aus dem Cache gelöscht, es gibt keinen Hinweis „neue Version – neu laden“.
- **Lange Listen** (Bibliothek, Soundboard) werden ohne Begrenzung gerendert.

## 4. Fehlt

- **Installer:** kein MSI/Inno; keine Startmenü-Verknüpfung, keine Deinstallation, keine Code-Signatur (kein Zertifikat vorhanden).
- **Spielmodus für andere Programme:** gewählte Programme beim Spielstart schließen, mit Whitelist, Vorschau und Wiederherstellung.
- **Messungen:** kein reproduzierbarer Leistungs-Testplan mit Messwerten.
- **Push:** keine Web-Push- oder native Windows-Toast-Benachrichtigungen.
- **Oberfläche:**
  - Kein „System“-Hell/Dunkel.
  - Kein Fokus-Fang in Dialogen; zu kleine Touch-Ziele (32 px).

## 5. Fehlerhaft oder Risiko (vor allem Sicherheit)

| # | Befund | Ort |
|---|---|---|
| R1 | `X-Forwarded-For`/`CF-Connecting-IP` werden von jedem Gerät geglaubt. Damit lassen sich alle Bremsen pro IP umgehen (Login, Kopplung, Verbindungen), und `LastIp` ist fälschbar. | WebHost.cs |
| R2 | Kein Host-Abgleich: DNS-Rebinding kann die nicht angemeldeten Methoden erreichen. | WebHost.cs `OriginAllowed` |
| R3 | Ein Relay mit `Origin: null` wirft in `new URL()` eine Ausnahme und bringt den Relay-Prozess zum Absturz (DoS ohne Anmeldung). | relay.ts |
| R4 | `obs.configure` braucht nur „Verwalten“. Wird die Adresse geändert, bleibt das gespeicherte Passwort erhalten, und ein Gerät könnte es an einen eigenen Rechner umlenken. | GamingServices.cs |
| R5 | Ein Gerät mit `admin` kann aus der Ferne Update-Quelle, Plugin-Katalog und erlaubte Web-Adressen ändern. Damit wären unsignierte Updates mit einem Klick möglich. | RpcApi.cs `settings.saveSecurity` |
| R6 | Wartende Änderungen mit Folgen (Plugin installieren oder aktivieren, also Rechte vergeben) werden nach dem Koppeln ohne erneute Bestätigung gesendet. | outbox-sync.ts |
| R7 | Jedes Gerät im WLAN kann mit 5 Fehlversuchen den aktiven Kopplungscode sperren. | Pairing.cs |
| R8 | Dialoge: Bei jedem Neu-Rendern springt der Fokus ins erste Feld (Tippen wird unterbrochen). | ui.tsx `Modal` |
| R9 | Monitor-Abo ohne Zähler: Schließt sich ein Widget, bekommen andere keine Live-Werte mehr. | SystemServices.cs / hooks.ts |
| R10 | Mikrofon-Durchleitung erholt sich nach dem Abziehen des Mikrofons nicht (`RecordingStopped` wird nicht ausgewertet). | NAudioEngine.cs |
| R11 | Single-Instance-Mutex nur pro Windows-Sitzung (`Local\`); zwei Benutzer kämpfen um den Port. | Program.cs |
| R12 | Relay-Verbindung: Nur die Anmeldung ist Ende-zu-Ende geschützt, der Inhalt nicht. Der Relay-Betreiber könnte mitlesen. Die Doku sagt „Ende-zu-Ende-Kopplung“, das ist missverständlich. | relay / Doku |

## Priorisierte Aufgabenliste

1. **Sicherheit:** R1, R2, R3, R4, R5, R6, R7 beheben, mit Tests. Relay-Formulierung korrigieren (R12).
2. **Stabilität und Bedienung:** R8 Dialog-Fokus und Fokus-Fang, R9 Abo-Zähler, R10 Mikrofon-Erholung, R11 globaler Mutex, Autostart-Eintrag mit veraltetem Pfad.
3. **Leistung:**
   - Haupt-Bundle verkleinern (Englisch und Demo nachladen).
   - Live-Status nicht mehr die ganze Oberfläche neu zeichnen lassen.
   - Pausen bei verstecktem Tab.
   - Service-Worker-Cache aufräumen.
   - Reproduzierbarer Messplan mit Vorher/Nachher.
4. **Datenschutz-Dokument und Doku-Korrekturen** (SECURITY, Abschlussbericht, README, Discord-Anleitung als „ungetestet“).
5. **Updates:** Erkennen eines fehlgeschlagenen Starts mit kontrolliertem Rollback.
6. **Benachrichtigungen:** gespeicherter Verlauf, gelesen/ungelesen, Kategorien, Ruhemodus auch für Tray-Hinweise.
7. **Spielmodus für andere Programme** (Whitelist, Vorschau, Wiederherstellung) und Hardware-Werte einzeln abschaltbar.
8. **Installer** (Inno Setup im Release-Workflow, Windows-Runner) – ohne Code-Signatur-Zertifikat ehrlich als unsigniert.
9. **Oberfläche:** Theme „System“, Touch-Ziele, sichtbarer Fokus in Feldern, lange Listen.
