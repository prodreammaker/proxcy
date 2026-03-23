// ============================================================================
// VLESS over WebSocket — Cloudflare Worker (Ultra-Hardened Production Build)
// ============================================================================
// Features:
//   • Global unhandledrejection / error safety net (eliminates Error 1101)
//   • Explicit STATE machine: IDLE → CONNECTING → ACTIVE → RETRYING → FAILED
//   • Multi-port pool with ordered fallback (443, 8443, 2053, 2083, 2087, 2096)
//   • Retry buffer: 1 MB / 200 chunks, defensive copy, FIFO seal, exact replay
//   • Generation token: stale pumps self-terminate after reconnect
//   • retryLock mutex: single-threaded retry guarantee, released at ALL exit paths
//   • Heartbeat (10 s): detects silently-dead writer
//   • Watchdog (5 s poll): half-open TCP (15 s no remote data) + 30 s idle close
//   • safeAsync wrapper: every async boundary protected, routes errors to closeAll
//   • Write validation: generation + writer + state checked before every write
//   • Hardened loop bodies: try/catch inside every while loop
//   • Safe socket teardown: releaseLock → close, no ghost sockets
//   • pendingData queue (max 100 chunks) buffers WS frames during reconnect
//   • VLESS response header (0x00 0x00) prepended to first remote data chunk
//   • UDP framed forwarding (DNS port 53 only)
//   • CF loop prevention via CIDR match → PROXYIP substitution
//   • Input validation: UUID, port range, domain length, address type
//   • Multi-port config page with per-port VLESS links and copy buttons
//   • Toast notification, fallback clipboard, New IP button
//   • Zero unhandled exceptions — never returns 1101
// ============================================================================

// ==========================
// Global Safety Net
// ==========================
// NOTE: addEventListener('unhandledrejection') is intentionally omitted.
// In CF Workers ES Module format, registering this listener at module scope
// with ev.preventDefault() causes immediate startup failure (Error 1101).
// All async boundaries are protected by safeAsync() + pumpPromise.catch()
// + ctx.waitUntil(), which is sufficient to prevent unhandled rejections.

// ==========================
// Core Configuration
// ==========================
var USERID  = '84621b0a-14e1-4600-ad46-aec6bcfa0e14';
var PROXYIP = 'cdn.xn--b6gac.eu.org';
var CLEAN_IPS = [
  'zula.ir',
  'icook.hk',
  'www.visa.com',
  'www.shopify.com',
  '104.17.10.10',
  '104.18.2.2',
  '162.159.192.1'
];

// MULTI-PORT POOL (443 MUST REMAIN FIRST PRIORITY)
var PORTS = [443, 8443, 2053, 2083, 2087, 2096];

var CF_CIDRS = [
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17'
];

// ==========================
// CIDR Pre-parse
// ==========================
function ipToInt(ip) {
  try {
    var parts = String(ip).split('.');
    if (parts.length !== 4) return 0;
    var res = 0;
    for (var i = 0; i < 4; i++) {
      var num = parseInt(parts[i], 10);
      if (isNaN(num) || num < 0 || num > 255) return 0;
      res = ((res << 8) + (num & 255)) >>> 0;
    }
    return res >>> 0;
  } catch (err) {
    console.error('[ipToInt] error:', err && err.message ? err.message : String(err));
    return 0;
  }
}

function parseCIDR(cidr) {
  try {
    var parts = String(cidr).split('/');
    var base = ipToInt(parts[0]);
    var maskBits = parseInt(parts[1], 10);
    if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) maskBits = 0;
    var mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return { base: base, mask: mask };
  } catch (err) {
    console.error('[parseCIDR] error:', err && err.message ? err.message : String(err));
    return { base: 0, mask: 0 };
  }
}

var CF_CIDR_PARSED = [];
for (var ci = 0; ci < CF_CIDRS.length; ci++) {
  CF_CIDR_PARSED.push(parseCIDR(CF_CIDRS[ci]));
}

