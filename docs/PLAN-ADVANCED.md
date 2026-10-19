# Plan: Erweiterte Funktionen (Master-Prompt „Advanced Features, Performance, Cross-Platform & Complete Integration“)

Eingegangen am 19.10.2026, **noch nicht begonnen**. Wird nach Version 2.5.0 (Update-Wächter, Benachrichtigungen, Spielmodus für Programme, Messwerte abschaltbar) umgesetzt. Der Prompt endete bei Punkt 23 („Ein Spielstart kann eine Szene, ein Theme, ein Fenster-Layout un…“) – der Rest fehlt noch.

Grundregeln aus dem Prompt: bestehendes Projekt weiterentwickeln, nichts doppelt bauen, keine Attrappen, keine erfundenen Testergebnisse oder Kompatibilitätsangaben, Abhängigkeiten von Hardware/Treibern/Diensten prüfen und dokumentieren.

Erste Einordnung gegen den Stand 2.4.0 (vor der eigentlichen Analyse, Spalte „Stand“ wird bei der Umsetzung genau geprüft):

| # | Funktion | Stand 2.4.0 (erste Einordnung) |
|---|---|---|
| 4 | Achievement-System für den Launcher | teilweise: GameQuest hat 8 Erfolge zu Spielzeit/Matches, keine für Launcher-Aktionen (Profil angelegt, Gerät gekoppelt …) |
| 5 | Dynamische Gaming-Themes je Spiel | teilweise: Themes/Design-Editor vorhanden, Profil kann Layout wechseln; kein Theme-Wechsel je Spiel |
| 6 | Backlog-Manager (Status, Prioritäten, Zufallsauswahl) | teilweise: Bibliothek mit Favoriten, Bewertung, Notizen, Kategorien; Wunschliste im Deal Radar; kein Status/Backlog/Zufall |
| 7 | Gaming-Aktivitätsstatus | teilweise: laufendes Spiel wird erkannt und angezeigt; keine Freigabe nach außen |
| 8 | Screenshot- und Clip-Bibliothek | fehlt (Aufnahme über OBS/Anbieter vorhanden, keine Bibliothek) |
| 9 | RGB-Beleuchtungszentrale | fehlt – abhängig von Hersteller-SDKs (z. B. OpenRGB-Server), Machbarkeit prüfen |
| 10 | Controller-Zentrale | fehlt – Windows-APIs (XInput/GameInput/HID) prüfen |
| 11 | Fenster- und Monitor-Layouts | fehlt – Windows-APIs (EnumDisplayMonitors, SetWindowPos) |
| 12 | Mod- und Add-on-Verwaltung | fehlt – nur für Spiele mit dokumentiertem Mod-Ordner sinnvoll |
| 13 | Spiele-Update- und Speicherübersicht | teilweise: Speicher je Laufwerk und je Spiel (Speicher-Ansicht) vorhanden; keine Update-Infos |
| 14 | Sprachsteuerung | teilweise: Spracheingabe im KI-Assistenten (Browser), Befehle lokal; keine Bestätigung für Systemaktionen nötig, da der Assistent keine ausführt |
| 15 | Mini-App- und Widget-Marktplatz | weitgehend: Widget-Baukasten, Plugin-Katalog mit Widgets; Notizen-/Musik-Widgets prüfen |
| 16 | Gaming-Kalender | fehlt |
| 17 | Lokale Dateiübertragung | teilweise: Sound- und Backup-Upload; kein allgemeiner Datei-Austausch |
| 18 | Spiele-Kompatibilitätsberater | fehlt – Datenquelle für Systemanforderungen nötig (z. B. Steam-Shop-Angaben), ehrlich als „Angabe des Shops“ |
| 19 | Gaming-Szenen | teilweise: Quick Actions mit Schritten, Profile; Szenen = Erweiterung um Layout/RGB/Widgets, Fortschritt, Abbruch, Wiederherstellen |
| 20 | Gaming-Statistik-Karten | teilweise: Gaming-Verlauf mit Statistik; kein Export als Bild/PDF |
| 21 | Lokaler Mehrgeräte-Modus (mehrere PCs) | teilweise: mehrere PCs in der Web-App (PC wechseln); prüfen: Ziel-PC vor jeder Aktion sichtbar |
| 22 | Desktop-Panel und Gaming-Overlay | weitgehend: Overlay (Game-Bar-Stil) und Desktop-Widgets vorhanden; prüfen: Tastatursteuerung, Transparenz |
| 23 | Zentrale Integration | Ereignis-System über Automatisierungen vorhanden; Rest des Prompts fehlt |
