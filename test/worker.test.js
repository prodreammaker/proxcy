import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

describe('KV Dashboard Worker', () => {
  describe('Unauthenticated routes', () => {
    it('GET / returns login page', async () => {
      const res = await SELF.fetch('http://localhost/');
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('KV Dashboard');
      expect(body).toContain('Sign In');
      expect(body).toContain('form');
    });

    it('GET /dashboard redirects to / when not authenticated', async () => {
      const res = await SELF.fetch('http://localhost/dashboard', { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
    });

    it('GET /kv/get redirects to / when not authenticated', async () => {
      const res = await SELF.fetch('http://localhost/kv/get?key=foo', { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
    });

    it('GET /logout clears cookie and redirects to /', async () => {
      const res = await SELF.fetch('http://localhost/logout', { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('Login flow', () => {
    it('rejects invalid credentials', async () => {
      const formData = new FormData();
      formData.append('username', 'wrong');
      formData.append('password', 'wrong');

      const res = await SELF.fetch('http://localhost/login', {
        method: 'POST',
        body: formData,
      });
      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid username or password');
    });

    it('accepts valid credentials and sets session cookie', async () => {
      const formData = new FormData();
      formData.append('username', env.ADMIN_USERNAME);
      formData.append('password', env.ADMIN_PASSWORD);

      const res = await SELF.fetch('http://localhost/login', {
        method: 'POST',
        body: formData,
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/dashboard');
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('kv_dash_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });
  });

  describe('Authenticated dashboard', () => {
    async function getSessionCookie() {
      const formData = new FormData();
      formData.append('username', env.ADMIN_USERNAME);
      formData.append('password', env.ADMIN_PASSWORD);
      const res = await SELF.fetch('http://localhost/login', {
        method: 'POST',
        body: formData,
        redirect: 'manual',
      });
      return res.headers.get('Set-Cookie').split(';')[0];
    }

    it('GET /dashboard shows dashboard when authenticated', async () => {
      const cookie = await getSessionCookie();
      const res = await SELF.fetch('http://localhost/dashboard', {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('KV Dashboard');
      expect(body).toContain('Stored Keys');
      expect(body).toContain('Add Key-Value Pair');
    });

    it('PUT and GET a KV pair', async () => {
      const cookie = await getSessionCookie();

      const putForm = new FormData();
      putForm.append('key', 'test-key');
      putForm.append('value', 'test-value');
      const putRes = await SELF.fetch('http://localhost/kv/put', {
        method: 'POST',
        body: putForm,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(putRes.status).toBe(302);

      const getRes = await SELF.fetch('http://localhost/kv/get?key=test-key', {
        headers: { Cookie: cookie },
      });
      expect(getRes.status).toBe(200);
      const body = await getRes.text();
      expect(body).toContain('test-key');
      expect(body).toContain('test-value');
    });

    it('DELETE a KV pair', async () => {
      const cookie = await getSessionCookie();

      const putForm = new FormData();
      putForm.append('key', 'delete-me');
      putForm.append('value', 'temp');
      await SELF.fetch('http://localhost/kv/put', {
        method: 'POST',
        body: putForm,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });

      const delForm = new FormData();
      delForm.append('key', 'delete-me');
      const delRes = await SELF.fetch('http://localhost/kv/delete', {
        method: 'POST',
        body: delForm,
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(delRes.status).toBe(302);
      expect(delRes.headers.get('Location')).toContain('deleted');
    });
  });
});
