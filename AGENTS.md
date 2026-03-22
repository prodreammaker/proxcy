## Cursor Cloud specific instructions

This is a Cloudflare Worker project (VLESS over WebSocket proxy). It has **no `package.json`** and **zero npm dependencies**; the only tool needed is the globally-installed `wrangler` CLI.

### Running the dev server

```
wrangler dev --port 8787
```

Runs locally via Miniflare (no Cloudflare account needed for local dev). The worker listens on `http://localhost:8787`.

### Key routes for testing

| Route | Purpose |
|---|---|
| `GET /` | Status/home page (shows "Node Online") |
| `GET /health` | Health check — returns `{"ok":true,"service":"vless-ws-worker"}` |
| `GET /84621b0a-14e1-4600-ad46-aec6bcfa0e14` | VLESS config UI with generated connection URIs |
| `GET /robots.txt` | Robots policy |
| WebSocket upgrade | VLESS tunnel handler (requires a VLESS client to test) |

### Gotchas

- There is no `package.json`, so `npm install` / `pnpm install` are not applicable. Wrangler must be installed globally (`npm i -g wrangler`).
- The worker uses the `cloudflare:sockets` built-in module, which is only available in the Cloudflare Workers runtime (provided by Miniflare locally).
- Full E2E proxy tunnel testing requires a VLESS-compatible client (e.g. v2rayN, Xray); HTTP endpoint testing can be done with `curl` or a browser.
- No lint or test framework is configured in this repo. Validation is done via endpoint testing.
- Deploying to Cloudflare (`wrangler deploy`) requires a `CLOUDFLARE_API_TOKEN`. Local dev does not.
