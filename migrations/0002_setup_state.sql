-- Tracks an in-progress /setup conversation so the bot can ask for the API
-- base URL and API key one at a time instead of requiring both in one message.
CREATE TABLE IF NOT EXISTS setup_state (
  line_user_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  api_base TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
