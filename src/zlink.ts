import type { ZLinkLink } from './types';

export class ZLinkApiError extends Error {}

async function request<T>(
  apiBase: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${apiBase.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      const parts = Object.entries(body).map(([k, v]) => (k === 'detail' ? String(v) : `${k}: ${v}`));
      if (parts.length) detail = parts.join(' · ');
    } catch {
      // non-JSON error body; keep the HTTP status as the message
    }
    throw new ZLinkApiError(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Probes the configured endpoint to confirm it's a reachable ZLink API with this key. */
export async function testConnection(apiBase: string, apiKey: string): Promise<void> {
  await request<ZLinkLink[]>(apiBase, apiKey, '/links/?search=__zlink_line_bot_probe__');
}

/** Checks that the URL itself points at a ZLink API, before an API key is even known. */
export async function checkHealth(apiBase: string): Promise<void> {
  const url = `${apiBase.replace(/\/+$/, '')}/healthz/`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ZLinkApiError('無法連線到這個網址');
  }
  if (!res.ok) throw new ZLinkApiError(`HTTP ${res.status}`);
}

export async function createLink(
  apiBase: string,
  apiKey: string,
  params: { original_url: string; short_code?: string; expires_at?: string | null },
): Promise<ZLinkLink> {
  return request<ZLinkLink>(apiBase, apiKey, '/links/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listLinks(apiBase: string, apiKey: string, search?: string): Promise<ZLinkLink[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<ZLinkLink[]>(apiBase, apiKey, `/links/${qs}`);
}

export async function findLinkByCode(
  apiBase: string,
  apiKey: string,
  code: string,
): Promise<ZLinkLink | null> {
  const results = await listLinks(apiBase, apiKey, code);
  return results.find((l) => l.short_code === code) ?? null;
}

export async function deleteLink(apiBase: string, apiKey: string, id: number): Promise<void> {
  await request<void>(apiBase, apiKey, `/links/${id}/`, { method: 'DELETE' });
}
