import {
  clearDelState,
  clearNewLinkState,
  clearSetupState,
  clearUserConfig,
  getDelState,
  getNewLinkState,
  getSetupState,
  getUserConfig,
  setDelState,
  setNewLinkState,
  setSetupState,
  setUserConfig,
} from './db';
import type { QuickReplyItem } from './line';
import { checkHealth, createLink, deleteLink, findLinkByCode, listLinks, testConnection, ZLinkApiError } from './zlink';

// Commands that are safe to offer as one-tap quick reply buttons: each works
// fine sent bare (with no arguments), either running immediately or kicking
// off a step-by-step prompt flow.
const QUICK_REPLY_COMMANDS: { pattern: RegExp; item: QuickReplyItem }[] = [
  { pattern: /\/setup\b/i, item: { label: '設定 API', text: '/setup' } },
  { pattern: /\/new\b/i, item: { label: '新增短連結', text: '/new' } },
  { pattern: /\/list\b/i, item: { label: '查詢列表', text: '/list' } },
  { pattern: /\/del\b/i, item: { label: '刪除短連結', text: '/del' } },
  { pattern: /\/status\b/i, item: { label: '目前設定', text: '/status' } },
  { pattern: /\/reset\b/i, item: { label: '清除設定', text: '/reset' } },
  { pattern: /\/help\b/i, item: { label: '使用說明', text: '/help' } },
];

const RESET_CONFIRM_TEXT = '確定要清除目前的 API 設定嗎？這個動作無法復原。';
const DEL_CONFIRM_PREFIX = '確定要刪除以下短連結嗎？這個動作無法復原：\n';
const CREATED_LINK_PATTERN = /已建立短連結：\n原始網址：.*\n短代碼：(\S+)/;

function buildDelConfirmText(codes: string[]): string {
  return `${DEL_CONFIRM_PREFIX}${codes.join(', ')}`;
}

/** Scans a reply for mentions of the commands above and returns matching quick reply buttons. */
export function buildQuickReply(reply: string | string[]): QuickReplyItem[] | undefined {
  const combined = Array.isArray(reply) ? reply.join('\n') : reply;

  // The /reset confirmation prompt gets its own explicit Yes/No buttons
  // instead of the generic auto-detected ones.
  if (combined === RESET_CONFIRM_TEXT) {
    return [
      { label: '確認清除', text: '/reset confirm' },
      { label: '取消', text: '/reset cancel' },
    ];
  }

  // Same for /del's confirmation prompt — extract the codes back out of the
  // message text so the confirm button knows exactly what to delete.
  if (combined.startsWith(DEL_CONFIRM_PREFIX)) {
    const codes = combined.slice(DEL_CONFIRM_PREFIX.length).split(', ');
    return [
      { label: '確認刪除', text: `/del confirm ${codes.join(' ')}` },
      { label: '取消', text: '/del cancel' },
    ];
  }

  // Right after creating a short link, offer a one-tap way to delete that
  // specific link (going through the same confirmation as a typed /del),
  // alongside the usual help button.
  const created = combined.match(CREATED_LINK_PATTERN);
  if (created) {
    return [
      { label: '刪除此短連結', text: `/del ${created[1]}` },
      { label: '使用說明', text: '/help' },
    ];
  }

  const items = QUICK_REPLY_COMMANDS.filter(({ pattern }) => pattern.test(combined)).map((c) => c.item);
  return items.length ? items : undefined;
}

/**
 * If the user is mid-way through a /setup or /new prompt flow (the bot is
 * waiting on their next message), offer a button to back out instead of
 * requiring them to type /cancel. Call after handleTextMessage so any state
 * changes from this turn are already reflected.
 */
export async function getCancelQuickReply(
  db: D1Database,
  lineUserId: string,
): Promise<QuickReplyItem[] | undefined> {
  const setupState = await getSetupState(db, lineUserId);
  const newLinkState = await getNewLinkState(db, lineUserId);
  const delState = await getDelState(db, lineUserId);
  if (setupState || newLinkState || delState) {
    return [{ label: '取消', text: '/cancel' }];
  }
  return undefined;
}

