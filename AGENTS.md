# AGENTS.md

## Project overview

Cloudflare Workers repository containing:
1. **VLESS-over-WebSocket Worker** – standalone JS files (`worker.js`, `workerui.js`, `vless-clean.js`).
2. **Secure Edge Gateway & Management Dashboard** – modular ES Modules under `src/` with VLESS proxy, admin dashboard, KV config, and dual-channel notifications (Email + Telegram).

## Cursor Cloud specific instructions

### Services

| Service | Command | Notes |
|---|---|---|
| Edge Gateway (dev) | `npm run dev` | Wrangler dev on port 8787. Admin at `/${ADMIN_UUID}`. Default login: `admin` / `changeme`. |

### Lint / Test / Build / Deploy

- **Lint:** `npm run lint`
- **Test:** `npm run test` — 17 integration tests. DNS errors for `filterjoo.ir` are expected/harmless.
- **Deploy (production):** `npx wrangler deploy -c wrangler-kv-dashboard.toml` — deploys to `small-thunder-6298.amin-chinisaz.workers.dev`.

### Production deployment

- **Worker URL:** `https://small-thunder-6298.amin-chinisaz.workers.dev`
- **KV Namespace ID:** `6f3cf17d2c6a433ba21c2d228069db66`
- **Account ID:** `d902b91f0f1076e0601ffd6e7b4382c0`
- **Admin path:** `/${ADMIN_UUID}` (value in `[vars]`)
- **Cron trigger:** daily at 08:00 UTC — sends Email + Telegram report via `notification.js`

### Critical Gotchas

- `minify = true` MUST be in the wrangler toml. Without it the bundle exceeds the free-plan cold-start CPU budget and returns Error 1101.
- CIDR parsing (`getCfParsed()`) is **lazy** — computed on first WebSocket request, not at module load. This reduces cold-start time.
- **Never** use `wrangler delete` then recreate on the free plan — it causes hours of DNS propagation failures (1101). Use `wrangler deploy` to update in-place.
- The admin dashboard is hidden at `/${ADMIN_UUID}`. Root `/` is a reverse proxy to `filterjoo.ir`.
- Session cookies are scoped to `Path=/${ADMIN_UUID}`.
- `src/notification.js` uses MailChannels API for email (requires domain SPF records for delivery) and Telegram Bot API.
- The `wrangler.toml` at root is for the original standalone VLESS worker, not the Edge Gateway. Use `wrangler-kv-dashboard.toml`.
