export type Bindings = {
  DB: D1Database;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
};

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source: {
    type: 'user' | 'group' | 'room';
    userId?: string;
  };
  message?: {
    type: string;
    text?: string;
  };
}

export interface UserConfig {
  line_user_id: string;
  api_base: string;
  api_key: string;
  created_at: string;
  updated_at: string;
}

/** Shape of a ZLink Link, as returned by GET/POST /links/. */
export interface ZLinkLink {
  id: number;
  original_url: string;
  short_code: string;
  short_url: string;
  expires_at: string | null;
  is_expired: boolean;
  created_at: string;
}