/**
 * Decides the quick reply buttons for a reply: commands mentioned in the
 * text, otherwise a cancel button if a prompt flow is in progress, otherwise
 * a /help button so no reply is ever left without a next step to tap.
 */
export async function resolveQuickReply(
  db: D1Database,
  lineUserId: string,
  reply: string | string[],
): Promise<QuickReplyItem[]> {
  const quickReply = buildQuickReply(reply) ?? (await getCancelQuickReply(db, lineUserId));
  return quickReply ?? [{ label: '使用說明', text: '/help' }];
}

const HELP_TEXT = `ZLink 短連結機器人

第一次使用請先設定：
/setup <API網址> <API金鑰>
例如：/setup https://api.example.com/api zlk_xxxxxxxx

設定完成後可以：
建立短連結：/new <網址> [自訂別名]
查詢短連結：/list [關鍵字]
刪除短連結：/del <短代碼> [短代碼2] [短代碼3]…
查看目前設定：/status
清除設定：/reset

也可以直接貼上網址，會自動建立短連結。`;

export const WELCOME_TEXT = `您好！我是 ZLink 短連結機器人 🔗

幫您快速建立、管理自己的短網址，先用以下指令完成設定：
/setup <API網址> <API金鑰>

設定好之後，直接貼上網址就能自動產生短連結，也可以用 /help 查看完整指令說明。`;

function isUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// /del accepts either a bare short code or a pasted short URL (e.g.
// https://i.zhiu.dev/abc123) — extract the trailing path segment as the code.
function extractShortCode(input: string): string {
  if (!isUrl(input)) return input;
  const segments = new URL(input).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || input;
}

export async function handleTextMessage(
  db: D1Database,
  lineUserId: string,
  text: string,
): Promise<string | string[]> {
  const trimmed = text.trim();
  const [cmd, ...rest] = trimmed.split(/\s+/);

  const lowerCmd = cmd.toLowerCase();
  const knownCommands = [
    '/setup', '/setting', '/status', '/reset', '/new', '/create', '/list', '/del', '/delete', '/help', '/start', '/cancel',
  ];
  if (!knownCommands.includes(lowerCmd)) {
    const setupState = await getSetupState(db, lineUserId);
    if (setupState) return continueSetup(db, lineUserId, setupState, trimmed);

    const newLinkState = await getNewLinkState(db, lineUserId);
    if (newLinkState) return continueNewLink(db, lineUserId, newLinkState, trimmed);

    const delState = await getDelState(db, lineUserId);
    if (delState) return continueDel(db, lineUserId, trimmed);
  } else if (
    lowerCmd === '/help' ||
    lowerCmd === '/start' ||
    lowerCmd === '/cancel' ||
    lowerCmd === '/reset' ||
    lowerCmd === '/del' ||
    lowerCmd === '/delete'
  ) {
    await clearSetupState(db, lineUserId);
    await clearNewLinkState(db, lineUserId);
    await clearDelState(db, lineUserId);
  }

  switch (lowerCmd) {
    case '/setup':
    case '/setting':
      return handleSetup(db, lineUserId, rest);
    case '/status':
      return handleStatus(db, lineUserId);
    case '/reset':
      if (rest[0]?.toLowerCase() === 'confirm') {
        await clearUserConfig(db, lineUserId);
        return '已清除設定。請用 /setup 重新設定 API 網址與金鑰。';
      }
      if (rest[0]?.toLowerCase() === 'cancel') {
        return '已取消。';
      }
      return RESET_CONFIRM_TEXT;
    case '/cancel':
      return '已取消。';
    case '/new':
    case '/create':
      return handleNew(db, lineUserId, rest);
    case '/list':
      return handleList(db, lineUserId, rest.join(' '));
    case '/del':
    case '/delete':
      if (rest[0]?.toLowerCase() === 'confirm') {
        return handleDelete(db, lineUserId, rest.slice(1));
      }
      if (rest[0]?.toLowerCase() === 'cancel') {
        return '已取消。';
      }
      if (!rest.length) {
        try {
          await requireConfig(db, lineUserId);
        } catch (e) {
          return (e as Error).message;
        }
        await setDelState(db, lineUserId);
        return '請輸入要刪除的短代碼（可一次輸入多個，用空白分隔）：';
      }
      return buildDelConfirmText(rest.map(extractShortCode));
    case '/help':
    case '/start':
      return HELP_TEXT;
    default:
      if (isUrl(trimmed)) return handleBareUrl(db, lineUserId, trimmed);
      return `不認得這個指令。輸入 /help 查看使用說明。`;
  }
}

