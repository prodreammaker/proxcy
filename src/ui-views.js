/**
 * UI Views — HTML/CSS templates for the KV Dashboard.
 *
 * Tailwind CSS is loaded via CDN.  All user-supplied strings are passed
 * through escapeHtml() before insertion to prevent XSS.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Escapes HTML special chars to prevent XSS when embedding user data. */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Truncates a string and appends an ellipsis if it exceeds maxLen. */
function truncate(str, maxLen = 90) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '\u2026' : str;
}

// ─── Shared assets ────────────────────────────────────────────────────────────

const TAILWIND = '<script src="https://cdn.tailwindcss.com"></script>';

const SHARED_CSS = `
<style>
  :root { color-scheme: dark; }

  body {
    background: linear-gradient(135deg, #0d0b1e 0%, #1e1a45 45%, #12122a 100%);
    min-height: 100vh;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  }

  /* ── Glass surface ── */
  .glass {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.11);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
  }

  .glass-nav {
    background: rgba(10, 8, 28, 0.65);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  /* ── Inputs ── */
  .glass-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.13);
    color: #fff;
    transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  .glass-input::placeholder { color: rgba(255,255,255,0.32); }
  .glass-input:focus {
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(139, 92, 246, 0.75);
    outline: none;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.22);
  }

  /* ── Buttons ── */
  .btn-primary {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    color: #fff;
    cursor: pointer;
    transition: filter 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .btn-primary:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(109, 40, 217, 0.45);
  }
  .btn-primary:active { transform: translateY(0); }

  .btn-danger {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.28);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }
  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.55);
    transform: translateY(-1px);
  }

  .btn-edit {
    background: rgba(139, 92, 246, 0.12);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.28);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }
  .btn-edit:hover {
    background: rgba(139, 92, 246, 0.26);
    border-color: rgba(139, 92, 246, 0.55);
    transform: translateY(-1px);
  }

  .btn-ghost {
    background: transparent;
    color: #9ca3af;
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .btn-ghost:hover { background: rgba(255,255,255,0.07); color: #fff; }

  /* ── Decorative orbs ── */
  .orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(110px);
    opacity: 0.13;
    pointer-events: none;
    z-index: 0;
    animation: orb-float 10s ease-in-out infinite;
  }
  @keyframes orb-float {
    0%, 100% { transform: translateY(0) scale(1); }
    50%       { transform: translateY(-28px) scale(1.06); }
  }

  /* ── Table ── */
  .tbl-row { transition: background 0.15s; }
  .tbl-row:hover { background: rgba(255,255,255,0.035); }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(5px);
    z-index: 60;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none;
    transition: opacity 0.22s;
  }
  .modal-overlay.open { opacity: 1; pointer-events: all; }
  .modal-box { transform: scale(0.94); transition: transform 0.22s; }
  .modal-overlay.open .modal-box { transform: scale(1); }

  /* ── Toast ── */
  .toast {
    position: fixed; top: 1.25rem; right: 1.25rem; z-index: 70;
    animation: toast-in 0.3s ease, toast-out 0.3s ease 3.8s forwards;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes toast-out {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-14px); }
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
  ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.38); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.65); }
</style>`;

// ─── SVG icon helpers ─────────────────────────────────────────────────────────

const ICON_DB = `
  <svg class="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375
         m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375
         m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375
         m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/>
  </svg>`;

const ICON_DB_SM = `
  <svg class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375
         m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375
         m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375
         m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/>
  </svg>`;

// ─── Login page ───────────────────────────────────────────────────────────────

/**
 * Renders the Glassmorphism login page.
 * @param {string|null} error  Optional error message shown in a red banner.
 */
