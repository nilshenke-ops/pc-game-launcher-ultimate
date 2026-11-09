#!/usr/bin/env bash
# Runs the cloud sync end-to-end test with the REAL Cloudflare Worker (workerd + a D1 database on disk), a second companion and two browsers.
# Needs: built web app (npm run build, build:hosted), built headless companion, built relay (the normal e2e setup). Installs wrangler once into a temp folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${PGL_WRANGLER:-}" ]; then
  TOOLS="${TMPDIR:-/tmp}/pgl-wrangler"
  mkdir -p "$TOOLS"
  [ -x "$TOOLS/node_modules/.bin/wrangler" ] || (cd "$TOOLS" && npm init -y >/dev/null && npm install wrangler@4 --no-audit --no-fund)
  export PGL_WRANGLER="$TOOLS/node_modules/.bin/wrangler"
fi
cd "$ROOT/web"
npx playwright test e2e/cloud-sync.spec.ts
