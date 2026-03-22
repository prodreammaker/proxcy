// ============================================================================
// VLESS over WebSocket — Cloudflare Worker (Ultra-Hardened & Flexible Relay)
// ============================================================================

var USERID = '84621b0a-14e1-4600-ad46-aec6bcfa0e14';
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
    console.error('[ipToInt] error:', err.message);
    return 0;
  }
}

function parseCIDR(cidr) {
  try {
    var parts = String(cidr).split('/');
    var base = ipToInt(parts[0]);
    var maskBits = parseInt(parts[1], 10);
    if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
      maskBits = 0;
    }
    var mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return { base: base, mask: mask };
  } catch (err) {
    console.error('[parseCIDR] error:', err.message);
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
    console.error('[isCloudflareIP] error:', err.message);
    return false;
  }
}

function getRandomCleanIP() {
  try {
    var idx = Math.floor(Math.random() * CLEAN_IPS.length);
    return CLEAN_IPS[idx];
  } catch (err) {
    console.error('[getRandomCleanIP] error:', err.message);
    return '104.18.2.2'; // Safe fallback
  }
}

function bytesToString(bytes, offset, length) {
  try {
    var s = '';
    for (var i = 0; i < length; i++) {
      s += String.fromCharCode(bytes[offset + i]);
    }
    return s;
  } catch (err) {
    console.error('[bytesToString] error:', err.message);
    return '';
  }
}

function byteHex(b) {
  var h = (b & 255).toString(16);
  return h.length === 1 ? '0' + h : h;
}

function bytesToUUID(bytes) {
  try {
    var hex = '';
    for (var i = 0; i < 16; i++) {
      hex += byteHex(bytes[i]);
    }
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20, 32)
    );
  } catch (err) {
    console.error('[bytesToUUID] error:', err.message);
    return '00000000-0000-0000-0000-000000000000';
  }
}

function isValidUUID(uuid) {
  try {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  } catch (err) {
    console.error('[isValidUUID] error:', err.message);
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
    console.error('[escapeHtml] error:', err.message);
    return '';
  }
}

// === SAFE WRAPPERS & BACKPRESSURE ===

function safeSend(ws, data) {
  try {
    if (ws && ws.readyState === 1) { 
      ws.send(data);
    }
  } catch (err) {
    console.error('[safeSend] ws.send error:', err.message);
  }
}

function safeClose(ws, code, reason) {
  try {
    if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
      ws.close(code, reason);
    }
  } catch (err) {
    console.error('[safeClose] ws.close error:', err.message);
  }
}

async function safeWrite(writer, data) {
  try {
    if (writer) {
      await writer.write(data);
    }
  } catch (err) {
    console.error('[safeWrite] writer.write error:', err.message);
    throw err; 
  }
}

// === UI PAGES ===

