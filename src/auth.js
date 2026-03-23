const COOKIE_NAME = 'edge_gw_session';
const SESSION_TTL_SECONDS = 86400;

const encoder = new TextEncoder();

async function getSigningKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

export async function createSessionToken(username, secret) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${username}:${expires}`;
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}:${toHex(signature)}`;
}

export async function verifySessionToken(token, secret) {
  if (!token) return null;

  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [username, expiresStr, sig] = parts;
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires)) return null;

  if (Math.floor(Date.now() / 1000) > expires) return null;

  const key = await getSigningKey(secret);
  const payload = `${username}:${expiresStr}`;
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromHex(sig),
    encoder.encode(payload),
  );

  return valid ? username : null;
}

export function setSessionCookie(token, basePath = '/') {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=${basePath}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(basePath = '/') {
  return `${COOKIE_NAME}=deleted; HttpOnly; Secure; SameSite=Strict; Path=${basePath}; Max-Age=0`;
}

export function getSessionCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function validateCredentials(username, password, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return false;
  return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
}