export function renderLoginPage(error = null) {
  const errorBanner = error
    ? `
    <div class="mb-5 flex items-center gap-3 rounded-xl border border-red-500/35
                bg-red-950/40 px-4 py-3">
      <svg class="h-5 w-5 flex-shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1
             0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"/>
      </svg>
      <p class="text-sm text-red-300">${escapeHtml(error)}</p>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>KV Dashboard &mdash; Sign In</title>
  ${TAILWIND}
  ${SHARED_CSS}
</head>
<body class="flex min-h-screen items-center justify-center p-4">

  <!-- Background orbs -->
  <div class="orb h-[640px] w-[640px] bg-violet-700"
       style="top:-220px;left:-220px;animation-delay:0s"></div>
  <div class="orb h-[520px] w-[520px] bg-indigo-600"
       style="bottom:-180px;right:-180px;animation-delay:5s"></div>
  <div class="orb h-[380px] w-[380px] bg-purple-500"
       style="top:55%;left:55%;animation-delay:2.5s"></div>

  <!-- Login card -->
  <div class="glass relative z-10 w-full max-w-md rounded-2xl p-8">

    <!-- Header -->
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
           style="background:rgba(124,58,237,0.22);border:1px solid rgba(139,92,246,0.32)">
        ${ICON_DB}
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-white">KV Dashboard</h1>
      <p class="mt-1.5 text-sm text-gray-400">Cloudflare KV Secure Management</p>
    </div>

    ${errorBanner}

    <!-- Form -->
    <form method="POST" action="/login" class="space-y-4" autocomplete="on">

      <div>
        <label class="mb-1.5 block text-xs font-semibold uppercase
                       tracking-wider text-gray-400">
          Username
        </label>
        <input
          type="text"
          name="username"
          autocomplete="username"
          required
          placeholder="admin"
          class="glass-input w-full rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label class="mb-1.5 block text-xs font-semibold uppercase
                       tracking-wider text-gray-400">
          Password
        </label>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          required
          placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
          class="glass-input w-full rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <button
        type="submit"
        class="btn-primary mt-2 w-full rounded-xl py-3 text-sm font-semibold"
      >
        Sign In Securely
      </button>
    </form>

    <!-- Footer note -->
    <p class="mt-6 flex items-center justify-center gap-1.5 text-center
              text-xs text-gray-600">
      <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0
             01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          clip-rule="evenodd"/>
      </svg>
      Secured with HMAC-SHA256 session tokens
    </p>
  </div>

</body>
</html>`;
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

/**
 * Renders the main KV management dashboard.
 *
 * @param {Array<{key:string,value:string,expiration:number|null}>} entries
 * @param {string} username  Authenticated user's name shown in the navbar.
 * @param {{type:'success'|'error', text:string}|null} statusMessage
 */
export function renderDashboard(entries, username, statusMessage = null) {
  // ── Toast notification ──
  const toastHtml = statusMessage
    ? (() => {
        const isError = statusMessage.type === 'error';
        const colors = isError
          ? 'border-red-500/35 bg-red-950/60 text-red-300'
          : 'border-green-500/35 bg-green-950/60 text-green-300';
        const iconPath = isError
          ? `<path fill-rule="evenodd"
               d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0
                  1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
               clip-rule="evenodd"/>`
          : `<path fill-rule="evenodd"
               d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0
                  00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2
                  2a1 1 0 001.414 0l4-4z"
               clip-rule="evenodd"/>`;
        return `
    <div class="toast flex max-w-sm items-center gap-3 rounded-xl border
                ${colors} px-4 py-3 shadow-2xl">
      <svg class="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        ${iconPath}
      </svg>
      <p class="text-sm font-medium">${escapeHtml(statusMessage.text)}</p>
    </div>`;
      })()
    : '';

  // ── Table rows ──
  const totalKeys = entries.length;
  const withExpiry = entries.filter(e => e.expiration !== null).length;
  const persistent = totalKeys - withExpiry;

  const rowsHtml = totalKeys === 0
    ? `<tr>
        <td colspan="3" class="py-20 text-center">
          <div class="flex flex-col items-center gap-3 text-gray-600">
            <svg class="h-14 w-14 opacity-40" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75
                   6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75
                   6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847
                   -8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25
                   4.125s-8.25-1.847-8.25-4.125"/>
            </svg>
            <p class="text-sm">No entries yet &mdash; add your first key-value pair above.</p>
          </div>
        </td>
       </tr>`
    : entries.map(entry => {
        const safeKey = escapeHtml(entry.key);
        const safeValue = escapeHtml(entry.value);
        const safeValueTrunc = escapeHtml(truncate(entry.value, 90));

        return `
    <tr class="tbl-row border-t border-white/[0.05]">
      <td class="px-5 py-3.5 align-middle">
        <span class="font-mono text-sm font-medium text-purple-300">${safeKey}</span>
      </td>
      <td class="px-5 py-3.5 align-middle">
        <span class="font-mono text-xs text-gray-400 leading-relaxed"
              title="${safeValue}">${safeValueTrunc || '<span class="text-gray-600 italic">empty</span>'}</span>
      </td>
      <td class="px-5 py-3.5 align-middle">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-edit rounded-lg px-3 py-1.5 text-xs font-medium js-edit-btn"
            data-key="${safeKey}"
            data-value="${safeValue}"
          >Edit</button>
          <form method="POST" action="/dashboard/delete" class="inline">
            <input type="hidden" name="key" value="${safeKey}"/>
            <button
              type="submit"
              class="btn-danger rounded-lg px-3 py-1.5 text-xs font-medium"
              onclick="return confirm('Delete key &quot;${safeKey}&quot;?\\n\\nThis cannot be undone.')"
            >Delete</button>
          </form>
        </div>
      </td>
    </tr>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>KV Dashboard</title>
  ${TAILWIND}
  ${SHARED_CSS}
</head>
<body class="min-h-screen">

  <!-- Background orbs -->
  <div class="orb h-[600px] w-[600px] bg-violet-800"
       style="top:-200px;left:-200px;animation-delay:0s"></div>
  <div class="orb h-[480px] w-[480px] bg-indigo-700"
       style="bottom:-180px;right:-180px;animation-delay:5s"></div>

  ${toastHtml}

  <!-- ── Edit modal ── -->
  <div id="editModal" class="modal-overlay" aria-modal="true" role="dialog">
    <div class="modal-box glass mx-4 w-full max-w-lg rounded-2xl p-6">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="text-base font-semibold text-white">Edit Entry</h2>
        <button id="closeModalBtn" type="button"
                class="text-gray-500 transition-colors hover:text-white">
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0
                 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10
                 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293
                 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
      <form method="POST" action="/dashboard/set">
        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-xs font-semibold uppercase
                           tracking-wider text-gray-400">Key</label>
            <input id="modalKey" type="text" name="key" readonly
                   class="glass-input w-full cursor-not-allowed rounded-xl
                          px-4 py-2.5 font-mono text-sm opacity-60"/>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-semibold uppercase
                           tracking-wider text-gray-400">Value</label>
            <textarea id="modalValue" name="value" rows="7"
                      placeholder="Enter value&hellip;"
                      class="glass-input w-full resize-y rounded-xl px-4
                             py-2.5 font-mono text-sm leading-relaxed"></textarea>
          </div>
          <div class="flex gap-3 pt-1">
            <button type="submit"
                    class="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold">
              Save Changes
            </button>
            <button type="button" id="cancelModalBtn"
                    class="btn-ghost flex-1 rounded-xl py-2.5 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Navbar ── -->
  <nav class="glass-nav sticky top-0 z-30">
    <div class="mx-auto flex max-w-7xl items-center justify-between
                px-4 py-3 sm:px-6">
      <div class="flex items-center gap-3">
        <div class="rounded-xl p-2"
             style="background:rgba(124,58,237,0.2);
                    border:1px solid rgba(139,92,246,0.3)">
          ${ICON_DB_SM}
        </div>
        <div>
          <h1 class="text-sm font-bold leading-none text-white">KV Dashboard</h1>
          <p class="mt-0.5 text-xs text-gray-500">Cloudflare KV Manager</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div class="hidden items-center gap-2 sm:flex">
          <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
          <span class="text-sm text-gray-400">${escapeHtml(username)}</span>
        </div>
        <a href="/logout"
           class="btn-danger inline-flex items-center gap-2 rounded-xl
                  px-4 py-2 text-xs font-semibold">
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293
                 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0
                 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
              clip-rule="evenodd"/>
          </svg>
          Logout
        </a>
      </div>
    </div>
  </nav>

  <!-- ── Main content ── -->
  <main class="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">

    <!-- Stats row -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">

      <div class="glass flex items-center gap-4 rounded-xl p-4">
        <div class="rounded-xl p-3"
             style="background:rgba(139,92,246,0.15);
                    border:1px solid rgba(139,92,246,0.28)">
          <svg class="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-white">${totalKeys}</p>
          <p class="mt-0.5 text-xs font-semibold uppercase tracking-wide
                    text-gray-500">Total Keys</p>
        </div>
      </div>

      <div class="glass flex items-center gap-4 rounded-xl p-4">
        <div class="rounded-xl p-3"
             style="background:rgba(99,102,241,0.15);
                    border:1px solid rgba(99,102,241,0.28)">
          <svg class="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-white">${withExpiry}</p>
          <p class="mt-0.5 text-xs font-semibold uppercase tracking-wide
                    text-gray-500">With Expiry</p>
        </div>
      </div>

      <div class="glass flex items-center gap-4 rounded-xl p-4">
        <div class="rounded-xl p-3"
             style="background:rgba(16,185,129,0.12);
                    border:1px solid rgba(16,185,129,0.25)">
          <svg class="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <p class="text-2xl font-bold text-white">${persistent}</p>
          <p class="mt-0.5 text-xs font-semibold uppercase tracking-wide
                    text-gray-500">Persistent</p>
        </div>
      </div>
    </div>

    <!-- Add / Update form -->
    <div class="glass rounded-2xl p-6">
      <h2 class="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <svg class="h-4 w-4 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1
               0 110-2h5V4a1 1 0 011-1z"
            clip-rule="evenodd"/>
        </svg>
        Add / Update Entry
      </h2>
      <form method="POST" action="/dashboard/set"
            class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr_auto]
                   md:items-end">
        <div>
          <label class="mb-1.5 block text-xs font-semibold uppercase
                         tracking-wider text-gray-400">Key</label>
          <input
            type="text" name="key" required
            placeholder="my:key:name"
            class="glass-input w-full rounded-xl px-4 py-2.5 font-mono text-sm"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-semibold uppercase
                         tracking-wider text-gray-400">Value</label>
          <input
            type="text" name="value"
            placeholder="Enter value&hellip;"
            class="glass-input w-full rounded-xl px-4 py-2.5 text-sm"
          />
        </div>
        <button type="submit"
                class="btn-primary inline-flex items-center gap-2 rounded-xl
                       px-6 py-2.5 text-sm font-semibold">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1
                 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"/>
          </svg>
          Save Entry
        </button>
      </form>
    </div>

    <!-- KV table -->
    <div class="glass overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b
                  border-white/[0.07] px-6 py-4">
        <h2 class="flex items-center gap-2 text-sm font-semibold text-white">
          <svg class="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
          KV Entries
        </h2>
        <div class="flex items-center gap-4">
          <input
            id="searchInput"
            type="text"
            placeholder="Filter keys&hellip;"
            class="glass-input rounded-lg px-3 py-1.5 text-xs w-44"
          />
          <span class="text-xs text-gray-500">
            ${totalKeys} record${totalKeys !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full" id="kvTable">
          <thead>
            <tr class="border-b border-white/[0.07]">
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase
                         tracking-wider text-gray-500 w-1/3">Key</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase
                         tracking-wider text-gray-500">Value</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase
                         tracking-wider text-gray-500 w-36">Actions</th>
            </tr>
          </thead>
          <tbody id="kvTableBody">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <script>
    // ── Modal ────────────────────────────────────────────────────────────────
    const modal = document.getElementById('editModal');

    function openModal(key, value) {
      document.getElementById('modalKey').value = key;
      document.getElementById('modalValue').value = value;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('modalValue').focus();
    }

    function closeModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    // Attach edit button listeners — reads decoded values from data-* attrs
    document.querySelectorAll('.js-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openModal(btn.dataset.key, btn.dataset.value);
      });
    });

    // ── Client-side search / filter ──────────────────────────────────────────
    document.getElementById('searchInput').addEventListener('input', function () {
      const needle = this.value.toLowerCase();
      document.querySelectorAll('#kvTableBody tr').forEach(row => {
        const keyCell = row.querySelector('td:first-child');
        if (!keyCell) return; // skip empty-state row
        const keyText = keyCell.textContent.toLowerCase();
        row.style.display = keyText.includes(needle) ? '' : 'none';
      });
    });
  </script>

</body>
</html>`;
}
