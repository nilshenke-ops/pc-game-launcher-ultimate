-- Automatic sync PC ↔ cloud ↔ devices (see src/sync.js). The Worker also creates these objects on first use.
CREATE TABLE IF NOT EXISTS sync_tokens (hash TEXT PRIMARY KEY, user TEXT NOT NULL, device TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sync_tokens_user ON sync_tokens (user);
CREATE TABLE IF NOT EXISTS sync_state (user TEXT PRIMARY KEY, seq INTEGER NOT NULL DEFAULT 0, pc_at TEXT, pc_name TEXT);
CREATE TABLE IF NOT EXISTS sync_items (user TEXT NOT NULL, item TEXT NOT NULL, part INTEGER NOT NULL, parts INTEGER NOT NULL, ver TEXT NOT NULL, blob TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user, item, part));
CREATE TABLE IF NOT EXISTS sync_ops (user TEXT NOT NULL, id TEXT NOT NULL, blob TEXT NOT NULL, at TEXT NOT NULL, device TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user, id));
