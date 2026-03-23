// Minimal VLESS-over-WS Cloudflare Worker
var UUID = '84621b0a-14e1-4600-ad46-aec6bcfa0e14';
var PROXYIP = 'cdn.xn--b6gac.eu.org';

var CF_RANGES = ['103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','104.16.0.0/13',
  '104.24.0.0/14','108.162.192.0/18','131.0.72.0/22','141.101.64.0/18',
  '162.158.0.0/15','172.64.0.0/13','173.245.48.0/20','188.114.96.0/20',
  '190.93.240.0/20','197.234.240.0/22','198.41.128.0/17'];

function ipNum(ip) {
  var p = ip.split('.'); var n = 0;
  for (var i = 0; i < 4; i++) n = (n << 8 | parseInt(p[i], 10)) >>> 0;
  return n;
}
function isCF(ip) {
  try {
    var n = ipNum(ip);
    for (var i = 0; i < CF_RANGES.length; i++) {
      var parts = CF_RANGES[i].split('/');
      var base = ipNum(parts[0]);
      var bits = parseInt(parts[1], 10);
      var mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      if ((n & mask) === (base & mask)) return true;
    }
  } catch(e) {}
  return false;
}

function parseVless(buf) {
  try {
    if (buf.length < 24) return null;
    // Skip version (1) + UUID (16) + addons len (1)
    var uuidBytes = buf.slice(1, 17);
    var hex = Array.from(uuidBytes).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
    var uuid = hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    if (uuid.toLowerCase() !== UUID.toLowerCase()) return null;
    var addonsLen = buf[17];
    var offset = 18 + addonsLen;
    if (offset + 3 > buf.length) return null;
    var cmd = buf[offset]; // 1=tcp 2=udp
    if (cmd !== 1 && cmd !== 2) return null;
    var port = (buf[offset+1] << 8) | buf[offset+2];
    var addrType = buf[offset+3];
    offset += 4;
    var host = '';
    if (addrType === 1) { // IPv4
      if (offset + 4 > buf.length) return null;
      host = buf[offset]+'.'+buf[offset+1]+'.'+buf[offset+2]+'.'+buf[offset+3];
      offset += 4;
    } else if (addrType === 2) { // domain
      var domLen = buf[offset++];
      host = new TextDecoder().decode(buf.slice(offset, offset+domLen));
      offset += domLen;
    } else if (addrType === 3) { // IPv6
      if (offset + 16 > buf.length) return null;
      var parts = [];
      for (var i = 0; i < 8; i++) parts.push(((buf[offset+i*2]<<8)|buf[offset+i*2+1]).toString(16));
      host = parts.join(':');
      offset += 16;
    } else return null;
    return { cmd: cmd, port: port, host: host, addrType: addrType, payload: buf.slice(offset) };
  } catch(e) { return null; }
}

