# VLESS over WebSocket Cloudflare Worker

Production-focused Cloudflare Worker for VLESS over WebSocket with:

- Resilient TCP reconnect + multi-port fallback (`443, 8443, 2053, 2083, 2087, 2096`)
- Cloudflare loop prevention via CIDR detection and proxy host substitution
- Hardened WebSocket handling (including early-data via `Sec-WebSocket-Protocol`)
- Dynamic configuration UI at `/<UUID>`
- Health endpoint for uptime checks

## Files

- `worker.js`: main production worker (recommended entrypoint)
- `workerui.js`: lighter UI-focused variant

## Routes

- `GET /` -> status/home page
- `GET /<UUID>` -> generated VLESS configuration page
- `GET|HEAD /health` -> `{"ok":true,"service":"vless-ws-worker"}`
- `GET|HEAD /robots.txt` -> robots policy
- `GET|HEAD /favicon.ico` -> tiny valid GIF response
- `WebSocket upgrade` -> VLESS tunnel handler

## Deploy (Wrangler)

1. Install Wrangler:

   - `npm i -g wrangler`

2. Login:

   - `wrangler login`

3. Deploy:

   - `wrangler deploy`

4. Tail logs:

   - `wrangler tail`

## Configuration

Edit these constants in `worker.js`:

- `USERID`: your VLESS UUID
- `PROXYIP`: fallback proxy host used for loop prevention
- `CLEAN_IPS`: fronting hosts/IPs for generated config links
- `PORTS`: retry/fallback destination ports

## Notes

- This Worker uses `cloudflare:sockets` for outbound TCP.
- UDP mode is accepted only for DNS (`port 53`) by design.
- For best reliability, keep compatibility date current and monitor `/health`.