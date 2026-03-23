import {
  validateCredentials,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookie,
} from './auth.js';
import { listKeys, getValue, putValue, deleteValue } from './kv-service.js';
import { loginPage, dashboardPage, viewValuePage } from './ui-views.js';

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers },
  });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

async function authenticate(request, env) {
  const token = getSessionCookie(request);
  return verifySessionToken(token, env.SESSION_SECRET);
}

async function handleLogin(request, env) {
  if (request.method === 'GET') {
    return html(loginPage());
  }

  const formData = await request.formData();
  const username = formData.get('username') || '';
  const password = formData.get('password') || '';

  if (!validateCredentials(username, password, env)) {
    return html(loginPage('Invalid username or password'), 401);
  }

  const token = await createSessionToken(username, env.SESSION_SECRET);
  return redirect('/dashboard', { 'Set-Cookie': setSessionCookie(token) });
}

async function handleDashboard(request, env) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const message = url.searchParams.get('msg') || '';
  const messageType = url.searchParams.get('msgType') || 'success';

  const { keys } = await listKeys(env.KV_DATA, { prefix });
  return html(dashboardPage(keys, message, messageType));
}

async function handleKvGet(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return redirect('/dashboard?msg=Key+is+required&msgType=error');

  const value = await getValue(env.KV_DATA, key);
  return html(viewValuePage(key, value));
}

async function handleKvPut(request, env) {
  const formData = await request.formData();
  const key = (formData.get('key') || '').trim();
  const value = formData.get('value') || '';
  const ttl = parseInt(formData.get('ttl') || '0', 10);

  if (!key) return redirect('/dashboard?msg=Key+is+required&msgType=error');

  const opts = {};
  if (ttl >= 60) opts.expirationTtl = ttl;

  await putValue(env.KV_DATA, key, value, opts);
  return redirect(`/dashboard?msg=Key+"${encodeURIComponent(key)}"+saved&msgType=success`);
}

async function handleKvDelete(request, env) {
  const formData = await request.formData();
  const key = (formData.get('key') || '').trim();
  if (!key) return redirect('/dashboard?msg=Key+is+required&msgType=error');

  await deleteValue(env.KV_DATA, key);
  return redirect(`/dashboard?msg=Key+"${encodeURIComponent(key)}"+deleted&msgType=success`);
}

function handleLogout() {
  return redirect('/', { 'Set-Cookie': clearSessionCookie() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' || path === '/login') {
        return handleLogin(request, env);
      }

      if (path === '/logout') {
        return handleLogout();
      }

      const user = await authenticate(request, env);
      if (!user) {
        return redirect('/');
      }

      switch (path) {
        case '/dashboard':
          return handleDashboard(request, env);
        case '/kv/get':
          return handleKvGet(request, env);
        case '/kv/put':
          if (request.method !== 'POST') return redirect('/dashboard');
          return handleKvPut(request, env);
        case '/kv/delete':
          if (request.method !== 'POST') return redirect('/dashboard');
          return handleKvDelete(request, env);
        default:
          return redirect('/dashboard');
      }
    } catch (err) {
      return html(
        `<div style="padding:2rem;color:#ef4444;font-family:monospace;">Error: ${err.message}</div>`,
        500,
      );
    }
  },
};
