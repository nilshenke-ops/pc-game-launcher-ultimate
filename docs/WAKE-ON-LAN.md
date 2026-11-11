# PC einschalten (Wake-on-LAN über die FRITZ!Box)

Mit „PC einschalten“ in der PC-Steuerung startest du deinen Windows-PC vom Handy, iPad oder einem anderen PC – zu Hause und unterwegs.

**Wichtig vorab:** Ob dein Laptop sich aus dem *ausgeschalteten* Zustand wecken lässt, entscheidet seine Hardware und sein BIOS. Das lässt sich
nur am Gerät selbst prüfen (Abschnitt 2 und 5). Die Software sendet das Signal zuverlässig – ob der Laptop darauf hört, zeigt erst der Test.

---

## 1. So funktioniert es

```
Handy/iPad ──(HTTPS, dein Konto)──▶ Cloud-Dienst ──(HTTPS, MyFRITZ!)──▶ FRITZ!Box ──(LAN-Kabel, Magic Packet)──▶ Laptop
                                                                                                    │
Handy/iPad ◀──────────── „PC verbunden“ ◀──── Begleiter startet mit Windows und meldet sich ◀───────┘
```

- Ein Handy-Browser kann kein Wake-on-LAN-Signal senden (Browser dürfen kein UDP), und der PC ist aus. Die FRITZ!Box ist immer an und
  hat die Funktion eingebaut („Computer starten“). Sie wird über die offizielle AVM-Schnittstelle TR-064 angesprochen
  (Dienst *Hosts*, Aktion `X_AVM-DE_WakeOnLANByMACAddress`).
- Ausgelöst wird das über den Cloud-Dienst des Projekts. Er nimmt den Befehl nur von einem angemeldeten Gerät deines Kontos an,
  höchstens einmal alle 20 Sekunden und 20-mal pro Stunde, und nur an eine MyFRITZ!-Adresse.
- **Es wird kein Port zum PC geöffnet und kein UDP-Port freigegeben.** Genutzt wird nur der HTTPS-Internetzugriff der FRITZ!Box selbst.
- Die FRITZ!Box-Zugangsdaten liegen **nicht** im Code der Website und werden **nicht** in der Cloud gespeichert. Sie werden mit deinem
  Konto-Schlüssel verschlüsselt auf deinen Geräten aufbewahrt und nur im Moment des Startsignals über HTTPS mitgeschickt.

### Die Anzeigen

| Anzeige | Bedeutung |
|---|---|
| PC verbunden | Der Begleiter am PC antwortet. |
| PC ausgeschaltet | Keine Verbindung, und die FRITZ!Box sieht den PC nicht im Heimnetz. |
| PC wird gestartet | Die FRITZ!Box hat das Wecksignal gesendet. **Das heißt noch nicht, dass Windows startet.** |
| PC startet gerade | Die FRITZ!Box sieht den PC wieder im Heimnetz. |
| Verbindung wird hergestellt | Der PC hat sich bei der Cloud gemeldet, die Verbindung wird aufgebaut. |
| PC nicht erreichbar | Nach 4 Minuten keine Verbindung – oder der PC ist im Netz, aber der Begleiter antwortet nicht. |
| Wake-on-LAN nicht verfügbar | Nicht eingerichtet oder nicht mit dem Cloud-Konto angemeldet. |

---

## 2. Was der HP Victus 15 kann – und was offen ist

Ich habe dazu keine offizielle HP-Angabe für dein Modell gefunden, nur Beiträge im HP-Forum. Deshalb hier getrennt nach „sicher“ und „offen“:

**Sicher (gilt für praktisch jeden Laptop):**
- Wecken aus dem ausgeschalteten Zustand geht **nur über das LAN-Kabel**, nicht über WLAN. Der Laptop muss per Kabel an der FRITZ!Box hängen.
- Es geht in aller Regel **nur mit angeschlossenem Netzteil**. Im Akkubetrieb schaltet der Laptop die Netzwerkkarte ab.
- Die Grafikkarte (RTX 5060) spielt keine Rolle.

**Offen (muss an deinem Gerät geprüft werden):**
- Ob das BIOS deines Victus eine Wake-on-LAN-Option hat. Bei HP-Consumer-Laptops (Victus, Pavilion) fehlt sie laut Forenbeiträgen
  oft oder ist je nach BIOS-Version unterschiedlich benannt („Wake on LAN“, „Wake on LAN from S4/S5“).