async function handleSetup(db: D1Database, lineUserId: string, args: string[]): Promise<string> {
  const [apiBase, apiKey] = args;

  // No args at all: walk the user through API base URL, then API key, one message at a time.
  if (!apiBase) {
    await setSetupState(db, lineUserId, 'awaiting_api_base', null);
    return '好的，請輸入您的 ZLink API 網址（例如：https://api.example.com/api）：';
  }

  if (!apiKey) {
    if (!isUrl(apiBase)) {
      return 'API 網址看起來不正確，請確認包含 http:// 或 https://。\n用法：/setup <API網址> <API金鑰>';
    }
    return checkUrlAndAskForKey(db, lineUserId, apiBase);
  }

  return finishSetup(db, lineUserId, apiBase, apiKey);
}

async function checkUrlAndAskForKey(db: D1Database, lineUserId: string, apiBase: string): Promise<string> {
  const normalizedBase = apiBase.replace(/\/+$/, '');
  try {
    await checkHealth(normalizedBase);
  } catch (e) {
    const detail = e instanceof ZLinkApiError ? e.message : '無法連線';
    return `這個網址看起來不是有效的 ZLink API（${detail}）。請重新輸入正確的 API 網址：`;
  }
  await setSetupState(db, lineUserId, 'awaiting_api_key', normalizedBase);
  return '收到網址了，請輸入您的 API 金鑰：';
}

async function continueSetup(
  db: D1Database,
  lineUserId: string,
  state: Awaited<ReturnType<typeof getSetupState>> & {},
  text: string,
): Promise<string> {
  if (state.step === 'awaiting_api_base') {
    if (!isUrl(text)) {
      return 'API 網址看起來不正確，請確認包含 http:// 或 https://，再輸入一次：';
    }
    return checkUrlAndAskForKey(db, lineUserId, text);
  }

  // awaiting_api_key
  return finishSetup(db, lineUserId, state.api_base as string, text);
}

async function finishSetup(
  db: D1Database,
  lineUserId: string,
  apiBase: string,
  apiKey: string,
): Promise<string> {
  try {
    await testConnection(apiBase, apiKey);
  } catch (e) {
    await clearSetupState(db, lineUserId);
    const detail = e instanceof ZLinkApiError ? e.message : 'API 無法連線';
    return `設定失敗：無法用這組網址和金鑰連到 ZLink API（${detail}）。請重新輸入 /setup 再試一次。`;
  }
  await setUserConfig(db, lineUserId, apiBase, apiKey);
  await clearSetupState(db, lineUserId);
  return '設定成功！現在可以用 /new 建立短連結，或直接貼上網址。';
}

async function handleStatus(db: D1Database, lineUserId: string): Promise<string> {
  const config = await getUserConfig(db, lineUserId);
  if (!config) return '尚未設定。請用 /setup <API網址> <API金鑰> 進行設定。';
  const maskedKey = config.api_key.length > 8 ? `${config.api_key.slice(0, 8)}…` : '••••';
  return `目前設定：\nAPI 網址：${config.api_base}\nAPI 金鑰：${maskedKey}`;
}

async function requireConfig(db: D1Database, lineUserId: string) {
  const config = await getUserConfig(db, lineUserId);
  if (!config) throw new Error('尚未設定 API。請先用 /setup <API網址> <API金鑰> 進行設定。');
  return config;
}

async function handleNew(db: D1Database, lineUserId: string, args: string[]): Promise<string | string[]> {
  const [url, alias] = args;

  // No args at all: walk the user through the URL, then the optional alias.
  if (!url) {
    try {
      await requireConfig(db, lineUserId);
    } catch (e) {
      return (e as Error).message;
    }
    await setNewLinkState(db, lineUserId, 'awaiting_url', null);
    return '好的，請輸入要縮短的網址：';
  }

  if (!isUrl(url)) {
    return '用法：/new <網址> [自訂別名]\n例如：/new https://example.com promo';
  }

  if (!alias) {
    await setNewLinkState(db, lineUserId, 'awaiting_alias', url);
    return '收到網址了，要自訂短代碼嗎？直接輸入想要的別名，或輸入 「skip」 略過：';
  }

  return finishNewLink(db, lineUserId, url, alias);
}

