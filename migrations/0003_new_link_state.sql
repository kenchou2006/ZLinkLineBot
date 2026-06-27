-- Tracks an in-progress /new conversation so the bot can ask for the target
-- URL, then the optional alias, one message at a time.
CREATE TABLE IF NOT EXISTS new_link_state (
  line_user_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  url TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
