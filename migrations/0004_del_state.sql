-- Tracks an in-progress /del conversation so the bot can ask which short
-- code(s) to delete instead of requiring them in the same message.
CREATE TABLE IF NOT EXISTS del_state (
  line_user_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
