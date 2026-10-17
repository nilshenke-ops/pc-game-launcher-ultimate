#!/usr/bin/env bash
# Runs the companion without Windows desktop features (Linux/macOS or testing). Audio/hotkeys/tray are reported as unsupported.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/web/dist/index.html" ] || (cd "$ROOT/web" && { [ -d node_modules ] || npm ci; } && npm run build)
dotnet build "$ROOT/companion/src/Companion.Headless" -c Release --nologo -v q
PGL_WEB_DIR="$ROOT/web/dist" dotnet "$ROOT/companion/src/Companion.Headless/bin/Release/net8.0/pgl-companion-headless.dll" "$@"
