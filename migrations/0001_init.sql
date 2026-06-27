-- Per-LINE-user ZLink API credentials. Each LINE user configures their own
-- ZLink instance (API base URL + API key) via the /setup command, so one bot
-- deployment can manage links across many independent ZLink instances.
CREATE TABLE IF NOT EXISTS user_config (
  line_user_id TEXT PRIMARY KEY,
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