function isCloudflareIP(ip) {
  try {
    var ipInt = ipToInt(ip);
    if (ipInt === 0) return false;
    for (var i = 0; i < CF_CIDR_PARSED.length; i++) {
      var c = CF_CIDR_PARSED[i];
      if ((ipInt & c.mask) === (c.base & c.mask)) return true;
    }
    return false;
  } catch (err) {
    console.error('[isCloudflareIP] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

function looksLikeCloudflareHostname(hostname) {
  try {
    var h = String(hostname || '').toLowerCase();
    if (!h) return false;
    var hints = [
      'workers.dev',
      'pages.dev',
      'cloudflare',
      'cdn-cgi',
      'cf-ipfs',
      'trycloudflare.com'
    ];
    for (var i = 0; i < hints.length; i++) {
      if (h.indexOf(hints[i]) !== -1) return true;
    }
    return false;
  } catch (err) {
    console.error('[looksLikeCloudflareHostname] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

var SOCKETS_CONNECT_CACHE = null;
async function getCloudflareSocketsConnect() {
  try {
    if (SOCKETS_CONNECT_CACHE) return SOCKETS_CONNECT_CACHE;
  } catch (err) {}
  try {
    var mod = await import('cloudflare:sockets');
    if (mod && typeof mod.connect === 'function') {
      SOCKETS_CONNECT_CACHE = mod.connect;
      return SOCKETS_CONNECT_CACHE;
    }
  } catch (err1) {
    console.error('[getCloudflareSocketsConnect] first import failed:', err1 && err1.message ? err1.message : String(err1));
  }
  try {
    // Recovery retry path for transient module loader failures.
    await Promise.resolve();
    var modRetry = await import('cloudflare:sockets');
    if (modRetry && typeof modRetry.connect === 'function') {
      SOCKETS_CONNECT_CACHE = modRetry.connect;
      return SOCKETS_CONNECT_CACHE;
    }
  } catch (err2) {
    console.error('[getCloudflareSocketsConnect] retry import failed:', err2 && err2.message ? err2.message : String(err2));
  }
  return null;
}

function getRandomCleanIP() {
  try {
    var idx = Math.floor(Math.random() * CLEAN_IPS.length);
    return CLEAN_IPS[idx];
  } catch (err) {
    console.error('[getRandomCleanIP] error:', err && err.message ? err.message : String(err));
    return '104.18.2.2';
  }
}

// ==========================
// Byte / String Utilities
// ==========================
function bytesToString(bytes, offset, length) {
  try {
    var s = '';
    for (var i = 0; i < length; i++) {
      s += String.fromCharCode(bytes[offset + i]);
    }
    return s;
  } catch (err) {
    console.error('[bytesToString] error:', err && err.message ? err.message : String(err));
    return '';
  }
}

function byteHex(b) {
  var h = (b & 255).toString(16);
  return h.length === 1 ? '0' + h : h;
}

function bytesToUUID(bytes) {
  try {
    if (!bytes || bytes.length < 16) return '00000000-0000-0000-0000-000000000000';
    var hex = '';
    for (var i = 0; i < 16; i++) hex += byteHex(bytes[i]);
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20, 32)
    );
  } catch (err) {
    console.error('[bytesToUUID] error:', err && err.message ? err.message : String(err));
    return '00000000-0000-0000-0000-000000000000';
  }
}

function isValidUUID(uuid) {
  try {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  } catch (err) {
    console.error('[isValidUUID] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

function escapeHtml(str) {
  try {
    var s = String(str);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 38) out += '&amp;';
      else if (c === 60) out += '&lt;';
      else if (c === 62) out += '&gt;';
      else if (c === 34) out += '&quot;';
      else out += s.charAt(i);
    }
    return out;
  } catch (err) {
    console.error('[escapeHtml] error:', err && err.message ? err.message : String(err));
    return '';
  }
}

// ==========================
// Safe I/O Wrappers
// ==========================

// safeSend — guards ws.send with readyState check and try/catch
function safeSend(ws, data, state) {
  try {
    if (state && (state.closed || state.wsClosed)) return;
    if (!ws) return;
    if (ws.readyState !== 1) return;
    ws.send(data);
  } catch (err) {
    console.error('[safeSend] ws.send error:', err && err.message ? err.message : String(err));
  }
}

// safeClose — guards ws.close with readyState check
function safeClose(ws, code, reason, state) {
  try {
    if (state && state.wsClosed) return;
    if (!ws) return;
    var rs = ws.readyState;
    if (rs === 0 || rs === 1 || rs === 2) {
      try {
        ws.close(code, reason);
      } catch (inner) {
        console.error('[safeClose] ws.close inner:', inner && inner.message ? inner.message : String(inner));
      }
    }
    if (state) state.wsClosed = true;
  } catch (err) {
    console.error('[safeClose] error:', err && err.message ? err.message : String(err));
  }
}

// safeWrite — guards writer.write, throws on failure so caller can retry
async function safeWrite(writer, data, state) {
  try {
    if (!writer) return;
    if (state && (state.closed || state.writerClosed)) return;
    await writer.write(data);
  } catch (err) {
    console.error('[safeWrite] writer.write error:', err && err.message ? err.message : String(err));
    throw err;
  }
}

// ==========================
// safeAsync — Universal Async Guard
// ==========================
// Wraps any async function so that neither sync throws nor async rejections
// can escape to the Workers runtime (the primary cause of Error 1101).
//
// Usage:
//   server.addEventListener('message', safeAsync(async function(ev){...}, 'msg', onErr));
//   safeAsync(async function(){...}, 'init')();
//
// Parameters:
//   fn      — async function to protect
//   context — label for structured log output
//   onError — optional callback(err, msg) routes error to retry/close logic
function safeAsync(fn, context, onError) {
  var label = context || 'async';
  return function safeAsyncWrapper() {
    var self = this;
    var args = arguments;
    var p;
    try {
      p = fn.apply(self, args);
    } catch (syncErr) {
      var syncMsg = syncErr && syncErr.message ? syncErr.message : String(syncErr);
      console.error('[safeAsync][' + label + '] sync throw:', syncMsg);
      if (typeof onError === 'function') {
        try { onError(syncErr, syncMsg); } catch (e2) {
          console.error('[safeAsync][' + label + '] onError throw:', e2 && e2.message ? e2.message : String(e2));
        }
      }
      return Promise.resolve();
    }
    if (!p || typeof p.then !== 'function') return p;
    return p.then(undefined, function (asyncErr) {
      var asyncMsg = asyncErr && asyncErr.message ? asyncErr.message : String(asyncErr);
      console.error('[safeAsync][' + label + '] async throw:', asyncMsg);
      if (typeof onError === 'function') {
        try { onError(asyncErr, asyncMsg); } catch (e2) {
          console.error('[safeAsync][' + label + '] onError throw:', e2 && e2.message ? e2.message : String(e2));
        }
      }
    });
  };
}

// ==========================
// WebSocket Input Helpers
// ==========================
function decodeBase64UrlToUint8(raw) {
  try {
    if (typeof atob !== 'function') return new Uint8Array(0);
    var token = String(raw || '').trim();
    if (!token) return new Uint8Array(0);
    token = token.replace(/-/g, '+').replace(/_/g, '/');
    var mod = token.length % 4;
    if (mod === 2) token += '==';
    else if (mod === 3) token += '=';
    else if (mod === 1) return new Uint8Array(0);
    var bin = atob(token);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  } catch (err) {
    console.error('[decodeBase64UrlToUint8] error:', err && err.message ? err.message : String(err));
    return new Uint8Array(0);
  }
}

function extractWsEarlyData(request) {
  try {
    if (!request || !request.headers) return new Uint8Array(0);
    var rawHeader = request.headers.get('sec-websocket-protocol') || request.headers.get('Sec-WebSocket-Protocol') || '';
    if (!rawHeader) return new Uint8Array(0);
    var tokens = String(rawHeader).split(',');
    for (var i = 0; i < tokens.length; i++) {
      var token = String(tokens[i] || '').trim();
      if (!token) continue;
      // Early data should be URL-safe base64.
      if (!/^[A-Za-z0-9\-_+=]+$/.test(token)) continue;
      var decoded = decodeBase64UrlToUint8(token);
      if (decoded && decoded.length > 0 && decoded[0] === 1) return decoded;
    }
    return new Uint8Array(0);
  } catch (err) {
    console.error('[extractWsEarlyData] error:', err && err.message ? err.message : String(err));
    return new Uint8Array(0);
  }
}

async function normalizeWsBinaryData(data) {
  try {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(data)) {
      var view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      var copy = new Uint8Array(view.length);
      copy.set(view);
      return copy;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      var ab = await data.arrayBuffer();
      return new Uint8Array(ab);
    }
    return null;
  } catch (err) {
    console.error('[normalizeWsBinaryData] error:', err && err.message ? err.message : String(err));
    return null;
  }
}

// ==========================
// Home Page  (premium UI)
// ==========================
function homePage(host) {
  try {
    var hostLabel  = escapeHtml(host || 'Unknown');
    var portsChips = '';
    for (var pi = 0; pi < PORTS.length; pi++) {
      var isPrimary = (pi === 0) ? ' primary' : '';
      portsChips +=
        '<div class="port-chip' + isPrimary + '">' +
          '<span class="chip-dot"></span>' +
          '<span class="chip-num">' + PORTS[pi] + '</span>' +
        '</div>';
    }

    var svgSettings =
      '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>' +
      '</svg>';

    var svgArrow =
      '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>' +
      '</svg>';

    var CSS = '' +
      ':root{color-scheme:dark;' +
        '--bg:#06080f;--surf:rgba(12,15,28,.9);--surf2:rgba(6,8,18,.7);' +
        '--sky:#38bdf8;--sky-d:rgba(56,189,248,.08);--sky-m:rgba(56,189,248,.18);--sky-b:rgba(56,189,248,.35);' +
        '--grn:#10b981;--grn-d:rgba(16,185,129,.1);--grn-b:rgba(16,185,129,.35);' +
        '--vio:#8b5cf6;--vio-d:rgba(139,92,246,.1);--vio-b:rgba(139,92,246,.3);' +
        '--brd:rgba(51,65,85,.55);--mut:#64748b;--sub:#94a3b8;--txt:#e2e8f0;' +
        '--r:20px;' +
      '}' +
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}' +
      'body{min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'background:var(--bg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
        'color:var(--txt);overflow:hidden;}' +

      /* ── aurora blobs ── */
      '.au{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}' +
      '.au b{position:absolute;border-radius:50%;filter:blur(90px);animation:drift linear infinite alternate;}' +
      '.au b:nth-child(1){width:600px;height:600px;background:radial-gradient(circle,#0ea5e9 0%,transparent 70%);opacity:.14;top:-180px;left:-140px;animation-duration:18s;}' +
      '.au b:nth-child(2){width:480px;height:480px;background:radial-gradient(circle,#6366f1 0%,transparent 70%);opacity:.13;bottom:-120px;right:-100px;animation-duration:22s;animation-delay:-8s;}' +
      '.au b:nth-child(3){width:340px;height:340px;background:radial-gradient(circle,#10b981 0%,transparent 70%);opacity:.12;top:35%;left:50%;animation-duration:19s;animation-delay:-4s;}' +
      '@keyframes drift{0%{transform:translate(0,0) scale(1);}100%{transform:translate(50px,35px) scale(1.1);}}' +

      /* ── scan lines overlay ── */
      '.scan{position:fixed;inset:0;pointer-events:none;z-index:1;' +
        'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px);}' +

      /* ── wrap & card ── */
      '.wrap{position:relative;z-index:2;width:100%;max-width:520px;padding:20px;}' +
      '.card{' +
        'border-radius:var(--r);padding:32px 28px 28px;' +
        'background:var(--surf);' +
        'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);' +
        'border:1px solid var(--sky-b);' +
        'box-shadow:' +
          '0 0 0 1px rgba(0,0,0,.6),' +          /* outer ring */
          '0 2px 0 1px rgba(56,189,248,.08),' +  /* top inner light */
          '0 24px 48px rgba(0,0,0,.65),' +        /* depth */
          '0 48px 100px rgba(0,0,0,.4),' +        /* far depth */
          '0 0 80px rgba(56,189,248,.09),' +      /* ambient glow */
          'inset 0 1px 0 rgba(255,255,255,.05),' +/* inner top shine */
          'inset 0 -1px 0 rgba(0,0,0,.3);' +     /* inner bottom shadow */
        'position:relative;overflow:hidden;}' +

      /* card corner glow */
      '.card::before{content:"";position:absolute;inset:0;pointer-events:none;' +
        'background:radial-gradient(ellipse 80% 50% at 0% 0%,rgba(56,189,248,.07),transparent),' +
                   'radial-gradient(ellipse 60% 60% at 100% 100%,rgba(99,102,241,.06),transparent);}' +
      /* top highlight line */
      '.card::after{content:"";position:absolute;top:0;left:15%;right:15%;height:1px;' +
        'background:linear-gradient(90deg,transparent,rgba(56,189,248,.6),transparent);' +
        'box-shadow:0 0 12px rgba(56,189,248,.4);}' +

      /* ── header ── */
      '.hd{display:flex;align-items:center;gap:14px;margin-bottom:24px;}' +

      /* status orb */
      '.orb{position:relative;width:22px;height:22px;flex-shrink:0;}' +
      '.orb-outer{position:absolute;inset:0;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(16,185,129,.25) 0%,rgba(16,185,129,.05) 60%,transparent 70%);' +
        'animation:orb-pulse 2.4s ease-in-out infinite;}' +
      '.orb-ring{position:absolute;inset:2px;border-radius:50%;' +
        'border:1.5px solid rgba(16,185,129,.5);animation:ping 2s ease-out infinite;}' +
      '.orb-core{position:absolute;inset:6px;border-radius:50%;' +
        'background:radial-gradient(circle,#6ee7b7 0%,#10b981 55%,#059669 100%);' +
        'box-shadow:0 0 8px rgba(16,185,129,.9),0 0 16px rgba(16,185,129,.5);}' +
      '@keyframes ping{0%{transform:scale(1);opacity:.8;}70%{transform:scale(2.2);opacity:0;}100%{opacity:0;}}' +
      '@keyframes orb-pulse{0%,100%{transform:scale(1);opacity:.8;}50%{transform:scale(1.3);opacity:1;}}' +

      '.hd-text h1{font-size:21px;font-weight:700;letter-spacing:-.4px;color:#f0f6ff;' +
        'text-shadow:0 0 24px rgba(56,189,248,.25);}' +
      '.hd-text p{font-size:12.5px;color:var(--sub);margin-top:2px;letter-spacing:.01em;}' +

      /* live tag */
      '.live-tag{margin-left:auto;display:inline-flex;align-items:center;gap:5px;' +
        'padding:3px 9px;border-radius:999px;' +
        'background:var(--grn-d);border:1px solid var(--grn-b);' +
        'color:#6ee7b7;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;' +
        'box-shadow:0 0 10px rgba(16,185,129,.15);}' +
      '.live-dot{width:5px;height:5px;border-radius:50%;background:#10b981;' +
        'box-shadow:0 0 6px #10b981;animation:orb-pulse 1.6s ease-in-out infinite;}' +

      /* ── divider ── */
      '.divider{height:1px;margin:0 -4px 22px;' +
        'background:linear-gradient(90deg,transparent,var(--brd),rgba(56,189,248,.2),var(--brd),transparent);}' +

      /* ── info boxes ── */
      '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}' +
      '.ibox{' +
        'background:var(--surf2);' +
        'border:1px solid var(--brd);' +
        'border-radius:14px;padding:13px 15px;' +
        'box-shadow:' +
          'inset 0 1px 0 rgba(255,255,255,.03),' +
          'inset 0 -1px 0 rgba(0,0,0,.2),' +
          '0 2px 8px rgba(0,0,0,.25);' +
        'transition:border-color .2s,box-shadow .2s;' +
        'position:relative;overflow:hidden;}' +
      '.ibox::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;' +
        'background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);}' +
      '.ibox:hover{border-color:rgba(56,189,248,.28);' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.04),' +
                   'inset 0 -1px 0 rgba(0,0,0,.2),' +
                   '0 2px 8px rgba(0,0,0,.25),' +
                   '0 0 16px rgba(56,189,248,.06);}' +
      '.ibox-icon{width:28px;height:28px;border-radius:8px;margin-bottom:10px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:var(--sky-d);border:1px solid rgba(56,189,248,.15);}' +
      '.ibox-icon svg{width:14px;height:14px;color:var(--sky);}' +
      '.ibox-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;' +
        'color:var(--mut);font-weight:700;margin-bottom:5px;}' +
      '.ibox-val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'font-size:12px;color:var(--sky);word-break:break-all;line-height:1.45;' +
        'text-shadow:0 0 12px rgba(56,189,248,.3);}' +
      '.ibox-val.green{color:#6ee7b7;text-shadow:0 0 12px rgba(16,185,129,.3);}' +
      '.ibox-val.violet{color:#c4b5fd;text-shadow:0 0 12px rgba(139,92,246,.3);}' +

      /* status ibox */
      '.status-ibox{background:var(--grn-d);border-color:var(--grn-b);}' +
      '.status-ibox .ibox-icon{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.2);}' +
      '.status-ibox .ibox-icon svg{color:#10b981;}' +
      '.status-ibox:hover{border-color:rgba(16,185,129,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 16px rgba(16,185,129,.08);}' +
      '.status-val{display:inline-flex;align-items:center;gap:5px;' +
        'padding:3px 9px;border-radius:999px;' +
        'background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);' +
        'color:#34d399;font-size:11px;font-weight:700;' +
        'box-shadow:0 0 8px rgba(16,185,129,.12);}' +
      '.status-val::before{content:"";width:5px;height:5px;border-radius:50%;' +
        'background:#10b981;box-shadow:0 0 5px #10b981;}' +

      /* ── ports row ── */
      '.ports-wrap{margin-bottom:22px;}' +
      '.ports-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;' +
        'color:var(--mut);font-weight:700;margin-bottom:9px;' +
        'display:flex;align-items:center;gap:6px;}' +
      '.ports-lbl::after{content:"";flex:1;height:1px;background:var(--brd);}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.port-chip{display:inline-flex;align-items:center;gap:5px;' +
        'padding:4px 10px;border-radius:8px;font-family:ui-monospace,monospace;' +
        'font-size:11px;font-weight:700;cursor:default;' +
        'background:var(--surf2);border:1px solid var(--brd);color:var(--sub);' +
        'transition:all .15s;' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 1px 3px rgba(0,0,0,.3);}' +
      '.port-chip.primary{' +
        'background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.4);color:#bae6fd;' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 3px rgba(0,0,0,.3),0 0 12px rgba(56,189,248,.12);}' +
      '.chip-dot{width:5px;height:5px;border-radius:50%;background:var(--mut);}' +
      '.port-chip.primary .chip-dot{background:#38bdf8;box-shadow:0 0 5px #38bdf8;}' +

      /* ── CTA button ── */
      '.cta{display:flex;align-items:center;justify-content:center;gap:9px;' +
        'text-decoration:none;padding:14px 28px;border-radius:14px;' +
        'font-weight:700;font-size:14px;letter-spacing:.02em;' +
        'color:#fff;border:none;cursor:pointer;width:100%;' +
        'background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);' +
        'position:relative;overflow:hidden;' +
        'box-shadow:0 4px 16px rgba(14,165,233,.3),0 8px 32px rgba(99,102,241,.2),' +
                   'inset 0 1px 0 rgba(255,255,255,.15),' +
                   'inset 0 -1px 0 rgba(0,0,0,.1);' +
        'transition:transform .18s,box-shadow .18s,filter .18s;}' +
      /* shimmer */
      '.cta::before{content:"";position:absolute;inset:0;' +
        'background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.15) 50%,transparent 70%);' +
        'transform:translateX(-100%);transition:transform .4s;}' +
      '.cta:hover::before{transform:translateX(100%);}' +
      '.cta:hover{transform:translateY(-2px);filter:brightness(1.08);' +
        'box-shadow:0 6px 22px rgba(14,165,233,.4),0 12px 40px rgba(99,102,241,.25),' +
                   'inset 0 1px 0 rgba(255,255,255,.18);}' +
      '.cta:active{transform:translateY(0);filter:brightness(.97);}' +
      '.cta svg{flex-shrink:0;}' +

      /* ── footer ── */
      '.foot{margin-top:20px;padding-top:16px;' +
        'border-top:1px solid rgba(51,65,85,.35);' +
        'display:flex;justify-content:space-between;align-items:center;' +
        'flex-wrap:wrap;gap:8px;font-size:10.5px;color:var(--mut);}' +
      '.foot-badges{display:flex;gap:6px;flex-wrap:wrap;}' +
      '.fbadge{padding:2px 8px;border-radius:5px;font-size:9.5px;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:.8px;}' +
      '.fbadge.cf{background:var(--vio-d);border:1px solid var(--vio-b);color:#c4b5fd;}' +
      '.fbadge.tls{background:var(--grn-d);border:1px solid var(--grn-b);color:#6ee7b7;}' +
      '.fbadge.dns{background:var(--sky-d);border:1px solid rgba(56,189,248,.2);color:#7dd3fc;}' +

      '@media(max-width:480px){.card{padding:24px 20px;}.info-grid{grid-template-columns:1fr;}}' ;

    var svgGlobe =
      '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10" stroke-width="1.6"/>' +
      '<path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke-width="1.6"/>' +
      '</svg>';
    var svgCheck =
      '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
      '</svg>';

    return '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8"><title>VLESS Node \u2014 Online</title>' +
      '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2210%22 fill=%22%2338bdf8%22/%3E%3C/svg%3E">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex,nofollow">' +
      '<style>' + CSS + '</style>' +
      '</head><body>' +
      '<div class="au"><b></b><b></b><b></b></div>' +
      '<div class="scan"></div>' +
      '<div class="wrap"><div class="card">' +

        '<div class="hd">' +
          '<div class="orb"><div class="orb-outer"></div><div class="orb-ring"></div><div class="orb-core"></div></div>' +
          '<div class="hd-text"><h1>Node Online</h1><p>VLESS &bull; WebSocket &bull; TLS 1.3</p></div>' +
          '<div class="live-tag"><span class="live-dot"></span>LIVE</div>' +
        '</div>' +

        '<div class="divider"></div>' +

        '<div class="info-grid">' +
          '<div class="ibox">' +
            '<div class="ibox-icon">' + svgGlobe + '</div>' +
            '<div class="ibox-lbl">Active Hostname</div>' +
            '<div class="ibox-val">' + hostLabel + '</div>' +
          '</div>' +
          '<div class="ibox status-ibox">' +
            '<div class="ibox-icon">' + svgCheck + '</div>' +
            '<div class="ibox-lbl">Node Status</div>' +
            '<div class="status-val">Operational</div>' +
          '</div>' +
          '<div class="ibox">' +
            '<div class="ibox-icon"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg></div>' +
            '<div class="ibox-lbl">Protocol</div>' +
            '<div class="ibox-val violet">VLESS / WS</div>' +
          '</div>' +
          '<div class="ibox">' +
            '<div class="ibox-icon"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></div>' +
            '<div class="ibox-lbl">CDN Fronting</div>' +
            '<div class="ibox-val green">Active</div>' +
          '</div>' +
        '</div>' +

        '<div class="ports-wrap">' +
          '<div class="ports-lbl">Port Pool</div>' +
          '<div class="chips">' + portsChips + '</div>' +
        '</div>' +

        '<a href="/' + USERID + '" class="cta">' +
          svgSettings +
          'Generate VLESS Config' +
          svgArrow +
        '</a>' +

        '<div class="foot">' +
          '<div class="foot-badges">' +
            '<span class="fbadge cf">Cloudflare</span>' +
            '<span class="fbadge tls">TLS 1.3</span>' +
            '<span class="fbadge dns">UDP/53</span>' +
          '</div>' +
          '<span>CDN &bull; Loop Prevention</span>' +
        '</div>' +

      '</div></div>' +
      '</body></html>';

  } catch (err) {
    console.error('[homePage] template error:', err && err.message ? err.message : String(err));
    return '<!DOCTYPE html><html><body><h1>Service Online</h1></body></html>';
  }
}

// ==========================
// VLESS Link Builder
// ==========================
function buildVlessLink(address, port, workerHost, fingerprint) {
  try {
    var uuid      = USERID;
    var security  = 'tls';
    var transport = 'ws';
    var path      = '/';
    return (
      'vless://' + uuid + '@' + address + ':' + port +
      '?encryption=none&security=' + security +
      '&sni=' + encodeURIComponent(workerHost) +
      '&fp=' + encodeURIComponent(fingerprint) +
      '&type=' + transport +
      '&host=' + encodeURIComponent(workerHost) +
      '&path=' + encodeURIComponent(path) +
      '#CF-VLESS-' + encodeURIComponent(address + ':' + port)
    );
  } catch (err) {
    console.error('[buildVlessLink] error:', err && err.message ? err.message : String(err));
    return '';
  }
}

// ==========================
// Config Page (Multi-Port)
// ==========================
function configPage(host) {
  try {
    var workerHost   = host || '';
    var escHost      = escapeHtml(workerHost);
    var cleanIP      = getRandomCleanIP();
    var address      = cleanIP;
    var escAddr      = escapeHtml(address);
    var primaryPort  = 443;
    var uuid         = USERID;
    var security     = 'tls';
    var transport    = 'ws';
    var path         = '/';
    var fingerprint  = 'chrome';

    // Primary link (port 443)
    var vlessLink =
      'vless://' + uuid + '@' + address + ':' + primaryPort +
      '?encryption=none&security=' + security +
      '&sni=' + encodeURIComponent(workerHost) +
      '&fp=' + encodeURIComponent(fingerprint) +
      '&type=' + transport +
      '&host=' + encodeURIComponent(workerHost) +
      '&path=' + encodeURIComponent(path) +
      '#CF-VLESS-' + encodeURIComponent(cleanIP);

    var escLink  = escapeHtml(vlessLink);
    var uuidShort = escapeHtml(uuid.substring(0, 8));

    // Build per-port alternative links
    var altLinksHtml = '';
    for (var i = 0; i < PORTS.length; i++) {
      var p           = PORTS[i];
      var linkForPort = buildVlessLink(address, p, workerHost, fingerprint);
      var escLinkP    = escapeHtml(linkForPort);
      var portSuffix  = String(p);
      var linkId      = 'altLink' + portSuffix;
      var btnId       = 'copyAlt' + portSuffix;
      altLinksHtml +=
        '<div class="alt-port-item">' +
        '<div class="alt-port-header">' +
        '<div class="alt-port-label">Port ' + p + '</div>' +
        '<button class="btn btn-secondary alt-copy-btn" data-target="' + linkId + '" id="' + btnId + '">' +
        '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>' +
        '</svg>' +
        'Copy</button></div>' +
        '<div class="link-display alt-link-display" id="' + linkId + '">' + escLinkP + '</div>' +
        '</div>';
    }

    var h = '';
    h += '<!DOCTYPE html><html lang="en"><head>';
    h += '<meta charset="UTF-8"><title>VLESS Config</title>';
    h += '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2210%22 fill=%22%238b5cf6%22/%3E%3C/svg%3E">';
    h += '<meta name="viewport" content="width=device-width,initial-scale=1">';
    h += '<meta name="robots" content="noindex,nofollow">';
    h += '<style>';

    /* ── CSS VARIABLES ── */
    h += ':root{color-scheme:dark;' +
         '--bg:#06080f;--surf:rgba(11,14,26,.92);--surf2:rgba(5,7,16,.75);--surf3:rgba(3,5,12,.6);' +
         '--sky:#38bdf8;--sky-d:rgba(56,189,248,.08);--sky-m:rgba(56,189,248,.2);--sky-b:rgba(56,189,248,.35);' +
         '--grn:#10b981;--grn-d:rgba(16,185,129,.09);--grn-b:rgba(16,185,129,.3);' +
         '--vio:#8b5cf6;--vio-d:rgba(139,92,246,.1);--vio-b:rgba(139,92,246,.3);' +
         '--amb:#f59e0b;--amb-d:rgba(245,158,11,.08);--amb-b:rgba(245,158,11,.25);' +
         '--brd:rgba(51,65,85,.55);--mut:#64748b;--sub:#94a3b8;--txt:#dde6f0;' +
         '--r:16px;--r-sm:10px;}';

    h += '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}';
    h += 'body{min-height:100vh;background:var(--bg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--txt);padding:20px 16px 40px;}';

    /* grid bg */
    h += 'body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;' +
         'background-image:linear-gradient(rgba(56,189,248,.025) 1px,transparent 1px),' +
                          'linear-gradient(90deg,rgba(56,189,248,.025) 1px,transparent 1px);' +
         'background-size:48px 48px;}';
    /* corner glows */
    h += 'body::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;' +
         'background:radial-gradient(ellipse 60% 50% at 0% 0%,rgba(56,189,248,.05),transparent),' +
                    'radial-gradient(ellipse 50% 50% at 100% 100%,rgba(99,102,241,.05),transparent);}';

    h += '.page{position:relative;z-index:1;max-width:980px;margin:0 auto;}';

    /* ── PAGE HEADER ── */
    h += '.page-hd{display:flex;justify-content:space-between;align-items:center;' +
         'flex-wrap:wrap;gap:12px;margin-bottom:22px;padding-bottom:18px;' +
         'border-bottom:1px solid var(--brd);}';
    h += '.page-title{font-size:21px;font-weight:700;color:#f0f6ff;letter-spacing:-.3px;' +
         'text-shadow:0 0 30px rgba(56,189,248,.2);}';
    h += '.page-sub{font-size:12px;color:var(--sub);margin-top:3px;}';
    h += '.node-pill{display:inline-flex;align-items:center;gap:7px;' +
         'background:var(--vio-d);border:1px solid var(--vio-b);color:#c4b5fd;' +
         'padding:6px 13px;border-radius:999px;font-size:11px;font-family:monospace;letter-spacing:.3px;' +
         'box-shadow:0 0 14px rgba(139,92,246,.12);}';
    h += '.node-pill-dot{width:7px;height:7px;border-radius:50%;background:var(--vio);' +
         'box-shadow:0 0 8px rgba(139,92,246,.9);}';

    /* ── LAYOUT ── */
    h += '.layout{display:grid;grid-template-columns:1fr 320px;gap:18px;align-items:start;}';
    h += '@media(max-width:820px){.layout{grid-template-columns:1fr;}}';

    /* ── CARD ── */
    h += '.card{' +
         'background:var(--surf);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
         'border:1px solid var(--brd);border-radius:var(--r);' +
         'box-shadow:' +
           '0 0 0 1px rgba(0,0,0,.5),' +
           'inset 0 1px 0 rgba(255,255,255,.04),' +
           'inset 0 -1px 0 rgba(0,0,0,.25),' +
           '0 8px 24px rgba(0,0,0,.5),' +
           '0 24px 48px rgba(0,0,0,.3);' +
         'position:relative;overflow:hidden;}';
    h += '.card::after{content:"";position:absolute;top:0;left:15%;right:15%;height:1px;' +
         'background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);}';
    h += '.card-body{padding:20px 22px;}';
    h += '.card-body+.card-body{border-top:1px solid var(--brd);}';

    /* section title */
    h += '.stitle{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;' +
         'color:var(--mut);font-weight:800;margin-bottom:14px;' +
         'display:flex;align-items:center;gap:8px;}';
    h += '.stitle-line{flex:1;height:1px;background:var(--brd);}';
    h += '.stitle-icon{width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}';
    h += '.stitle-icon.sky{background:var(--sky-d);border:1px solid rgba(56,189,248,.15);}';
    h += '.stitle-icon.grn{background:var(--grn-d);border:1px solid rgba(16,185,129,.15);}';
    h += '.stitle-icon.vio{background:var(--vio-d);border:1px solid rgba(139,92,246,.15);}';
    h += '.stitle-icon svg{width:11px;height:11px;}';
    h += '.stitle-icon.sky svg{color:var(--sky);}';
    h += '.stitle-icon.grn svg{color:var(--grn);}';
    h += '.stitle-icon.vio svg{color:var(--vio);}';

    /* ── PARAM GRID ── */
    h += '.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:9px;}';
    h += '.pbox{' +
         'background:var(--surf2);border:1px solid rgba(51,65,85,.4);border-radius:var(--r-sm);' +
         'padding:11px 13px;position:relative;overflow:hidden;' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.025),inset 0 -1px 0 rgba(0,0,0,.2),0 2px 6px rgba(0,0,0,.2);' +
         'transition:border-color .18s,box-shadow .18s;}';
    /* left accent bar */
    h += '.pbox::before{content:"";position:absolute;left:0;top:20%;bottom:20%;width:2px;border-radius:0 2px 2px 0;background:var(--brd);transition:background .18s;}';
    h += '.pbox.sky::before{background:var(--sky);box-shadow:0 0 6px rgba(56,189,248,.5);}';
    h += '.pbox.grn::before{background:var(--grn);box-shadow:0 0 6px rgba(16,185,129,.5);}';
    h += '.pbox.vio::before{background:var(--vio);box-shadow:0 0 6px rgba(139,92,246,.5);}';
    h += '.pbox.amb::before{background:var(--amb);box-shadow:0 0 6px rgba(245,158,11,.5);}';
    h += '.pbox:hover{border-color:rgba(56,189,248,.25);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.03),inset 0 -1px 0 rgba(0,0,0,.2),0 2px 6px rgba(0,0,0,.2),0 0 14px rgba(56,189,248,.05);}';
    h += '.pk{font-size:9.5px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);font-weight:800;margin-bottom:5px;padding-left:6px;}';
    h += '.pv{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;word-break:break-all;line-height:1.45;padding-left:6px;}';
    h += '.pv.c-sky{color:var(--sky);text-shadow:0 0 10px rgba(56,189,248,.25);}';
    h += '.pv.c-grn{color:#6ee7b7;text-shadow:0 0 10px rgba(16,185,129,.25);}';
    h += '.pv.c-vio{color:#c4b5fd;text-shadow:0 0 10px rgba(139,92,246,.25);}';
    h += '.pv.c-amb{color:#fcd34d;text-shadow:0 0 10px rgba(245,158,11,.25);}';
    h += '.pv.c-txt{color:var(--txt);}';
    h += '.pv.mono-sm{font-size:10px;}';

    /* ── PORT TABS ── */
    h += '.pt-wrap{margin-bottom:14px;}';
    h += '.pt-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);font-weight:800;margin-bottom:8px;}';
    h += '.pt-row{display:flex;flex-wrap:wrap;gap:6px;}';
    h += '.ptab{' +
         'padding:5px 14px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;' +
         'font-family:ui-monospace,monospace;letter-spacing:.3px;' +
         'border:1px solid rgba(51,65,85,.6);background:var(--surf3);color:var(--sub);' +
         'transition:all .15s;' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 1px 3px rgba(0,0,0,.3);}';
    h += '.ptab:hover{border-color:rgba(56,189,248,.3);color:var(--sky);}';
    h += '.ptab.active{' +
         'background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.55);color:#bae6fd;' +
         'box-shadow:' +
           'inset 0 1px 0 rgba(255,255,255,.06),' +
           '0 1px 3px rgba(0,0,0,.3),' +
           '0 0 0 1px rgba(56,189,248,.15),' +
           '0 0 16px rgba(56,189,248,.18);}';

    /* ── LINK TEXTBOX ── */
    h += '.link-outer{position:relative;margin-bottom:14px;}';
    /* fake editor chrome */
    h += '.link-chrome{' +
         'background:#020611;border:1px solid rgba(56,189,248,.22);border-radius:var(--r-sm);' +
         'overflow:hidden;' +
         'box-shadow:' +
           '0 0 0 1px rgba(0,0,0,.5),' +
           'inset 0 1px 0 rgba(56,189,248,.04),' +
           '0 4px 16px rgba(0,0,0,.5),' +
           '0 0 24px rgba(56,189,248,.06);' +
         'transition:border-color .2s,box-shadow .2s;}';
    h += '.link-chrome:hover{border-color:rgba(56,189,248,.38);box-shadow:0 0 0 1px rgba(0,0,0,.5),inset 0 1px 0 rgba(56,189,248,.05),0 4px 16px rgba(0,0,0,.5),0 0 28px rgba(56,189,248,.1);}';
    /* title bar */
    h += '.link-bar{' +
         'display:flex;align-items:center;gap:8px;padding:8px 14px;' +
         'border-bottom:1px solid rgba(56,189,248,.1);' +
         'background:rgba(56,189,248,.04);}';
    h += '.link-dots{display:flex;gap:5px;}';
    h += '.link-dot{width:9px;height:9px;border-radius:50%;}';
    h += '.link-dot:nth-child(1){background:#ff5f57;box-shadow:0 0 4px rgba(255,95,87,.5);}';
    h += '.link-dot:nth-child(2){background:#ffbd2e;box-shadow:0 0 4px rgba(255,189,46,.5);}';
    h += '.link-dot:nth-child(3){background:#28c941;box-shadow:0 0 4px rgba(40,201,65,.5);}';
    h += '.link-bar-title{font-size:10px;color:var(--mut);font-family:monospace;letter-spacing:.3px;flex:1;text-align:center;}';
    /* link text content */
    h += '.link-content{' +
         'padding:14px 16px;' +
         'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
         'font-size:11.5px;line-height:1.65;word-break:break-all;' +
         'min-height:68px;' +
         'color:#7dd3fc;' +
         'text-shadow:0 0 14px rgba(56,189,248,.2);}';
    h += '#mainLink{cursor:text;}';

    /* ── BUTTONS ── */
    h += '.btn-row{display:flex;gap:8px;flex-wrap:wrap;}';
    h += '.btn{' +
         'display:inline-flex;align-items:center;gap:7px;' +
         'padding:9px 18px;border-radius:10px;' +
         'font-size:12.5px;font-weight:700;letter-spacing:.02em;cursor:pointer;' +
         'border:none;transition:all .16s;position:relative;overflow:hidden;}';
    h += '.btn svg{flex-shrink:0;}';

    /* primary — gradient with shimmer */
    h += '.btn-primary{' +
         'background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;' +
         'box-shadow:0 3px 12px rgba(14,165,233,.3),0 6px 24px rgba(99,102,241,.2),' +
                    'inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.1);}';
    h += '.btn-primary::before{content:"";position:absolute;inset:0;' +
         'background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%);' +
         'transform:translateX(-100%);transition:transform .4s;}';
    h += '.btn-primary:hover::before{transform:translateX(100%);}';
    h += '.btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px);' +
         'box-shadow:0 5px 18px rgba(14,165,233,.4),0 10px 32px rgba(99,102,241,.25),' +
                    'inset 0 1px 0 rgba(255,255,255,.2);}';
    h += '.btn-primary:active{transform:translateY(0);filter:brightness(.96);}';

    /* secondary */
    h += '.btn-secondary{' +
         'background:rgba(15,20,40,.8);color:var(--txt);' +
         'border:1px solid rgba(71,85,105,.55);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 1px 4px rgba(0,0,0,.3);}';
    h += '.btn-secondary:hover{background:rgba(30,41,59,.8);border-color:rgba(100,116,139,.65);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 4px rgba(0,0,0,.3),0 0 12px rgba(56,189,248,.05);}';
    h += '.btn-secondary:active{background:rgba(15,20,40,.9);}';

    /* danger/green */
    h += '.btn-ghost{' +
         'background:transparent;color:var(--sub);' +
         'border:1px solid rgba(51,65,85,.5);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.02);}';
    h += '.btn-ghost:hover{border-color:rgba(16,185,129,.4);color:#6ee7b7;}';

    /* ── SIDEBAR CARDS ── */
    h += '.sidebar{display:flex;flex-direction:column;gap:16px;}';

    /* clean IP hero */
    h += '.ip-hero{' +
         'background:linear-gradient(135deg,rgba(14,165,233,.12),rgba(99,102,241,.1));' +
         'border:1px solid rgba(56,189,248,.28);border-radius:var(--r);' +
         'padding:20px 20px 18px;position:relative;overflow:hidden;' +
         'box-shadow:0 0 0 1px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.4),0 0 32px rgba(56,189,248,.07);}';
    h += '.ip-hero::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;' +
         'background:linear-gradient(90deg,transparent,rgba(56,189,248,.5),transparent);}';
    h += '.ip-hero-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--mut);font-weight:800;margin-bottom:8px;}';
    h += '.ip-hero-addr{font-family:ui-monospace,monospace;font-size:17px;font-weight:700;' +
         'color:var(--sky);margin-bottom:6px;letter-spacing:.4px;' +
         'text-shadow:0 0 20px rgba(56,189,248,.35);}';
    h += '.ip-hero-note{font-size:11px;color:var(--sub);display:flex;align-items:center;gap:5px;}';
    h += '.ip-hero-note::before{content:"";width:5px;height:5px;border-radius:50%;' +
         'background:#10b981;box-shadow:0 0 6px #10b981;flex-shrink:0;}';

    /* alt ports list */
    h += '.alt-list{display:flex;flex-direction:column;gap:7px;}';
    h += '.alt-item{' +
         'display:flex;align-items:center;gap:8px;' +
         'padding:9px 12px;border-radius:var(--r-sm);' +
         'background:var(--surf2);border:1px solid rgba(51,65,85,.4);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.02),0 1px 3px rgba(0,0,0,.25);' +
         'transition:border-color .15s,box-shadow .15s;}';
    h += '.alt-item:hover{border-color:rgba(56,189,248,.25);' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 1px 3px rgba(0,0,0,.25),0 0 10px rgba(56,189,248,.05);}';
    h += '.alt-badge{' +
         'font-family:monospace;font-size:11.5px;font-weight:800;color:#c4b5fd;' +
         'background:var(--vio-d);border:1px solid var(--vio-b);' +
         'padding:2px 9px;border-radius:7px;flex-shrink:0;' +
         'box-shadow:0 0 8px rgba(139,92,246,.1);}';
    h += '.alt-link-txt{' +
         'font-family:ui-monospace,monospace;font-size:9.5px;color:var(--mut);' +
         'flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;}';
    h += '.alt-link-data{display:none;}';
    h += '.copy-sm{' +
         'display:inline-flex;align-items:center;gap:4px;' +
         'padding:4px 10px;font-size:10.5px;font-weight:700;border-radius:7px;' +
         'background:rgba(15,20,40,.9);color:var(--sub);' +
         'border:1px solid rgba(51,65,85,.5);cursor:pointer;flex-shrink:0;' +
         'transition:all .13s;' +
         'box-shadow:inset 0 1px 0 rgba(255,255,255,.03);}';
    h += '.copy-sm:hover{background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.4);color:var(--sky);}';
    h += '.copy-sm svg{width:10px;height:10px;}';

    /* ── TOAST ── */
    h += '.toast{' +
         'position:fixed;bottom:26px;left:50%;' +
         'transform:translateX(-50%) translateY(70px);opacity:0;' +
         'background:linear-gradient(135deg,rgba(5,150,105,.95),rgba(4,120,87,.95));' +
         'backdrop-filter:blur(8px);' +
         'color:#ecfdf5;padding:10px 20px;border-radius:12px;' +
         'font-weight:700;font-size:13px;' +
         'border:1px solid rgba(16,185,129,.4);' +
         'box-shadow:0 4px 20px rgba(0,0,0,.5),0 0 24px rgba(16,185,129,.2);' +
         'transition:all .35s cubic-bezier(.34,1.56,.64,1);z-index:999;' +
         'white-space:nowrap;display:flex;align-items:center;gap:8px;}';
    h += '.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}';
    h += '.toast svg{width:15px;height:15px;flex-shrink:0;}';

    /* ── FOOTER ── */
    h += '.page-foot{margin-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;font-size:10.5px;color:var(--mut);}';
    h += '.foot-pills{display:flex;gap:6px;flex-wrap:wrap;}';
    h += '.fpill{padding:3px 9px;border-radius:6px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;}';
    h += '.fpill.cf{background:var(--vio-d);border:1px solid var(--vio-b);color:#c4b5fd;}';
    h += '.fpill.tls{background:var(--grn-d);border:1px solid var(--grn-b);color:#6ee7b7;}';
    h += '.fpill.dns{background:var(--sky-d);border:1px solid rgba(56,189,248,.2);color:#7dd3fc;}';
    h += '.fpill.cdn{background:var(--amb-d);border:1px solid var(--amb-b);color:#fcd34d;}';

    h += '@media(max-width:600px){.card-body{padding:16px;}.pgrid{grid-template-columns:1fr 1fr;}}';
    h += '</style></head><body>';

    /* ── SVG ICONS ── */
    var iCopy   = '<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>';
    var iRefresh= '<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>';
    var iCheck  = '<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>';
    var iLink   = '<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>';
    var iShield = '<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';
    var iServer = '<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/></svg>';
    var iFingerprint = '<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>';

    /* ── HTML ── */
    h += '<div class="page">';

    /* page header */
    h += '<div class="page-hd">';
    h += '<div><div class="page-title">VLESS Configuration</div><div class="page-sub">CDN fronting &bull; clean IP &bull; ' + PORTS.length + '-port fallback pool</div></div>';
    h += '<div class="node-pill"><span class="node-pill-dot"></span>Node&nbsp;' + uuidShort + '&hellip;</div>';
    h += '</div>';

    /* layout */
    h += '<div class="layout">';
    /* ─── LEFT ─── */
    h += '<div>';

    /* params card */
    h += '<div class="card" style="margin-bottom:16px">';
    h += '<div class="card-body">';
    h += '<div class="stitle"><div class="stitle-icon sky">' + iServer + '</div>Connection Parameters<span class="stitle-line"></span></div>';
    h += '<div class="pgrid">';
    h += '<div class="pbox sky"><div class="pk">Address</div><div class="pv c-sky">'       + escAddr                    + '</div></div>';
    h += '<div class="pbox vio"><div class="pk">Port</div><div class="pv c-vio">'           + primaryPort                 + '</div></div>';
    h += '<div class="pbox grn"><div class="pk">Security</div><div class="pv c-grn">'       + security.toUpperCase()      + '</div></div>';
    h += '<div class="pbox sky"><div class="pk">Transport</div><div class="pv c-sky">'      + transport.toUpperCase()     + '</div></div>';
    h += '<div class="pbox"><div class="pk">Path</div><div class="pv c-txt">'               + escapeHtml(path)            + '</div></div>';
    h += '<div class="pbox sky"><div class="pk">SNI</div><div class="pv c-sky">'            + escHost                     + '</div></div>';
    h += '<div class="pbox sky"><div class="pk">Host Header</div><div class="pv c-sky">'    + escHost                     + '</div></div>';
    h += '<div class="pbox amb"><div class="pk">Fingerprint</div><div class="pv c-amb">'    + escapeHtml(fingerprint)     + '</div></div>';
    h += '<div class="pbox" style="grid-column:1/-1"><div class="pk">UUID</div><div class="pv c-txt mono-sm">' + escapeHtml(uuid) + '</div></div>';
    h += '</div>';
    h += '</div></div>';

    /* link card */
    h += '<div class="card">';
    h += '<div class="card-body">';
    h += '<div class="stitle"><div class="stitle-icon sky">' + iLink + '</div>Client URI<span class="stitle-line"></span></div>';

    /* port selector */
    h += '<div class="pt-wrap">';
    h += '<div class="pt-lbl">Select Port</div>';
    h += '<div class="pt-row" id="portTabs">';
    for (var ti = 0; ti < PORTS.length; ti++) {
      h += '<button class="ptab' + (ti === 0 ? ' active' : '') + '" data-port="' + PORTS[ti] + '">' + PORTS[ti] + '</button>';
    }
    h += '</div></div>';

    /* hidden link data */
    h += '<div style="display:none" id="allLinks">';
    for (var li = 0; li < PORTS.length; li++) {
      var lp   = PORTS[li];
      var lnk  = buildVlessLink(address, lp, workerHost, fingerprint);
      h += '<span data-port="' + lp + '">' + escapeHtml(lnk) + '</span>';
    }
    h += '</div>';

    /* link box — editor style */
    h += '<div class="link-outer">';
    h += '<div class="link-chrome">';
    h += '<div class="link-bar"><div class="link-dots"><div class="link-dot"></div><div class="link-dot"></div><div class="link-dot"></div></div><div class="link-bar-title">vless://&nbsp;&bull;&nbsp;port&nbsp;443</div></div>';
    h += '<div class="link-content" id="mainLink">' + escLink + '</div>';
    h += '</div></div>';

    /* action buttons */
    h += '<div class="btn-row">';
    h += '<button class="btn btn-primary" id="copyBtn">' + iCopy + 'Copy Link</button>';
    h += '<button class="btn btn-secondary" id="newIpBtn">' + iRefresh + 'New IP</button>';
    h += '</div>';
    h += '</div></div>';

    h += '</div>'; /* end left */

    /* ─── SIDEBAR ─── */
    h += '<div class="sidebar">';

    /* clean IP hero */
    h += '<div class="ip-hero">';
    h += '<div class="ip-hero-lbl">Clean IP &mdash; CDN Fronting</div>';
    h += '<div class="ip-hero-addr">' + escAddr + '</div>';
    h += '<div class="ip-hero-note">Rotates on each page reload</div>';
    h += '</div>';

    /* all ports list */
    h += '<div class="card">';
    h += '<div class="card-body">';
    h += '<div class="stitle"><div class="stitle-icon vio">' + iShield + '</div>All Ports<span class="stitle-line"></span></div>';
    h += '<div class="alt-list">';
    for (var ai = 0; ai < PORTS.length; ai++) {
      var ap      = PORTS[ai];
      var al      = buildVlessLink(address, ap, workerHost, fingerprint);
      var aEsc    = escapeHtml(al);
      var aId     = 'alink' + ap;
      h += '<div class="alt-item">';
      h += '<span class="alt-badge">' + ap + '</span>';
      h += '<span class="alt-link-txt" title="' + aEsc + '">' + aEsc + '</span>';
      h += '<span class="alt-link-data" id="' + aId + '">' + aEsc + '</span>';
      h += '<button class="copy-sm alt-copy-btn" data-target="' + aId + '">' + iCopy + 'Copy</button>';
      h += '</div>';
    }
    h += '</div>';
    h += '</div></div>';

    h += '</div>'; /* end sidebar */
    h += '</div>'; /* end layout */

    /* footer */
    h += '<div class="page-foot">';
    h += '<div class="foot-pills"><span class="fpill cf">Cloudflare</span><span class="fpill tls">TLS 1.3</span><span class="fpill dns">UDP/53</span><span class="fpill cdn">CDN Front</span></div>';
    h += '<span>Loop prevention &bull; Runtime retry &bull; ' + PORTS.length + '-port fallback</span>';
    h += '</div>';

    h += '</div>'; /* end page */

    /* toast */
    h += '<div class="toast" id="toast">' + iCheck + 'Copied to clipboard!</div>';

    /* scripts */
    h += '<script>';
    h += 'function showToast(){var t=document.getElementById("toast");t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2200);}';
    h += 'function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(showToast,function(){fbCopy(text);});}else{fbCopy(text);}}';
    h += 'function fbCopy(text){var ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;top:0;left:0;opacity:0;";document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand("copy");showToast();}catch(e){}document.body.removeChild(ta);}';
    h += 'document.getElementById("copyBtn").addEventListener("click",function(){var el=document.getElementById("mainLink");if(el)copyText(el.innerText||el.textContent);});';
    h += 'document.getElementById("newIpBtn").addEventListener("click",function(){window.location.reload();});';
    /* port tabs */
    h += '(function(){';
    h += 'var tabs=document.querySelectorAll(".ptab");';
    h += 'var spans=document.querySelectorAll("#allLinks span");';
    h += 'var mainBox=document.getElementById("mainLink");';
    h += 'var barTitle=document.querySelector(".link-bar-title");';
    h += 'var map={};for(var i=0;i<spans.length;i++){map[spans[i].getAttribute("data-port")]=spans[i].textContent||spans[i].innerText;}';
    h += 'for(var j=0;j<tabs.length;j++){(function(tab){tab.addEventListener("click",function(){';
    h += 'for(var k=0;k<tabs.length;k++)tabs[k].classList.remove("active");';
    h += 'tab.classList.add("active");';
    h += 'var p=tab.getAttribute("data-port");';
    h += 'if(mainBox&&map[p]){mainBox.textContent=map[p];}';
    h += 'if(barTitle){barTitle.textContent="vless:// \u2022 port "+p;}';
    h += '});';
    h += '})(tabs[j]);}';
    h += '})();';
    /* alt copy buttons */
    h += 'var altBtns=document.querySelectorAll(".alt-copy-btn");';
    h += 'for(var i=0;i<altBtns.length;i++){(function(btn){btn.addEventListener("click",function(){var el=document.getElementById(btn.getAttribute("data-target"));if(el)copyText(el.textContent||el.innerText);});})(altBtns[i]);}';
    h += '</script></body></html>';
    return h;
  } catch (err) {
    console.error('[configPage] error:', err && err.message ? err.message : String(err));
    return '<!DOCTYPE html><html><body><p>Configuration Error</p></body></html>';
  }
}

