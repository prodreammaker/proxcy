/**
 * KV Dashboard — Main Worker Entry Point
 *
 * Routes:
 *   GET  /                 → Login page
 *   POST /login            → Authenticate; set session cookie; redirect → /dashboard
 *   GET  /logout           → Clear session cookie; redirect → /
 *   GET  /dashboard        → Protected KV management dashboard
 *   POST /dashboard/set    → Create / update a KV entry (protected)
 *   POST /dashboard/delete → Delete a KV entry (protected)
 *
 * Environment variables required:
 *   ADMIN_USERNAME   — admin login name
 *   ADMIN_PASSWORD   — admin login password (also used as HMAC secret when
 *                      SESSION_SECRET is not set)
 *
 * Optional environment variables:
 *   SESSION_SECRET   — separate secret for signing session tokens
 *
 * KV namespace binding required:
 *   KV               — bound in wrangler.toml under [[kv_namespaces]]
 */

import { authenticate, login, createSessionCookie, clearSessionCookie } from './auth.js';
import { listAllEntries, setEntry, deleteEntry } from './kv-service.js';
import { renderLoginPage, renderDashboard } from './ui-views.js';

// ─── Response helpers ─────────────────────────────────────────────────────────

const HTML = { 'Content-Type': 'text/html; charset=UTF-8' };

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, { status, headers: { ...HTML, ...extraHeaders } });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...extraHeaders },
  });
}

// ─── Status message lookup ────────────────────────────────────────────────────

const STATUS_MESSAGES = {
  saved:   { type: 'success', text: 'Entry saved successfully.' },
  deleted: { type: 'success', text: 'Entry deleted successfully.' },
  error:   { type: 'error',   text: 'An error occurred. Please try again.' },
};

// ─── Worker ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // ── Configuration guard ──────────────────────────────────────────────────
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
      return new Response(
        'Worker configuration error: ADMIN_USERNAME and ADMIN_PASSWORD ' +
        'environment variables must be set. ' +
        'Run: wrangler secret put ADMIN_USERNAME && wrangler secret put ADMIN_PASSWORD',
        { status: 503, headers: { 'Content-Type': 'text/plain' } },
      );
    }

    if (!env.KV) {
      return new Response(
        'Worker configuration error: KV namespace binding is not configured. ' +
        'Add a [[kv_namespaces]] entry to wrangler.toml.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } },
      );
    }

    // ── Route handling ───────────────────────────────────────────────────────
    try {

      // GET / — Login page
      if (pathname === '/' && method === 'GET') {
        return html(renderLoginPage());
      }

      // POST /login — Authenticate and create session
      if (pathname === '/login' && method === 'POST') {
        const form = await request.formData();
        const username = (form.get('username') ?? '').toString().trim();
        const password = (form.get('password') ?? '').toString();

        const token = await login(username, password, env);
        if (!token) {
          return html(
            renderLoginPage('Invalid username or password. Please try again.'),
            401,
          );
        }

        const isSecure = url.protocol === 'https:';
        return redirect('/dashboard', {
          'Set-Cookie': createSessionCookie(token, isSecure),
        });
      }

      // GET|POST /logout — Destroy session
      if (pathname === '/logout') {
        return redirect('/', { 'Set-Cookie': clearSessionCookie() });
      }

      // ── Protected routes — verify session before proceeding ────────────────
      const authenticatedUser = await authenticate(request, env);

      // GET /dashboard — Main dashboard
      if (pathname === '/dashboard' && method === 'GET') {
        if (!authenticatedUser) return redirect('/');

        const statusKey = url.searchParams.get('status') ?? '';
        const statusMessage = STATUS_MESSAGES[statusKey] ?? null;

        const entries = await listAllEntries(env.KV);
        return html(renderDashboard(entries, authenticatedUser, statusMessage));
      }

      // POST /dashboard/set — Create or overwrite a KV entry
      if (pathname === '/dashboard/set' && method === 'POST') {
        if (!authenticatedUser) return redirect('/');

        const form = await request.formData();
        const key   = (form.get('key')   ?? '').toString();
        const value = (form.get('value') ?? '').toString();

        await setEntry(env.KV, key, value);
        return redirect('/dashboard?status=saved');
      }

      // POST /dashboard/delete — Remove a KV entry
      if (pathname === '/dashboard/delete' && method === 'POST') {
        if (!authenticatedUser) return redirect('/');

        const form = await request.formData();
        const key  = (form.get('key') ?? '').toString();

        await deleteEntry(env.KV, key);
        return redirect('/dashboard?status=deleted');
      }

      // 404 catch-all
      return new Response('Not Found', { status: 404 });

    } catch (err) {
      console.error('[KV Dashboard] Unhandled error:', err?.message ?? err);

      // Redirect to dashboard with error flag for protected action failures,
      // otherwise return a generic 500.
      if (pathname.startsWith('/dashboard')) {
        return redirect('/dashboard?status=error');
      }
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