- Ob der Laptop aus **„Herunterfahren“ (S5)** aufwacht. Viele Laptops dieser Klasse wachen nur aus dem **Ruhezustand (S4)** auf.
- Aus **„Energie sparen“** wachen Geräte mit „Modern Standby“ (S0) laut Forenbeiträgen meist nicht per Magic Packet auf.

Der Begleiter prüft, was Windows selbst meldet (PC-Steuerung → PC einschalten → Einrichten → „Was der PC selbst meldet“):
LAN-Kabel verbunden, „Magic Packet“ am Adapter eingeschaltet, Netzwerkadapter darf wecken, Schnellstart aus, Ruhezustand verfügbar, Netzteil.
Diese Prüfung liest nur Windows-Einstellungen. Das BIOS kann sie nicht lesen.

---

## 3. Einstellungen am Laptop

### 3.1 BIOS/UEFI
1. Laptop ausschalten, einschalten und sofort mehrmals **Esc** drücken, dann **F10** (BIOS Setup).
2. Unter *Advanced*, *System Configuration* oder *Power Management* nach **„Wake on LAN“** suchen
   (auch „Wake on LAN from S4/S5“ oder „S5 Wake on LAN“) und einschalten.
3. Mit F10 speichern.
4. Gibt es die Option nicht: BIOS über *HP Support Assistant* aktualisieren und noch einmal nachsehen. Fehlt sie weiterhin, kann das Wecken
   trotzdem funktionieren (manche Geräte haben es fest eingeschaltet) – das zeigt der Test in Abschnitt 5.

### 3.2 Windows 11
1. **Geräte-Manager → Netzwerkadapter →** den LAN-Adapter (meist „Realtek … GbE“) doppelklicken.
   - Reiter **Energieverwaltung:** „Gerät kann den Computer aus dem Ruhezustand aktivieren“ **an**, „Nur Magic Packet kann Computer aus dem Ruhezustand aktivieren“ **an**.
   - Reiter **Erweitert:** „Wake on Magic Packet“ → **Aktiviert**, „Shutdown Wake-On-Lan“ → **Aktiviert**,
     „Energy Efficient Ethernet“ und „Green Ethernet“ → **Deaktiviert**.
   - Fehlt der Reiter „Energieverwaltung“: den LAN-Treiber von der HP-Supportseite für dein Modell neu installieren.
2. **Schnellstart ausschalten:** Systemsteuerung → Energieoptionen → „Auswählen, was beim Drücken von Netzschaltern geschehen soll“ →
   „Einige Einstellungen sind momentan nicht verfügbar“ → **„Schnellstart aktivieren“ abwählen**.
3. **Ruhezustand einschalten** (als Reserve, falls „Herunterfahren“ nicht weckbar ist): Eingabeaufforderung als Administrator → `powercfg /hibernate on`.
4. **Begleiter mit Windows starten:** in der Website am PC unter Einstellungen → „Installation & Autostart“ den Autostart einschalten.
5. **Automatische Windows-Anmeldung:** Der Begleiter startet erst, wenn Windows angemeldet ist. Fragt Windows nach dem Start nach PIN oder
   Kennwort, bleibt die Website bei „PC startet gerade“ stehen. Für das Einschalten aus der Ferne brauchst du deshalb die automatische Anmeldung
   (z. B. mit dem Microsoft-Werkzeug *Autologon* aus den Sysinternals). **Abwägung:** Wer den Laptop einschaltet, ist dann ohne Kennwort angemeldet.

---

## 4. Einstellungen an der FRITZ!Box

1. **Laptop per LAN-Kabel** an die FRITZ!Box anschließen und einmal einschalten, damit die FRITZ!Box ihn kennt.
2. **Test direkt in der FRITZ!Box:** Heimnetz → Netzwerk → beim Laptop auf den Stift → Schaltfläche **„Computer starten“**.
   Funktioniert das bei ausgeschaltetem Laptop, funktioniert auch die Website. Funktioniert es nicht, liegt es am Laptop (Abschnitt 3), nicht an der Website.
3. **MyFRITZ!-Konto:** Internet → MyFRITZ!-Konto → einrichten. Dort steht deine Adresse (`…​.myfritz.net`).
   „Zertifikat von letsencrypt.org verwenden“ einschalten.
4. **Internetzugriff über HTTPS:** Internet → Freigaben → FRITZ!Box-Dienste → „Internetzugriff auf die FRITZ!Box über HTTPS aktiviert“ einschalten.
   Den „TCP-Port für HTTPS“ notieren.
