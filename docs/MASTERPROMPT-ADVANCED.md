# Master-Prompt „Advanced Features, Performance, Cross-Platform & Complete Integration“

Originaltext wie erhalten (19.10.2026), Grundlage für docs/PLAN-ADVANCED.md.

MASTER-PROMPT: PC GAME LAUNCHER ULTIMATE – ADVANCED FEATURES, PERFORMANCE, CROSS-PLATFORM & COMPLETE INTEGRATION

1. Deine Aufgabe und das Ziel

Du bist ein erfahrener Senior Software Engineer, Windows-Entwickler, Full-Stack-Entwickler, UI/UX-Designer, Performance-Experte und Softwarearchitekt.

Ich entwickle PC Game Launcher Ultimate. Es soll sich zu einer professionellen, modernen, leistungsoptimierten Gaming-Zentrale entwickeln, über die ich meinen Windows-PC von der PC-Software, der Website sowie von meinem Handy und iPad aus bedienen kann.

Deine Aufgabe ist es, das bestehende Projekt gründlich zu analysieren, alle unten aufgeführten Funktionen mit dem vorhandenen Code abzugleichen und die fehlenden Funktionen vollständig zu implementieren.

WICHTIG:

- Arbeite mit dem bestehenden Projekt. Erstelle nicht ohne zwingenden Grund alles neu.
- Bewahre vorhandene Funktionen und kompatible Schnittstellen.
- Entwickle keine zweite Version einer Funktion, die bereits zuverlässig vorhanden ist.
- Verbessere vorhandene Funktionen nur dort, wo es sinnvoll ist.
- Implementiere neue Funktionen tatsächlich. Erstelle keine Attrappen, Demo-Schaltflächen oder bloß dekorative Oberflächen.
- Alle Funktionen müssen auf den jeweils unterstützten Plattformen sinnvoll bedienbar sein.
- Priorisiere Stabilität, Sicherheit, Performance und echte Funktionsfähigkeit.
- Erfinde keine Testergebnisse, Kompatibilitätsangaben oder Leistungsverbesserungen.
- Wenn eine Funktion von Hardware, Treibern, Windows-APIs, Hersteller-Software oder externen Diensten abhängig ist, prüfe die tatsächlichen Möglichkeiten und dokumentiere Voraussetzungen und Einschränkungen.

2. Zuerst das gesamte bestehende Projekt analysieren

Untersuche vor jeder größeren Änderung:

- Die gesamte Repository-Struktur und alle relevanten Quellcodedateien.
- Die bestehende Website und ihre Komponenten.
- Die Windows-PC-Software und den Companion-Dienst.
- Die Kommunikationsschnittstellen zwischen Website, PC und mobilen Geräten.
- Das bestehende Datenmodell, Protokolle und gespeicherte Einstellungen.
- Das Soundboard, Audio-Center, Plugin-System, Dashboard, Automatisierungen und Gaming-Profile.
- Die vorhandenen Update-, Backup-, Diagnose- und Sicherheitsmechanismen.
- Bestehende Tests, Dokumentation und bekannte Fehler.

Erstelle intern eine Funktionsmatrix mit diesen Zuständen:

1. Vollständig implementiert und getestet.
2. Implementiert, aber nicht ausreichend getestet.
3. Teilweise implementiert.
4. Nur grafisch vorhanden.
5. Nicht vorhanden.
6. Technisch nicht möglich oder nur mit Einschränkungen möglich.

Implementiere anschließend ausschließlich die notwendigen Erweiterungen und Verbesserungen.

Wenn du Zugriff auf Git hast, arbeite möglichst in einem separaten Branch und sichere den ursprünglichen Zustand. Erstelle vor riskanten Änderungen nachvollziehbare Sicherungspunkte.

3. Plattformübergreifende Architektur

Die gesamte Software muss auf einer gemeinsamen, konsistenten Architektur aufbauen.

Windows-PC

- Vollständige PC-Steuerung über die vorhandene Windows-Anwendung.
- Zuverlässige Integration mit dem Windows-System.
- Native Funktionen dort einsetzen, wo sie technisch sinnvoll sind.
- Tray-Integration und Autostart nur entsprechend den vorhandenen Einstellungen.
- Keine unnötigen Administratorrechte.
- Langfristig stabile Hintergrundausführung.

Website

- Die Weboberfläche muss eigenständig aufrufbar sein.
- Sämtliche für die Website vorgesehenen Funktionen müssen tatsächlich funktionieren.
- Die Website muss über eine sichere Verbindung mit dem PC-Companion kommunizieren können.
- Statische Hosting-Dienste wie GitHub Pages dürfen nicht als ausführende Windows-Umgebung behandelt werden.
- PC-Aktionen müssen über den installierten Companion erfolgen.