async function handleVless(server) {
  var socket = null; var writer = null; var closed = false;
  function closeAll() {
    if (closed) return; closed = true;
    try { if (writer) writer.releaseLock(); } catch(e) {}
    try { if (socket) socket.close(); } catch(e) {}
    try { server.close(1000, 'done'); } catch(e) {}
  }
  try {
    // Get first message
    var firstData = await new Promise(function(res, rej) {
      var done = false;
      function onMsg(ev) { if (done) return; done = true; res(ev.data); }
      function onClose() { if (!done) { done = true; rej(new Error('closed before data')); } }
      server.addEventListener('message', onMsg);
      server.addEventListener('close', onClose);
      server.addEventListener('error', onClose);
    });

    var raw = firstData instanceof ArrayBuffer ? new Uint8Array(firstData) : firstData;
    if (!(raw instanceof Uint8Array)) { closeAll(); return; }

    var hdr = parseVless(raw);
    if (!hdr) { closeAll(); return; }

    // Get connect function
    var connectFn;
    try {
      var socks = await import('cloudflare:sockets');
      connectFn = socks && socks.connect;
    } catch(e) { connectFn = null; }
    if (!connectFn) { closeAll(); return; }

    // Choose target host (avoid CF loop)
    var targetHost = hdr.host;
    if (hdr.addrType === 1 && isCF(hdr.host)) targetHost = PROXYIP;
    if (hdr.addrType === 2 && (hdr.host.indexOf('workers.dev') !== -1 || hdr.host.indexOf('pages.dev') !== -1)) targetHost = PROXYIP;

    // Connect TCP
    try {
      socket = connectFn({ hostname: targetHost, port: hdr.port });
      writer = socket.writable.getWriter();
    } catch(e) { closeAll(); return; }

    // Send VLESS response header + initial payload
    var responseHdr = new Uint8Array(2); // version 0, addons 0
    try {
      await writer.write(responseHdr);
      if (hdr.payload.length > 0) await writer.write(hdr.payload);
    } catch(e) { closeAll(); return; }

    // Pump: remote → WS
    var pumpDone = (async function() {
      try {
        var reader = socket.readable.getReader();
        var first = true;
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          if (!r.value || r.value.length === 0) continue;
          var chunk = r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value);
          if (first) {
            first = false;
            // Prepend VLESS response header bytes on first chunk
            var out = new Uint8Array(2 + chunk.length);
            out[0] = 0; out[1] = 0; out.set(chunk, 2);
            try { server.send(out); } catch(e) {}
          } else {
            try { server.send(chunk); } catch(e) {}
          }
        }
        reader.releaseLock();
      } catch(e) {}
      closeAll();
    })();
    pumpDone.catch(function() { closeAll(); });

    // Pump: WS → remote
    server.addEventListener('message', function(ev) {
      try {
        if (closed) return;
        var d = ev.data;
        var buf = d instanceof ArrayBuffer ? new Uint8Array(d) : d;
        if (!(buf instanceof Uint8Array)) return;
        writer.write(buf).catch(function() { closeAll(); });
      } catch(e) { closeAll(); }
    });

    server.addEventListener('close', closeAll);
    server.addEventListener('error', function() { closeAll(); });

  } catch(e) { closeAll(); }
}

export default {
  async fetch(request, env, ctx) {
    try {
      var upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
      var wsKey = request.headers.get('Sec-WebSocket-Key') || '';
      if (upgrade === 'websocket' && wsKey.trim()) {
        try {
          var pair = new WebSocketPair();
          var client = pair[0], server = pair[1];
          server.accept();
          var vlessPromise = handleVless(server);
          vlessPromise.catch(function() {});
          if (ctx && ctx.waitUntil) ctx.waitUntil(vlessPromise.catch(function(){}));
          return new Response(null, { status: 101, webSocket: client });
        } catch(e) {
          return new Response('WS error', { status: 200 });
        }
      }
      var path = new URL(request.url).pathname;
      if (path === '/favicon.ico') return new Response(null, { status: 204 });
      var wh = request.headers.get('Host') || 'small-thunder-6298.amin-chinisaz.workers.dev';
      var p = [8443,2053,2083,2087,2096];
      var staticAddrs = ['104.16.132.'+Math.floor(Math.random()*255),
        '104.24.'+Math.floor(Math.random()*255)+'.'+Math.floor(Math.random()*255),
        '172.64.'+Math.floor(Math.random()*255)+'.'+Math.floor(Math.random()*255),
        '162.158.'+Math.floor(Math.random()*255)+'.'+Math.floor(Math.random()*255),
        'zula.ir','icook.hk'];
      var out = ['# VLESS — Dynamic IPs (refresh for new addresses)','# SNI: '+wh,''];
      for(var i=0;i<staticAddrs.length;i++){
        var pt=p[Math.floor(Math.random()*p.length)];
        out.push('vless://'+UUID+'@'+staticAddrs[i]+':'+pt+'?encryption=none&security=tls&sni='+wh+'&alpn=http%2F1.1&fp=chrome&type=ws&host='+wh+'&path=%2F%3Fed%3D2048#CF-'+(i+1));
      }
      return new Response(out.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    } catch(e) {
      return new Response('OK', { status: 200 });
    }
  }
};
