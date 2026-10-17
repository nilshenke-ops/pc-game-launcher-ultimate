#!/usr/bin/env bash
# Runs every automated test: web unit tests, relay tests, companion (C#) tests and the browser end-to-end tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> Web: Typecheck + Unit-Tests"
(cd "$ROOT/web" && { [ -d node_modules ] || npm ci; } && npx tsc -b && npx vitest run)
echo "==> Relay: Build + Tests"
(cd "$ROOT/relay" && { [ -d node_modules ] || npm ci; } && npm test)
echo "==> Companion: C#-Tests"
dotnet test "$ROOT/companion/tests/Companion.Core.Tests" --nologo
echo "==> Windows-Companion: Build-Prüfung (Cross-Compile)"
dotnet build "$ROOT/companion/src/Companion.Windows" -c Release --nologo -v q
echo "==> End-to-End (Playwright, Chromium)"
dotnet build "$ROOT/companion/src/Companion.Headless" --nologo -v q
(cd "$ROOT/web" && npm run build && npm run build:hosted && npx playwright test)
echo "Alle Tests erfolgreich."
