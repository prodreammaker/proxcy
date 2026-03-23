function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={darkMode:'class',theme:{extend:{fontFamily:{sans:['Inter','system-ui','sans-serif']}}}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
body{font-family:'Inter',system-ui,sans-serif}
.glass{background:rgba(255,255,255,.06);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.12)}
.glass-strong{background:rgba(255,255,255,.10);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,.18)}
.orb{position:fixed;border-radius:50%;filter:blur(80px);opacity:.35;pointer-events:none;z-index:0}
.field{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);transition:border-color .2s,box-shadow .2s}
.field:focus{border-color:rgba(139,92,246,.6);box-shadow:0 0 0 3px rgba(139,92,246,.15);outline:none}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);transition:transform .15s,box-shadow .2s}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 25px rgba(139,92,246,.35)}
.btn-primary:active{transform:translateY(0)}
.btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);transition:transform .15s,box-shadow .2s}
.btn-danger:hover{transform:translateY(-1px);box-shadow:0 8px 25px rgba(239,68,68,.35)}
.trow{transition:background .15s}.trow:hover{background:rgba(255,255,255,.04)}
.tab-btn{padding:.5rem 1rem;border-radius:.75rem;font-size:.8rem;font-weight:500;color:rgb(156,163,175);transition:all .2s;border:1px solid transparent}
.tab-btn:hover{color:#e5e7eb;background:rgba(255,255,255,.05)}
.tab-btn.active{color:#c4b5fd;background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.25)}
.toast{animation:slideIn .3s ease-out,fadeOut .3s ease-in 2.7s forwards}
@keyframes slideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeOut{to{opacity:0;transform:translateY(-10px)}}
.metric-card{position:relative;overflow:hidden}
.metric-card::after{content:'';position:absolute;top:0;right:0;width:60px;height:60px;border-radius:50%;filter:blur(30px);opacity:.2}
</style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen antialiased">
<div class="orb" style="width:600px;height:600px;top:-200px;left:-100px;background:radial-gradient(circle,rgba(139,92,246,.3),transparent 70%)"></div>
<div class="orb" style="width:500px;height:500px;bottom:-150px;right:-100px;background:radial-gradient(circle,rgba(59,130,246,.25),transparent 70%)"></div>
<div class="orb" style="width:400px;height:400px;top:40%;left:60%;background:radial-gradient(circle,rgba(236,72,153,.15),transparent 70%)"></div>
${body}
</body>
</html>`;
}

export function loginPage(basePath, error = '') {
  const errHtml = error
    ? `<div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">${esc(error)}</div>`
    : '';

  const body = `
<div class="relative z-10 flex items-center justify-center min-h-screen p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 mb-4">
        <svg class="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
        </svg>
      </div>
      <h1 class="text-3xl font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">Edge Gateway</h1>
      <p class="text-gray-500 mt-2 text-sm">Secure Management Console</p>
    </div>
    <div class="glass rounded-2xl p-8 shadow-2xl shadow-black/20">
      ${errHtml}
      <form method="POST" action="${esc(basePath)}/login" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
          <input type="text" name="username" required autocomplete="username" class="field w-full px-4 py-3 rounded-xl text-gray-100 placeholder-gray-500" placeholder="Enter username"/>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
          <input type="password" name="password" required autocomplete="current-password" class="field w-full px-4 py-3 rounded-xl text-gray-100 placeholder-gray-500" placeholder="Enter password"/>
        </div>
        <button type="submit" class="btn-primary w-full py-3 rounded-xl text-white font-semibold text-sm tracking-wide">Sign In</button>
      </form>
    </div>
    <p class="text-center text-gray-600 text-xs mt-6">HMAC-SHA256 &middot; HttpOnly &middot; SameSite=Strict</p>
  </div>
</div>`;
  return shell('Edge Gateway &mdash; Auth', body);
}

export function dashboardPage(basePath, { config, keys, host, message = '', messageType = 'success' }) {
  const toast = message
    ? `<div class="toast fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${messageType === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-300' : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'}">${esc(message)}</div>`
    : '';

  const bp = esc(basePath);
  const simConn = Math.floor(Math.random() * 40) + 12;
  const simBw = (Math.random() * 4.5 + 0.5).toFixed(2);
  const simReqs = Math.floor(Math.random() * 5000) + 1200;

  const overviewTab = buildOverviewTab(simConn, simBw, simReqs);
  const configTab = buildConfigTab(bp, config);
  const conngenTab = buildConngenTab(config, host);
  const kvTab = buildKvTab(bp, keys);

  const body = `
${toast}
<div class="relative z-10 min-h-screen">
  <header class="glass-strong border-b border-white/5">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-semibold text-gray-100">Edge Gateway</h1>
          <p class="text-[11px] text-gray-500 -mt-0.5">Secure Management Dashboard</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="hidden sm:inline text-[11px] text-gray-600 font-mono">${esc(host)}</span>
        <a href="${bp}/logout" class="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">Logout</a>
      </div>
    </div>
  </header>

  <div class="max-w-7xl mx-auto px-6 pt-6">
    <nav class="flex gap-2 flex-wrap" id="tab-nav">
      <button class="tab-btn active" data-tab="overview" onclick="switchTab('overview')">
        <span class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>Overview</span>
      </button>
      <button class="tab-btn" data-tab="config" onclick="switchTab('config')">
        <span class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Configuration</span>
      </button>
      <button class="tab-btn" data-tab="conngen" onclick="switchTab('conngen')">
        <span class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.675-5.568a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"/></svg>Connection Gen</span>
      </button>
      <button class="tab-btn" data-tab="kvdata" onclick="switchTab('kvdata')">
        <span class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>KV Data</span>
      </button>
    </nav>
  </div>

  <main class="max-w-7xl mx-auto px-6 py-6">
    <div id="tab-overview">${overviewTab}</div>
    <div id="tab-config" class="hidden">${configTab}</div>
    <div id="tab-conngen" class="hidden">${conngenTab}</div>
    <div id="tab-kvdata" class="hidden">${kvTab}</div>
  </main>
</div>
<script>
function switchTab(t){
  document.querySelectorAll('[id^="tab-"]').forEach(function(el){if(el.id!=='tab-nav')el.classList.add('hidden')});
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
  var panel=document.getElementById('tab-'+t);if(panel)panel.classList.remove('hidden');
  var btn=document.querySelector('[data-tab="'+t+'"]');if(btn)btn.classList.add('active');
}
function copyText(id){
  var el=document.getElementById(id);if(!el)return;
  var text=el.textContent||el.innerText;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){showCopyToast()}).catch(function(){fallbackCopy(text)});
  }else{fallbackCopy(text)}
}
function fallbackCopy(text){
  var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';
  document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showCopyToast()}catch(e){}document.body.removeChild(ta);
}
function showCopyToast(){
  var d=document.createElement('div');
  d.className='fixed bottom-6 right-6 z-50 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shadow-lg';
  d.textContent='Copied to clipboard';d.style.animation='slideIn .3s ease-out,fadeOut .3s ease-in 1.7s forwards';
  document.body.appendChild(d);setTimeout(function(){try{document.body.removeChild(d)}catch(e){}},2200);
}
</script>`;
  return shell('Edge Gateway Dashboard', body);
}

function buildOverviewTab(conn, bw, reqs) {
  const activities = [
    { time: '2 min ago', event: 'TCP tunnel established', dest: '104.18.x.x:443', status: 'active' },
    { time: '5 min ago', event: 'WebSocket connection', dest: '172.67.x.x:8443', status: 'active' },
    { time: '12 min ago', event: 'DNS relay (UDP:53)', dest: '1.1.1.1:53', status: 'completed' },
    { time: '18 min ago', event: 'TCP tunnel established', dest: '104.16.x.x:2053', status: 'completed' },
    { time: '31 min ago', event: 'Connection retry', dest: '162.159.x.x:443', status: 'retried' },
    { time: '45 min ago', event: 'WebSocket connection', dest: '104.24.x.x:2083', status: 'completed' },
  ];

  const actRows = activities.map((a) => {
    const badge = a.status === 'active'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : a.status === 'retried'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
        : 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    return `<tr class="trow border-b border-white/5">
      <td class="px-4 py-3 text-xs text-gray-500">${esc(a.time)}</td>
      <td class="px-4 py-3 text-sm text-gray-200">${esc(a.event)}</td>
      <td class="px-4 py-3 font-mono text-xs text-violet-300">${esc(a.dest)}</td>
      <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-md text-[11px] font-medium border ${badge}">${esc(a.status)}</span></td>
    </tr>`;
  }).join('');

  return `
<div class="space-y-6">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="glass rounded-2xl p-5 metric-card" style="--tw-after-bg:rgba(139,92,246,.5)">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-gray-500 uppercase tracking-wider">Active Connections</p>
        <div class="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center"><svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/></svg></div>
      </div>
      <p class="text-3xl font-bold text-gray-100">${conn}</p>
      <p class="text-[11px] text-emerald-400 mt-1">&#9650; Live</p>
    </div>
    <div class="glass rounded-2xl p-5 metric-card">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-gray-500 uppercase tracking-wider">Bandwidth (24h)</p>
        <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center"><svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5"/></svg></div>
      </div>
      <p class="text-3xl font-bold text-gray-100">${bw} <span class="text-lg text-gray-400">GB</span></p>
      <p class="text-[11px] text-gray-500 mt-1">&#8593; 1.2 GB / &#8595; ${(bw - 1.2).toFixed(1)} GB</p>
    </div>
    <div class="glass rounded-2xl p-5 metric-card">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-gray-500 uppercase tracking-wider">Total Requests</p>
        <div class="w-8 h-8 rounded-lg bg-pink-500/15 flex items-center justify-center"><svg class="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"/></svg></div>
      </div>
      <p class="text-3xl font-bold text-gray-100">${reqs.toLocaleString()}</p>
      <p class="text-[11px] text-gray-500 mt-1">Last 24 hours</p>
    </div>
    <div class="glass rounded-2xl p-5 metric-card">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs text-gray-500 uppercase tracking-wider">Uptime</p>
        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center"><svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
      </div>
      <p class="text-3xl font-bold text-gray-100">99.97<span class="text-lg text-gray-400">%</span></p>
      <p class="text-[11px] text-emerald-400 mt-1">All systems operational</p>
    </div>
  </div>

  <div class="glass rounded-2xl overflow-hidden">
    <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-200">Network Activity</h2>
      <span class="text-[11px] text-gray-600 italic">Simulated data</span>
    </div>
    <table class="w-full">
      <thead><tr class="border-b border-white/5">
        <th class="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Time</th>
        <th class="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Event</th>
        <th class="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Destination</th>
        <th class="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</th>
      </tr></thead>
      <tbody>${actRows}</tbody>
    </table>
  </div>

  <div class="glass rounded-2xl p-5">
    <h3 class="text-sm font-semibold text-gray-200 mb-3">System Status</h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="flex items-center gap-3"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-sm text-gray-300">WebSocket Handler</span></div>
      <div class="flex items-center gap-3"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-sm text-gray-300">TCP Proxy Engine</span></div>
      <div class="flex items-center gap-3"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-sm text-gray-300">Reverse Proxy</span></div>
    </div>
  </div>
</div>`;
}

function buildConfigTab(bp, config) {
  const cleanIpsVal = Array.isArray(config.cleanIps) ? config.cleanIps.join(', ') : '';
  const portsVal = Array.isArray(config.ports) ? config.ports.join(', ') : '';

  return `
<div class="space-y-6">
  <div class="glass rounded-2xl p-6">
    <h2 class="text-sm font-semibold text-gray-200 mb-5 flex items-center gap-2">
      <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.929-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/></svg>
      Gateway Configuration
    </h2>
    <form method="POST" action="${bp}/config" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-400 mb-1">VLESS UUID</label>
          <input type="text" name="uuid" value="${escAttr(config.uuid || '')}" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 font-mono placeholder-gray-600" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Proxy IP (CF Loop Prevention)</label>
          <input type="text" name="proxyIp" value="${escAttr(config.proxyIp || '')}" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 font-mono placeholder-gray-600" placeholder="cdn.example.org"/>
        </div>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Clean IPs / Fronting Domains <span class="text-gray-600">(comma-separated)</span></label>
        <input type="text" name="cleanIps" value="${escAttr(cleanIpsVal)}" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 font-mono placeholder-gray-600" placeholder="zula.ir, icook.hk, 104.17.10.10"/>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Ports <span class="text-gray-600">(comma-separated)</span></label>
          <input type="text" name="ports" value="${escAttr(portsVal)}" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 font-mono placeholder-gray-600" placeholder="443, 8443, 2053"/>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Reverse Proxy Target</label>
          <input type="text" name="proxyTarget" value="${escAttr(config.proxyTarget || '')}" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 font-mono placeholder-gray-600" placeholder="https://example.com"/>
        </div>
      </div>
      <div class="pt-2">
        <button type="submit" class="btn-primary px-6 py-2.5 rounded-xl text-white text-sm font-medium">Save Configuration</button>
      </div>
    </form>
  </div>

  <div class="glass rounded-2xl p-6">
    <h3 class="text-sm font-semibold text-gray-200 mb-3">Current Runtime Config</h3>
    <pre class="font-mono text-xs text-gray-300 bg-black/20 rounded-xl p-4 overflow-auto max-h-64">${esc(JSON.stringify(config, null, 2))}</pre>
  </div>
</div>`;
}

function buildConngenTab(config, host) {
  const uuid = config.uuid || '00000000-0000-0000-0000-000000000000';
  const cleanIps = Array.isArray(config.cleanIps) ? config.cleanIps : [];
  const ports = Array.isArray(config.ports) ? config.ports : [443];

  let uris = '';
  let idx = 0;
  for (const ip of cleanIps) {
    for (const port of ports) {
      const label = `${ip}:${port}`;
      const uri = `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&sni=${host}&type=ws&host=${host}&fp=chrome#${encodeURIComponent(label)}`;
      const elId = `uri-${idx}`;
      uris += `
      <div class="glass rounded-xl p-3 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-gray-400 mb-0.5">${esc(label)}</p>
          <p id="${elId}" class="font-mono text-[11px] text-violet-300 truncate">${esc(uri)}</p>
        </div>
        <button onclick="copyText('${elId}')" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-colors">Copy</button>
      </div>`;
      idx++;
    }
  }

  if (!uris) {
    uris = '<p class="text-gray-500 text-sm py-8 text-center">No clean IPs or ports configured. Add them in the Configuration tab.</p>';
  }

  return `
<div class="space-y-6">
  <div class="glass rounded-2xl p-6">
    <h2 class="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
      <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.675-5.568a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"/></svg>
      VLESS Connection Strings
    </h2>
    <p class="text-xs text-gray-500 mb-1">Host: <span class="font-mono text-gray-400">${esc(host)}</span> &middot; UUID: <span class="font-mono text-gray-400">${esc(uuid.substring(0, 8))}…</span></p>
    <p class="text-[11px] text-gray-600 mb-5">${cleanIps.length} clean IPs &times; ${ports.length} ports = ${cleanIps.length * ports.length} connection strings</p>
    <div class="grid grid-cols-1 gap-2 max-h-[28rem] overflow-y-auto pr-1">${uris}</div>
  </div>
</div>`;
}

function buildKvTab(bp, keys) {
  const rows = keys.length
    ? keys.map((k) => `
      <tr class="trow border-b border-white/5">
        <td class="px-5 py-3 font-mono text-sm text-violet-300">${esc(k.name)}</td>
        <td class="px-5 py-3 text-sm text-gray-400">${k.expiration ? new Date(k.expiration * 1000).toISOString() : '<span class="text-gray-600">none</span>'}</td>
        <td class="px-5 py-3 text-right space-x-2">
          <a href="${bp}/kv/get?key=${encodeURIComponent(k.name)}" class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 transition-colors">View</a>
          <form method="POST" action="${bp}/kv/delete" class="inline" onsubmit="return confirm('Delete key: ${escAttr(k.name)}?')">
            <input type="hidden" name="key" value="${escAttr(k.name)}"/>
            <button type="submit" class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors">Delete</button>
          </form>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="px-5 py-12 text-center text-gray-500">No keys found. Add your first key-value pair below.</td></tr>';

  return `
<div class="space-y-6">
  <div class="glass rounded-2xl p-6">
    <h2 class="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
      <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      Add Key-Value Pair
    </h2>
    <form method="POST" action="${bp}/kv/put" class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
      <div class="sm:col-span-3"><label class="block text-xs text-gray-400 mb-1">Key</label><input type="text" name="key" required class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600" placeholder="my-key"/></div>
      <div class="sm:col-span-5"><label class="block text-xs text-gray-400 mb-1">Value</label><input type="text" name="value" required class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600" placeholder="my-value"/></div>
      <div class="sm:col-span-2"><label class="block text-xs text-gray-400 mb-1">TTL (sec)</label><input type="number" name="ttl" min="60" class="field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600" placeholder="optional"/></div>
      <div class="sm:col-span-2"><button type="submit" class="btn-primary w-full py-2.5 rounded-lg text-white text-sm font-medium">Add</button></div>
    </form>
  </div>

  <div class="glass rounded-2xl overflow-hidden">
    <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-200">Stored Keys</h2>
      <form method="GET" action="${bp}/dashboard" class="flex items-center gap-2">
        <input type="text" name="prefix" class="field px-3 py-1.5 rounded-lg text-xs text-gray-100 placeholder-gray-600 w-40" placeholder="Filter by prefix..."/>
        <button type="submit" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">Filter</button>
      </form>
    </div>
    <table class="w-full"><thead><tr class="border-b border-white/5">
      <th class="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Key</th>
      <th class="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Expiration</th>
      <th class="px-5 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>
</div>`;
}

export function viewValuePage(basePath, key, value) {
  const bp = esc(basePath);
  const body = `
<div class="relative z-10 min-h-screen">
  <header class="glass-strong border-b border-white/5">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="${bp}/dashboard" class="text-gray-400 hover:text-gray-200 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg></a>
        <h1 class="text-lg font-semibold text-gray-100">View Key</h1>
      </div>
      <a href="${bp}/logout" class="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">Logout</a>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-6 py-8 space-y-6">
    <div class="glass rounded-2xl p-6">
      <label class="block text-xs text-gray-500 uppercase tracking-wider mb-2">Key</label>
      <p class="font-mono text-violet-300 text-lg">${esc(key)}</p>
    </div>
    <div class="glass rounded-2xl p-6">
      <label class="block text-xs text-gray-500 uppercase tracking-wider mb-2">Value</label>
      <pre class="font-mono text-sm text-gray-200 whitespace-pre-wrap break-all bg-black/20 rounded-xl p-4 max-h-96 overflow-auto">${value !== null ? esc(value) : '<span class="text-gray-500 italic">Key not found</span>'}</pre>
    </div>
    <div class="flex gap-3">
      <a href="${bp}/dashboard" class="px-5 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">&larr; Back</a>
      <form method="POST" action="${bp}/kv/delete" onsubmit="return confirm('Delete this key?')">
        <input type="hidden" name="key" value="${escAttr(key)}"/>
        <button type="submit" class="btn-danger px-5 py-2.5 rounded-xl text-sm font-medium text-white">Delete Key</button>
      </form>
    </div>
  </main>
</div>`;
  return shell(`Edge Gateway &mdash; ${esc(key)}`, body);
}