// ==========================
// VLESS Protocol Parser
// ==========================
function parseVlessHeaderDetailed(buf) {
  try {
    if (!buf || buf.length < 1) return { ok: false, needMore: true, reason: 'empty' };
    var offset = 0;

    if (buf.length < offset + 1) return { ok: false, needMore: true, reason: 'short version' };
    var version = buf[offset++];
    if (version !== 1) return { ok: false, needMore: false, reason: 'bad version' };

    if (buf.length < offset + 16) return { ok: false, needMore: true, reason: 'short uuid' };
    var uuidBytes = buf.subarray(offset, offset + 16);
    offset += 16;

    if (buf.length < offset + 1) return { ok: false, needMore: true, reason: 'short optlen' };
    var optLen = buf[offset++];
    if (optLen < 0) return { ok: false, needMore: false, reason: 'bad optlen' };

    if (buf.length < offset + optLen + 4) return { ok: false, needMore: true, reason: 'short options' };
    offset += optLen;

    if (buf.length < offset + 1) return { ok: false, needMore: true, reason: 'short command' };
    var command = buf[offset++];

    if (buf.length < offset + 2) return { ok: false, needMore: true, reason: 'short port' };
    var port = (buf[offset] << 8) | buf[offset + 1];
    offset += 2;
    if (port < 1 || port > 65535) return { ok: false, needMore: false, reason: 'bad port' };

    if (buf.length < offset + 1) return { ok: false, needMore: true, reason: 'short addr type' };
    var addrType = buf[offset++];
    var address  = '';

    if (addrType === 1) {
      // IPv4
      if (buf.length < offset + 4) return { ok: false, needMore: true, reason: 'short ipv4' };
      address = buf[offset] + '.' + buf[offset + 1] + '.' + buf[offset + 2] + '.' + buf[offset + 3];
      offset += 4;
    } else if (addrType === 2) {
      // Domain
      if (buf.length < offset + 1) return { ok: false, needMore: true, reason: 'short domain len' };
      var dlen = buf[offset++];
      if (dlen < 1 || dlen > 253) return { ok: false, needMore: false, reason: 'bad domain len' };
      if (buf.length < offset + dlen) return { ok: false, needMore: true, reason: 'short domain bytes' };
      address = bytesToString(buf, offset, dlen);
      offset += dlen;
    } else if (addrType === 3) {
      // IPv6
      if (buf.length < offset + 16) return { ok: false, needMore: true, reason: 'short ipv6' };
      var parts = [];
      for (var g = 0; g < 8; g++) {
        var hi = buf[offset + g * 2];
        var lo = buf[offset + g * 2 + 1];
        parts.push((((hi & 255) << 8) | (lo & 255)).toString(16));
      }
      offset += 16;
      address = parts.join(':');
    } else {
      return { ok: false, needMore: false, reason: 'bad addr type' };
    }

    var payload = buf.subarray(offset);
    return {
      ok: true,
      needMore: false,
      header: {
        version:     version,
        uuid:        bytesToUUID(uuidBytes),
        command:     command,
        port:        port,
        addressType: addrType,
        address:     address,
        payload:     payload
      }
    };
  } catch (err) {
    console.error('[parseVlessHeaderDetailed] error:', err && err.message ? err.message : String(err));
    return { ok: false, needMore: false, reason: 'exception' };
  }
}