// A bare URL pasted without /new: create immediately with an auto-generated
// code, skipping the alias prompt that the explicit /new flow asks for.
async function handleBareUrl(db: D1Database, lineUserId: string, url: string): Promise<string | string[]> {
  return finishNewLink(db, lineUserId, url, undefined);
}

async function continueDel(db: D1Database, lineUserId: string, text: string): Promise<string> {
  await clearDelState(db, lineUserId);
  const codes = text.trim().split(/\s+/).filter(Boolean).map(extractShortCode);
  if (!codes.length) return '用法：/del <短代碼> [短代碼2] [短代碼3]…';
  return buildDelConfirmText(codes);
}

async function continueNewLink(
  db: D1Database,
  lineUserId: string,
  state: Awaited<ReturnType<typeof getNewLinkState>> & {},
  text: string,
): Promise<string | string[]> {
  if (state.step === 'awaiting_url') {
    if (!isUrl(text)) {
      return '網址看起來不正確，請確認包含 http:// 或 https://，再輸入一次：';
    }
    await setNewLinkState(db, lineUserId, 'awaiting_alias', text);
    return '收到網址了，要自訂短代碼嗎？直接輸入想要的別名，或輸入 「skip」 略過：';
  }

  // awaiting_alias
  const alias = text.toLowerCase() === 'skip' ? undefined : text;
  return finishNewLink(db, lineUserId, state.url as string, alias);
}

async function finishNewLink(
  db: D1Database,
  lineUserId: string,
  url: string,
  alias: string | undefined,
): Promise<string | string[]> {
  let config;
  try {
    config = await requireConfig(db, lineUserId);
  } catch (e) {
    await clearNewLinkState(db, lineUserId);
    return (e as Error).message;
  }
  try {
    const link = await createLink(config.api_base, config.api_key, {
      original_url: url,
      short_code: alias || undefined,
    });
    await clearNewLinkState(db, lineUserId);
    return [
      `已建立短連結：\n原始網址：${link.original_url}\n短代碼：${link.short_code}`,
      link.short_url,
    ];
  } catch (e) {
    await clearNewLinkState(db, lineUserId);
    const detail = e instanceof ZLinkApiError ? e.message : '未知錯誤';
    return `建立失敗：${detail}`;
  }
}

async function handleList(db: D1Database, lineUserId: string, keyword: string): Promise<string> {
  let config;
  try {
    config = await requireConfig(db, lineUserId);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const links = await listLinks(config.api_base, config.api_key, keyword || undefined);
    if (!links.length) return '沒有找到任何短連結。';
    const lines = links
      .slice(0, 15)
      .map((l) => `${l.short_code}${l.is_expired ? '（已過期）' : ''} → ${l.original_url}`);
    const more = links.length > 15 ? `\n…還有 ${links.length - 15} 筆，請用關鍵字縮小搜尋範圍。` : '';
    return lines.join('\n') + more;
  } catch (e) {
    const detail = e instanceof ZLinkApiError ? e.message : '未知錯誤';
    return `查詢失敗：${detail}`;
  }
}

async function handleDelete(db: D1Database, lineUserId: string, codes: string[]): Promise<string> {
  if (!codes.length) return '用法：/del <短代碼> [短代碼2] [短代碼3]…';
  let config;
  try {
    config = await requireConfig(db, lineUserId);
  } catch (e) {
    return (e as Error).message;
  }
  const results: string[] = [];
  for (const code of codes) {
    try {
      const link = await findLinkByCode(config.api_base, config.api_key, code);
      if (!link) {
        results.push(`找不到短代碼 「${code}」`);
        continue;
      }
      await deleteLink(config.api_base, config.api_key, link.id);
      results.push(`已刪除：${code}`);
    } catch (e) {
      const detail = e instanceof ZLinkApiError ? e.message : '未知錯誤';
      results.push(`刪除 「${code}」 失敗：${detail}`);
    }
  }
  return results.join('\n');
}