function homePage(host) {
  try {
    var hostLabel = escapeHtml(host || 'Unknown');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>VLESS Node Active</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<style>
:root { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0d14; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #e2e8f0; }
.container { width: 100%; max-width: 640px; padding: 24px; }
.card { border-radius: 20px; padding: 32px; background: linear-gradient(145deg, #151a2a 0%, #0b0d14 100%); box-shadow: 0 32px 64px rgba(0,0,0,0.6); border: 1px solid rgba(56, 189, 248, 0.15); position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.4), transparent); }
.header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
.status-indicator { position: relative; width: 16px; height: 16px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 12px rgba(16, 185, 129, 0.8); }
.ping { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(16, 185, 129, 0.6); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
@keyframes ping { 75%, 100% { transform: scale(2.5); opacity: 0; } }
.title-group h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #f8fafc; }
.title-group p { font-size: 14px; color: #94a3b8; margin-top: 4px; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
.info-box { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.8); border-radius: 12px; padding: 16px; }
.info-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; font-weight: 600; }
.info-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #38bdf8; word-break: break-all; }
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #34d399; font-size: 12px; font-weight: 500; }
.action-area { display: flex; flex-direction: column; gap: 12px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #38bdf8; color: #0369a1; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; transition: all 0.2s; border: none; cursor: pointer; }
.btn:hover { background: #7dd3fc; transform: translateY(-1px); }
.btn-icon { width: 18px; height: 18px; }
.footer { margin-top: 24px; text-align: center; font-size: 12px; color: #475569; border-top: 1px solid rgba(51, 65, 85, 0.5); padding-top: 16px; }
@media (max-width: 480px) { .card { padding: 24px; } .title-group h1 { font-size: 20px; } }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <div class="status-indicator"><div class="dot"></div><div class="ping"></div></div>
      <div class="title-group">
        <h1>Node Online</h1>
        <p>VLESS Protocol via WebSocket Proxy</p>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-box">
        <div class="info-label">Active Hostname</div>
        <div class="info-value">${hostLabel}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Service Status</div>
        <div class="badge">Operational</div>
      </div>
    </div>
    <div class="action-area">
      <a href="/${USERID}" class="btn">
        <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        Generate VLESS Configuration
      </a>
    </div>
    <div class="footer">Cloudflare Workers Infrastructure &bull; TLS Secured &bull; Port 443</div>
  </div>
</div>
</body>
</html>`;
  } catch (err) {
    console.error('[homePage] template error:', err.message);
    return '<!DOCTYPE html><html><body><h1>Service Online</h1></body></html>';
  }
}

function configPage(host) {
  try {
    var workerHost = host || '';
    var escHost = escapeHtml(workerHost);
    var cleanIP = getRandomCleanIP();
    var address = cleanIP;
    var escAddr = escapeHtml(address);
    var port = '443';
    var uuid = USERID;
    var security = 'tls';
    var transport = 'ws';
    var path = '/';
    var fingerprint = 'chrome';

    var vlessLink =
      'vless://' + uuid + '@' + address + ':' + port +
      '?encryption=none&security=' + security +
      '&sni=' + encodeURIComponent(workerHost) +
      '&fp=' + encodeURIComponent(fingerprint) +
      '&type=' + transport +
      '&host=' + encodeURIComponent(workerHost) +
      '&path=' + encodeURIComponent(path) +
      '#CF-VLESS-' + encodeURIComponent(cleanIP);

    var escLink = escapeHtml(vlessLink);
    var uuidShort = escapeHtml(uuid.substring(0, 8));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>VLESS Configuration</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<style>
:root { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0d14; font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; }
.container { width: 100%; max-width: 900px; padding: 24px; }
.card { border-radius: 20px; padding: 32px; background: linear-gradient(145deg, #151a2a 0%, #0b0d14 100%); box-shadow: 0 32px 64px rgba(0,0,0,0.6); border: 1px solid rgba(139, 92, 246, 0.15); }
.header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(51, 65, 85, 0.5); }
.title h1 { font-size: 22px; font-weight: 700; color: #f8fafc; }
.title p { font-size: 13px; color: #94a3b8; margin-top: 6px; }
.uuid-pill { background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); color: #c4b5fd; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-family: monospace; }
.param-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.param-box { background: rgba(15, 23, 42, 0.6); border-radius: 12px; padding: 14px; border: 1px solid rgba(51, 65, 85, 0.4); }
.param-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; font-weight: 600; }
.param-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #e2e8f0; word-break: break-all; }
.highlight { color: #38bdf8; font-weight: 600; }
.link-section { background: rgba(3, 7, 18, 0.5); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 16px; padding: 20px; margin-bottom: 24px; }
.link-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 12px; }
.link-title { font-size: 14px; font-weight: 600; color: #f8fafc; display: flex; align-items: center; gap: 8px; }
.link-title::before { content: ''; width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; }
.btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
.btn-primary { background: #38bdf8; color: #0369a1; }
.btn-primary:hover { background: #7dd3fc; }
.btn-secondary { background: rgba(51, 65, 85, 0.5); color: #f8fafc; border: 1px solid rgba(71, 85, 105, 0.5); }
.btn-secondary:hover { background: rgba(71, 85, 105, 0.8); }
.link-display { background: #020617; padding: 16px; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #94a3b8; line-height: 1.5; word-break: break-all; border: 1px solid rgba(30, 41, 59, 0.8); }
.toast { position: fixed; bottom: 24px; right: 24px; background: #10b981; color: #022c22; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); transform: translateY(100px); opacity: 0; transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); z-index: 1000; }
.toast.show { transform: translateY(0); opacity: 1; }
.footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #64748b; }
.tag { padding: 4px 10px; border-radius: 6px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); color: #7dd3fc; }
@media (max-width: 600px) { .card { padding: 20px; } .param-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <div class="title">
        <h1>VLESS Configuration</h1>
        <p>Optimized with clean IP fronting</p>
      </div>
      <div class="uuid-pill">Node ID: ${uuidShort}...</div>
    </div>
    <div class="param-grid">
      <div class="param-box"><div class="param-label">Address</div><div class="param-value highlight">${escAddr}</div></div>
      <div class="param-box"><div class="param-label">Port</div><div class="param-value">${port}</div></div>
      <div class="param-box"><div class="param-label">UUID</div><div class="param-value" style="font-size: 11px;">${escapeHtml(uuid)}</div></div>
      <div class="param-box"><div class="param-label">Security</div><div class="param-value">${security.toUpperCase()}</div></div>
      <div class="param-box"><div class="param-label">Transport</div><div class="param-value">${transport.toUpperCase()}</div></div>
      <div class="param-box"><div class="param-label">Path</div><div class="param-value">${escapeHtml(path)}</div></div>
      <div class="param-box"><div class="param-label">SNI</div><div class="param-value highlight">${escHost}</div></div>
      <div class="param-box"><div class="param-label">Host</div><div class="param-value highlight">${escHost}</div></div>
      <div class="param-box"><div class="param-label">Fingerprint</div><div class="param-value">${escapeHtml(fingerprint)}</div></div>
    </div>
    <div class="link-section">
      <div class="link-header">
        <div class="link-title">Client URI</div>
        <div class="btn-group">
          <button class="btn btn-secondary" id="newIpBtn">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            New IP
          </button>
          <button class="btn btn-primary" id="copyBtn">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
            Copy Link
          </button>
        </div>
      </div>
      <div class="link-display" id="linkText">${escLink}</div>
    </div>
    <div class="footer">
      <div class="tag">Active Clean IP: ${escAddr}</div>
      <div>Ensures compatibility across restricted networks.</div>
    </div>
  </div>
</div>
<div class="toast" id="toast">Copied to clipboard!</div>
<script>
function showToast() {
  var t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}
function fallbackCopyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast();
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
}
document.getElementById('copyBtn').addEventListener('click', function() {
  var text = document.getElementById('linkText').innerText;
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(function() {
    showToast();
  }, function(err) {
    fallbackCopyTextToClipboard(text);
  });
});
document.getElementById('newIpBtn').addEventListener('click', function() {
  window.location.reload();
});
</script>
</body>
</html>`;
  } catch (err) {
    console.error('[configPage] template error:', err.message);
    return '<!DOCTYPE html><html><body><p>Configuration Error</p></body></html>';
  }
}

// === VLESS PROTOCOL PARSING ===

function parseVlessHeader(buf) {
  try {
    if (!buf || buf.length < 22) return null;
    var offset = 0;
    var version = buf[offset++];
    if (version !== 1) return null;
    if (buf.length < offset + 16) return null;
    var uuidBytes = buf.subarray(offset, offset + 16);
    offset += 16;
    var optLen = buf[offset++];
    if (buf.length < offset + optLen + 4) return null;
    offset += optLen;
    var command = buf[offset++];
    var port = (buf[offset] << 8) | buf[offset + 1];
    offset += 2;
    var addrType = buf[offset++];
    var address = '';
    
    if (addrType === 1) {
      if (buf.length < offset + 4) return null;
      address = buf[offset] + '.' + buf[offset + 1] + '.' + buf[offset + 2] + '.' + buf[offset + 3];
      offset += 4;
    } else if (addrType === 2) {
      if (buf.length < offset + 1) return null;
      var dlen = buf[offset++];
      if (buf.length < offset + dlen) return null;
      address = bytesToString(buf, offset, dlen);
      offset += dlen;
    } else if (addrType === 3) {
      if (buf.length < offset + 16) return null;
      var parts = [];
      for (var g = 0; g < 8; g++) {
        var hi = buf[offset + g * 2];
        var lo = buf[offset + g * 2 + 1];
        var v = ((hi & 255) << 8) | (lo & 255);
        parts.push(v.toString(16));
      }
      offset += 16;
      address = parts.join(':');
    } else {
      return null;
    }
    
    var payload = buf.subarray(offset);
    return {
      version: version,
      uuid: bytesToUUID(uuidBytes),
      command: command,
      port: port,
      addressType: addrType,
      address: address,
      payload: payload
    };
  } catch (err) {
    console.error('[parseVlessHeader] error:', err.message);
    return null;
  }
}

function concatUint8(a, b) {
  try {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  } catch (err) {
    console.error('[concatUint8] error:', err.message);
    return new Uint8Array(0);
  }
}

// === STREAM PUMPING ===

async function forwardUdpFramed(writer, data) {
  try {
    var o = 0;
    while (o < data.length) {
      if (o + 2 > data.length) {
        var rest = data.subarray(o);
        var frame1 = new Uint8Array(2 + rest.length);
        frame1[0] = (rest.length >> 8) & 255;
        frame1[1] = rest.length & 255;
        frame1.set(rest, 2);
        await safeWrite(writer, frame1);
        break;
      }
      var L = (data[o] << 8) | data[o + 1];
      if (L > 0 && o + 2 + L <= data.length) {
        await safeWrite(writer, data.subarray(o, o + 2 + L));
        o += 2 + L;
        continue;
      }
      var rest2 = data.subarray(o);
      var frame2 = new Uint8Array(2 + rest2.length);
      frame2[0] = (rest2.length >> 8) & 255;
      frame2[1] = rest2.length & 255;
      frame2.set(rest2, 2);
      await safeWrite(writer, frame2);
      break;
    }
  } catch (err) {
    console.error('[forwardUdpFramed] error:', err.message);
    throw err;
  }
}

async function pumpTcpToWs(reader, ws, closeAllCallback) {
  var first = true;
  try {
    while (true) {
      var r;
      try {
        r = await reader.read();
      } catch (err) {
        console.error('[pumpTcpToWs] reader.read error:', err.message);
        break;
      }
      
      if (r.done) break;
      var v = r.value;
      if (!v) continue;
      var chunk = v instanceof Uint8Array ? v : new Uint8Array(v);
      if (chunk.length === 0) continue;
      
      if (first) {
        first = false;
        var out = new Uint8Array(2 + chunk.length);
        out[0] = 0;
        out[1] = 0;
        out.set(chunk, 2);
        safeSend(ws, out);
      } else {
        safeSend(ws, chunk);
      }
    }
  } catch (err) {
    console.error('[pumpTcpToWs] unexpected error:', err.message);
  } finally {
    try { closeAllCallback(); } catch (err) { console.error('[pumpTcpToWs] closeAll error:', err.message); }
  }
}

async function pumpUdpTcpToWs(reader, ws, closeAllCallback) {
  var pending = new Uint8Array(0);
  var first = true;
  try {
    while (true) {
      var r;
      try {
        r = await reader.read();
      } catch (err) {
        console.error('[pumpUdpTcpToWs] reader.read error:', err.message);
        break;
      }
      
      if (r.done) break;
      var v = r.value;
      if (!v) continue;
      var chunk = v instanceof Uint8Array ? v : new Uint8Array(v);
      if (chunk.length === 0) continue;
      
      pending = pending.length ? concatUint8(pending, chunk) : chunk;
      while (pending.length >= 2) {
        var len = (pending[0] << 8) | pending[1];
        if (len < 1 || pending.length < 2 + len) break;
        var packet = pending.subarray(0, 2 + len);
        pending = pending.subarray(2 + len);
        
        if (first) {
          first = false;
          var out = new Uint8Array(2 + packet.length);
          out[0] = 0;
          out[1] = 0;
          out.set(packet, 2);
          safeSend(ws, out);
        } else {
          safeSend(ws, packet);
        }
      }
    }
  } catch (err) {
    console.error('[pumpUdpTcpToWs] unexpected error:', err.message);
  } finally {
    try { closeAllCallback(); } catch (err) { console.error('[pumpUdpTcpToWs] closeAll error:', err.message); }
  }
}

// === MAIN WEBSOCKET HANDLER ===

async function handleVlessOverWS(request) {
  try {
    var upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    if (typeof WebSocketPair === 'undefined') {
      return new Response('Environment mismatch: WebSockets not supported', { status: 200 });
    }

    var pair;
    try {
      pair = new WebSocketPair();
    } catch (err) {
      console.error('[handleVlessOverWS] WebSocketPair error:', err.message);
      return new Response('WebSocket creation failed', { status: 200 });
    }
    
    var client = pair[0];
    var server = pair[1];

    try {
      server.accept();
    } catch (acErr) {
      console.error('[handleVlessOverWS] server.accept error:', acErr.message);
      return new Response('WebSocket accept failed', { status: 200 });
    }

    var mode = 'vless'; 
    var pendingData = [];
    var socket = null;
    var writer = null;
    var reader = null;
    var closed = false;

    function closeAll() {
      if (closed) return;
      closed = true;
      try {
        if (socket && typeof socket.close === 'function') {
          socket.close();
        }
      } catch (err) {
        console.error('[closeAll] socket.close error:', err.message);
      }
      try {
        if (writer && typeof writer.releaseLock === 'function') writer.releaseLock();
      } catch (err) {
        console.error('[closeAll] writer.releaseLock error:', err.message);
      }
      try {
        if (reader && typeof reader.releaseLock === 'function') reader.releaseLock();
      } catch (err) {
        console.error('[closeAll] reader.releaseLock error:', err.message);
      }
      safeClose(server, 1000, 'done');
    }

    server.addEventListener('message', async function (event) {
      try {
        if (closed) return;
        if (typeof event.data === 'string') return;
        var raw = new Uint8Array(event.data);
        if (raw.length === 0) return;

        if (mode === 'vless') {
          mode = 'connecting';

          var hdr = parseVlessHeader(raw);
          if (!hdr) {
            safeClose(server, 1002, 'bad header');
            return;
          }
          if (!isValidUUID(hdr.uuid) || hdr.uuid.toLowerCase() !== USERID.toLowerCase()) {
            safeClose(server, 1008, 'auth failed');
            return;
          }

          var isUdp = (hdr.command === 2);
          if (hdr.command !== 1 && hdr.command !== 2) {
            safeClose(server, 1008, 'bad cmd');
            return;
          }

          var targetHost = hdr.address;
          var targetPort = hdr.port;

          if (!isUdp && (hdr.addressType === 1 || hdr.addressType === 2)) {
            if (isCloudflareIP(hdr.address)) {
              targetHost = PROXYIP;
            }
          }

          var connectFn = null;
          try {
            var socks = await import('cloudflare:sockets');
            connectFn = socks.connect;
          } catch (err) {
            console.error('[import sockets] error:', err.message);
            safeClose(server, 1011, 'no sockets module');
            return;
          }

          try {
            socket = connectFn({ 
              hostname: targetHost, 
              port: targetPort 
            });
            
            if (!socket || !socket.writable || !socket.readable) {
               throw new Error('connectFn returned malformed socket instance');
            }
          } catch (err) {
            console.error('[socket connect] error:', err.message);
            safeClose(server, 1011, 'connect failed');
            return;
          }

          try {
            writer = socket.writable.getWriter();
          } catch (err) {
            console.error('[getWriter] error:', err.message);
            closeAll();
            return;
          }

          try {
            reader = socket.readable.getReader();
          } catch (err) {
            console.error('[getReader] error:', err.message);
            closeAll();
            return;
          }

          mode = isUdp ? 'udp' : 'tcp';

          if (isUdp) {
            pumpUdpTcpToWs(reader, server, closeAll);
          } else {
            pumpTcpToWs(reader, server, closeAll);
          }

          if (hdr.payload && hdr.payload.length > 0) {
            try {
              if (isUdp) {
                await forwardUdpFramed(writer, hdr.payload);
              } else {
                await safeWrite(writer, hdr.payload);
              }
            } catch (err) {
              console.error('[initial payload] write error:', err.message);
              closeAll();
              return; 
            }
          }

          for (var i = 0; i < pendingData.length; i++) {
            if (closed) break;
            try {
              if (isUdp) {
                await forwardUdpFramed(writer, pendingData[i]);
              } else {
                await safeWrite(writer, pendingData[i]);
              }
            } catch (err) {
              console.error('[pendingData] write error:', err.message);
              closeAll();
              break;
            }
          }
          pendingData = [];

        } else if (mode === 'connecting') {
          pendingData.push(raw);
        } else if (mode === 'tcp') {
          try {
            await safeWrite(writer, raw);
          } catch (err) {
            console.error('[tcp mode] stream write error:', err.message);
            closeAll();
          }
        } else if (mode === 'udp') {
          try {
            await forwardUdpFramed(writer, raw);
          } catch (err) {
            console.error('[udp mode] stream write error:', err.message);
            closeAll();
          }
        }
      } catch (err) {
        console.error('[ws message] master catch error:', err.message);
        closeAll();
      }
    });

    server.addEventListener('error', function (err) {
      try {
        console.error('[websocket event] server error:', err.message);
        closeAll();
      } catch (e) {
        console.error('[websocket event] error handler failed:', e.message);
      }
    });

    server.addEventListener('close', function () {
      try {
        closeAll();
      } catch (e) {
        console.error('[websocket event] close handler failed:', e.message);
      }
    });

    return new Response(null, { status: 101, webSocket: client });

  } catch (wsErr) {
    console.error('[handleVlessOverWS] master catch:', wsErr.message);
    return new Response('Connection Failed', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

var HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, max-age=0'
};

export default {
  async fetch(request, env, ctx) {
    try {
      var url;
      try {
        url = new URL(request.url);
      } catch (urlBad) {
        console.error('[fetch] URL parse error:', urlBad.message);
        return new Response('Invalid Request', { status: 200 });
      }

      var pathname = url.pathname;
      var host = request.headers.get('Host') || '';
      var method = request.method;

      // Absolute Route Isolation
      if (pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }

      var up = request.headers.get('Upgrade');
      if (up && up.toLowerCase() === 'websocket') {
        return await handleVlessOverWS(request);
      }

      if (method === 'GET' && pathname === '/') {
        return new Response(homePage(host), { status: 200, headers: HTML_HEADERS });
      }

      if (method === 'GET' && pathname === '/' + USERID) {
        return new Response(configPage(host), { status: 200, headers: HTML_HEADERS });
      }

      // Safe fallback for unhandled routes
      return new Response(homePage(host), { status: 200, headers: HTML_HEADERS });

    } catch (err) {
      console.error('[fetch] Top-level fetch error:', err.message);
      return new Response('Safe Fallback', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }
};