Handy und iPad

- Vollständige, responsive Bedienung der vorgesehenen Funktionen.
- Optimierte Touch-Steuerung, ausreichend große Bedienelemente und übersichtliche Navigation.
- Unterstützung moderner mobiler Browser, insbesondere Android und iPadOS/Safari.
- Optional installierbare Web-App, sofern technisch unterstützt.
- Kein unnötiger Download einer separaten App, wenn die Website die betreffende Aufgabe bereits zuverlässig erledigen kann.
- Verbindung, Synchronisierung und Fehlerbehandlung müssen auch bei mobilen Netzwerkwechseln zuverlässig funktionieren.

Gemeinsames Verhalten

Alle Plattformen müssen denselben tatsächlichen Funktionszustand anzeigen. Änderungen dürfen nicht nur lokal auf einem Gerät gespeichert werden, wenn sie eigentlich den PC oder andere Geräte betreffen.

Nutze vorhandene Schnittstellen und Datenmodelle weiter. Falls Erweiterungen am Protokoll erforderlich sind, implementiere sie rückwärtskompatibel, soweit möglich.

4. Feature: Achievement-System für den Launcher

Ergänze ein optionales eigenes Erfolgssystem.

Funktionen:

- Erfolge für selbst definierte oder sinnvoll ausgewählte Aktionen.
- Abzeichen, Fortschrittsanzeigen und Level.
- Übersicht über freigeschaltete und noch offene Erfolge.
- Statistiken und persönliche Meilensteine.
- Speicherung lokal oder in der vorhandenen sicheren Synchronisierung.
- Eigene Einstellungen zum Aktivieren und Deaktivieren.
- Keine künstliche Belastung durch ständige Hintergrundprüfungen.

Beispiele sind das erstmalige Einrichten eines Gaming-Profils, das erfolgreiche Koppeln eines Geräts oder das Erstellen einer bestimmten Anzahl von Automatisierungen.

Das System darf keine unnötigen Daten sammeln und soll keine externen Konten voraussetzen.

5. Feature: Dynamische Gaming-Themes

Erweitere das Designsystem um dynamische, spielabhängige Themes.

Funktionen:

- Themes für einzelne Spiele und Programme.
- Eigene Farbschemata, Akzentfarben, Hintergründe und Oberflächenstile.
- Automatischer Wechsel beim Start eines ausgewählten Spiels.
- Rückkehr zum vorherigen Theme nach dem Beenden.
- Manuelle Auswahl und Deaktivierung.
- Themes exportieren und importieren.
- Themes auf PC, Website, Handy und iPad möglichst konsistent darstellen.
- Einstellungen für reduzierte Animationen und ressourcenschonende Darstellung.

Verwende vorhandene Spielinformationen, sofern verfügbar. Erfinde keine offiziellen Spielgrafiken oder Logos.

6. Feature: Backlog-Manager und Spielplanung

Ergänze eine umfassende Verwaltung der persönlichen Spielebibliothek.

Mögliche Status:

- Noch spielen.
- Als Nächstes spielen.
- Gerade aktiv.
- Pausiert.
- Durchgespielt.
- Nicht mehr interessant.

Zusätzliche Funktionen:

- Eigene Wunschliste.
- Prioritäten und persönliche Notizen.
- Tags und Kategorien.
- Zufällige Auswahl aus selbst ausgewählten Spielen.
- Filter nach Status, Plattform, Kategorie und Spielzeit.
- Fortschritt und persönliche Ziele.
- Synchronisierung zwischen Geräten.
- Import und Export der Daten.

Spiele müssen nicht automatisch als durchgespielt markiert werden. Solche Zustände sollen manuell bestätigt werden können.

7. Feature: Gaming-Aktivitätsstatus

Implementiere einen optionalen Aktivitätsstatus.

Mögliche Informationen:

- Aktuell gestartetes Spiel.
- Beginn und Dauer der aktuellen Sitzung.
- Verfügbarkeit oder eigener Status.
- Optional zuletzt gespielte Titel.

Anforderungen:

- Datenschutz standardmäßig priorisieren.
- Aktivitätsfreigabe vollständig deaktivierbar.
- Keine öffentliche Freigabe ohne ausdrückliche Zustimmung.
- Keine Veröffentlichung privater Spielpfade oder anderer sensibler Daten.
- Externe Plattformintegrationen nur über offizielle oder dokumentierte Schnittstellen.
- Keine Zugangsdaten im Frontend speichern.
- Anzeige von Aktivität nur dann, wenn der tatsächliche Zustand zuverlässig ermittelt wurde.

8. Feature: Screenshot- und Clip-Bibliothek

Entwickle eine zentrale Verwaltung vorhandener Gaming-Aufnahmen.

Funktionen:

- Screenshots und Clips importieren oder aus ausgewählten Ordnern erfassen.
- Vorschau und Detailansicht.
- Gruppierung nach Spiel, Datum und Ordner.
- Favoriten, Tags und Suche.
- Öffnen des Speicherorts.
- Umbenennen und Sortieren.
- Sichere Löschfunktion mit Bestätigung.
- Optionaler Import von Aufnahmen bekannter Gaming-Plattformen.
- Unterstützung großer Mediensammlungen ohne unnötiges Laden sämtlicher Dateien in den Arbeitsspeicher.
- Lokale Dateiübertragung auf Handy und iPad über eine abgesicherte Verbindung.

Erstelle keine automatische Bildschirmaufzeichnung ohne ausdrückliche Aktivierung. Respektiere Speicherplatz, Datenschutz und Urheberrechte.

9. Feature: RGB-Beleuchtungszentrale

Implementiere eine zentrale Oberfläche für kompatible RGB-Geräte.

Mögliche Geräte:

- Tastaturen.
- Mäuse.
- Headsets.
- Mainboard- und PC-Beleuchtung.
- Weitere unterstützte Peripheriegeräte.

Funktionen:

- Erkennung kompatibler Geräte, soweit technisch möglich.
- Geräteübersicht.
- Farben, Helligkeit und verfügbare Effekte.
- Speicherung eigener Profile.
- Automatische Auswahl eines Profils beim Start eines Spiels.
- Wiederherstellung vorheriger Einstellungen.
- Statusanzeige und verständliche Fehlermeldungen.

WICHTIG:

- Prüfe die tatsächliche Unterstützung der jeweiligen Hersteller und Schnittstellen.
- Nutze vorhandene offizielle APIs oder geeignete dokumentierte Bibliotheken.
- Behaupte keine universelle Unterstützung für alle Geräte.
- Vermeide Konflikte mit bereits laufender Hersteller-Software.
- Übernimm nicht unkontrolliert die vollständige Geräteverwaltung.
- Wenn ein Gerät nicht unterstützt wird, zeige dies deutlich an.

10. Feature: Controller-Zentrale

Ergänze eine Verwaltungsoberfläche für Gamecontroller.

Funktionen:

- Erkennung angeschlossener Controller, soweit unterstützt.
- Anzeigen von Gerätename und Verbindungsstatus.
- Anzeige verfügbarer Tasten und Eingaben.
- Testansicht für Tasten, Achsen und Trigger.
- Profile und Tastenbelegungen für unterstützte Geräte.
- Spielbezogene Konfigurationen.
- Speicherung und Wiederherstellung von Profilen.
- Erkennung nicht verfügbarer Funktionen.

Vermeide Konflikte mit Steam Input, Windows und anderen Controller-Tools. Simulierte Eingaben oder Änderungen an systemweiten Controller-Einstellungen dürfen nur nach expliziter Zustimmung und mit klarer Rücksetzmöglichkeit erfolgen.

11. Feature: Fenster- und Monitor-Layouts

Implementiere eine Verwaltung von Desktop-Layouts.

Funktionen:

- Erkennung verfügbarer Monitore.
- Speichern und Wiederherstellen unterstützter Fensterpositionen.
- Vordefinierte Layouts für Gaming, Streaming, Schule und Alltag.
- Programme bestimmten Monitoren zuweisen.
- Fenstergrößen und Positionen anordnen.
- Layouts manuell starten oder an ein Spielprofil koppeln.
- Umgang mit nicht angeschlossenen Monitoren.
- Berücksichtigung unterschiedlicher Auflösungen und Skalierungen.

Die Funktion soll möglichst wenige Ressourcen verbrauchen und darf Fenster nicht unkontrolliert verschieben. Vor dem automatischen Wiederherstellen muss die Situation geprüft werden.

12. Feature: Mod- und Add-on-Verwaltung

Ergänze eine optionale Verwaltungsfunktion für Spiel-Mods und Add-ons.

Funktionen:

- Mods für unterstützte Spiele organisieren.
- Installationsordner und Versionen dokumentieren.
- Verschiedene Mod-Profile speichern.
- Konflikte und fehlende Voraussetzungen anzeigen, soweit erkennbar.
- Backups vor Änderungen.
- Wiederherstellung früherer Konfigurationen.
- Aktivieren und Deaktivieren von Mods über unterstützte Methoden.
- Import und Export von Mod-Listen.

Sicherheit:

- Keine beliebigen ausführbaren Dateien automatisch starten.
- Keine Mods ungeprüft herunterladen oder installieren.
- Keine fremden Spieldateien ohne Sicherung überschreiben.
- Vor destruktiven Änderungen eine Bestätigung verlangen.
- Nur offiziell unterstützte oder nachvollziehbar dokumentierte Installationswege verwenden.
- Bestehende Anti-Cheat- und Sicherheitsmechanismen nicht umgehen.

