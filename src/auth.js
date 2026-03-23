/**
 * Authentication module.
 *
 * Implements stateless, HMAC-SHA256-signed session tokens stored in
 * HttpOnly + SameSite=Strict cookies. No external libraries are used;
 * all crypto is performed via the native Web Crypto API available in
 * the Cloudflare Workers runtime.
 *
 * Token wire format (base64 of): username|expiresEpochMs|hmacHex
 */

const COOKIE_NAME = 'kv_session';
const TOKEN_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

// ─── Crypto helpers ──────────────────────────────────────────────────────────

async function importSigningKey(secret) {
  const raw = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function generateToken(username, secret) {
  const key = await importSigningKey(secret);
  const expires = Date.now() + TOKEN_EXPIRY_SECONDS * 1000;
  const payload = `${username}|${expires}`;

  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return btoa(`${payload}|${sigHex}`);
}

async function verifyToken(token, secret) {
  try {
    const decoded = atob(token);

    // Split from the right to isolate sigHex, then expiresMs, then username.
    // The username itself may not contain '|', but we parse defensively.
    const lastPipe = decoded.lastIndexOf('|');
    const secondLastPipe = decoded.lastIndexOf('|', lastPipe - 1);

    if (lastPipe === -1 || secondLastPipe === -1) return null;

    const sigHex = decoded.slice(lastPipe + 1);
    const payload = decoded.slice(0, lastPipe); // username|expiresMs
    const expiresStr = decoded.slice(secondLastPipe + 1, lastPipe);
    const username = decoded.slice(0, secondLastPipe);

    // Check expiry before crypto to fail fast
    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires) || Date.now() > expires) return null;

    const key = await importSigningKey(secret);
    const sigBytes = new Uint8Array(
      (sigHex.match(/.{1,2}/g) ?? []).map(b => parseInt(b, 16)),
    );
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(payload),
    );

    return isValid ? username : null;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    cookies[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
  }
  return cookies;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads the session cookie from the request and verifies its HMAC signature.
 * Returns the authenticated username string, or null if unauthenticated.
 */
export async function authenticate(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return null;

  return verifyToken(token, secret);
}

/**
 * Validates the supplied credentials against the environment configuration.
 * Returns a signed session token string on success, or null on failure.
 */
export async function login(username, password, env) {
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username !== env.ADMIN_USERNAME ||
    password !== env.ADMIN_PASSWORD
  ) {
    return null;
  }

  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  return generateToken(username, secret);
}

/**
 * Returns a Set-Cookie header value that installs the session cookie.
 * Pass secure=false only for local HTTP development.
 */
export function createSessionCookie(token, secure = true) {
  const secureAttr = secure ? '; Secure' : '';
  return (
    `${COOKIE_NAME}=${token}` +
    `; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TOKEN_EXPIRY_SECONDS}` +
    secureAttr
  );
}

/**
 * Returns a Set-Cookie header value that immediately expires the session cookie.
 */
export function clearSessionCookie() {
  return (
    `${COOKIE_NAME}=` +
    `; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` +
    `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}