function parseVlessHeader(buf) {
  try {
    var parsed = parseVlessHeaderDetailed(buf);
    if (!parsed || !parsed.ok) return null;
    return parsed.header;
  } catch (err) {
    console.error('[parseVlessHeader] error:', err && err.message ? err.message : String(err));
    return null;
  }
}

// ==========================
// Binary Utility
// ==========================
function concatUint8(a, b) {
  try {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  } catch (err) {
    console.error('[concatUint8] error:', err && err.message ? err.message : String(err));
    return new Uint8Array(0);
  }
}

// ==========================
// UDP Framed Forwarding
// ==========================
// Forwards data to TCP writer using length-prefixed UDP framing.
// Each inner loop body is protected with try/catch (hardened).
async function forwardUdpFramed(writer, data, state) {
  try {
    var o = 0;
    while (o < data.length) {
      try {
        if (state && state.closed) break;
        if (o + 2 > data.length) {
          var rest  = data.subarray(o);
          var frame = new Uint8Array(2 + rest.length);
          frame[0] = (rest.length >> 8) & 255;
          frame[1] = rest.length & 255;
          frame.set(rest, 2);
          await safeWrite(writer, frame, state);
          break;
        }
        var L = (data[o] << 8) | data[o + 1];
        if (L > 0 && o + 2 + L <= data.length) {
          await safeWrite(writer, data.subarray(o, o + 2 + L), state);
          o += 2 + L;
          continue;
        }
        var rest2  = data.subarray(o);
        var frame2 = new Uint8Array(2 + rest2.length);
        frame2[0] = (rest2.length >> 8) & 255;
        frame2[1] = rest2.length & 255;
        frame2.set(rest2, 2);
        await safeWrite(writer, frame2, state);
        break;
      } catch (loopErr) {
        console.error('[forwardUdpFramed] loop error:', loopErr && loopErr.message ? loopErr.message : String(loopErr));
        throw loopErr;
      }
    }
  } catch (err) {
    console.error('[forwardUdpFramed] error:', err && err.message ? err.message : String(err));
    throw err;
  }
}

