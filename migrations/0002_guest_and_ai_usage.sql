-- Guest accounts (no sign-in) and per-user daily AI usage counters
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;

CREATE TABLE ai_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
