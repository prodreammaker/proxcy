# AGENTS.md

## Cursor Cloud specific instructions

This is a **Cloudflare Worker** project (VLESS-over-WebSocket proxy). It has no build step and zero runtime dependencies — the two JS files (`worker.js`, `workerui.js`) are self-contained ES modules.

### Running locally

- `npm run dev` — starts `worker.js` via `wrangler dev` on port 8787
- `npm run dev:ui` — starts `workerui.js` via `wrangler dev --config wrangler-ui.toml`

Both variants serve an HTML status page at `/` and a config page at `/<USERID>` (default UUID: `84621b0a-14e1-4600-ad46-aec6bcfa0e14`). WebSocket upgrade requests on the USERID path activate the VLESS relay.

### Linting

- `npm run lint` — runs ESLint (flat config in `eslint.config.js`). Only warnings are expected (unused catch-clause variables), no errors.

### Gotchas

- There are **no automated tests** in this repo. Validation is done by running `wrangler dev` and manually hitting endpoints.
- The `cloudflare:sockets` import (used for raw TCP connect) only works inside the Cloudflare Workers runtime (wrangler dev or deployed). It will not work in plain Node.js.
- No Cloudflare account is needed for `wrangler dev` local mode; the worker runs fully in the local miniflare runtime.
- `wrangler.toml` points to `worker.js` (production variant with retry/fallback logic); `wrangler-ui.toml` points to `workerui.js` (simpler UI variant).