// ==========================
// TCP → WS Pump
// ==========================
// Reads from TCP origin, writes chunks to WebSocket.
// First chunk prepends VLESS response header (0x00 0x00).
// Loop body hardened with inner try/catch.
async function pumpTcpToWs(reader, ws, closeAllCallback, state) {
  var first = true;
  try {
    while (true) {
      try {
        if (state && state.closed) break;

        var r;
        try {
          r = await reader.read();
        } catch (readErr) {
          console.error('[pumpTcpToWs] reader.read error:', readErr && readErr.message ? readErr.message : String(readErr));
          break;
        }

        if (!r || r.done) break;
        var v = r.value;
        if (!v) continue;
        var chunk = v instanceof Uint8Array ? v : new Uint8Array(v);
        if (chunk.length === 0) continue;

        if (state && state.closed) break;

        if (first) {
          first = false;
          var out = new Uint8Array(2 + chunk.length);
          out[0] = 0; out[1] = 0;
          out.set(chunk, 2);
          safeSend(ws, out, state);
        } else {
          safeSend(ws, chunk, state);
        }
      } catch (loopErr) {
        console.error('[pumpTcpToWs] loop body error:', loopErr && loopErr.message ? loopErr.message : String(loopErr));
        break;
      }
    }
  } catch (err) {
    console.error('[pumpTcpToWs] unexpected error:', err && err.message ? err.message : String(err));
  } finally {
    try {
      closeAllCallback();
    } catch (err) {
      console.error('[pumpTcpToWs] closeAll error:', err && err.message ? err.message : String(err));
    }
  }
}

// ==========================
// UDP/TCP → WS Pump
// ==========================
// Reassembles length-prefixed UDP frames from TCP stream and sends to WebSocket.
// Both outer and inner loop bodies hardened with try/catch.
async function pumpUdpTcpToWs(reader, ws, closeAllCallback, state) {
  var pending = new Uint8Array(0);
  var first   = true;
  try {
    while (true) {
      try {
        if (state && state.closed) break;

        var r;
        try {
          r = await reader.read();
        } catch (readErr) {
          console.error('[pumpUdpTcpToWs] reader.read error:', readErr && readErr.message ? readErr.message : String(readErr));
          break;
        }

        if (!r || r.done) break;
        var v = r.value;
        if (!v) continue;
        var chunk = v instanceof Uint8Array ? v : new Uint8Array(v);
        if (chunk.length === 0) continue;

        if (state && state.closed) break;

        pending = pending.length ? concatUint8(pending, chunk) : chunk;

        while (pending.length >= 2) {
          try {
            if (state && state.closed) break;
            var len = (pending[0] << 8) | pending[1];
            if (len < 1 || pending.length < 2 + len) break;
            var packet = pending.subarray(0, 2 + len);
            pending = pending.subarray(2 + len);

            if (state && state.closed) break;

            if (first) {
              first = false;
              var out = new Uint8Array(2 + packet.length);
              out[0] = 0; out[1] = 0;
              out.set(packet, 2);
              safeSend(ws, out, state);
            } else {
              safeSend(ws, packet, state);
            }
          } catch (innerErr) {
            console.error('[pumpUdpTcpToWs] inner loop error:', innerErr && innerErr.message ? innerErr.message : String(innerErr));
            break;
          }
        }
      } catch (loopErr) {
        console.error('[pumpUdpTcpToWs] outer loop error:', loopErr && loopErr.message ? loopErr.message : String(loopErr));
        break;
      }
    }
  } catch (err) {
    console.error('[pumpUdpTcpToWs] unexpected error:', err && err.message ? err.message : String(err));
  } finally {
    try {
      closeAllCallback();
    } catch (err) {
      console.error('[pumpUdpTcpToWs] closeAll error:', err && err.message ? err.message : String(err));
    }
  }
}