13. Feature: Spiele-Update- und Speicherübersicht

Erstelle eine Übersicht für installierte Spiele und deren Speicherbedarf.

Funktionen:

- Installationsordner und belegten Speicher anzeigen.
- Speicherverbrauch pro Spiel erfassen.
- Große Ordner identifizieren.
- Doppelte Dateien oder verwaiste Installationsreste nur als mögliche Kandidaten markieren.
- Verfügbare Updates anzeigen, sofern eine zuverlässige Schnittstelle existiert.
- Installationspfade öffnen.
- Sortierung nach Größe, letztem Start und Plattform.
- Warnungen bei knappem Speicherplatz.
- Schutz vor versehentlichem Löschen wichtiger Daten.

Updates müssen nicht für jede Plattform direkt verfügbar sein. Wenn keine offizielle Schnittstelle existiert, soll die Software zum jeweiligen Launcher verlinken, statt Update-Funktionen vorzutäuschen.

14. Feature: Sprachsteuerung

Implementiere eine optionale Sprachsteuerung für häufig verwendete Aktionen.

Beispiele:

- „Starte Minecraft.“
- „Öffne das Soundboard.“
- „Aktiviere mein Gaming-Profil.“
- „Zeige meine PC-Auslastung.“
- „Schalte zum nächsten Audio-Gerät.“

Anforderungen:

- Sprachsteuerung aktivierbar und vollständig deaktivierbar.
- Verständliche Anzeige des erkannten Befehls.
- Lokale Spracherkennung bevorzugen, sofern ausreichend zuverlässig und ressourcenschonend.
- Cloudbasierte Erkennung nur optional und mit klarer Einwilligung.
- Mikrofonzugriff transparent anzeigen.
- Keine dauerhafte Audioaufzeichnung ohne ausdrückliche Zustimmung.
- Kritische Aktionen wie Herunterfahren benötigen eine zusätzliche Bestätigung.
- Keine unbeschränkte Ausführung beliebiger Sprachbefehle.
- Unbekannte Befehle sicher ablehnen.

15. Feature: Mini-App- und Widget-Marktplatz

Erweitere die Oberfläche um kleine, optionale Widgets.

Beispiele:

- Uhr und Kalender.
- Notizen.
- Musiksteuerung.
- Hardwarestatus.
- Schnellzugriffe.
- Persönliche Textfelder.
- Eigene Statusanzeigen.
- Externe Datenquellen nur bei tatsächlicher Unterstützung.

Funktionen:

- Widgets hinzufügen und entfernen.
- Position und Größe ändern.
- Sichtbarkeit und Darstellung konfigurieren.
- Widgets einzeln deaktivieren.
- Eigene Layouts speichern.
- Widgets zwischen Geräten synchronisieren, sofern sinnvoll.
- Ressourcenverbrauch und Berechtigungen anzeigen.

Trenne Widgets technisch von privilegierten PC-Funktionen. Ein Widget darf nicht automatisch auf beliebige lokale Dateien, Zugangsdaten oder Systemaktionen zugreifen.

16. Feature: Gaming-Kalender

Implementiere eine Kalenderansicht für Gaming und persönliche Planung.

Funktionen:

- Geplante Gaming-Sessions.
- Eigene Termine und Erinnerungen.
- Release-Termine und Events, sofern zuverlässige Datenquellen vorhanden sind.
- Wiederkehrende Termine.
- Optionale Benachrichtigungen.
- Kalenderimport nur über geeignete, dokumentierte Schnittstellen.
- Lokale Speicherung als Grundfunktion.
- Zeitzonen und Sommerzeit korrekt behandeln.
- Synchronisierung zwischen PC und mobilen Geräten.

Der Kalender muss auch ohne externe Datenquellen sinnvoll funktionieren.

17. Feature: Lokale Dateiübertragung

Ermögliche die sichere Übertragung ausgewählter Dateien zwischen PC, Handy und iPad.

Unterstützte Anwendungsfälle:

- Screenshots und Clips übertragen.
- Sounddateien importieren.
- Konfigurationen und Profile austauschen.
- Dateien vom Handy an den PC senden.
- Übertragungsfortschritt und Dateigröße anzeigen.
- Abbrechen und Fehler erneut versuchen.
- Dateitypen und Dateigrößen validieren.
- Vorhandene Dateien beim Überschreiben schützen.
- Empfangene Dateien zunächst in einem festgelegten Bereich ablegen.
- Keine automatische Ausführung übertragener Dateien.

Sicherheit:

- Nur gekoppelte und autorisierte Geräte zulassen.
- Keine offene Dateiübertragung im öffentlichen Netzwerk.
- Zugriff auf ausgewählte Verzeichnisse begrenzen.
- Dateinamen und Pfade validieren.
- Schutz vor Pfadmanipulation und unzulässigen Dateizugriffen.
- Verbindungen authentifizieren und sensible Daten bei der Übertragung schützen.

18. Feature: Spiele-Kompatibilitätsberater

Entwickle eine Übersicht, die installierte oder ausgewählte Spiele mit den verfügbaren PC-Komponenten vergleicht.

Mögliche Informationen:

- CPU.
- GPU.
- RAM.
- VRAM, sofern zuverlässig verfügbar.
- Freier Speicherplatz.
- Betriebssystem.
- Bekannte Mindest- und empfohlene Systemanforderungen.

Funktionen:

- Vergleich von Mindest- und empfohlenen Anforderungen.
- Anzeige möglicher Engpässe.
- Hinweise auf fehlenden Speicher oder nicht erfüllte Voraussetzungen.
- Kennzeichnung unsicherer oder veralteter Daten.
- Verlinkung zu offiziellen Informationsquellen.
- Manuelle Auswahl von Spielen, auch wenn sie nicht installiert sind.

Erfinde keine Leistungswerte. Ein Vergleich der Systemanforderungen ist keine Garantie für eine bestimmte FPS-Zahl. Unbekannte Hardwareinformationen müssen als unbekannt gekennzeichnet werden.

19. Feature: Gaming-Szenen

Ergänze ein übergreifendes Szenen-System.

Eine Szene fasst mehrere vorhandene Funktionen zu einer benutzerdefinierten Aktion zusammen.

Beispiel „Rennspiel“:

1. Gewünschtes Spiel starten.
2. Gaming-Profil aktivieren.
3. Passendes Audio-Gerät auswählen.
4. Unterstützte RGB-Einstellungen laden.
5. Fenster-Layout wiederherstellen.
6. Gewünschte Widgets anzeigen.

Beispiel „Streaming“:

1. Streaming-Programme öffnen.
2. Fenster positionieren.
3. Audio-Konfiguration laden.
4. Benötigte Hotkeys aktivieren.

Anforderungen:

- Szenen frei erstellen, bearbeiten, kopieren und löschen.
- Einzelne Aktionen aktivieren oder deaktivieren.
- Ausführungsreihenfolge festlegen.
- Fortschritt und Fehler anzeigen.
- Abbruch ermöglichen.
- Vorherige Einstellungen bei Bedarf wiederherstellen.
- Szenen zwischen Geräten exportieren und importieren.
- Keine Aktion ohne die erforderlichen Berechtigungen ausführen.

20. Feature: Persönliche Gaming-Statistik-Karten

Erstelle optional gestaltete Zusammenfassungen von Gaming-Sessions und Zeiträumen.

Mögliche Inhalte:

- Am häufigsten gespielte Spiele.
- Gesamte Spielzeit.
- Sitzungen pro Zeitraum.
- Persönliche Meilensteine.
- Verfügbare Performance-Messwerte.
- Vergleich ausgewählter Zeiträume.

Funktionen:

- Verschiedene Layouts.
- Export als Bild oder PDF, sofern technisch sinnvoll.
- Optionaler Export als Datendatei.
- Datenschutzfreundliche lokale Auswertung.
- Auswahl der enthaltenen Informationen.
- Keine automatische Veröffentlichung.
- Keine irreführenden Statistiken bei fehlenden Daten.

21. Feature: Lokaler Mehrgeräte-Modus

Ermögliche die Verwaltung mehrerer eigener Windows-PCs im selben Netzwerk.

Funktionen:

- Mehrere autorisierte PCs registrieren.
- Geräte individuell benennen.
- Online- und Offline-Status anzeigen.
- Den Ziel-PC vor jeder Aktion klar anzeigen.
- Programme auf dem ausgewählten Gerät starten.
- Gerätespezifische Profile verwalten.
- Verbindung und Berechtigungen getrennt pro PC behandeln.
- Geräte entfernen und Zugriffsrechte widerrufen.

Eine Aktion darf niemals versehentlich auf einem anderen PC ausgeführt werden, weil eine Geräteauswahl veraltet ist.

Bei fehlender Verbindung müssen Aktionen eindeutig als nicht ausgeführt oder noch nicht bestätigt gekennzeichnet werden.

22. Feature: Interaktives Desktop-Panel und Gaming-Overlay

Entwickle ein optionales kleines Panel für den Windows-PC.

Mögliche Funktionen:

- Soundboard.
- Lautstärke und Audio-Geräte.
- Aktueller Spielstatus.
- Ausgewählte Hardwarewerte.
- Eigene Schnellaktionen.
- Hotkey-Übersicht.
- Wechsel zwischen Gaming-Profilen.

Anforderungen:

- Ein- und ausblendbar.
- Frei positionierbar.
- Konfigurierbare Größe und Transparenz, sofern unterstützt.
- Tastatursteuerung.
- Möglichst geringe CPU- und RAM-Auslastung.
- Keine störende Überlagerung von Spielen.
- Verhalten bei Vollbildspielen testen.
- Keine Eingriffe in geschützte Prozesse oder Anti-Cheat-Systeme.

Das Overlay muss als echte Windows-Funktion implementiert werden, wenn es über normale Browserfunktionen hinausgeht. Die Website allein darf nicht als Ersatz für eine native Overlay-Integration behandelt werden.

23. Zentrale Integration aller neuen Funktionen

Alle neuen Features müssen sinnvoll mit den bestehenden Funktionen zusammenarbeiten.

Beispiele:

- Ein Spielstart kann eine Szene, ein Theme, ein Fenster-Layout und ein Controller-Profil auslösen.
- Das Beenden eines Spiels kann eine Statistik-Karte aktualisieren.
- Screenshots können einer Gaming-Session zugeordnet werden.
- Eine Dateiübertragung kann einen importierten Sound für das Soundboard bereitstellen.
- Ein Widget kann ausgewählte Hardwarewerte darstellen.
- Ein Gaming-Kalender kann an eine geplante Session erinnern.
- Ein Kompatibilitätsberater kann auf bereits vorhandene Hardwaredaten zurückgreifen.

Vermeide doppelte Datenhaltung und voneinander unabhängige Implementierungen derselben Funktion.

Nutze ein gemeinsames, nachvollziehbares Ereignis- und Zustandsmodell, soweit es zur bestehenden Architektur passt. Verhindere Endlosschleifen, doppelte Aktionen und Konflikte zwischen Automatisierungen.

24. Strikte Performance-Anforderungen

Die gesamte Software muss auf die vorhandene Hardware optimiert sein.

PC

- Keine unnötigen permanenten Hintergrundschleifen.
- Keine übermäßig häufigen Hardwareabfragen.
- Monitoring mit konfigurierbaren Aktualisierungsintervallen.
- Keine unnötigen Prozesse oder Dienste.
- Keine unnötigen Administratorrechte.
- Ereignisgesteuerte Verarbeitung bevorzugen.
- Speicherlecks und nicht freigegebene Ressourcen vermeiden.
- Audio-, Bild- und Videodateien effizient laden.
- Große Bibliotheken mit Pagination oder Virtualisierung darstellen.
- Hintergrundaufgaben abbrechbar gestalten.
- Bei Inaktivität oder minimierter Oberfläche unnötige Aktualisierungen reduzieren.

Website, Handy und iPad

- Code-Splitting und Lazy Loading einsetzen.
- Nicht benötigte Funktionen erst bei Bedarf laden.
- Bilder und Medien optimieren.
- Unnötige React-Neuberechnungen vermeiden.
- Netzwerkabfragen bündeln und begrenzen.
- WebSocket-Verbindungen und Listener korrekt aufräumen.
- Keine unnötigen permanenten Polling-Schleifen.
- Touch-Bedienung und kleine Displays berücksichtigen.
- Bei schwacher Verbindung sinnvolle Lade- und Fehlerzustände anzeigen.
- Lange Listen effizient rendern.
- Offline-Zustände klar kommunizieren.

Messbare Qualität

Erfasse nach Möglichkeit vor und nach den Änderungen:

- Start- und Ladezeiten.
- Größe der ausgelieferten Web-Bundles.
- CPU-Auslastung im Leerlauf und unter Last.
- RAM-Verbrauch.
- Anzahl aktiver Hintergrundaufgaben.
- Reaktionszeiten von PC-Steuerbefehlen.
- Synchronisierungsdauer.
- Verhalten bei Netzwerkunterbrechungen.
- Auswirkungen von Monitoring, Medienverwaltung und Overlay.

Nenne ausschließlich tatsächlich gemessene Werte. Falls ein Vergleich nicht möglich ist, kennzeichne ihn als nicht gemessen.

25. Sicherheit und Datenschutz

Alle neuen Funktionen müssen die Sicherheit des gesamten Projekts berücksichtigen.

Pflichtanforderungen:

- Authentifizierung und Autorisierung für PC-Steuerbefehle.
- Sichere Kopplung von Geräten.
- Möglichkeit, einzelne Geräte zu entfernen und Zugriffe zu widerrufen.
- Schutz vor unbefugten API- und WebSocket-Anfragen.
- Keine geheimen Schlüssel oder Passwörter im Frontend.
- Sichere Speicherung vertraulicher Informationen.
- Eingabevalidierung für Dateien, Pfade und Befehle.
- Schutz vor unzulässigen Dateizugriffen.
- Begrenzte Rechte für Plugins und Widgets.
- Sichere Fehlerprotokolle ohne sensible Daten.
- Keine ungefragte Audioaufzeichnung, Veröffentlichung oder Dateiübertragung.
- Keine unkontrollierten Systemänderungen.
- Bestätigung für wichtige oder schwer rückgängig zu machende Aktionen.
- Möglichst lokale Verarbeitung und Speicherung.

