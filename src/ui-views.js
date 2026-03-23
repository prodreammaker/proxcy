function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
          colors: {
            glass: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' }
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; }
    .glass {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .glass-strong {
      background: rgba(255,255,255,0.10);
      backdrop-filter: blur(32px);
      -webkit-backdrop-filter: blur(32px);
      border: 1px solid rgba(255,255,255,0.18);
    }
    .gradient-orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.4;
      pointer-events: none;
      z-index: 0;
    }
    .input-field {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.10);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-field:focus {
      border-color: rgba(139,92,246,0.6);
      box-shadow: 0 0 0 3px rgba(139,92,246,0.15);
      outline: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      transition: transform 0.15s, box-shadow 0.2s;
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 25px rgba(139,92,246,0.35);
    }
    .btn-primary:active { transform: translateY(0); }
    .btn-danger {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      transition: transform 0.15s, box-shadow 0.2s;
    }
    .btn-danger:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 25px rgba(239,68,68,0.35);
    }
    .table-row { transition: background 0.15s; }
    .table-row:hover { background: rgba(255,255,255,0.04); }
    .toast {
      animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 2.7s forwards;
    }
    @keyframes slideIn { from { transform: translateY(-20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
    @keyframes fadeOut { to { opacity:0; transform: translateY(-10px); } }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen antialiased">
  <div class="gradient-orb" style="width:600px;height:600px;top:-200px;left:-100px;background:radial-gradient(circle,rgba(139,92,246,0.3),transparent 70%);"></div>
  <div class="gradient-orb" style="width:500px;height:500px;bottom:-150px;right:-100px;background:radial-gradient(circle,rgba(59,130,246,0.25),transparent 70%);"></div>
  <div class="gradient-orb" style="width:400px;height:400px;top:40%;left:60%;background:radial-gradient(circle,rgba(236,72,153,0.15),transparent 70%);"></div>
  ${body}
</body>
</html>`;
}

export function loginPage(error = '') {
  const errorHtml = error
    ? `<div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">${escapeHtml(error)}</div>`
    : '';

  const body = `
  <div class="relative z-10 flex items-center justify-center min-h-screen p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 mb-4">
          <svg class="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
          KV Dashboard
        </h1>
        <p class="text-gray-400 mt-2 text-sm">Serverless Data Management</p>
      </div>

      <div class="glass rounded-2xl p-8 shadow-2xl shadow-black/20">
        ${errorHtml}
        <form method="POST" action="/login" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
            <input type="text" name="username" required autocomplete="username"
              class="input-field w-full px-4 py-3 rounded-xl text-gray-100 placeholder-gray-500"
              placeholder="Enter username" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <input type="password" name="password" required autocomplete="current-password"
              class="input-field w-full px-4 py-3 rounded-xl text-gray-100 placeholder-gray-500"
              placeholder="Enter password" />
          </div>
          <button type="submit"
            class="btn-primary w-full py-3 rounded-xl text-white font-semibold text-sm tracking-wide">
            Sign In
          </button>
        </form>
      </div>

      <p class="text-center text-gray-600 text-xs mt-6">
        Secured with HMAC-SHA256 &middot; HttpOnly Cookies
      </p>
    </div>
  </div>`;

  return htmlShell('KV Dashboard &mdash; Login', body);
}

export function dashboardPage(keys, message = '', messageType = 'success') {
  const toastHtml = message
    ? `<div class="toast fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${
        messageType === 'error'
          ? 'bg-red-500/20 border border-red-500/30 text-red-300'
          : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
      }">${escapeHtml(message)}</div>`
    : '';

  const rows = keys.length
    ? keys
        .map(
          (k) => `
      <tr class="table-row border-b border-white/5">
        <td class="px-5 py-3.5 font-mono text-sm text-violet-300">${escapeHtml(k.name)}</td>
        <td class="px-5 py-3.5 text-sm text-gray-400">
          ${k.expiration ? new Date(k.expiration * 1000).toISOString() : '<span class="text-gray-600">none</span>'}
        </td>
        <td class="px-5 py-3.5 text-right space-x-2">
          <a href="/kv/get?key=${encodeURIComponent(k.name)}"
             class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 transition-colors">
            View
          </a>
          <form method="POST" action="/kv/delete" class="inline" onsubmit="return confirm('Delete key: ${escapeAttr(k.name)}?')">
            <input type="hidden" name="key" value="${escapeAttr(k.name)}" />
            <button type="submit"
              class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors">
              Delete
            </button>
          </form>
        </td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="3" class="px-5 py-12 text-center text-gray-500">No keys found. Add your first key-value pair below.</td></tr>`;

  const body = `
  ${toastHtml}
  <div class="relative z-10 min-h-screen">
    <!-- Header -->
    <header class="glass-strong border-b border-white/5">
      <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <h1 class="text-lg font-semibold text-gray-100">KV Dashboard</h1>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-xs text-gray-500">Cloudflare Workers KV</span>
          <a href="/logout"
             class="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
            Logout
          </a>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="glass rounded-2xl p-5">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Keys</p>
          <p class="text-2xl font-bold text-gray-100">${keys.length}</p>
        </div>
        <div class="glass rounded-2xl p-5">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">With Expiration</p>
          <p class="text-2xl font-bold text-gray-100">${keys.filter((k) => k.expiration).length}</p>
        </div>
        <div class="glass rounded-2xl p-5">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Permanent</p>
          <p class="text-2xl font-bold text-gray-100">${keys.filter((k) => !k.expiration).length}</p>
        </div>
      </div>

      <!-- Add Key Form -->
      <div class="glass rounded-2xl p-6">
        <h2 class="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Add Key-Value Pair
        </h2>
        <form method="POST" action="/kv/put" class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-3">
            <label class="block text-xs text-gray-400 mb-1">Key</label>
            <input type="text" name="key" required
              class="input-field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600"
              placeholder="my-key" />
          </div>
          <div class="sm:col-span-5">
            <label class="block text-xs text-gray-400 mb-1">Value</label>
            <input type="text" name="value" required
              class="input-field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600"
              placeholder="my-value" />
          </div>
          <div class="sm:col-span-2">
            <label class="block text-xs text-gray-400 mb-1">TTL (seconds)</label>
            <input type="number" name="ttl" min="60" step="1"
              class="input-field w-full px-3 py-2.5 rounded-lg text-sm text-gray-100 placeholder-gray-600"
              placeholder="optional" />
          </div>
          <div class="sm:col-span-2">
            <button type="submit"
              class="btn-primary w-full py-2.5 rounded-lg text-white text-sm font-medium">
              Add
            </button>
          </div>
        </form>
      </div>

      <!-- Data Table -->
      <div class="glass rounded-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-200">Stored Keys</h2>
          <form method="GET" action="/dashboard" class="flex items-center gap-2">
            <input type="text" name="prefix"
              class="input-field px-3 py-1.5 rounded-lg text-xs text-gray-100 placeholder-gray-600 w-40"
              placeholder="Filter by prefix..." />
            <button type="submit"
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
              Filter
            </button>
          </form>
        </div>
        <table class="w-full">
          <thead>
            <tr class="border-b border-white/5">
              <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
              <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiration</th>
              <th class="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </main>
  </div>`;

  return htmlShell('KV Dashboard', body);
}

export function viewValuePage(key, value) {
  const body = `
  <div class="relative z-10 min-h-screen">
    <header class="glass-strong border-b border-white/5">
      <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a href="/dashboard" class="text-gray-400 hover:text-gray-200 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </a>
          <h1 class="text-lg font-semibold text-gray-100">View Key</h1>
        </div>
        <a href="/logout"
           class="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
          Logout
        </a>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div class="glass rounded-2xl p-6">
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-2">Key</label>
        <p class="font-mono text-violet-300 text-lg">${escapeHtml(key)}</p>
      </div>
      <div class="glass rounded-2xl p-6">
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-2">Value</label>
        <pre class="font-mono text-sm text-gray-200 whitespace-pre-wrap break-all bg-black/20 rounded-xl p-4 max-h-96 overflow-auto">${value !== null ? escapeHtml(value) : '<span class="text-gray-500 italic">Key not found</span>'}</pre>
      </div>
      <div class="flex gap-3">
        <a href="/dashboard"
           class="px-5 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
          &larr; Back to Dashboard
        </a>
        <form method="POST" action="/kv/delete" onsubmit="return confirm('Delete this key?')">
          <input type="hidden" name="key" value="${escapeAttr(key)}" />
          <button type="submit"
            class="btn-danger px-5 py-2.5 rounded-xl text-sm font-medium text-white">
            Delete Key
          </button>
        </form>
      </div>
    </main>
  </div>`;

  return htmlShell(`KV Dashboard &mdash; ${escapeHtml(key)}`, body);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
