import type { UserConfig } from './types';

export async function getUserConfig(db: D1Database, lineUserId: string): Promise<UserConfig | null> {
  const row = await db
    .prepare('SELECT * FROM user_config WHERE line_user_id = ?')
    .bind(lineUserId)
    .first<UserConfig>();
  return row ?? null;
}

export async function setUserConfig(
  db: D1Database,
  lineUserId: string,
  apiBase: string,
  apiKey: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_config (line_user_id, api_base, api_key, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(line_user_id) DO UPDATE SET
         api_base = excluded.api_base,
         api_key = excluded.api_key,
         updated_at = datetime('now')`,
    )
    .bind(lineUserId, apiBase, apiKey)
    .run();
}

export async function clearUserConfig(db: D1Database, lineUserId: string): Promise<void> {
  await db.prepare('DELETE FROM user_config WHERE line_user_id = ?').bind(lineUserId).run();
}

export interface SetupState {
  line_user_id: string;
  step: 'awaiting_api_base' | 'awaiting_api_key';
  api_base: string | null;
}

export async function getSetupState(db: D1Database, lineUserId: string): Promise<SetupState | null> {
  const row = await db
    .prepare('SELECT * FROM setup_state WHERE line_user_id = ?')
    .bind(lineUserId)
    .first<SetupState>();
  return row ?? null;
}

export async function setSetupState(
  db: D1Database,
  lineUserId: string,
  step: SetupState['step'],
  apiBase: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO setup_state (line_user_id, step, api_base, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(line_user_id) DO UPDATE SET
         step = excluded.step,
         api_base = excluded.api_base,
         updated_at = datetime('now')`,
    )
    .bind(lineUserId, step, apiBase)
    .run();
}

export async function clearSetupState(db: D1Database, lineUserId: string): Promise<void> {
  await db.prepare('DELETE FROM setup_state WHERE line_user_id = ?').bind(lineUserId).run();
}

export interface NewLinkState {
  line_user_id: string;
  step: 'awaiting_url' | 'awaiting_alias';
  url: string | null;
}

export async function getNewLinkState(db: D1Database, lineUserId: string): Promise<NewLinkState | null> {
  const row = await db
    .prepare('SELECT * FROM new_link_state WHERE line_user_id = ?')
    .bind(lineUserId)
    .first<NewLinkState>();
  return row ?? null;
}

export async function setNewLinkState(
  db: D1Database,
  lineUserId: string,
  step: NewLinkState['step'],
  url: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO new_link_state (line_user_id, step, url, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(line_user_id) DO UPDATE SET
         step = excluded.step,
         url = excluded.url,
         updated_at = datetime('now')`,
    )
    .bind(lineUserId, step, url)
    .run();
}

export async function clearNewLinkState(db: D1Database, lineUserId: string): Promise<void> {
  await db.prepare('DELETE FROM new_link_state WHERE line_user_id = ?').bind(lineUserId).run();
}

export async function getDelState(db: D1Database, lineUserId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM del_state WHERE line_user_id = ?').bind(lineUserId).first();
  return row !== null;
}

export async function setDelState(db: D1Database, lineUserId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO del_state (line_user_id, updated_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(line_user_id) DO UPDATE SET updated_at = datetime('now')`,
    )
    .bind(lineUserId)
    .run();
}

export async function clearDelState(db: D1Database, lineUserId: string): Promise<void> {
  await db.prepare('DELETE FROM del_state WHERE line_user_id = ?').bind(lineUserId).run();
}
