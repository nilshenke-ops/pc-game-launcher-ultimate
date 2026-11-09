#!/usr/bin/env bash
# Builds the hosted app, makes sure the D1 database exists, applies the migrations and deploys the Worker that
# serves both the site and /api/account. Needs CLOUDFLARE_API_TOKEN (never committed); the database id is read
# from CLOUDFLARE_D1_DATABASE_ID or looked up/created through the API and written only to the git-ignored
# wrangler.deploy.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKER_NAME="${CLOUDFLARE_WORKER_NAME:-pc-game-launcher-ultimate}"
WORKER_URL="${CLOUDFLARE_WORKER_URL:-https://$WORKER_NAME.nilshenke.workers.dev}"
DB_NAME="${CLOUDFLARE_D1_DATABASE_NAME:-nexus-accounts}"
CONFIG="wrangler.deploy.json"

fail() { echo "Fehler: $*" >&2; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "CLOUDFLARE_API_TOKEN fehlt. Token im Cloudflare-Dashboard erzeugen (Workers + D1 bearbeiten) und nur als Umgebungsvariable bzw. GitHub-Secret setzen."
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || fail "CLOUDFLARE_ACCOUNT_ID fehlt (Cloudflare-Dashboard → Konto-ID)."
command -v node >/dev/null 2>&1 || fail "Node.js fehlt."

echo "1/5 Website bauen (dist-hosted) …"
(cd web && npm ci --no-audit --no-fund && npm run build:hosted)
[ -f web/dist-hosted/index.html ] || fail "web/dist-hosted/index.html fehlt – der Build ist nicht durchgelaufen."

echo "2/5 D1-Datenbank „$DB_NAME“ …"
ID="${CLOUDFLARE_D1_DATABASE_ID:-}"
if [ -z "$ID" ]; then
  ID="$(npx --yes wrangler@4 d1 list --json 2>/dev/null | DB_NAME="$DB_NAME" node -e '
    let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : parsed.result ?? parsed.databases ?? [];
        const hit = list.find((x) => x.name === process.env.DB_NAME);
        if (hit) process.stdout.write(hit.uuid ?? hit.id ?? "");
      } catch { /* no list yet */ }
    });')"
fi
if [ -z "$ID" ]; then
  echo "   nicht vorhanden – wird angelegt."
  OUT="$(npx --yes wrangler@4 d1 create "$DB_NAME" 2>&1)" || { echo "$OUT" >&2; fail "D1-Datenbank konnte nicht angelegt werden."; }
  ID="$(printf '%s' "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1)"
fi
[ -n "$ID" ] || fail "Datenbank-ID von „$DB_NAME“ nicht gefunden. CLOUDFLARE_D1_DATABASE_ID setzen."
echo "   ID: $ID"

echo "3/5 Konfiguration mit D1-Bindung erzeugen …"
rm -f wrangler.deploy.json
DB_NAME="$DB_NAME" DB_ID="$ID" ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" CONFIG="$CONFIG" WORKER_NAME="$WORKER_NAME" node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("wrangler.json", "utf8"));
  cfg.name = process.env.WORKER_NAME;
  if (process.env.ACCOUNT_ID) cfg.account_id = process.env.ACCOUNT_ID;
  cfg.d1_databases = [{
    binding: "DB",
    database_name: process.env.DB_NAME,
    database_id: process.env.DB_ID,
    migrations_dir: "cloud-account-worker/migrations",
  }];
  fs.writeFileSync(process.env.CONFIG, JSON.stringify(cfg, null, 2) + "\n");
'
# The generated file contains the database id and is never committed.
grep -qxF 'wrangler.deploy.json' .gitignore 2>/dev/null || printf '\n# generated Worker config (contains the D1 database id)\nwrangler.deploy.json\n.wrangler/\n' >> .gitignore

echo "4/5 Migrationen anwenden und Worker veröffentlichen …"
npx --yes wrangler@4 d1 migrations apply "$DB_NAME" --remote --config "$CONFIG" -y
npx --yes wrangler@4 deploy --config "$CONFIG"

echo "5/5 Health-Check …"
READY=0
for _ in $(seq 1 12); do
  if curl -fsS --max-time 15 "$WORKER_URL/api/account/health" -o /tmp/nexus-health.json; then
    if node -e 'const d=require("/tmp/nexus-health.json"); process.exit(d.ok === true && d.database === "ok" ? 0 : 1)'; then READY=1; break; fi
  fi
  sleep 5
done
cat /tmp/nexus-health.json 2>/dev/null || true
echo
[ "$READY" = "1" ] || fail "Der Worker antwortet, aber der Health-Check ist nicht ok (D1-Bindung prüfen)."
echo "Fertig: $WORKER_URL"
