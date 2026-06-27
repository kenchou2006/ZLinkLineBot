import { Hono } from 'hono';
import { buildQuickReply, handleTextMessage, WELCOME_TEXT } from './commands';
import { replyText, verifyLineSignature } from './line';
import type { Bindings, LineEvent, LineWebhookBody } from './types';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => c.text('ZLink LINE Bot is running.'));

app.post('/webhook', async (c) => {
  const signature = c.req.header('x-line-signature');
  const rawBody = await c.req.text();

  if (!signature || !(await verifyLineSignature(c.env.LINE_CHANNEL_SECRET, rawBody, signature))) {
    return c.text('Invalid signature', 401);
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text('Invalid body', 400);
  }

  // Reply to LINE immediately; process events in the background so the
  // webhook doesn't time out waiting on the ZLink API.
  c.executionCtx.waitUntil(
    Promise.all(body.events.map((event) => handleEvent(c.env, event))).then(() => undefined),
  );

  return c.text('OK');
});

async function handleEvent(env: Bindings, event: LineEvent): Promise<void> {
  if (event.type === 'follow') {
    if (event.replyToken) {
      await replyText(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, WELCOME_TEXT, buildQuickReply(WELCOME_TEXT));
    }
    return;
  }

  if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) return;
  const userId = event.source.userId;
  if (!userId) {
    await replyText(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, '目前僅支援一對一聊天設定 API。');
    return;
  }

  const reply = await handleTextMessage(env.DB, userId, event.message.text ?? '');
  await replyText(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, reply, buildQuickReply(reply));
}

export default app;
