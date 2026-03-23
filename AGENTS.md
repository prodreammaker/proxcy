# AGENTS.md

## Cursor Cloud specific instructions

This is a **Cloudflare Workers** project (VLESS-over-WebSocket proxy). There is no `package.json`, no build step, no test suite, and no linter configured.

### Key facts

- **Only tooling dependency**: Wrangler CLI (`npm i -g wrangler`), installed globally.
- **Three worker variants**: `worker.js` (production, recommended), `workerui.js` (lighter UI), `vless-clean.js` (minimal). All are standalone — no shared modules.
- **No build/bundle step**: JS files are deployed directly.
- **No automated tests or lint**: There is no test framework or linter configured in this repo.

### Running locally

- `wrangler dev --local` starts a local dev server on `http://localhost:8787` using the default `wrangler.toml` (entry: `vless-clean.js`).
- `wrangler dev --local -c wrangler-workerui.toml` runs the `workerui.js` variant.
- `wrangler dev --local worker.js` runs the full production `worker.js` variant (recommended for development).
- Key test endpoints: `/` (home), `/health` (JSON health check, worker.js only), `/<UUID>` (config page, UUID: `84621b0a-14e1-4600-ad46-aec6bcfa0e14`).

### Deploying

- Requires `CLOUDFLARE_API_TOKEN` env var (see `envexample.txt`).
- `wrangler deploy` deploys to Cloudflare Workers using `wrangler.toml`.

### Gotchas

- `wrangler dev` without `--local` attempts remote mode and requires Cloudflare auth. Always use `--local` for local-only development.
- The `cloudflare:sockets` module is only available in the Workers runtime; outbound TCP/UDP relaying cannot be tested from `localhost` — only HTTP endpoint responses can be verified locally.
