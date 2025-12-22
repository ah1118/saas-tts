CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chars INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user
ON usage_log(user_id);
