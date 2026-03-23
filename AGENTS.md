# AGENTS.md

## Project overview

Cloudflare Workers repository containing two projects:
1. **VLESS-over-WebSocket Worker** – existing standalone JS files (`worker.js`, `workerui.js`, `vless-clean.js`) with no npm dependencies.
2. **KV Data Management Dashboard** – modular ES Modules project under `src/` with `package.json` dependencies (Wrangler, ESLint, Vitest).

## Cursor Cloud specific instructions

### Services

| Service | Command | Notes |
|---|---|---|
| KV Dashboard (dev) | `npm run dev` | Runs `wrangler dev -c wrangler-kv-dashboard.toml` on port 8787. Uses local KV simulation — no real Cloudflare KV namespace needed. Default login: `admin` / `changeme` (set in `wrangler-kv-dashboard.toml` `[vars]`). |

### Lint / Test / Build

- **Lint:** `npm run lint` — runs ESLint on `src/` only (existing root-level JS files are excluded via `eslint.config.js` ignores).
- **Test:** `npm run test` — runs Vitest with `@cloudflare/vitest-pool-workers` which spins up a local Workerd runtime. All tests use the in-memory KV binding from `wrangler-kv-dashboard.toml`.
- **Build/Deploy:** `npm run deploy` — deploys to Cloudflare (requires `CLOUDFLARE_API_TOKEN`). Not needed for local dev.

### Gotchas

- The `wrangler-kv-dashboard.toml` config uses a placeholder KV namespace ID (`placeholder-kv-namespace-id`). Wrangler local dev (`--local`) creates an in-memory KV automatically, so this works fine for development. Replace with a real ID before deploying to Cloudflare.
- The `wrangler.toml` (root) is for the original VLESS worker, **not** the KV dashboard. Always use `-c wrangler-kv-dashboard.toml` for dashboard work.
- Tailwind CSS is loaded via CDN in the HTML templates (`src/ui-views.js`), so no build step is needed for styles.
