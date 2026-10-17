#!/usr/bin/env bash
# Development: headless companion on :8787 (API/WebSocket) + Vite dev server on :5173 with hot reload.
# Open the printed "PC-Ansicht" link, but replace port 8787 with 5173 for live reloading.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT/web" && { [ -d node_modules ] || npm ci; })
PGL_DEV=1 dotnet run --project "$ROOT/companion/src/Companion.Headless" -- --data "$ROOT/.devdata" &
COMPANION=$!
trap 'kill $COMPANION 2>/dev/null' EXIT
cd "$ROOT/web" && npm run dev
