var USERID = '84621b0a-14e1-4600-ad46-aec6bcfa0e14';
var CLEAN_IPS = [
  'www.visa.com',
  'www.shopify.com',
  '104.17.10.10',
  '104.18.2.2'
];

var HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, max-age=0'
};

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
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

function randomCleanIp() {
  return CLEAN_IPS[Math.floor(Math.random() * CLEAN_IPS.length)];
}

function buildVlessUri(workerHost) {
  var cleanIp = randomCleanIp();
  return 'vless://' + USERID + '@' + cleanIp + ':443' +
    '?encryption=none&security=tls&sni=' + encodeURIComponent(workerHost) +
    '&fp=chrome&type=ws&host=' + encodeURIComponent(workerHost) +
    '&path=%2F#CF-MINI-' + encodeURIComponent(cleanIp);
}

function homePage(workerHost) {
  var configPath = '/' + USERID;
  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>Cloudflare mini worker</title>' +
    '<style>' +
    'body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#0b1020;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;}' +
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
    '<h1>Cloudflare mini worker</h1>' +
    '<p>A lightweight Cloudflare-hosted surface for the original VLESS project: health checks, service status, and a generated client URI page.</p>' +
    '<section class="grid">' +
    '<div class="panel"><div class="label">Host</div><div class="value">' + escapeHtml(workerHost) + '</div></div>' +
    '<div class="panel"><div class="label">Health</div><div class="value">GET /health</div></div>' +
    '<div class="panel"><div class="label">Config route</div><div class="value">' + escapeHtml(configPath) + '</div></div>' +
    '<div class="panel"><div class="label">Source scope</div><div class="value">HTTP mini of the GitHub worker</div></div>' +
    '</section>' +
    '<div class="actions">' +
    '<a class="button" href="' + escapeHtml(configPath) + '">Open config page</a>' +
    '<a class="button ghost" href="/health">View health JSON</a>' +
    '</div></main></body></html>';
}

function configPage(workerHost) {
  var vlessUri = buildVlessUri(workerHost);
  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>Cloudflare mini config</title>' +
    '<style>' +
    'body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#020617;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;}' +
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
    '<p style="margin:0;color:#94a3b8;line-height:1.6;">A compact client page generated from the original GitHub worker defaults and served from Cloudflare Workers.</p>' +
    '<section class="row">' +
    '<div class="panel"><div class="label">Worker host</div><div class="value">' + escapeHtml(workerHost) + '</div></div>' +
    '<div class="panel"><div class="label">UUID</div><div class="value">' + escapeHtml(USERID) + '</div></div>' +
    '<div class="panel"><div class="label">Transport</div><div class="value">TLS / WS / 443</div></div>' +
    '<div class="panel"><div class="label">Generated clean IP</div><div class="value">' + escapeHtml(vlessUri.split('@')[1].split(':')[0]) + '</div></div>' +
    '</section>' +
    '<div class="link" id="vless-link">' + escapeHtml(vlessUri) + '</div>' +
    '<div class="actions">' +
    '<button id="copy-link">Copy VLESS URI</button>' +
    '<a href="/">Back home</a>' +
    '</div>' +
    '<script>' +
    'document.getElementById(\"copy-link\").addEventListener(\"click\",function(){' +
    'var text=document.getElementById(\"vless-link\").textContent;' +
    'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text);}else{' +
    'var area=document.createElement(\"textarea\");area.value=text;document.body.appendChild(area);area.select();document.execCommand(\"copy\");document.body.removeChild(area);}' +
    'this.textContent=\"Copied\";setTimeout(function(){document.getElementById(\"copy-link\").textContent=\"Copy VLESS URI\";},1500);' +
    '});' +
    '</script></main></body></html>';
}

export default {
  async fetch(request) {
    var url = new URL(request.url);
    var pathname = normalizePathname(url.pathname);
    var method = request.method.toUpperCase();
    var workerHost = request.headers.get('Host') || url.hostname;

    if ((method === 'GET' || method === 'HEAD') && pathname === '/health') {
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        service: 'vless-ws-worker-mini-http',
        workerHost: workerHost
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/robots.txt') {
      return new Response(method === 'HEAD' ? null : 'User-agent: *\nDisallow: /', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    if (method === 'GET' && pathname === '/') {
      return new Response(homePage(workerHost), { status: 200, headers: HTML_HEADERS });
    }

    if (method === 'GET' && pathname.toLowerCase() === ('/' + USERID).toLowerCase()) {
      return new Response(configPage(workerHost), { status: 200, headers: HTML_HEADERS });
    }

    return new Response(homePage(workerHost), { status: 200, headers: HTML_HEADERS });
  }
};