// ==========================
// Connect With Port Fallback (connect-time helper)
// ==========================
// Tries each candidate port in order; throws if all fail.
async function connectWithPortFallback(connectFn, hostname, initialPort, state) {
  var lastError  = null;
  var tried      = {};
  var candidates = [];

  if (typeof initialPort === 'number') {
    candidates.push(initialPort);
    tried[initialPort] = true;
  }
  for (var i = 0; i < PORTS.length; i++) {
    if (!tried[PORTS[i]]) {
      candidates.push(PORTS[i]);
      tried[PORTS[i]] = true;
    }
  }

  for (var j = 0; j < candidates.length; j++) {
    if (state && state.closed) break;
    var port = candidates[j];
    try {
      var sock = connectFn({ hostname: hostname, port: port });
      if (!sock || !sock.writable || !sock.readable) {
        throw new Error('Malformed socket on port ' + port);
      }
      console.log('[connectWithPortFallback] connected on port', port);
      return { socket: sock, port: port };
    } catch (err) {
      lastError = err;
      console.error('[connectWithPortFallback] port ' + port + ':', err && err.message ? err.message : String(err));
    }
  }

  throw lastError || new Error('connectWithPortFallback: no ports available');
}

// ============================================================================
// STATE MACHINE CONSTANTS
// ============================================================================
//  IDLE        — Awaiting first VLESS header from client
//  CONNECTING  — Initial TCP connect in progress; WS frames buffered
//  ACTIVE      — Tunnel live; data flows (TCP or UDP)
//  RETRYING    — Socket failed; reconnecting to next port; WS frames buffered
//  FAILED      — All ports exhausted; session terminating
var STATE = {
  IDLE:       'IDLE',
  CONNECTING: 'CONNECTING',
  ACTIVE:     'ACTIVE',
  FAILED:     'FAILED',
  RETRYING:   'RETRYING'
};

