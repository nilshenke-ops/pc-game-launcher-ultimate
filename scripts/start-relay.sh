#!/usr/bin/env bash
# Starts the optional relay (serves web app + companion download, forwards remote clients). Config: relay/relay.config.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/web/dist/index.html" ] || (cd "$ROOT/web" && { [ -d node_modules ] || npm ci; } && npm run build)
cd "$ROOT/relay" && { [ -d node_modules ] || npm ci; } && npm run build && npm start
