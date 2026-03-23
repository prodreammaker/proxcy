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
  const value = await kvNamespace.get(key);
  return value;
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
