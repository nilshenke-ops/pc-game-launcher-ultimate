# Signaturschlüssel der Android-App

`jarvis.p12` ist der feste Schlüssel, mit dem jede APK signiert wird. Er ist **kein Geheimnis im Sinne
eines Konto-Passworts** – er schützt nur davor, dass eine fremde App sich als Update ausgibt, und Android
verlangt für jedes Update dieselbe Signatur. Ohne ihn ließen sich Updates nicht installieren.

- Typ: PKCS12, Alias `jarvis`, Passwort `jarvis-update` (per Umgebungsvariablen `ANDROID_STORE_PASSWORD`
  und `ANDROID_KEY_PASSWORD` überschreibbar).
- Gültigkeit: 30 Jahre, selbstsigniert.
- Für eine Veröffentlichung im Play Store wird ein eigener Schlüssel benötigt; dieser hier ist nur für die
  direkte Installation (APK) gedacht.

**Nicht löschen und nicht ersetzen**, sonst nimmt ein Android-Gerät das nächste Update nicht mehr an –
man müsste die App deinstallieren und neu installieren.
