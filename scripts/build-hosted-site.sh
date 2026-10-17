#!/usr/bin/env bash
# Builds the hosted web app ("PC verbinden"-Webseite) as a ZIP for a free static host
# (Cloudflare Pages, GitHub Pages, Netlify). The page stays online while the PC is off and connects
# to the PC address that is scanned (QR code) or typed in.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$ROOT/companion/Directory.Build.props")"
(cd "$ROOT/web" && { [ -d node_modules ] || npm ci; } && npm run build:hosted)
mkdir -p "$ROOT/artifacts"
ZIP="$ROOT/artifacts/GameLauncher-Webseite-$VERSION.zip"
rm -f "$ZIP"
(cd "$ROOT/web/dist-hosted" && python3 -c "import zipfile,os,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(d,f), os.path.relpath(os.path.join(d,f))) for d,_,fs in os.walk('.') for f in fs]" "$ZIP")
echo "Fertig: $ZIP (Inhalt direkt hochladen, index.html liegt im Hauptordner)"
