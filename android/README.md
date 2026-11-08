# Android-App (APK)

Eine schlanke Hülle um die Web-App: Sie öffnet `https://nilshenke-ops.github.io/pc-game-launcher-ultimate/` in
einem eigenen Fenster (eigener Speicher, bleibt angemeldet) und bringt den Update-Weg mit, den auch die
PC-Software hat.

## Symbol und Name

Der Startbildschirm zeigt **Nexus** (kurz, passt unter das Symbol) – derselbe Kurzname wie bei der
installierten Webseite. Im System (App-Info, Installer, Berechtigungen) steht weiter „Nexus Gaming Hub“.

Das Symbol ist im Marken-Look der Seite: Verlauf von Cyan nach Violett, dunkle Platte, Play-Zeichen. Es liegt
als adaptives Symbol (Android 8+, `mipmap-anydpi-v26`) für runde, eckige und themenfarbige Symbole vor, dazu
PNG-Varianten für alle Dichten. Erzeugt wird alles aus Code:

```bash
python3 scripts/make-android-icon.py   # braucht Pillow
```

## Updates

1. **Automatisch:** Beim Start und danach alle 6 Stunden fragt die App
   `…/android/latest.json` ab. Ist dort eine höhere `versionCode` als die installierte, erscheint oben eine
   Leiste „Version x.y.z verfügbar“ mit **Installieren** und **Später**. „Installieren“ lädt die APK, prüft die
   SHA-256 und übergibt sie an die Android-Installation.
2. **Von Hand:** In der App auf der Seite „Cloud“ (Karte „Android-App“) auf **Nach Updates suchen** tippen –
   das geht über die Brücke `window.JarvisApp` direkt an die App.
3. Android verlangt beim Installieren immer eine Bestätigung – ein stilles Selbst-Update ist ohne
   Systemrechte nicht möglich. Deshalb: ein Tipp statt „ganz ohne“.

## Neue Version veröffentlichen

1. `android/version.properties`: `versionCode` **erhöhen** (z. B. 2) und `versionName` setzen (z. B. 1.0.1).
2. Auf `main` pushen – der Workflow „Android-App bauen“ baut die APK, lädt sie an das Release `android-latest`
   und schreibt `android/latest.json` auf gh-pages. Danach bietet jede installierte App das Update an.

Die APK liegt dauerhaft unter
`https://github.com/nilshenke-ops/pc-game-launcher-ultimate/releases/download/android-latest/jarvis-android.apk`.

## Bauen ohne GitHub

`cd android && gradle assembleRelease` (JDK 17, Android SDK mit Platform 34). Die fertige Datei liegt unter
`app/build/outputs/apk/release/app-release.apk`.