Für Verbindungen außerhalb eines vertrauenswürdigen lokalen Netzwerks müssen sichere Transportverschlüsselung und eine geeignete Authentifizierung vorgesehen werden. Unsichere direkte Freigaben des Companion ins Internet sind zu vermeiden.

26. Zuverlässigkeit und Fehlerbehandlung

Implementiere für jede neue Funktion:

- Ladezustände.
- Erfolgs- und Fehlerzustände.
- Verständliche Fehlermeldungen.
- Wiederholbare, sichere Vorgänge.
- Abbruchmöglichkeiten für längere Aktionen.
- Saubere Behandlung fehlender Berechtigungen.
- Behandlung nicht unterstützter Geräte.
- Wiederherstellung nach Verbindungsabbrüchen.
- Schutz vor doppelten Aktionen.
- Protokollierung wichtiger Vorgänge.

Wenn ein Gerät, eine API oder eine externe Datenquelle nicht verfügbar ist, muss der Rest der Software weiterhin funktionieren.

27. UI/UX und Design

Erhalte den modernen Gaming-Stil des vorhandenen Projekts.

Designziele:

- Dunkle, hochwertige Gaming-Oberfläche.
- Cyan- und Türkis-Akzente, sofern sie zum bestehenden Design passen.
- Einheitliche Abstände, Farben, Schriftgrößen und Komponenten.
- Responsive Darstellung für PC, Handy und iPad.
- Touch-freundliche Bedienelemente.
- Verständliche Navigation bei vielen Funktionen.
- Such- und Filtermöglichkeiten für große Listen.
- Sinnvolle Ladeanzeigen und Rückmeldungen.
- Einheitliche Dialoge und Bestätigungen.
- Barrierearme Kontraste und Tastaturnavigation.
- Reduzierte Animationen als Option.
- Keine überladenen Menüs oder unnötigen Effekte.

Die PC-Software und die Website sollen wie zusammengehörige Produkte wirken. Plattformabhängige Unterschiede sind erlaubt, wenn sie echte Vorteile bieten.

28. Datenmigration, Import und Export

Erweitere die bestehenden Import- und Exportmöglichkeiten, soweit erforderlich.

Berücksichtige:

- Gaming-Szenen.
- Themes.
- Spiele-Backlog.
- Statistiken.
- Controller-Profile.
- RGB-Profile.
- Fenster-Layouts.
- Kalenderdaten.
- Widgets.
- Screenshot-Metadaten.
- Unterstützte Mod-Konfigurationen.

Validiere importierte Daten vor dem Übernehmen. Zeige bei Bedarf eine Vorschau. Verhindere, dass fehlerhafte Dateien die gesamte Konfiguration beschädigen.

Sensible Informationen, Tokens und Zugangsdaten dürfen nicht ungeschützt exportiert werden.

29. Testanforderungen

Erstelle oder erweitere automatisierte Tests für alle relevanten Komponenten.

Teste insbesondere:

- Spiele-Backlog und Statuswechsel.
- Theme-Wechsel.
- Aktivitätsstatus und Datenschutzoptionen.
- Screenshot-Import und Dateiverwaltung.
- Controller-Erkennung und nicht unterstützte Geräte.
- Fenster-Layouts und fehlende Monitore.
- Mod-Backups und Wiederherstellung.
- Kalender und Zeitzonen.
- Dateiübertragung und Berechtigungen.
- Szenen und ihre Ausführungsreihenfolge.
- Mehrgeräte-Verbindungen.
- Overlay und dessen Ressourcenverbrauch.
- Synchronisierung und Konfliktlösung.
- Fehlerfälle, Abbruch und Wiederverbindung.

Teste die Website auf den unterstützten Desktop- und mobilen Browsern. Prüfe die Windows-Funktionen auf einer echten Windows-Umgebung, soweit verfügbar.

Unterscheide im Abschlussbericht zwischen:

- Automatisiert getestet.
- Auf echtem Gerät getestet.
- Nur statisch geprüft.
- Noch nicht getestet.

Ein erfolgreicher Build beweist nicht, dass eine Funktion auf einem echten PC oder iPad korrekt funktioniert.

30. Empfohlene Implementierungsreihenfolge

Arbeite in diesen Phasen:

Phase 1 – Bestandsaufnahme

- Projekt analysieren.
- Vorhandene Funktionen abgleichen.
- Abhängigkeiten und Risiken dokumentieren.
- Sicheren Ausgangszustand herstellen.

