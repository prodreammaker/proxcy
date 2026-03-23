var DEFAULT_USERID = '84621b0a-14e1-4600-ad46-aec6bcfa0e14';
var DEFAULT_PROXYIP = 'cdn.xn--b6gac.eu.org';
var DEFAULT_CLEAN_IPS = [
  'www.visa.com',
  'www.shopify.com',
  '104.17.10.10',
  '104.18.2.2'
];

var HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, max-age=0'
};

var HEALTH_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

var ROBOTS_BODY = 'User-agent: *\nDisallow: /';
var CLOUDFLARE_HOST_HINTS = ['workers.dev', 'pages.dev', 'cloudflare', 'cdn-cgi', 'trycloudflare.com'];
var CLOUDFLARE_CIDRS = [
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

var PARSED_CIDRS = CLOUDFLARE_CIDRS.map(parseCIDR);

function getRuntimeConfig(env) {
  var userId = readString(env && env.USERID, DEFAULT_USERID);
  var proxyHost = readString(env && env.PROXYIP, DEFAULT_PROXYIP);
  var cleanIpEnv = readString(env && env.CLEAN_IPS, '');
  var cleanIps = cleanIpEnv
    ? cleanIpEnv.split(',').map(function (entry) { return entry.trim(); }).filter(Boolean)
    : DEFAULT_CLEAN_IPS.slice();

  if (!isValidUuid(userId)) {
    throw new Error('USERID must be a valid UUID');
  }

  if (!cleanIps.length) {
    cleanIps = DEFAULT_CLEAN_IPS.slice();
  }

  return {
    userId: userId,
    proxyHost: proxyHost,
    cleanIps: cleanIps
  };
}

function readString(value, fallback) {
  var text = String(value || '').trim();
  return text || fallback;
}

function randomCleanIp(cleanIps) {
  if (!cleanIps.length) return DEFAULT_CLEAN_IPS[0];
  return cleanIps[Math.floor(Math.random() * cleanIps.length)];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePathname(pathname) {
  var path = String(pathname || '/');
  if (!path) return '/';
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

function isWebSocketUpgrade(request) {
  var upgrade = request.headers.get('Upgrade') || '';
  var key = request.headers.get('Sec-WebSocket-Key') || '';
  return upgrade.toLowerCase() === 'websocket' && key.trim().length > 0;
}

function configPath(userId) {
  return '/' + userId.toLowerCase();
}

function buildVlessUri(config, workerHost) {
  var cleanIp = randomCleanIp(config.cleanIps);
  return 'vless://' + config.userId + '@' + cleanIp + ':443' +
    '?encryption=none&security=tls&sni=' + encodeURIComponent(workerHost) +
    '&fp=chrome&type=ws&host=' + encodeURIComponent(workerHost) +
    '&path=%2F#CF-MINI-' + encodeURIComponent(cleanIp);
}

function homePage(config, workerHost) {
  var configHref = configPath(config.userId);
  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>CF VLESS Mini</title>' +
    '<style>' +
    'body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1020;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;}' +
    '.card{max-width:720px;width:100%;background:linear-gradient(180deg,#11182d,#0b1020);border:1px solid rgba(96,165,250,.25);border-radius:24px;padding:32px;box-shadow:0 20px 60px rgba(15,23,42,.55);}' +
    'h1{margin:0 0 12px;font-size:28px;}p{margin:0 0 16px;color:#94a3b8;line-height:1.6;}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:24px 0;}' +
    '.panel{padding:16px;border-radius:16px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.18);}' +
    '.label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin-bottom:8px;}' +
    '.value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word;color:#f8fafc;}' +
    '.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;}' +
    'a.button{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:12px;background:#60a5fa;color:#0f172a;text-decoration:none;font-weight:700;}' +
    'a.ghost{background:transparent;border:1px solid rgba(96,165,250,.35);color:#bfdbfe;}' +
    '</style></head><body><main class="card">' +
    '<h1>Cloudflare VLESS mini</h1>' +
    '<p>A reduced Worker that keeps only the public pages, health checks, and a single WebSocket-to-socket relay path.</p>' +
    '<section class="grid">' +
    '<div class="panel"><div class="label">Host</div><div class="value">' + escapeHtml(workerHost) + '</div></div>' +
    '<div class="panel"><div class="label">Health</div><div class="value">GET /health</div></div>' +
    '<div class="panel"><div class="label">UUID route</div><div class="value">' + escapeHtml(configHref) + '</div></div>' +
    '<div class="panel"><div class="label">Proxy fallback</div><div class="value">' + escapeHtml(config.proxyHost) + '</div></div>' +
    '</section>' +
    '<div class="actions">' +
    '<a class="button" href="' + escapeHtml(configHref) + '">Open config page</a>' +
    '<a class="button ghost" href="/health">View health JSON</a>' +
    '</div></main></body></html>';
}

function configPage(config, workerHost) {
  var vlessUri = buildVlessUri(config, workerHost);
  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>CF VLESS Mini Config</title>' +
    '<style>' +
    'body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#020617;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;}' +
    '.card{max-width:860px;width:100%;background:linear-gradient(180deg,#111827,#020617);border:1px solid rgba(167,139,250,.25);border-radius:24px;padding:32px;box-shadow:0 20px 60px rgba(2,6,23,.75);}' +
    '.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:20px 0;}' +
    '.panel{padding:16px;border-radius:16px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.18);}' +
    '.label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin-bottom:8px;}' +
    '.value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word;color:#f8fafc;}' +
    '.link{padding:18px;border-radius:18px;background:#020617;border:1px solid rgba(96,165,250,.22);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;word-break:break-word;color:#bfdbfe;}' +
    '.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;}' +
    'button,a{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;}' +
    'button{background:#a78bfa;color:#1e1b4b;}a{background:transparent;border:1px solid rgba(167,139,250,.35);color:#ddd6fe;}' +
    '</style></head><body><main class="card">' +
    '<h1 style="margin:0 0 10px;">Mini configuration</h1>' +
    '<p style="margin:0;color:#94a3b8;line-height:1.6;">A single TLS+WebSocket profile built from the current Worker hostname and a randomly selected clean IP.</p>' +
    '<section class="row">' +
    '<div class="panel"><div class="label">Worker host</div><div class="value">' + escapeHtml(workerHost) + '</div></div>' +
    '<div class="panel"><div class="label">UUID</div><div class="value">' + escapeHtml(config.userId) + '</div></div>' +
    '<div class="panel"><div class="label">Transport</div><div class="value">TLS / WS / 443</div></div>' +
    '<div class="panel"><div class="label">Fallback proxy</div><div class="value">' + escapeHtml(config.proxyHost) + '</div></div>' +
    '</section>' +
    '<div class="link" id="vless-link">' + escapeHtml(vlessUri) + '</div>' +
    '<div class="actions">' +
    '<button id="copy-link">Copy VLESS URI</button>' +
    '<a href="/">Back home</a>' +
    '</div>' +
    '<script>' +
    'document.getElementById("copy-link").addEventListener("click",function(){' +
    'var text=document.getElementById("vless-link").textContent;' +
    'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text);}else{' +
    'var area=document.createElement("textarea");area.value=text;document.body.appendChild(area);area.select();document.execCommand("copy");document.body.removeChild(area);}' +
    'this.textContent="Copied";setTimeout(()=>{this.textContent="Copy VLESS URI";},1500);' +
    '});' +
    '</script></main></body></html>';
}

function bytesToString(bytes, offset, length) {
  var chars = '';
  for (var i = 0; i < length; i++) {
    chars += String.fromCharCode(bytes[offset + i]);
  }
  return chars;
}

function byteHex(value) {
  var hex = (value & 255).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

function bytesToUuid(bytes) {
  var hex = '';
  for (var i = 0; i < 16; i++) {
    hex += byteHex(bytes[i]);
  }
  return hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20, 32);
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function parseVlessHeader(chunk) {
  if (!chunk || chunk.length < 22) return null;

  var offset = 0;
  var version = chunk[offset++];
  if (version !== 1) return null;

  var uuidBytes = chunk.subarray(offset, offset + 16);
  if (uuidBytes.length !== 16) return null;
  offset += 16;

  var optionLength = chunk[offset++];
  if (chunk.length < offset + optionLength + 4) return null;
  offset += optionLength;

  var command = chunk[offset++];
  var port = (chunk[offset] << 8) | chunk[offset + 1];
  offset += 2;

  var addressType = chunk[offset++];
  var address = '';

  if (addressType === 1) {
    if (chunk.length < offset + 4) return null;
    address = chunk[offset] + '.' + chunk[offset + 1] + '.' + chunk[offset + 2] + '.' + chunk[offset + 3];
    offset += 4;
  } else if (addressType === 2) {
    if (chunk.length < offset + 1) return null;
    var domainLength = chunk[offset++];
    if (chunk.length < offset + domainLength) return null;
    address = bytesToString(chunk, offset, domainLength);
    offset += domainLength;
  } else if (addressType === 3) {
    if (chunk.length < offset + 16) return null;
    var parts = [];
    for (var group = 0; group < 8; group++) {
      var hi = chunk[offset + group * 2];
      var lo = chunk[offset + group * 2 + 1];
      parts.push((((hi & 255) << 8) | (lo & 255)).toString(16));
    }
    address = parts.join(':');
    offset += 16;
  } else {
    return null;
  }

  return {
    uuid: bytesToUuid(uuidBytes),
    command: command,
    port: port,
    address: address,
    addressType: addressType,
    payload: chunk.subarray(offset)
  };
}

function ipToInt(ip) {
  var parts = String(ip || '').split('.');
  if (parts.length !== 4) return 0;

  var result = 0;
  for (var i = 0; i < parts.length; i++) {
    var value = parseInt(parts[i], 10);
    if (Number.isNaN(value) || value < 0 || value > 255) return 0;
    result = ((result << 8) + value) >>> 0;
  }
  return result >>> 0;
}

function parseCIDR(cidr) {
  var parts = String(cidr || '').split('/');
  var base = ipToInt(parts[0]);
  var maskBits = parseInt(parts[1], 10);
  if (Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) maskBits = 0;
  var mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return { base: base, mask: mask };
}

function isCloudflareIp(ip) {
  var ipValue = ipToInt(ip);
  if (!ipValue) return false;

  for (var i = 0; i < PARSED_CIDRS.length; i++) {
    var range = PARSED_CIDRS[i];
    if ((ipValue & range.mask) === (range.base & range.mask)) {
      return true;
    }
  }
  return false;
}

function looksLikeCloudflareHost(hostname) {
  var text = String(hostname || '').toLowerCase();
  if (!text) return false;

  for (var i = 0; i < CLOUDFLARE_HOST_HINTS.length; i++) {
    if (text.indexOf(CLOUDFLARE_HOST_HINTS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(0);
}

function safeSend(ws, value) {
  if (ws && ws.readyState === 1) {
    ws.send(value);
  }
}

function safeCloseWebSocket(ws, code, reason) {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
    ws.close(code || 1000, reason || 'done');
  }
}

function concatUint8(left, right) {
  var output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

async function writeUdpFrames(writer, chunk) {
  var offset = 0;
  while (offset < chunk.length) {
    if (offset + 2 > chunk.length) {
      var remainder = chunk.subarray(offset);
      var fallbackFrame = new Uint8Array(2 + remainder.length);
      fallbackFrame[0] = (remainder.length >> 8) & 255;
      fallbackFrame[1] = remainder.length & 255;
      fallbackFrame.set(remainder, 2);
      await writer.write(fallbackFrame);
      return;
    }

    var length = (chunk[offset] << 8) | chunk[offset + 1];
    if (length > 0 && offset + 2 + length <= chunk.length) {
      await writer.write(chunk.subarray(offset, offset + 2 + length));
      offset += 2 + length;
      continue;
    }

    var rest = chunk.subarray(offset);
    var frame = new Uint8Array(2 + rest.length);
    frame[0] = (rest.length >> 8) & 255;
    frame[1] = rest.length & 255;
    frame.set(rest, 2);
    await writer.write(frame);
    return;
  }
}

async function pumpTcpToWebSocket(reader, server, closeAll) {
  var firstChunk = true;
  try {
    while (true) {
      var result = await reader.read();
      if (result.done) return;
      var chunk = toUint8Array(result.value);
      if (!chunk.length) continue;

      if (firstChunk) {
        firstChunk = false;
        var withResponseHeader = new Uint8Array(2 + chunk.length);
        withResponseHeader[0] = 0;
        withResponseHeader[1] = 0;
        withResponseHeader.set(chunk, 2);
        safeSend(server, withResponseHeader);
      } else {
        safeSend(server, chunk);
      }
    }
  } catch (error) {
    console.error('[mini] tcp pump failed:', error.message || String(error));
  } finally {
    closeAll();
  }
}

async function pumpUdpTcpToWebSocket(reader, server, closeAll) {
  var pending = new Uint8Array(0);
  var firstFrame = true;
  try {
    while (true) {
      var result = await reader.read();
      if (result.done) return;

      var chunk = toUint8Array(result.value);
      if (!chunk.length) continue;
      pending = pending.length ? concatUint8(pending, chunk) : chunk;

      while (pending.length >= 2) {
        var length = (pending[0] << 8) | pending[1];
        if (length < 1 || pending.length < length + 2) {
          break;
        }

        var packet = pending.subarray(0, length + 2);
        pending = pending.subarray(length + 2);

        if (firstFrame) {
          firstFrame = false;
          var framed = new Uint8Array(2 + packet.length);
          framed[0] = 0;
          framed[1] = 0;
          framed.set(packet, 2);
          safeSend(server, framed);
        } else {
          safeSend(server, packet);
        }
      }
    }
  } catch (error) {
    console.error('[mini] udp pump failed:', error.message || String(error));
  } finally {
    closeAll();
  }
}

async function handleVlessOverWebSocket(request, config) {
  var webSocketPair = new WebSocketPair();
  var client = webSocketPair[0];
  var server = webSocketPair[1];
  server.accept();

  var connectModule = await import('cloudflare:sockets');
  var connect = connectModule.connect;
  var mode = 'header';
  var pendingWrites = [];
  var socket = null;
  var writer = null;
  var reader = null;
  var closed = false;

  function closeAll(code, reason) {
    if (closed) return;
    closed = true;

    try {
      if (reader && typeof reader.releaseLock === 'function') reader.releaseLock();
    } catch (error) {}

    try {
      if (writer && typeof writer.releaseLock === 'function') writer.releaseLock();
    } catch (error) {}

    try {
      if (socket && typeof socket.close === 'function') socket.close();
    } catch (error) {}

    try {
      safeCloseWebSocket(server, code, reason);
    } catch (error) {}
  }

  async function onMessage(event) {
    if (closed || typeof event.data === 'string') return;

    try {
      var raw = toUint8Array(event.data);
      if (!raw.length) return;

      if (mode === 'header') {
        mode = 'connecting';
        var header = parseVlessHeader(raw);
        if (!header || !isValidUuid(header.uuid) || header.uuid.toLowerCase() !== config.userId.toLowerCase()) {
          closeAll(1008, 'invalid uuid');
          return;
        }

        var isUdp = header.command === 2;
        if (header.command !== 1 && !(isUdp && header.port === 53)) {
          closeAll(1008, 'unsupported command');
          return;
        }

        var targetHost = header.address;
        if (config.proxyHost) {
          if ((header.addressType === 1 && isCloudflareIp(header.address)) ||
              (header.addressType === 2 && looksLikeCloudflareHost(header.address))) {
            targetHost = config.proxyHost;
          }
        }

        socket = connect({ hostname: targetHost, port: header.port });
        writer = socket.writable.getWriter();
        reader = socket.readable.getReader();
        mode = isUdp ? 'udp' : 'tcp';

        if (isUdp) {
          pumpUdpTcpToWebSocket(reader, server, closeAll);
        } else {
          pumpTcpToWebSocket(reader, server, closeAll);
        }

        if (header.payload.length) {
          if (isUdp) {
            await writeUdpFrames(writer, header.payload);
          } else {
            await writer.write(header.payload);
          }
        }

        while (pendingWrites.length) {
          var queued = pendingWrites.shift();
          if (isUdp) {
            await writeUdpFrames(writer, queued);
          } else {
            await writer.write(queued);
          }
        }
        return;
      }

      if (mode === 'connecting') {
        pendingWrites.push(raw);
        return;
      }

      if (mode === 'udp') {
        await writeUdpFrames(writer, raw);
        return;
      }

      await writer.write(raw);
    } catch (error) {
      console.error('[mini] websocket message failed:', error.message || String(error));
      closeAll(1011, 'relay failure');
    }
  }

  server.addEventListener('message', function (event) {
    void onMessage(event);
  });

  server.addEventListener('close', function () {
    closeAll(1000, 'client closed');
  });

  server.addEventListener('error', function () {
    closeAll(1011, 'socket error');
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

export default {
  async fetch(request, env) {
    try {
      var config = getRuntimeConfig(env);
      var url = new URL(request.url);
      var pathname = normalizePathname(url.pathname);
      var method = request.method.toUpperCase();
      var workerHost = request.headers.get('Host') || url.hostname;

      if (isWebSocketUpgrade(request)) {
        return handleVlessOverWebSocket(request, config);
      }

      if ((method === 'GET' || method === 'HEAD') && pathname === '/health') {
        if (method === 'HEAD') {
          return new Response(null, { status: 200, headers: HEALTH_HEADERS });
        }
        return new Response(JSON.stringify({
          ok: true,
          service: 'vless-ws-worker-mini',
          workerHost: workerHost
        }), { status: 200, headers: HEALTH_HEADERS });
      }

      if ((method === 'GET' || method === 'HEAD') && pathname === '/robots.txt') {
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
          });
        }
        return new Response(ROBOTS_BODY, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
        });
      }

      if ((method === 'GET' || method === 'HEAD') && pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }

      if (method === 'GET' && pathname === '/') {
        return new Response(homePage(config, workerHost), { status: 200, headers: HTML_HEADERS });
      }

      if (method === 'GET' && pathname.toLowerCase() === configPath(config.userId)) {
        return new Response(configPage(config, workerHost), { status: 200, headers: HTML_HEADERS });
      }

      return new Response(homePage(config, workerHost), { status: 200, headers: HTML_HEADERS });
    } catch (error) {
      console.error('[mini] fetch failed:', error.message || String(error));
      return new Response('Mini worker fallback', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
};
