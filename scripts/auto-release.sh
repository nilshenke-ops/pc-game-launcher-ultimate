#!/usr/bin/env bash
# Veröffentlicht den Windows-Begleiter selbstständig, wenn sich Web- oder Begleiter-Code ohne Versionssprung geändert
# hat: Patch-Version erhöhen, Änderungsprotokoll aus den Commit-Titeln schreiben, nach main pushen und den normalen
# Release-Workflow starten. Ein Push mit dem CI-Token löst selbst keine Workflows aus, deshalb der ausdrückliche Start.
# Usage: scripts/auto-release.sh [--dry-run]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

say() { printf '%s\n' "$*"; }
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY" || true; }
skip() { say "$*"; summary "$*"; exit 0; }

# Dateien, die im Windows-Begleiter landen (eingebettete Web-App) oder ihn bauen.
PATHS=(web companion protocol scripts/publish-companion.sh scripts/publish-companion.ps1)

VERSION="$(tr -d '[:space:]' < VERSION)"
TAG="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
[ -n "$TAG" ] || skip "Kein Release-Tag gefunden – nichts zu tun."
[ "${TAG#v}" = "$VERSION" ] || skip "VERSION $VERSION ist noch nicht veröffentlicht (letztes Release $TAG) – das übernimmt die normale Veröffentlichung."

# Nur veröffentlichen, was die Prüfungen bestanden hat, und nicht mit einem laufenden Release kollidieren.
if [ "$DRY" = "0" ]; then
  command -v gh >/dev/null || { say "Fehler: gh (GitHub CLI) fehlt."; exit 1; }
  HEAD_SHA="$(git rev-parse HEAD)"
  read -r STATUS CONCLUSION LAST_SHA <<<"$(gh run list --workflow=release.yml --branch main --limit 1 \
    --json status,conclusion,headSha --jq '.[0] | "\(.status) \(.conclusion // "-") \(.headSha)"')"
  if [ "$LAST_SHA" = "$HEAD_SHA" ] && [ "$STATUS" != "completed" ]; then
    skip "Die Veröffentlichung für diesen Stand läuft gerade – beim nächsten Lauf erneut."
  elif [ "$LAST_SHA" = "$HEAD_SHA" ] && [ "$CONCLUSION" != "success" ]; then
    skip "Der letzte Lauf für diesen Stand war $CONCLUSION – es wird nichts veröffentlicht, bis main wieder grün ist."
  fi
fi

CHANGED="$(git diff --name-only "$TAG"..HEAD -- "${PATHS[@]}")"
[ -n "$CHANGED" ] || skip "Keine Änderungen an Web oder Begleiter seit $TAG – kein neues Release nötig."

IFS=. read -r MAJOR MINOR PATCH <<<"$VERSION"
NEXT="$MAJOR.$MINOR.$((PATCH + 1))"
if [ "$DRY" = "0" ]; then
  while gh release view "v$NEXT" >/dev/null 2>&1 || grep -qE "^## ${NEXT//./\\.} " CHANGELOG.md; do
    PATCH=$((PATCH + 1))
    NEXT="$MAJOR.$MINOR.$PATCH"
  done
fi

DATE="$(date -u +%Y-%m-%d)"
ENTRY="$(mktemp)"
{
  printf '## %s – %s\n### Verbessert\n' "$NEXT" "$DATE"
  git log --no-merges --reverse --pretty='- %s' "$TAG"..HEAD -- "${PATHS[@]}"
} >"$ENTRY"

if [ "$DRY" = "1" ]; then
  say "== Probelauf =="
  say "Letztes Release: $TAG · nächste Version: $NEXT · betroffene Dateien: $(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ')"
  say ""
  cat "$ENTRY"
  rm -f "$ENTRY"
  exit 0
fi

printf '%s\n' "$NEXT" >VERSION
python3 - "$ENTRY" <<'PY'
import sys
from pathlib import Path
entry = Path(sys.argv[1]).read_text(encoding="utf-8").rstrip() + "\n\n"
path = Path("CHANGELOG.md")
text = path.read_text(encoding="utf-8")
index = text.find("\n## ")
text = (text.rstrip() + "\n\n" + entry) if index < 0 else (text[:index + 1] + entry + text[index + 1:])
path.write_text(text, encoding="utf-8")
PY
rm -f "$ENTRY"

git add VERSION CHANGELOG.md
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -m "Version $NEXT: automatisch für den Windows-Begleiter veröffentlicht" \
  -m "$(git log --no-merges --reverse --pretty='- %s' "$TAG"..HEAD -- "${PATHS[@]}" | head -20)"
git push origin HEAD:main
gh workflow run release.yml --ref main
say "Version $NEXT ausgelöst – der Release-Workflow baut jetzt Webseite und Windows-Begleiter."
summary "Version $NEXT ausgelöst (vorher $TAG)."