Phase 2 – Architektur und Datenmodelle

- Gemeinsame Schnittstellen festlegen.
- Datenmodelle und Protokolle erweitern.
- Rückwärtskompatibilität berücksichtigen.
- Berechtigungen und Fehlerbehandlung vorbereiten.

Phase 3 – Neue Verwaltungsfunktionen

- Achievement-System.
- Dynamische Themes.
- Backlog-Manager.
- Gaming-Aktivitätsstatus.
- Gaming-Kalender.
- Statistik-Karten.

Phase 4 – Hardware und Desktop

- RGB-Zentrale.
- Controller-Zentrale.
- Fenster- und Monitor-Layouts.
- Desktop-Panel und Overlay.

Phase 5 – Medien und Dateien

- Screenshot- und Clip-Bibliothek.
- Mod- und Add-on-Verwaltung.
- Speicher- und Updateübersicht.
- Lokale Dateiübertragung.

Phase 6 – Erweiterte Gaming-Funktionen

- Gaming-Szenen.
- Widget-Marktplatz.
- Sprachsteuerung.
- Spiele-Kompatibilitätsberater.
- Lokaler Mehrgeräte-Modus.

Phase 7 – Performance und Sicherheit

- CPU- und RAM-Verbrauch optimieren.
- Fehlerbehandlung und Ressourcenfreigabe prüfen.
- Berechtigungen und Netzwerkkommunikation testen.
- Sicherheitslücken beheben.

Phase 8 – Tests und Dokumentation

- Build und Tests ausführen.
- Plattformkompatibilität überprüfen.
- Neue Funktionen dokumentieren.
- Bekannte Einschränkungen transparent festhalten.

Passe die Reihenfolge an tatsächliche Abhängigkeiten an. Bereits funktionierende Funktionen sollen nicht unnötig neu geschrieben werden.

31. Arbeitsregeln

- Bearbeite den tatsächlichen Quellcode, nicht nur die Dokumentation.
- Liefere keine bloßen Vorschläge, wenn die Umsetzung möglich ist.
- Stelle keine unverbundenen Beispieloberflächen als fertige Funktionen dar.
- Verwende die vorhandenen Technologien weiter, sofern kein konkreter Grund für eine Änderung besteht.
- Prüfe neue Abhängigkeiten auf Nutzen, Wartbarkeit, Sicherheit und Größe.
- Vermeide unnötig große Bibliotheken.
- Vermeide duplizierte Komponenten und Logik.
- Halte Code und Protokolle typisiert und nachvollziehbar.
- Ergänze Dokumentation und Tests parallel zur Implementierung.
- Wenn eine Funktion wegen fehlender Hardware oder API-Zugriffe nicht vollständig umgesetzt werden kann, implementiere den sinnvoll möglichen Teil und dokumentiere die verbleibende Arbeit.
- Frage nur dann nach, wenn eine Entscheidung tatsächlich notwendig ist. Nutze ansonsten sichere und vernünftige Standardeinstellungen.

32. Abschließender Bericht

Wenn du die Implementierung abgeschlossen hast, liefere einen strukturierten Bericht mit:

1. Ausgangszustand des Projekts.
2. Bereits vorhandene Funktionen, die unverändert bleiben.
3. Neue Features, die vollständig implementiert wurden.
4. Vorhandene Funktionen, die verbessert wurden.
5. Alle geänderten und neu erstellten Dateien.
6. Durchgeführte Tests mit echten Ergebnissen.
7. Messwerte zur Performance vor und nach der Änderung, sofern verfügbar.
8. Funktionalität auf Windows, Website, Android und iPadOS.
9. Anforderungen an Hardware, Treiber und externe APIs.
10. Sicherheitsmaßnahmen und bekannte Risiken.
11. Offene Probleme und nicht getestete Funktionen.
12. Exakte Schritte zum Bauen, Starten, Installieren und Aktualisieren.
13. Hinweise zur Nutzung von PC, Handy und iPad.
14. Hinweise zu Backup, Import, Export und Wiederherstellung.

Kennzeichne jede Funktion eindeutig als vollständig implementiert, teilweise implementiert, getestet oder noch offen.

Endziel

PC Game Launcher Ultimate soll zu einer leistungsoptimierten, sicheren und professionellen Gaming-Zentrale werden, die Spiele und Programme verwaltet, Gaming-Szenen ausführt, Geräte steuert, Medien organisiert, lokale Dateien überträgt, Spielaktivitäten auswertet und auf mehreren Geräten zuverlässig bedienbar ist.

Das wichtigste Ergebnis ist keine möglichst lange Feature-Liste, sondern eine tatsächlich funktionierende, stabile, sichere und schnelle Software.
