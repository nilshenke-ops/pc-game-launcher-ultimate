# Cloud-Konto und persönliche Datensynchronisierung

## Ziel
Benutzer sollen sich auch anmelden können, wenn ihr eigener PC ausgeschaltet oder nicht erreichbar ist. Konto, Design und ausgewählte persönliche Einstellungen sollen dafür in einem erreichbaren Cloud-Dienst liegen und nach Anmeldung auf weiteren Geräten geladen werden.

## Umfang / Nicht-Ziele
- Umfasst Benutzerkonto, Design/Prefs sowie die bereits im Konto enthaltenen ausgewählten persönlichen Werte (Gamer-Pass, Widget-Zähler/-Erinnerung, Deal-Radar-Einstellung und Raum-Einstellung), soweit diese Daten nicht gerätegebunden sind.
- Spielebibliothek, installierte Spiele, PC-Profile, Kalender/PC-Zustand und Steuerungsrechte bleiben beim eigenen PC; Cloud-Anmeldung gewährt keinerlei PC-Zugriff.
- Passwort und Verschlüsselungsschlüssel sollen nicht im Klartext an den Cloud-Dienst gesendet werden. Konto-Inhalte bleiben Ende-zu-Ende verschlüsselt.
- Kein Wechsel der GitHub-Pages-Webhosting-Architektur in diesem Vorhaben.

## Ansätze
1. **Supabase als Cloud-Backend (empfohlen):** Authentifizierung und geschützte Datenspeicherung ohne Verfügbarkeit des Heim-PCs. Passt zum vorhandenen Supabase-Zugang, aber dieser listet aktuell kein Projekt; ein Projekt/Anmeldedaten müssen erst verfügbar gemacht werden.
2. **Eigenes PC-Backend/Tunnel:** nutzt bestehende Companion-Logik und vermeidet einen externen Datenspeicher, erfüllt aber Anmeldung/Synchronisierung bei ausgeschaltetem PC nicht.
3. **Nur Browser-Speicher/Exportcode:** funktioniert offline, synchronisiert aber nicht automatisch zwischen Geräten und ist keine Cloud.

Empfohlen ist Ansatz 1, da nur dieser die gewünschte PC-unabhängige Anmeldung und geräteübergreifende Synchronisierung erfüllt.

## Sicherheits- und Betriebsgrenzen
- Browser greift direkt auf den Cloud-Dienst zu; nur öffentliche Projektkonfiguration darf in den Web-Build gelangen. Keine Service-Role-Schlüssel im Browser oder Repository.
- Zugriff auf Datensätze muss pro authentifiziertem Benutzer beschränkt sein (Row Level Security); Änderungen müssen auf unterstützte Konto-Felder begrenzt werden.
- Ein Cloud-Projekt ist derzeit nicht im verbundenen Supabase-Konto sichtbar. Eine echte Ende-zu-Ende-Implementierung und ein erfolgreicher Laufzeitnachweis sind blockiert, bis ein Projekt sowie passende öffentliche Client-Konfiguration verfügbar sind.
- Kein Live-Projekt wird ohne ausdrückliche Bereitstellung/Autorisierung verändert.

## Umsetzungsspielraum
Nach Freigabe des Entwurfs wird die bestehende Konto-Oberfläche und `design-account.ts` von Companion-only RPC auf Cloud-Authentifizierung und verschlüsselten Cloud-Speicher umgestellt; Offline-Änderungen werden lokal vorgemerkt und bei erreichbarer Cloud abgeglichen. PC-spezifische RPC und Daten bleiben unverändert. Bestehende Companion-Konten sind nicht automatisch in der Cloud vorhanden; Migration wird nicht stillschweigend vorgenommen.
