import {
  validateCredentials,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookie,
} from './auth.js';
import {
  getGatewayConfig,
  putGatewayConfig,
  listKeys,
  getValue,
  putValue,
  deleteValue,
} from './kv-service.js';
import { loginPage, dashboardPage, viewValuePage } from './ui-views.js';

// ─── VLESS Protocol Constants ────────────────────────────────────────────────

const CF_RANGES = [
  '103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','104.16.0.0/13',
  '104.24.0.0/14','108.162.192.0/18','131.0.72.0/22','141.101.64.0/18',
  '162.158.0.0/15','172.64.0.0/13','173.245.48.0/20','188.114.96.0/20',
  '190.93.240.0/20','197.234.240.0/22','198.41.128.0/17',
];

const CF_HINTS = ['workers.dev', 'pages.dev', 'cloudflare', 'cdn-cgi', 'trycloudflare.com'];

function ipNum(ip) {
  const p = ip.split('.');
  let n = 0;
  for (let i = 0; i < 4; i++) n = (n << 8 | parseInt(p[i], 10)) >>> 0;
  return n;
}

const CF_PARSED = CF_RANGES.map((cidr) => {
  const [base, bits] = cidr.split('/');
  const mask = parseInt(bits, 10) === 0 ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return { base: ipNum(base), mask };
});

function isCfIp(ip) {
  try {
    const n = ipNum(ip);
    for (const c of CF_PARSED) if ((n & c.mask) === (c.base & c.mask)) return true;
  } catch (_) { /* non-IPv4 */ }
  return false;
}

function isCfHost(hostname) {
  const h = (hostname || '').toLowerCase();
  return CF_HINTS.some((hint) => h.includes(hint));
}

// ─── VLESS Protocol Parser ───────────────────────────────────────────────────

function parseVless(buf, targetUuid) {
  try {
    if (buf.length < 24) return null;
    const uuidBytes = buf.slice(1, 17);
    let hex = '';
    for (let i = 0; i < 16; i++) hex += ('0' + uuidBytes[i].toString(16)).slice(-2);
    const uuid = hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    if (uuid.toLowerCase() !== targetUuid.toLowerCase()) return null;

    const addonsLen = buf[17];
    let offset = 18 + addonsLen;
    if (offset + 3 > buf.length) return null;

    const cmd = buf[offset];
    if (cmd !== 1 && cmd !== 2) return null;
    const port = (buf[offset + 1] << 8) | buf[offset + 2];
    const addrType = buf[offset + 3];
    offset += 4;

    let host = '';
    if (addrType === 1) {
      if (offset + 4 > buf.length) return null;
      host = buf[offset]+'.'+buf[offset+1]+'.'+buf[offset+2]+'.'+buf[offset+3];
      offset += 4;
    } else if (addrType === 2) {
      const domLen = buf[offset++];
      host = new TextDecoder().decode(buf.slice(offset, offset + domLen));
      offset += domLen;
    } else if (addrType === 3) {
      if (offset + 16 > buf.length) return null;
      const parts = [];
      for (let i = 0; i < 8; i++) parts.push(((buf[offset+i*2]<<8)|buf[offset+i*2+1]).toString(16));
      host = parts.join(':');
      offset += 16;
    } else {
      return null;
    }
    return { cmd, port, host, addrType, payload: buf.slice(offset) };
  } catch (_) { return null; }
}

// ─── VLESS WebSocket Handler ─────────────────────────────────────────────────

