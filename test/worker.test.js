import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const BASE = `/${env.ADMIN_UUID}`;

describe('Edge Gateway Worker', () => {
  describe('Public routes', () => {
    it('GET /health returns JSON health check', async () => {
      const res = await SELF.fetch('http://localhost/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.service).toBe('edge-gateway');
    });

    it('GET /robots.txt returns disallow-all', async () => {
      const res = await SELF.fetch('http://localhost/robots.txt');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Disallow: /');
    });

    it('GET /favicon.ico returns a GIF', async () => {
      const res = await SELF.fetch('http://localhost/favicon.ico');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/gif');
    });

    it('GET / does NOT expose the login page (reverse proxy or 404)', async () => {
      const res = await SELF.fetch('http://localhost/');
      const body = await res.text();
      expect(body).not.toContain('Edge Gateway');
      expect(body).not.toContain('Sign In');
    });

    it('GET /random-path does NOT expose admin', async () => {
      const res = await SELF.fetch('http://localhost/random-path');
      const body = await res.text();
      expect(body).not.toContain('Sign In');
    });
  });

  describe('Secret admin entry point', () => {
    it(`GET ${BASE} shows login page`, async () => {
      const res = await SELF.fetch(`http://localhost${BASE}`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Edge Gateway');
      expect(body).toContain('Sign In');
      expect(body).toContain(`action="${BASE}/login"`);
    });

    it(`GET ${BASE}/dashboard redirects to ${BASE} when unauthenticated`, async () => {
      const res = await SELF.fetch(`http://localhost${BASE}/dashboard`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(BASE);
    });

    it(`GET ${BASE}/logout clears cookie and redirects`, async () => {
      const res = await SELF.fetch(`http://localhost${BASE}/logout`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('Authentication', () => {
    it('rejects invalid credentials', async () => {
      const form = new FormData();
      form.append('username', 'wrong');
      form.append('password', 'wrong');
      const res = await SELF.fetch(`http://localhost${BASE}/login`, { method: 'POST', body: form });
      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid username or password');
    });

    it('accepts valid credentials and sets secure cookie', async () => {
      const form = new FormData();
      form.append('username', env.ADMIN_USERNAME);
      form.append('password', env.ADMIN_PASSWORD);
      const res = await SELF.fetch(`http://localhost${BASE}/login`, {
        method: 'POST',
        body: form,
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(`${BASE}/dashboard`);
      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('edge_gw_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain(`Path=${BASE}`);
    });
  });

  describe('Authenticated admin operations', () => {
    async function login() {
      const form = new FormData();
      form.append('username', env.ADMIN_USERNAME);
      form.append('password', env.ADMIN_PASSWORD);
      const res = await SELF.fetch(`http://localhost${BASE}/login`, {
        method: 'POST',
        body: form,
        redirect: 'manual',
      });
      return res.headers.get('Set-Cookie').split(';')[0];
    }

    it('dashboard loads with all tabs', async () => {
      const cookie = await login();
      const res = await SELF.fetch(`http://localhost${BASE}/dashboard`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Edge Gateway');
      expect(body).toContain('Overview');
      expect(body).toContain('Configuration');
      expect(body).toContain('Connection Gen');
      expect(body).toContain('KV Data');
      expect(body).toContain('VLESS UUID');
    });

    it('config save and dashboard reload', async () => {
      const cookie = await login();
      const form = new FormData();
      form.append('uuid', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      form.append('proxyIp', 'test-proxy.example.org');
      form.append('cleanIps', 'zula.ir, 104.17.10.10');
      form.append('ports', '443, 8443');
      form.append('proxyTarget', 'https://example.com');

      const saveRes = await SELF.fetch(`http://localhost${BASE}/config`, {
        method: 'POST',
        body: form,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(saveRes.status).toBe(302);
      expect(saveRes.headers.get('Location')).toContain('Configuration+saved');

      const dashRes = await SELF.fetch(`http://localhost${BASE}/dashboard`, {
        headers: { Cookie: cookie },
      });
      const body = await dashRes.text();
      expect(body).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(body).toContain('test-proxy.example.org');
    });

    it('KV put, get, delete cycle', async () => {
      const cookie = await login();

      const putForm = new FormData();
      putForm.append('key', 'test-key');
      putForm.append('value', 'test-value');
      const putRes = await SELF.fetch(`http://localhost${BASE}/kv/put`, {
        method: 'POST',
        body: putForm,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(putRes.status).toBe(302);

      const getRes = await SELF.fetch(`http://localhost${BASE}/kv/get?key=test-key`, {
        headers: { Cookie: cookie },
      });
      expect(getRes.status).toBe(200);
      const body = await getRes.text();
      expect(body).toContain('test-key');
      expect(body).toContain('test-value');

      const delForm = new FormData();
      delForm.append('key', 'test-key');
      const delRes = await SELF.fetch(`http://localhost${BASE}/kv/delete`, {
        method: 'POST',
        body: delForm,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(delRes.status).toBe(302);
      expect(delRes.headers.get('Location')).toContain('deleted');
    });

    it('connection generator shows VLESS URIs', async () => {
      const cookie = await login();
      const dashRes = await SELF.fetch(`http://localhost${BASE}/dashboard`, {
        headers: { Cookie: cookie },
      });
      const body = await dashRes.text();
      expect(body).toContain('vless://');
      expect(body).toContain('VLESS Connection Strings');
    });
  });
});
