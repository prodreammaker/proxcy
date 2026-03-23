# AGENTS.md

## Project overview

Cloudflare Workers repository containing two projects:
1. **VLESS-over-WebSocket Worker** – existing standalone JS files (`worker.js`, `workerui.js`, `vless-clean.js`) with no npm dependencies.
2. **Secure Edge Gateway & Management Dashboard** – modular ES Modules project under `src/` with `package.json` dependencies (Wrangler, ESLint, Vitest). Integrates VLESS WebSocket proxying with a hidden admin dashboard and reverse proxy layer.

## Cursor Cloud specific instructions

### Services

| Service | Command | Notes |
|---|---|---|
| Edge Gateway (dev) | `npm run dev` | Runs `wrangler dev -c wrangler-kv-dashboard.toml` on port 8787. Uses local KV simulation. Admin dashboard is at `/${ADMIN_UUID}` (see `wrangler-kv-dashboard.toml` `[vars]`). Default login: `admin` / `changeme`. Root path (`/`) acts as a reverse proxy — returns 502 if upstream is unreachable in dev. |

### Lint / Test / Build

- **Lint:** `npm run lint` — ESLint on `src/` only (root-level JS files excluded in `eslint.config.js`).
- **Test:** `npm run test` — Vitest with `@cloudflare/vitest-pool-workers`. Tests cover auth flow, admin routing, config save, KV CRUD, and verify the admin dashboard is not exposed on public paths. Expect DNS errors for `filterjoo.ir` in test output — they're harmless (reverse proxy upstream unreachable in CI).
- **Deploy:** `npm run deploy` — requires `CLOUDFLARE_API_TOKEN`. Not needed for local dev.

### Gotchas

- The admin dashboard is **hidden** behind `/${ADMIN_UUID}`. Visiting `/` triggers the reverse proxy, NOT the login page.
- `wrangler-kv-dashboard.toml` uses a placeholder KV namespace ID. Wrangler local dev creates in-memory KV automatically. Replace the ID before deploying to Cloudflare.
- The `wrangler.toml` (root) is for the original VLESS worker, **not** the Edge Gateway. Always use `-c wrangler-kv-dashboard.toml`.
- Tailwind CSS is loaded via CDN in `src/ui-views.js` — no build step for styles.
- The VLESS WebSocket handler reads config (UUID, proxyIp) from KV at connection time. If KV has no config, it falls back to `ADMIN_UUID` from env vars.
- Session cookies are scoped to `Path=/${ADMIN_UUID}` so they're never sent on public routes.