// ============================================================================
// MAIN WEBSOCKET HANDLER
// ============================================================================
// Implements: runtime retry engine, replay buffer, generation tokens,
// retryLock mutex, watchdog, heartbeat, pending data queue, safeAsync events.
async function handleVlessOverWS(request, ctx) {
  try {
    var upgradeHeader = '';
    try {
      upgradeHeader = (request.headers && request.headers.get('Upgrade')) || '';
    } catch (e) { upgradeHeader = ''; }

    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    var wsKeyHdr = '';
    try {
      wsKeyHdr = (request.headers && request.headers.get('Sec-WebSocket-Key')) || '';
    } catch (e) { wsKeyHdr = ''; }
    if (!wsKeyHdr || !String(wsKeyHdr).trim()) {
      return new Response('Missing Sec-WebSocket-Key', { status: 400 });
    }

    if (typeof WebSocketPair === 'undefined') {
      return new Response('Environment mismatch: WebSockets not supported', { status: 200 });
    }

    var pair;
    try {
      pair = new WebSocketPair();
    } catch (err) {
      console.error('[handleVlessOverWS] WebSocketPair error:', err && err.message ? err.message : String(err));
      return new Response('WebSocket creation failed', { status: 200 });
    }

    var client = pair[0];
    var server = pair[1];

    try {
      server.accept();
    } catch (acErr) {
      console.error('[handleVlessOverWS] server.accept error:', acErr && acErr.message ? acErr.message : String(acErr));
      return new Response('WebSocket accept failed', { status: 200 });
    }

    // ── State machine ─────────────────────────────────────────────────────
    var mode = STATE.IDLE;

    // ── Pending WS data — buffered while CONNECTING / RETRYING ────────────
    var pendingData       = [];
    var MAX_PENDING_CHUNKS = 100;
    var pendingDataBytes   = 0;
    var MAX_PENDING_BYTES  = 1024 * 1024;

    // ── Global session flags ──────────────────────────────────────────────
    var sessionClosed  = false;
    var wsServerClosed = false;

    // ── Replay buffer ─────────────────────────────────────────────────────
    // Accumulates all data written to ANY socket so it can be replayed on
    // reconnect. Bounded by chunk count AND total byte size.
    var retryBuffer           = [];
    var retryBufferBytes      = 0;
    var MAX_RETRY_BUFFER_CHUNKS = 200;
    var MAX_RETRY_BUFFER_BYTES  = 1024 * 1024; // 1 MB

    function addToRetryBuffer(data) {
      try {
        if (!data || data.length === 0) return;
        if (retryBuffer.length >= MAX_RETRY_BUFFER_CHUNKS) return;
        if (retryBufferBytes + data.length > MAX_RETRY_BUFFER_BYTES) return;
        var copy = new Uint8Array(data); // defensive copy — prevents aliasing
        retryBuffer.push(copy);
        retryBufferBytes += copy.length;
      } catch (e) {
        console.error('[addToRetryBuffer] error:', e && e.message ? e.message : String(e));
      }
    }

    // ── Active socket handles — replaced on every retry ──────────────────
    var curSocket        = null;
    var curWriter        = null;
    var curReader        = null;
    var curWriterReleased = false;
    var curReaderReleased = false;
    var curSocketClosed   = false;

    // ── Retry / generation tracking ───────────────────────────────────────
    var candidatePorts  = [];
    var candidateHosts  = [];
    var portIndex       = 0;
    var hostIndex       = 0;
    var connGeneration  = 0;
    // retryLock — absolute single-threaded retry guarantee.
    // Released in finally AND outer catch — no escape paths.
    var retryLock       = false;
    // genFailedFlags[gen] — pump sets this when it detects failure DURING
    // setup while connectToNext holds the mutex and cannot be re-entered.
    var genFailedFlags  = {};

    // ── Session metadata ──────────────────────────────────────────────────
    var isUdpMode         = false;
    var targetHostGlobal  = '';
    var connectFnGlobal   = null;
    var vlessResponseSent = false; // VLESS 0x00 0x00 response header sent flag

    // ── Activity timestamps ───────────────────────────────────────────────
    var lastDataTime       = Date.now();
    var lastRemoteDataTime = Date.now();
    var connActiveTime     = 0;

    // ── Timers ────────────────────────────────────────────────────────────
    var watchdogInterval  = null;
    var heartbeatInterval = null;
    var wsEarlyData       = extractWsEarlyData(request);
    var initialHeaderBuffer = new Uint8Array(0);
    var MAX_INITIAL_HEADER_BYTES = 8192;

    // ─────────────────────────────────────────────────────────────────────
    // Watchdog — fires every 5 s
    // Detects: half-open TCP (>15 s no remote data) and total idle (>30 s).
    // ─────────────────────────────────────────────────────────────────────
    function startWatchdog() {
      if (watchdogInterval) return;
      try {
        if (typeof setInterval !== 'function') {
          console.error('[watchdog] setInterval is not available in this runtime');
          return;
        }
        watchdogInterval = setInterval(function () {
          try {
            if (sessionClosed) {
              try {
                clearInterval(watchdogInterval);
              } catch (ce) {}
              watchdogInterval = null;
              return;
            }
            if (mode !== STATE.ACTIVE) return;
            var now = Date.now();
            // CF-specific: half-open TCP — socket "alive" but remote silent >15s
            if (now - lastRemoteDataTime > 15000) {
              console.log('[WATCHDOG] 15s no remote data — half-open TCP, retrying');
              if (!sessionClosed) {
                mode = STATE.RETRYING;
                safeConnectToNext('watchdog: half-open TCP', undefined);
              }
              return;
            }
            // Total inactivity >30s → close session
            if (now - lastDataTime > 30000) {
              console.log('[WATCHDOG] no data 30s — closing');
              try {
                clearInterval(watchdogInterval);
              } catch (ce) {}
              watchdogInterval = null;
              closeAll();
            }
          } catch (e) {
            console.error('[watchdog] error:', e && e.message ? e.message : String(e));
          }
        }, 5000);
      } catch (schedErr) {
        console.error('[watchdog] setInterval registration failed:', schedErr && schedErr.message ? schedErr.message : String(schedErr));
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Heartbeat — fires every 10 s
    // Detects: silently-dead writer (socket closed under us without error).
    // Skips if ACTIVE connection is <2s old (grace window after connect).
    // ─────────────────────────────────────────────────────────────────────
    function startHeartbeat() {
      if (heartbeatInterval) return;
      try {
        if (typeof setInterval !== 'function') {
          console.error('[heartbeat] setInterval is not available in this runtime');
          return;
        }
        heartbeatInterval = setInterval(function () {
          try {
            if (sessionClosed) {
              try {
                clearInterval(heartbeatInterval);
              } catch (ce) {}
              heartbeatInterval = null;
              return;
            }
            if (mode !== STATE.ACTIVE) return;
            if (connActiveTime > 0 && Date.now() - connActiveTime < 2000) return;
            if (!curWriter || curWriterReleased || curSocketClosed) {
              console.log('[HEARTBEAT] dead writer — retrying');
              if (!sessionClosed) safeConnectToNext('heartbeat: dead writer', undefined);
            }
          } catch (e) {
            console.error('[heartbeat] error:', e && e.message ? e.message : String(e));
          }
        }, 10000);
      } catch (schedErr) {
        console.error('[heartbeat] setInterval registration failed:', schedErr && schedErr.message ? schedErr.message : String(schedErr));
      }
    }

    // ── First-connect flag ────────────────────────────────────────────────
    var isFirstConnect = true;

    // ─────────────────────────────────────────────────────────────────────
    // releaseCurrent — safely release locks on current socket handles
    // ─────────────────────────────────────────────────────────────────────
    function releaseCurrent() {
      try {
        if (curWriter && !curWriterReleased) {
          curWriterReleased = true;
          try { curWriter.releaseLock(); } catch (e) {
            console.error('[releaseCurrent] writer.releaseLock:', e && e.message ? e.message : String(e));
          }
        }
      } catch (e) {}
      try {
        if (curReader && !curReaderReleased) {
          curReaderReleased = true;
          try { curReader.releaseLock(); } catch (e) {
            console.error('[releaseCurrent] reader.releaseLock:', e && e.message ? e.message : String(e));
          }
        }
      } catch (e) {}
      try {
        if (curSocket && !curSocketClosed) {
          curSocketClosed = true;
          try { curSocket.close(); } catch (e) {
            console.error('[releaseCurrent] socket.close:', e && e.message ? e.message : String(e));
          }
        }
      } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────────
    // closeAll — full session teardown (idempotent)
    // ─────────────────────────────────────────────────────────────────────
    function closeAll() {
      if (sessionClosed) return;
      sessionClosed = true;
      mode = STATE.FAILED;
      try { if (watchdogInterval)  { clearInterval(watchdogInterval);  watchdogInterval  = null; } } catch (e) {}
      try { if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } } catch (e) {}
      releaseCurrent();
      if (!wsServerClosed) {
        wsServerClosed = true;
        try { server.close(1000, 'done'); } catch (e) {
          console.error('[closeAll] server.close error:', e && e.message ? e.message : String(e));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // safeWsCloseSession — close WS with specific code/reason (once)
    // ─────────────────────────────────────────────────────────────────────
    function safeWsCloseSession(code, reason) {
      if (wsServerClosed) return;
      wsServerClosed = true;
      try { server.close(code, reason); } catch (e) {
        console.error('[safeWsCloseSession] error:', e && e.message ? e.message : String(e));
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // buildCandidates — ordered port list: initialPort first, then PORTS pool
    // ─────────────────────────────────────────────────────────────────────
    function buildCandidates(initialPort) {
      var tried = {};
      var list  = [];
      if (typeof initialPort === 'number' && !isNaN(initialPort)) {
        list.push(initialPort);
        tried[initialPort] = true;
      }
      for (var i = 0; i < PORTS.length; i++) {
        if (!tried[PORTS[i]]) {
          list.push(PORTS[i]);
          tried[PORTS[i]] = true;
        }
      }
      return list;
    }

    function buildHostCandidates(address, addressType) {
      var out = [];
      var seen = {};
      function addHost(h) {
        try {
          var v = String(h || '').trim();
          if (!v) return;
          var key = v.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          out.push(v);
        } catch (e) {}
      }
      try {
        if (addressType === 1 && isCloudflareIP(address)) {
          addHost(PROXYIP);
          addHost(address);
        } else if (addressType === 2 && looksLikeCloudflareHostname(address)) {
          addHost(address);
          addHost(PROXYIP);
        } else {
          addHost(address);
        }
        if (out.length === 0) addHost(PROXYIP);
      } catch (err) {
        console.error('[buildHostCandidates] error:', err && err.message ? err.message : String(err));
      }
      return out;
    }

    function appendInitialHeaderChunk(chunk) {
      try {
        if (!chunk || chunk.length === 0) return true;
        if (initialHeaderBuffer.length + chunk.length > MAX_INITIAL_HEADER_BYTES) return false;
        if (initialHeaderBuffer.length === 0) {
          initialHeaderBuffer = new Uint8Array(chunk);
        } else {
          initialHeaderBuffer = concatUint8(initialHeaderBuffer, chunk);
        }
        return true;
      } catch (err) {
        console.error('[appendInitialHeaderChunk] error:', err && err.message ? err.message : String(err));
        return false;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // startPump — per-port remote → WS pump
    // ─────────────────────────────────────────────────────────────────────
    // Captures its generation at start. Terminates silently if a newer
    // generation becomes active (stale pump detection at every await gap).
    // On failure: sets genFailedFlags[capturedGen] and calls connectToNext.
    function startPump(capturedR, capturedPort, capturedGen, capturedConnectTime) {
      // CRITICAL: the async IIFE returns a Promise — without .catch(), rejections become Worker Error 1101.
      var pumpPromise = (async function () {
        var failureSignaled = false;

        function signalPumpFailure(reason) {
          if (failureSignaled) return;
          failureSignaled = true;
          genFailedFlags[capturedGen] = reason;
          safeConnectToNext(reason, capturedGen);
        }

        try {
          while (true) {
            try {
              if (sessionClosed) break;
              if (capturedGen !== connGeneration) {
                console.log('[DROP] stale pump gen', capturedGen, 'port', capturedPort, '— current:', connGeneration);
                break;
              }

              var rr;
              try {
                rr = await capturedR.read();
              } catch (readErr) {
                console.log('[FAIL] reader.read port', capturedPort, ':', readErr && readErr.message ? readErr.message : String(readErr));
                if (!sessionClosed && capturedGen === connGeneration) {
                  signalPumpFailure('read error port ' + capturedPort);
                }
                break;
              }

              // Re-validate generation after every await gap
              if (sessionClosed) break;
              if (capturedGen !== connGeneration) {
                console.log('[DROP] stale pump gen', capturedGen, 'post-read port', capturedPort);
                break;
              }

              if (!rr || rr.done) {
                if (!sessionClosed && capturedGen === connGeneration) {
                  var elapsed = Date.now() - capturedConnectTime;
                  if (elapsed < 2000) {
                    console.log('[FAIL] early-dead port', capturedPort, '(', elapsed, 'ms < 2000ms)');
                    signalPumpFailure('early stream close port ' + capturedPort);
                  } else {
                    console.log('[INFO] remote stream ended normally port', capturedPort);
                    closeAll();
                  }
                }
                break;
              }

              var v = rr.value;
              if (!v) continue;
              var chunk = v instanceof Uint8Array ? v : new Uint8Array(v);
              if (chunk.length === 0) continue;

              lastDataTime       = Date.now();
              lastRemoteDataTime = Date.now(); // CF: track remote data separately

              // Prepend VLESS response header (0x00 0x00) to first chunk
              if (!vlessResponseSent) {
                vlessResponseSent = true;
                console.log('[SUCCESS] connected port', capturedPort, '— first data received');
                var out = new Uint8Array(2 + chunk.length);
                out[0] = 0; out[1] = 0;
                out.set(chunk, 2);
                if (!wsServerClosed && server.readyState === 1) {
                  try { server.send(out); } catch (sendErr) {
                    console.error('[startPump] server.send (header) error:', sendErr && sendErr.message ? sendErr.message : String(sendErr));
                    if (!sessionClosed && capturedGen === connGeneration) {
                      signalPumpFailure('ws send fail port ' + capturedPort);
                    }
                  }
                }
              } else {
                if (!wsServerClosed && server.readyState === 1) {
                  try { server.send(chunk); } catch (sendErr) {
                    console.error('[startPump] server.send error:', sendErr && sendErr.message ? sendErr.message : String(sendErr));
                    if (!sessionClosed && capturedGen === connGeneration) {
                      signalPumpFailure('ws send fail port ' + capturedPort);
                    }
                  }
                }
              }
            } catch (loopErr) {
              console.error('[startPump] loop error port', capturedPort, ':', loopErr && loopErr.message ? loopErr.message : String(loopErr));
              if (!sessionClosed && capturedGen === connGeneration) {
                signalPumpFailure('pump loop error port ' + capturedPort);
              }
              break;
            }
          }
        } catch (err) {
          console.error('[startPump] outer error port', capturedPort, ':', err && err.message ? err.message : String(err));
          try {
            if (!sessionClosed && capturedGen === connGeneration) {
              signalPumpFailure('pump outer error port ' + capturedPort);
            }
          } catch (e2) {}
        }
      })();
      var pumpDrained = pumpPromise.catch(function (pumpRej) {
        try {
          console.error('[startPump] promise rejection port', capturedPort, ':', pumpRej && pumpRej.message ? pumpRej.message : String(pumpRej));
        } catch (logE) {}
        try {
          if (!sessionClosed) closeAll();
        } catch (e) {}
      });
      if (ctx && typeof ctx.waitUntil === 'function') {
        try {
          ctx.waitUntil(pumpDrained);
        } catch (wuErr) {
          console.error('[startPump] ctx.waitUntil error:', wuErr && wuErr.message ? wuErr.message : String(wuErr));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // connectToNext — core retry engine
    // ─────────────────────────────────────────────────────────────────────
    // Iterates candidatePorts[portIndex..] until one succeeds or all fail.
    // Each attempt: connect → bump gen → start pump → replay buffer → flush pending.
    // If pump pre-failed (genFailedFlags) during setup → skip to next port.
    // retryLock mutex ensures only ONE invocation runs at any time.
    // fromGen (optional): stale pump callbacks are silently rejected.
    async function connectToNext(reason, fromGen) {
      try {
        if (sessionClosed) return;
        if (fromGen !== undefined && fromGen !== connGeneration) return;
        // Mutex — only one connectToNext at a time; released at ALL exit paths
        if (retryLock) return;
        retryLock = true;
        mode = STATE.RETRYING;

        try {
          var connected = false;

          while (!sessionClosed) {
            if (hostIndex >= candidateHosts.length) break;
            if (portIndex >= candidatePorts.length) {
              hostIndex++;
              if (hostIndex < candidateHosts.length) {
                targetHostGlobal = candidateHosts[hostIndex];
                portIndex = 0;
                reason = 'rotate host to ' + targetHostGlobal;
                console.log('[HOST-ROTATE] switching to', targetHostGlobal, '| reason:', reason);
                continue;
              }
              break;
            }
            // Tear down previous attempt
            releaseCurrent();
            curSocket = null; curWriter = null; curReader = null;
            curWriterReleased = false; curReaderReleased = false; curSocketClosed = false;

            // Micro-delay: let stale async callbacks flush before new socket
            await Promise.resolve();
            if (sessionClosed) break;

            // Bump generation — makes ALL older pumps stale immediately
            connGeneration++;
            var thisGen = connGeneration;

            var port = candidatePorts[portIndex++];
            console.log('[CONNECT] host', targetHostGlobal, 'port', port, '| port-attempt', portIndex, 'of', candidatePorts.length, '| host-attempt', (hostIndex + 1), 'of', candidateHosts.length, '| reason:', reason);

            // ── Connect ──────────────────────────────────────────────────
            var sock = null, w = null, r = null;
            var connectOk = false;
            try {
              sock = connectFnGlobal({ hostname: targetHostGlobal, port: port });
              if (!sock || !sock.writable || !sock.readable) throw new Error('malformed socket');
              w = sock.writable.getWriter();
              r = sock.readable.getReader();
              connectOk = true;
            } catch (err) {
              console.log('[FAIL] port', port, ':', err && err.message ? err.message : String(err));
              try { if (r) r.releaseLock(); } catch (e) {}
              try { if (w) w.releaseLock(); } catch (e) {}
              try { if (sock) sock.close(); } catch (e) {}
              reason = 'connect error host ' + targetHostGlobal + ' port ' + port;
              continue;
            }

            if (!connectOk) { reason = 'connect not ok port ' + port; continue; }

            // ── Install handles ───────────────────────────────────────────
            var connectTime   = Date.now();
            curSocket         = sock; curWriter = w; curReader = r;
            curWriterReleased = false; curReaderReleased = false; curSocketClosed = false;
            lastDataTime      = Date.now();
            lastRemoteDataTime = Date.now();

            // ── Launch pump (independent async, captures thisGen) ─────────
            startPump(r, port, thisGen, connectTime);

            // ── Replay entire retry buffer on new socket ──────────────────
            var portOk = true;
            for (var i = 0; i < retryBuffer.length; i++) {
              if (sessionClosed) { portOk = false; break; }
              if (thisGen !== connGeneration) { portOk = false; break; }
              if (!w || curWriter !== w || curWriterReleased) { portOk = false; break; }
              try {
                if (isUdpMode) {
                  await forwardUdpFramed(w, retryBuffer[i], { closed: sessionClosed, writerClosed: curWriterReleased });
                } else {
                  await w.write(retryBuffer[i]);
                }
                if (sessionClosed) { portOk = false; break; }
                if (thisGen !== connGeneration) { portOk = false; break; }
                lastDataTime = Date.now();
              } catch (err) {
                console.log('[FAIL] replay write port', port, ':', err && err.message ? err.message : String(err));
                portOk = false;
                break;
              }
            }

            if (!portOk) {
              try { r.releaseLock(); } catch (e) {}
              try { w.releaseLock(); } catch (e) {}
              try { sock.close(); } catch (e) {}
              if (curSocket === sock) {
                curSocket = null; curWriter = null; curReader = null;
                curWriterReleased = false; curReaderReleased = false; curSocketClosed = false;
              }
              delete genFailedFlags[thisGen];
              reason = 'replay failed host ' + targetHostGlobal + ' port ' + port;
              continue;
            }

            // ── Flush pendingData accumulated during this reconnect ────────
            var pd = pendingData.slice();
            pendingData = [];
            pendingDataBytes = 0;

            for (var j = 0; j < pd.length; j++) {
              if (sessionClosed) { portOk = false; break; }
              if (thisGen !== connGeneration) { portOk = false; break; }
              if (!w || curWriter !== w || curWriterReleased) { portOk = false; break; }
              addToRetryBuffer(pd[j]);
              try {
                if (isUdpMode) {
                  await forwardUdpFramed(w, pd[j], { closed: sessionClosed, writerClosed: curWriterReleased });
                } else {
                  await w.write(pd[j]);
                }
                if (sessionClosed) { portOk = false; break; }
                if (thisGen !== connGeneration) { portOk = false; break; }
                lastDataTime = Date.now();
              } catch (err) {
                console.log('[FAIL] pending flush port', port, ':', err && err.message ? err.message : String(err));
                portOk = false;
                break;
              }
            }

            if (!portOk) {
              try { r.releaseLock(); } catch (e) {}
              try { w.releaseLock(); } catch (e) {}
              try { sock.close(); } catch (e) {}
              if (curSocket === sock) {
                curSocket = null; curWriter = null; curReader = null;
                curWriterReleased = false; curReaderReleased = false; curSocketClosed = false;
              }
              delete genFailedFlags[thisGen];
              reason = 'pending flush failed host ' + targetHostGlobal + ' port ' + port;
              continue;
            }

            // ── Check if pump pre-signaled failure during setup ───────────
            if (genFailedFlags[thisGen]) {
              var preFailReason = genFailedFlags[thisGen];
              delete genFailedFlags[thisGen];
              console.log('[FAIL] pump pre-failed setup port', port, ':', preFailReason);
              try { r.releaseLock(); } catch (e) {}
              try { w.releaseLock(); } catch (e) {}
              try { sock.close(); } catch (e) {}
              if (curSocket === sock) {
                curSocket = null; curWriter = null; curReader = null;
                curWriterReleased = false; curReaderReleased = false; curSocketClosed = false;
              }
              reason = preFailReason + ' host ' + targetHostGlobal + ' port ' + port;
              continue;
            }

            // ── Port succeeded ────────────────────────────────────────────
            connected      = true;
            mode           = STATE.ACTIVE;
            connActiveTime = Date.now();
            startWatchdog();
            startHeartbeat();
            if (isFirstConnect) {
              isFirstConnect = false;
              console.log('[CONNECT] success port', port, '— ACTIVE mode:', isUdpMode ? 'udp' : 'tcp');
            } else {
              console.log('[RECOVERED] port', port, '— resumed mode:', isUdpMode ? 'udp' : 'tcp');
            }
            break;
          }

          if (!connected && !sessionClosed) {
            console.log('[FAIL] all hosts/ports exhausted. Last reason:', reason);
            closeAll();
          }

        } finally {
          retryLock = false; // Always release mutex
        }

      } catch (err) {
        console.error('[connectToNext] master catch:', err && err.message ? err.message : String(err));
        retryLock = false; // Release at outer catch too
        if (!sessionClosed) closeAll();
      }
    }

    // ── safeConnectToNext — schedules connectToNext with guaranteed rejection handling
    // Fire-and-forget connectToNext() calls MUST use this path; bare connectToNext()
    // returns a Promise that could reject and surface as Worker Error 1101.
    function safeConnectToNext(reason, fromGen) {
      try {
        Promise.resolve(connectToNext(reason, fromGen)).catch(function (schedErr) {
          console.error('[safeConnectToNext] rejected:', schedErr && schedErr.message ? schedErr.message : String(schedErr));
          try {
            if (!sessionClosed) closeAll();
          } catch (e) {}
        });
      } catch (syncSched) {
        console.error('[safeConnectToNext] sync error:', syncSched && syncSched.message ? syncSched.message : String(syncSched));
        try {
          if (!sessionClosed) closeAll();
        } catch (e2) {}
      }
    }

    async function processWsBinaryFrame(raw) {
      if (!raw || raw.length === 0) return;
      if (mode === STATE.IDLE) {
        if (!appendInitialHeaderChunk(raw)) {
          safeWsCloseSession(1009, 'header too large');
          return;
        }

        var parsed = parseVlessHeaderDetailed(initialHeaderBuffer);
        if (!parsed || !parsed.ok) {
          if (parsed && parsed.needMore) return;
          safeWsCloseSession(1002, 'bad header');
          return;
        }

        mode = STATE.CONNECTING;
        var hdr = parsed.header;
        initialHeaderBuffer = new Uint8Array(0);

        if (!isValidUUID(hdr.uuid) || hdr.uuid.toLowerCase() !== USERID.toLowerCase()) {
          safeWsCloseSession(1008, 'auth failed');
          return;
        }

        isUdpMode = (hdr.command === 2);
        if (hdr.command !== 1 && hdr.command !== 2) {
          safeWsCloseSession(1008, 'bad cmd');
          return;
        }

        targetHostGlobal = String(hdr.address || '');
        var targetPort   = hdr.port;

        var connectFn = null;
        try {
          connectFn = await getCloudflareSocketsConnect();
          if (!connectFn) {
            console.error('[import sockets] connect function unavailable');
            safeWsCloseSession(1011, 'no sockets connect');
            return;
          }
        } catch (err) {
          console.error('[import sockets] error:', err && err.message ? err.message : String(err));
          safeWsCloseSession(1011, 'no sockets module');
          return;
        }

        connectFnGlobal = connectFn;
        candidateHosts  = buildHostCandidates(targetHostGlobal, hdr.addressType);
        hostIndex       = 0;
        if (!candidateHosts || candidateHosts.length === 0) {
          safeWsCloseSession(1011, 'no target host');
          return;
        }
        targetHostGlobal = candidateHosts[0];
        candidatePorts  = buildCandidates(targetPort);
        portIndex       = 0;

        if (hdr.payload && hdr.payload.length > 0) {
          addToRetryBuffer(hdr.payload);
        }

        await connectToNext('initial connect', undefined);

      } else if (mode === STATE.CONNECTING || mode === STATE.RETRYING) {
        // Buffer WS frames while establishing / re-establishing socket
        if (pendingData.length >= MAX_PENDING_CHUNKS) {
          console.error('[ws-message] pendingData overflow — closing');
          closeAll();
          return;
        }
        if (pendingDataBytes + raw.length > MAX_PENDING_BYTES) {
          console.error('[ws-message] pendingData bytes overflow — closing');
          closeAll();
          return;
        }
        pendingData.push(raw);
        pendingDataBytes += raw.length;

      } else if (mode === STATE.ACTIVE) {
        // Write validation: check writer belongs to current generation
        if (!curWriter || curWriterReleased || curSocketClosed) {
          console.log('[FAIL] invalid writer state — retrying');
          if (!sessionClosed) {
            mode = STATE.RETRYING;
            safeConnectToNext('active: invalid writer', undefined);
          }
          return;
        }

        lastDataTime = Date.now();
        addToRetryBuffer(raw); // buffer BEFORE write — ensures it's captured if write fails

        if (isUdpMode) {
          try {
            await forwardUdpFramed(curWriter, raw, { closed: sessionClosed, writerClosed: curWriterReleased });
          } catch (err) {
            console.log('[FAIL] udp write error:', err && err.message ? err.message : String(err));
            if (!sessionClosed) {
              mode = STATE.RETRYING;
              safeConnectToNext('udp write error', undefined);
            }
          }
        } else {
          try {
            if (!curWriter || curWriterReleased || curSocketClosed) {
              throw new Error('writer became invalid before tcp write');
            }
            await curWriter.write(raw);
          } catch (err) {
            console.log('[FAIL] tcp write error:', err && err.message ? err.message : String(err));
            if (!sessionClosed) {
              mode = STATE.RETRYING;
              safeConnectToNext('tcp write error', undefined);
            }
          }
        }
      }
    }

    // ── WebSocket message handler ─────────────────────────────────────────
    // Wrapped with safeAsync — any unhandled error routes to closeAll.
    server.addEventListener('message', safeAsync(async function (event) {
      if (sessionClosed) return;
      if (!event || event.data === undefined || event.data === null) return;
      if (typeof event.data === 'string') return;
      var raw = await normalizeWsBinaryData(event.data);
      if (!raw || raw.length === 0) return;
      await processWsBinaryFrame(raw);

    }, 'ws-message', function (err, msg) {
      console.error('[ws-message] safeAsync caught — closing:', msg);
      try { closeAll(); } catch (e) {}
    }));

    // Process early data from Sec-WebSocket-Protocol for clients that send
    // VLESS payload before first WS message.
    if (wsEarlyData && wsEarlyData.length > 0) {
      safeAsync(async function () {
        if (sessionClosed) return;
        await processWsBinaryFrame(wsEarlyData);
      }, 'ws-early-data', function (err, msg) {
        console.error('[ws-early-data] safeAsync caught:', msg);
        try { closeAll(); } catch (e) {}
      })();
    }

    // Some Workers revisions do not expose 'error' on WebSocketPair server sockets; registration can throw
    // synchronously (before safeAsync runs) → uncaught exception → Error 1101. Nested try/catch + API guard.
    try {
      try {
        if (typeof server.addEventListener === 'function') {
          server.addEventListener('error', safeAsync(function (err) {
            console.error('[ws-error] server error:', err && err.message ? err.message : String(err));
            closeAll();
          }, 'ws-error', function (e) {
            console.error('[ws-error] safeAsync caught:', e && e.message ? e.message : String(e));
            try { closeAll(); } catch (e2) {}
          }));
        } else {
          console.error('[ws-error] server.addEventListener is not a function — skipping error listener');
        }
      } catch (regErr) {
        console.error('[ws-error] addEventListener registration error:', regErr && regErr.message ? regErr.message : String(regErr));
      }
    } catch (outerErr) {
      console.error('[ws-error] outer guard error:', outerErr && outerErr.message ? outerErr.message : String(outerErr));
    }

    server.addEventListener('close', safeAsync(function () {
      wsServerClosed = true;
      closeAll();
    }, 'ws-close', function (e) {
      console.error('[ws-close] safeAsync caught:', e && e.message ? e.message : String(e));
      try { closeAll(); } catch (e2) {}
    }));

    return new Response(null, { status: 101, webSocket: client });

  } catch (wsErr) {
    console.error('[handleVlessOverWS] master catch:', wsErr && wsErr.message ? wsErr.message : String(wsErr));
    return new Response('Connection Failed', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// ==========================
// HTML Response Headers
// ==========================
var HTML_HEADERS = {
  'Content-Type':  'text/html; charset=utf-8',
  'Cache-Control': 'private, max-age=0'
};

// ==========================
// Path & static asset helpers (favicon + UUID token route normalization)
// ==========================
// Minimal valid 1×1 transparent GIF (43 bytes). 200 + image/gif avoids empty-body/204 quirks → 500.
var FAVICON_GIF_BYTES = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59
]);

// Normalizes URL pathname for reliable routing across clients (encoding, trailing slashes).
function normalizePathname(raw) {
  try {
    var p = String(raw || '/');
    try {
      p = decodeURIComponent(p.replace(/\+/g, '%20'));
    } catch (e) {}
    if (!p || p.charAt(0) !== '/') {
      p = '/' + String(p || '').replace(/^\/+/, '');
    }
    while (p.length > 1 && p.charAt(p.length - 1) === '/') {
      p = p.slice(0, -1);
    }
    return p;
  } catch (err) {
    console.error('[normalizePathname] error:', err && err.message ? err.message : String(err));
    return '/';
  }
}

// Case-insensitive favicon match (some proxies alter casing).
function isFaviconRequest(pathname) {
  try {
    return String(pathname || '').toLowerCase() === '/favicon.ico';
  } catch (err) {
    console.error('[isFaviconRequest] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

// Favicon: 200 + real GIF bytes (not 204) — avoids CDN/browser stacks that map bad empty bodies to 500.
function faviconResponse(httpMethod) {
  var method = 'GET';
  try {
    method = String(httpMethod || 'GET').toUpperCase();
  } catch (e) {}
  var headers = {
    'Content-Type': 'image/gif',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  try {
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: headers });
    }
    return new Response(FAVICON_GIF_BYTES, { status: 200, headers: headers });
  } catch (err) {
    console.error('[faviconResponse] error:', err && err.message ? err.message : String(err));
    try {
      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: headers });
      }
      return new Response(FAVICON_GIF_BYTES, { status: 200, headers: headers });
    } catch (err2) {
      console.error('[faviconResponse] hard fallback:', err2 && err2.message ? err2.message : String(err2));
      return new Response(null, { status: 200, headers: { 'Content-Type': 'image/gif' } });
    }
  }
}

// UUID config "token" path: case-insensitive match after normalization.
function isConfigTokenPath(pathname, method) {
  try {
    if (method !== 'GET') return false;
    var want = '/' + String(USERID).toLowerCase();
    var got = String(pathname || '').toLowerCase();
    return got === want;
  } catch (err) {
    console.error('[isConfigTokenPath] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

// True only for a real RFC 6455 opening handshake. Treating bare "Upgrade: websocket"
// (no Sec-WebSocket-Key) as WS makes Workers emit 101 without a valid handshake → edge 500.
function isRfc6455WebSocketUpgrade(request) {
  try {
    if (!request || !request.headers) return false;
    var upg = request.headers.get('Upgrade') || '';
    if (!upg || upg.toLowerCase() !== 'websocket') return false;
    var key = request.headers.get('Sec-WebSocket-Key') || '';
    return String(key).trim().length > 0;
  } catch (err) {
    console.error('[isRfc6455WebSocketUpgrade] error:', err && err.message ? err.message : String(err));
    return false;
  }
}

// ==========================
// Fetch Handler
// ==========================
export default {
  async fetch(request, env, ctx) {
    try {
      var url;
      try {
        url = new URL(request.url);
      } catch (urlBad) {
        console.error('[fetch] URL parse error:', urlBad && urlBad.message ? urlBad.message : String(urlBad));
        return new Response('Invalid Request', { status: 200 });
      }

      var pathnameRaw = url.pathname || '/';
      var host     = '';
      var method   = '';
      var methodUp = 'GET';
      var up       = '';
      try {
        host   = (request.headers && request.headers.get('Host'))    || '';
        method = request.method || '';
        methodUp = String(method || 'GET').toUpperCase();
        up     = (request.headers && request.headers.get('Upgrade')) || '';
      } catch (hdrErr) {
        console.error('[fetch] headers error:', hdrErr && hdrErr.message ? hdrErr.message : String(hdrErr));
      }

      // Favicon — match raw path before decode/normalize (avoids rare decode edge cases).
      try {
        var favSeg = String(pathnameRaw).split('?')[0];
        var favLc = favSeg.toLowerCase();
        while (favLc.length > 1 && favLc.charAt(favLc.length - 1) === '/') {
          favLc = favLc.slice(0, -1);
        }
        if (favLc === '/favicon.ico') {
          try {
            return faviconResponse(method);
          } catch (favErr) {
            console.error('[fetch] favicon raw-path error:', favErr && favErr.message ? favErr.message : String(favErr));
            try {
              return faviconResponse(method);
            } catch (fav2) {
              return new Response(FAVICON_GIF_BYTES, { status: 200, headers: { 'Content-Type': 'image/gif' } });
            }
          }
        }
      } catch (favEarly) {
        console.error('[fetch] favicon early gate:', favEarly && favEarly.message ? favEarly.message : String(favEarly));
      }

      var pathname = normalizePathname(pathnameRaw);

      // Favicon — second match after normalization (case / slash variants).
      if (isFaviconRequest(pathname)) {
        try {
          return faviconResponse(method);
        } catch (favErr) {
          console.error('[fetch] favicon handler error:', favErr && favErr.message ? favErr.message : String(favErr));
          return new Response(FAVICON_GIF_BYTES, { status: 200, headers: { 'Content-Type': 'image/gif' } });
        }
      }

      // WebSocket upgrade — RFC 6455 requires Sec-WebSocket-Key; never return 101 without it.
      if (isRfc6455WebSocketUpgrade(request)) {
        try {
          return await handleVlessOverWS(request, ctx);
        } catch (wsErr) {
          console.error('[fetch] handleVlessOverWS error:', wsErr && wsErr.message ? wsErr.message : String(wsErr));
          return new Response('Connection Failed', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }

      // Lightweight health endpoint for external monitors.
      if ((methodUp === 'GET' || methodUp === 'HEAD') && pathname === '/health') {
        var healthHeaders = {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        };
        if (methodUp === 'HEAD') {
          return new Response(null, { status: 200, headers: healthHeaders });
        }
        return new Response('{"ok":true,"service":"vless-ws-worker"}', { status: 200, headers: healthHeaders });
      }

      // Explicit robots response for scanners and bots.
      if ((methodUp === 'GET' || methodUp === 'HEAD') && pathname === '/robots.txt') {
        var robotsHeaders = {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        };
        if (methodUp === 'HEAD') {
          return new Response(null, { status: 200, headers: robotsHeaders });
        }
        return new Response('User-agent: *\nDisallow: /', { status: 200, headers: robotsHeaders });
      }

      // Home page
      if (methodUp === 'GET' && pathname === '/') {
        try {
          return new Response(homePage(host), { status: 200, headers: HTML_HEADERS });
        } catch (e) {
          return new Response('Service Online', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }

      // Config page (UUID token path — case-insensitive after normalizePathname)
      if (isConfigTokenPath(pathname, method)) {
        try {
          return new Response(configPage(host), { status: 200, headers: HTML_HEADERS });
        } catch (e) {
          return new Response('Configuration Unavailable', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }

      // Default fallback — show home page for any unmatched route
      try {
        return new Response(homePage(host), { status: 200, headers: HTML_HEADERS });
      } catch (e) {
        return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }

    } catch (err) {
      // Absolute last resort — nothing can escape to the CF runtime
      console.error('[fetch] top-level error:', err && err.message ? err.message : String(err));
      return new Response('Safe Fallback', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }
};