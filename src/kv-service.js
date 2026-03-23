const CONFIG_KEY = 'gateway:config';

const DEFAULT_CONFIG = {
  uuid: '',
  proxyIp: 'cdn.xn--b6gac.eu.org',
  cleanIps: [
    'zula.ir',
    'icook.hk',
    'www.visa.com',
    'www.shopify.com',
    '104.17.10.10',
    '104.18.2.2',
    '162.159.192.1',
  ],
  ports: [443, 8443, 2053, 2083, 2087, 2096],
  proxyTarget: 'https://filterjoo.ir',
};

export async function getGatewayConfig(kvNamespace, fallbackUuid = '') {
  try {
    const raw = await kvNamespace.get(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed, uuid: parsed.uuid || fallbackUuid };
    }
  } catch (_) {
    /* KV may be unavailable in dev */
  }
  return { ...DEFAULT_CONFIG, uuid: fallbackUuid };
}

export async function putGatewayConfig(kvNamespace, config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  await kvNamespace.put(CONFIG_KEY, JSON.stringify(merged));
  return { written: true };
}

export async function listKeys(kvNamespace, { prefix = '', cursor, limit = 50 } = {}) {
  const opts = { limit };
  if (prefix) opts.prefix = prefix;
  if (cursor) opts.cursor = cursor;

  const result = await kvNamespace.list(opts);
  return {
    keys: result.keys.map((k) => ({ name: k.name, expiration: k.expiration || null })),
    cursor: result.list_complete ? null : result.cursor,
    complete: result.list_complete,
  };
}

export async function getValue(kvNamespace, key) {
  if (!key) throw new Error('Key is required');
  return kvNamespace.get(key);
}

export async function putValue(kvNamespace, key, value, { expirationTtl } = {}) {
  if (!key) throw new Error('Key is required');
  const opts = {};
  if (expirationTtl && expirationTtl > 0) opts.expirationTtl = expirationTtl;
  await kvNamespace.put(key, value, opts);
  return { key, written: true };
}

export async function deleteValue(kvNamespace, key) {
  if (!key) throw new Error('Key is required');
  await kvNamespace.delete(key);
  return { key, deleted: true };
}