async function handleVless(server, vlessUuid, proxyIp) {
  let socket = null;
  let writer = null;
  let closed = false;

  function closeAll() {
    if (closed) return;
    closed = true;
    try { if (writer) writer.releaseLock(); } catch (_) {}
    try { if (socket) socket.close(); } catch (_) {}
    try { server.close(1000, 'done'); } catch (_) {}
  }

  try {
    const firstData = await new Promise((resolve, reject) => {
      let done = false;
      server.addEventListener('message', (ev) => { if (!done) { done = true; resolve(ev.data); } });
      server.addEventListener('close', () => { if (!done) { done = true; reject(new Error('closed')); } });
      server.addEventListener('error', () => { if (!done) { done = true; reject(new Error('error')); } });
    });

    const raw = firstData instanceof ArrayBuffer ? new Uint8Array(firstData) : firstData;
    if (!(raw instanceof Uint8Array)) { closeAll(); return; }

    const hdr = parseVless(raw, vlessUuid);
    if (!hdr) { closeAll(); return; }

    let connectFn;
    try {
      const socks = await import('cloudflare:sockets');
      connectFn = socks && socks.connect;
    } catch (_) { connectFn = null; }
    if (!connectFn) { closeAll(); return; }

    let targetHost = hdr.host;
    if (hdr.addrType === 1 && isCfIp(hdr.host)) targetHost = proxyIp;
    if (hdr.addrType === 2 && isCfHost(hdr.host)) targetHost = proxyIp;

    try {
      socket = connectFn({ hostname: targetHost, port: hdr.port });
      writer = socket.writable.getWriter();
    } catch (_) { closeAll(); return; }

    const responseHdr = new Uint8Array(2);
    try {
      await writer.write(responseHdr);
      if (hdr.payload.length > 0) await writer.write(hdr.payload);
    } catch (_) { closeAll(); return; }

    const pumpDone = (async () => {
      try {
        const reader = socket.readable.getReader();
        let first = true;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          if (first) {
            first = false;
            const out = new Uint8Array(2 + chunk.length);
            out.set(chunk, 2);
            try { server.send(out); } catch (_) {}
          } else {
            try { server.send(chunk); } catch (_) {}
          }
        }
        reader.releaseLock();
      } catch (_) {}
      closeAll();
    })();
    pumpDone.catch(() => closeAll());

    server.addEventListener('message', (ev) => {
      try {
        if (closed) return;
        const d = ev.data;
        const buf = d instanceof ArrayBuffer ? new Uint8Array(d) : d;
        if (!(buf instanceof Uint8Array)) return;
        writer.write(buf).catch(() => closeAll());
      } catch (_) { closeAll(); }
    });

    server.addEventListener('close', closeAll);
    server.addEventListener('error', closeAll);
  } catch (_) { closeAll(); }
}

// ─── Reverse Proxy ───────────────────────────────────────────────────────────

async function reverseProxy(request, targetOrigin) {
  try {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, targetOrigin);

    const headers = new Headers(request.headers);
    headers.set('Host', target.host);
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const upstream = await fetch(target.toString(), init);
    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete('set-cookie');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (_) {
    return new Response('Upstream unavailable', { status: 502, headers: { 'Content-Type': 'text/plain' } });
  }
}

// ─── Utility Responses ───────────────────────────────────────────────────────

const TINY_GIF = new Uint8Array([
  71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59,
]);

function htmlResp(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html;charset=UTF-8', ...extra } });
}

function redir(location, extra = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extra } });
}

// ─── Admin Route Handlers ────────────────────────────────────────────────────

async function authenticate(request, env) {
  const token = getSessionCookie(request);
  return verifySessionToken(token, env.SESSION_SECRET);
}

async function handleAdminLogin(request, env, basePath) {
  if (request.method === 'GET') {
    return htmlResp(loginPage(basePath));
  }

  const form = await request.formData();
  const username = form.get('username') || '';
  const password = form.get('password') || '';

  if (!validateCredentials(username, password, env)) {
    return htmlResp(loginPage(basePath, 'Invalid username or password'), 401);
  }

  const token = await createSessionToken(username, env.SESSION_SECRET);
  return redir(`${basePath}/dashboard`, { 'Set-Cookie': setSessionCookie(token, basePath) });
}

async function handleDashboard(request, env, basePath, host) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const message = url.searchParams.get('msg') || '';
  const messageType = url.searchParams.get('msgType') || 'success';

  const config = await getGatewayConfig(env.KV_DATA, env.ADMIN_UUID);
  const { keys } = await listKeys(env.KV_DATA, { prefix });
  return htmlResp(dashboardPage(basePath, { config, keys, host, message, messageType }));
}

async function handleConfigSave(request, env, basePath) {
  const form = await request.formData();

  const cleanIpsRaw = (form.get('cleanIps') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const portsRaw = (form.get('ports') || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0 && n < 65536);

  const config = {
    uuid: (form.get('uuid') || '').trim(),
    proxyIp: (form.get('proxyIp') || '').trim(),
    cleanIps: cleanIpsRaw,
    ports: portsRaw.length ? portsRaw : [443],
    proxyTarget: (form.get('proxyTarget') || '').trim(),
  };

  await putGatewayConfig(env.KV_DATA, config);
  return redir(`${basePath}/dashboard?msg=Configuration+saved&msgType=success`);
}

async function handleKvGet(request, env, basePath) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return redir(`${basePath}/dashboard?msg=Key+is+required&msgType=error`);
  const value = await getValue(env.KV_DATA, key);
  return htmlResp(viewValuePage(basePath, key, value));
}

