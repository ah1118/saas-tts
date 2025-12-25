-- =========================
-- USERS
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT UNIQUE NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- =========================
-- USAGE LOG (TTS usage)
-- =========================
CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chars INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- =========================
-- JOBS (TTS + VIDEO)
-- =========================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- job type: 'tts' | 'video'
  type TEXT NOT NULL DEFAULT 'tts',

  -- job state
  status TEXT NOT NULL,          -- queued | running | done | failed

  -- used for TTS, 0 for video
  chars INTEGER NOT NULL DEFAULT 0,

  -- input or output path in R2
  r2_key TEXT,

  -- error message if failed
  error TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
