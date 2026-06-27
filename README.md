# ZLinkLineBot

A LINE Bot for creating and managing [ZLink](../ZLinkAPI) short links from a
chat. Runs on Cloudflare Workers (via [Hono](https://hono.dev)) with
Cloudflare D1 for storage — no server to manage.

Each LINE user configures their own ZLink API endpoint and API key with
`/setup`; the bot stores that per-user, so one deployment can serve many
people managing different (or the same) ZLink instances.

## How it works

1. LINE sends webhook events to `POST /webhook`.
2. The signature is verified against `LINE_CHANNEL_SECRET` (HMAC-SHA256).
3. Text messages are parsed as commands and dispatched to the configured
   ZLink API using the user's stored API key (`X-API-Key` header — see
   [ZLinkAPI's README](../ZLinkAPI/README.md#managing-links-with-an-api-key)).
4. The reply is sent back via LINE's reply API.

API key authentication on ZLink is scoped to **links only** (no users, cache,
or other API keys), so this bot can never do more than create/list/delete
short links even if a key were compromised.

## Commands

| Command | Description |
|---|---|
| `/setup <api_base> <api_key>` | Configure the ZLink API endpoint + key (tested before saving) |
| `/status` | Show the currently configured endpoint (key masked) |
| `/reset` | Clear the stored configuration |
| `/new <url> [alias]` | Create a short link (also triggered by pasting a bare URL) |
| `/list [keyword]` | List links, optionally filtered |
| `/del <short_code>` | Delete a link by its short code |
| `/help` | Show usage |

## Setup

`wrangler.toml` deliberately does **not** declare a D1 binding or database ID
— which database backs a given deployment is environment-specific, not
something that belongs in this repo. Bind your own D1 instance using
whichever path matches how you deploy:

### Option A — CLI (`wrangler`)

```bash
npx wrangler login
npx wrangler d1 create zlink-line-bot
```

Add the returned binding to a local, untracked copy of the config (don't
commit it — see the comment in `wrangler.toml` for the exact block to add),
then:

```bash
npm run db:migrate:local   # local dev
npm run db:migrate:remote  # production, after first deploy
```

### Option B — Cloudflare dashboard (no CLI)

1. **Workers & Pages → D1 → Create database**, name it whatever you like.
2. Open the database's **Console** tab and paste/run the contents of each
   file in `migrations/`, in order, to create the tables.
3. Deploy the Worker (see below), then go to the Worker's
   **Settings → Bindings → Add binding → D1 database**. Binding name must be
   `DB` (matches `Bindings.DB` in `src/types.ts`). This binding is stored on
   Cloudflare's side and persists across redeploys even though it's not in
   the repo.

### Create a LINE Messaging API channel

In the [LINE Developers Console](https://developers.line.biz/console/),
create a Messaging API channel and note:

- **Channel secret**
- **Channel access token** (issue a long-lived one)

### Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the two LINE values
npm run dev
```

Use a tool like `cloudflared tunnel` or `ngrok` to expose `localhost` and set
that URL + `/webhook` as the channel's webhook URL for testing.

### Deploy

**CLI:**

```bash
npm run deploy
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

**Dashboard (no CLI):** push this repo to GitHub, then **Workers & Pages →
Create → Workers → Import a repository**, pick the repo, deploy. Afterwards
set `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` under the Worker's
**Settings → Variables and Secrets** (type: Secret), and add the D1 binding
as described in Option B above.

Then set the webhook URL in the LINE Developers Console to
`https://<your-worker>.workers.dev/webhook` and enable "Use webhook".

## Tech stack

Hono · Cloudflare Workers · Cloudflare D1 · TypeScript