async function handleKvPut(request, env, basePath) {
  const form = await request.formData();
  const key = (form.get('key') || '').trim();
  const value = form.get('value') || '';
  const ttl = parseInt(form.get('ttl') || '0', 10);

  if (!key) return redir(`${basePath}/dashboard?msg=Key+is+required&msgType=error`);
  const opts = {};
  if (ttl >= 60) opts.expirationTtl = ttl;
  await putValue(env.KV_DATA, key, value, opts);
  return redir(`${basePath}/dashboard?msg=Key+"${encodeURIComponent(key)}"+saved&msgType=success`);
}

async function handleKvDelete(request, env, basePath) {
  const form = await request.formData();
  const key = (form.get('key') || '').trim();
  if (!key) return redir(`${basePath}/dashboard?msg=Key+is+required&msgType=error`);
  await deleteValue(env.KV_DATA, key);
  return redir(`${basePath}/dashboard?msg=Key+"${encodeURIComponent(key)}"+deleted&msgType=success`);
}

// ─── Main Fetch Handler ──────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = request.method.toUpperCase();
      const host = request.headers.get('Host') || url.host;
      const adminUuid = env.ADMIN_UUID || '';
      const basePath = adminUuid ? `/${adminUuid}` : '/__admin';

      // ── WebSocket upgrade → VLESS tunnel ──────────────────────────────
      const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
      const wsKey = (request.headers.get('Sec-WebSocket-Key') || '').trim();
      if (upgrade === 'websocket' && wsKey) {
        try {
          const config = await getGatewayConfig(env.KV_DATA, adminUuid);
          const vlessUuid = config.uuid || adminUuid;
          const proxyIp = config.proxyIp || 'cdn.xn--b6gac.eu.org';

          const pair = new WebSocketPair();
          const [client, server] = Object.values(pair);
          server.accept();
          const p = handleVless(server, vlessUuid, proxyIp);
          p.catch(() => {});
          if (ctx && ctx.waitUntil) ctx.waitUntil(p);
          return new Response(null, { status: 101, webSocket: client });
        } catch (_) {
          return new Response('WS error', { status: 200 });
        }
      }

      // ── Static assets ─────────────────────────────────────────────────
      if (path.toLowerCase() === '/favicon.ico') {
        return method === 'HEAD'
          ? new Response(null, { status: 200, headers: { 'Content-Type': 'image/gif' } })
          : new Response(TINY_GIF, { status: 200, headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=31536000' } });
      }

      if (path === '/health') {
        return new Response('{"ok":true,"service":"edge-gateway"}', {
          status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }

      if (path === '/robots.txt') {
        return new Response('User-agent: *\nDisallow: /', {
          status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
        });
      }

      // ── Admin routes (secret path) ────────────────────────────────────
      if (adminUuid && path.toLowerCase().startsWith(basePath.toLowerCase())) {
        const sub = path.slice(basePath.length) || '/';

        if (sub === '/' || sub === '/login') {
          return handleAdminLogin(request, env, basePath);
        }

        if (sub === '/logout') {
          return redir('/', { 'Set-Cookie': clearSessionCookie(basePath) });
        }

        const user = await authenticate(request, env);
        if (!user) return redir(basePath);

        switch (sub) {
          case '/dashboard':
            return handleDashboard(request, env, basePath, host);
          case '/config':
            if (method !== 'POST') return redir(`${basePath}/dashboard`);
            return handleConfigSave(request, env, basePath);
          case '/kv/get':
            return handleKvGet(request, env, basePath);
          case '/kv/put':
            if (method !== 'POST') return redir(`${basePath}/dashboard`);
            return handleKvPut(request, env, basePath);
          case '/kv/delete':
            if (method !== 'POST') return redir(`${basePath}/dashboard`);
            return handleKvDelete(request, env, basePath);
          default:
            return redir(`${basePath}/dashboard`);
        }
      }

      // ── Reverse proxy (all other traffic) ─────────────────────────────
      const config = await getGatewayConfig(env.KV_DATA, adminUuid);
      if (config.proxyTarget) {
        return reverseProxy(request, config.proxyTarget);
      }

      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
    }
  },
};
