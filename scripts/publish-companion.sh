#!/usr/bin/env bash
# Builds the Windows companion as a single EXE (web app embedded), plus ZIP, checksums and the relay download.
# Works on Linux/macOS (cross-compile) and in Git Bash on Windows. Requires: Node.js 20+, .NET 8 SDK.
# Usage: scripts/publish-companion.sh [--framework-dependent]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts"
VERSION="$(tr -d "[:space:]" < "$ROOT/VERSION")"
SELF_CONTAINED=true
[[ "${1:-}" == "--framework-dependent" ]] && SELF_CONTAINED=false

command -v node >/dev/null || { echo "Fehler: Node.js fehlt (https://nodejs.org)"; exit 1; }
command -v dotnet >/dev/null || { echo "Fehler: .NET 8 SDK fehlt (https://dotnet.microsoft.com/download)"; exit 1; }

echo "==> Web-App bauen"
(cd "$ROOT/web" && { [ -d node_modules ] || npm ci; } && npm run build)

echo "==> Windows-Companion veröffentlichen (self-contained=$SELF_CONTAINED)"
rm -rf "$OUT/companion"
dotnet publish "$ROOT/companion/src/Companion.Windows/Companion.Windows.csproj" -c Release -r win-x64 \
  --self-contained "$SELF_CONTAINED" -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile="$SELF_CONTAINED" -p:DebugType=none -p:GenerateDocumentationFile=false \
  -o "$OUT/companion" --nologo

EXE="$OUT/companion/PCGameLauncherCompanion.exe"
[ -f "$EXE" ] || { echo "Fehler: $EXE wurde nicht erzeugt"; exit 1; }
rm -f "$OUT/companion/"*.xml "$OUT/companion/"*.pdb
SHA="$(sha256sum "$EXE" | cut -d' ' -f1)"
SIZE="$(stat -c %s "$EXE" 2>/dev/null || stat -f %z "$EXE")"

echo "==> ZIP und Prüfsummen"
ZIP="$OUT/PCGameLauncherCompanion-$VERSION-win-x64.zip"
cp "$ROOT/docs/LIESMICH-Companion.txt" "$OUT/companion/LIESMICH.txt"
(cd "$OUT/companion" && echo "$SHA  PCGameLauncherCompanion.exe" > SHA256SUMS.txt && rm -f "$ZIP" && \
  if command -v zip >/dev/null; then zip -q -9 "$ZIP" PCGameLauncherCompanion.exe LIESMICH.txt SHA256SUMS.txt; \
  else python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); [z.write(f) for f in sys.argv[2:]]" "$ZIP" PCGameLauncherCompanion.exe LIESMICH.txt SHA256SUMS.txt; fi)
(cd "$OUT" && sha256sum "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")

echo "==> Relay-Download bereitstellen"
mkdir -p "$ROOT/relay/downloads"
cp "$EXE" "$ROOT/relay/downloads/PCGameLauncherCompanion.exe"
printf '{"fileName":"PCGameLauncherCompanion.exe","size":%s,"sha256":"%s","version":"%s"}\n' "$SIZE" "$SHA" "$VERSION" > "$ROOT/relay/downloads/manifest.json"

echo
echo "Fertig:"
echo "  EXE:    $EXE ($SIZE Bytes)"
echo "  SHA256: $SHA"
echo "  ZIP:    $ZIP"