5. **Eigener Benutzer:** System → FRITZ!Box-Benutzer → Benutzer hinzufügen, z. B. `jarvis`, mit langem Kennwort.
   Rechte: **„Zugang auch aus dem Internet erlaubt“** und **„FRITZ!Box Einstellungen“**. Alle anderen Rechte aus.
6. **Zugriff für Anwendungen:** Heimnetz → Netzwerk → Netzwerkeinstellungen → „Zugriff für Anwendungen zulassen“ einschalten.

**Abwägung zu Punkt 4:** Der HTTPS-Internetzugriff macht die Anmeldeseite der FRITZ!Box aus dem Internet erreichbar. Das ist die von AVM
vorgesehene, verschlüsselte Fernwartung und keine Portfreigabe zu deinem PC – aber es ist ein Dienst mehr im Internet. Wer das nicht will,
nimmt die Variante in Abschnitt 6.

---

## 5. In der Website einrichten und testen

1. Mit deinem **Cloud-Konto** anmelden (Profil).
2. **PC-Steuerung → PC einschalten → Einrichten:** MyFRITZ!-Adresse, HTTPS-Port, FRITZ!Box-Benutzer, Kennwort, MAC-Adresse des LAN-Anschlusses
   (wird vom PC gelesen, wenn er verbunden ist).
3. **„Verbindung testen“** – die Antwort sagt, ob die FRITZ!Box erreichbar ist, ob sie den PC kennt und ob er per Kabel hängt.
4. **Test im Heimnetz:** Laptop mit Netzteil und LAN-Kabel **herunterfahren**, 30 Sekunden warten, „PC einschalten“ tippen.
   - Startet er nicht: denselben Test aus dem **Ruhezustand** machen (Start → Ein/Aus → Ruhezustand).
   - Startet er aus dem Ruhezustand, aber nicht aus „Herunterfahren“: künftig den Ruhezustand statt Herunterfahren benutzen.
5. **Test von unterwegs:** WLAN am Handy ausschalten (Mobilfunk) und wiederholen.
6. **Wiederverbindung:** Nach dem Start muss in der Website ohne weiteres Zutun „PC verbunden“ erscheinen.

---

## 6. Variante ohne Internetzugriff auf die FRITZ!Box (nur VPN)

1. FRITZ!Box: Internet → Freigaben → VPN (WireGuard) → Verbindung für das Handy einrichten.
2. Unterwegs: WireGuard am Handy einschalten, `http://fritz.box` öffnen, Heimnetz → Netzwerk → Laptop → **„Computer starten“**.

Sicherer, weil nichts außer dem VPN erreichbar ist – dafür zwei Handgriffe mehr und kein Knopf in der Website. Ein Browser kann die FRITZ!Box
auch im VPN nicht direkt ansprechen, deshalb gibt es für diese Variante keinen Ein-Tipp-Start.

---

## 7. Wenn es nicht funktioniert

| Meldung / Verhalten | Ursache und Abhilfe |
|---|---|
| „FRITZ!Box ist über das Internet nicht erreichbar“ | Adresse/Port prüfen; HTTPS-Internetzugriff und Let's-Encrypt-Zertifikat einschalten (4.3, 4.4). |
| „Benutzer oder Kennwort falsch …“ | Benutzer braucht „Zugang auch aus dem Internet“ und „FRITZ!Box Einstellungen“ (4.5). |
| „Die FRITZ!Box hat die Schnittstelle nicht gefunden“ | „Zugriff für Anwendungen zulassen“ einschalten (4.6). |
| „kennt kein Gerät mit dieser MAC-Adresse“ | MAC des **LAN**-Anschlusses eintragen; Laptop einmal per Kabel anschließen. |
| Signal gesendet, PC startet nicht | Netzteil und LAN-Kabel? Schnellstart aus? Adapter-Einstellungen (3.2)? BIOS (3.1)? Test mit „Computer starten“ in der FRITZ!Box (4.2). Aus dem Ruhezustand versuchen. |
| „PC startet gerade“ bleibt stehen | Windows wartet auf die Anmeldung, oder der Begleiter startet nicht automatisch (3.2 Punkt 4 und 5). |
| „Das Startsignal wurde gerade erst gesendet“ | Schutz vor Mehrfach-Befehlen: 20 Sekunden warten. |
