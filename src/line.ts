/** Verify the `x-line-signature` header: base64(HMAC-SHA256(channelSecret, rawBody)). */
export async function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export interface QuickReplyItem {
  /** Button label, shown above the chat input. Max 20 characters in LINE's UI. */
  label: string;
  /** Text sent as if the user typed it, when the button is tapped. */
  text: string;
}

export async function replyText(
  channelAccessToken: string,
  replyToken: string,
  text: string | string[],
  quickReply?: QuickReplyItem[],
): Promise<void> {
  // LINE caps a single text message at 5000 characters, and a reply at 5 messages.
  const texts = (Array.isArray(text) ? text : [text]).slice(0, 5);
  const messages = texts.map((t) => ({
    type: 'text',
    text: t.length > 4900 ? t.slice(0, 4900) + '\n…(truncated)' : t,
  }));
  // Quick reply buttons can only be attached to LINE's last message in a reply.
  if (quickReply?.length && messages.length) {
    (messages[messages.length - 1] as Record<string, unknown>).quickReply = {
      items: quickReply.map((item) => ({
        type: 'action',
        action: { type: 'message', label: item.label, text: item.text },
      })),
    };
  }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    console.error('LINE reply failed', res.status, await res.text());
  }
}
