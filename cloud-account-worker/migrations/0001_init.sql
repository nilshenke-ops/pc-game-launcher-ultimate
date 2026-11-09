-- Nexus cloud account: one encrypted blob per user name, plus failed-login bookkeeping.
-- The Worker also creates these objects on first use, so an existing database without migrations keeps working.
CREATE TABLE IF NOT EXISTS accounts (
  user TEXT PRIMARY KEY,
  auth_salt TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  blob TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_fails (
  user TEXT NOT NULL,
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_fails_lookup ON login_fails (user, ip, at);
