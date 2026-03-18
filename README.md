![Logo](logo.webp)

[Go version API server](https://github.com/mirtlecn/post-go) | [CLI client](https://github.com/mirtlecn/post-cli) | [Skills for AI Agents](https://github.com/mirtlecn/post-cli/tree/master/skills)

# Post — Lightweight File, Text & URL Sharing API & Web UI

## Web UI

Available at <http://localhost:3000/admin>. Password is `SECRET_KEY` or `ADMIN_KEY` if set.

![Web UI Screenshot](gui.webp)

## HTTP API

Write operations require the header `Authorization: Bearer <SECRET_KEY>`.
`ttl` values are optional, use minutes, and must be between `0` and `525600` (`365` days). `0` means no expiration.
Write requests may include an optional `created` string. Accepted input formats are `RFC3339`, `RFC3339Nano`, `YYYY-MM-DD HH:MM:SS`, and date-only `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`. Values without a timezone are parsed as `Asia/Shanghai`, then stored and returned as UTC `RFC3339`.
`type: "topic"` accepts an optional `title`. Topic displays use that `title` when present, otherwise they fall back to the topic path.

Suggested shell variables:

```bash
export POST_BASE_URL="https://example.com"
export POST_TOKEN="your-secret-key"
```

For details, see [API documentation](https://github.com/mirtlecn/post-go/blob/master/API.md)

## CLI client

[CLI client](https://github.com/mirtlecn/post-cli)

## Deploy

### Vercel 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mirtlecn/post&project-name=post&repository-name=post&build-command=npm%20run%20build&env=LINKS_REDIS_URL,SECRET_KEY,ADMIN_KEY,S3_ENDPOINT,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_BUCKET_NAME,S3_REGION)

Required:
- `LINKS_REDIS_URL` : 'redis://...' or 'rediss://...' URL for Redis connection
- `SECRET_KEY` : API token
- `ADMIN_KEY` : Password for admin GUI login

### Local

Prerequisites:
- Node.js 24+
- Redis (a valid Redis URL. Get a free one at <https://redis.com/>)
- S3-compatible storage (Required for file uploads)

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Build admin UI and start local server (http://localhost:3000)
npm start

# Visit admin UI at <http://localhost:3000/admin>
```

Env:
- Required: `LINKS_REDIS_URL`, `SECRET_KEY`
- Optional: `ADMIN_KEY` (only for `/admin` GUI login; if missing, GUI login falls back to `SECRET_KEY`)
- `LINKS_REDIS_URL` should use:
  - `rediss://...` for TLS-enabled providers (recommended for Upstash and other managed Redis)
  - `redis://...` only for non-TLS Redis
- If you see socket-closed errors when using `redis://`, switch to `rediss://`
- Optional: `MAX_CONTENT_SIZE_KB` (default 500), `MAX_FILE_SIZE_MB` (default 10), `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`

## Credits

MIT Licence

© Mirtle together with OpenAI Codex
