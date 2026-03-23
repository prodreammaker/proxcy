/**
 * KV Service — CRUD operations for a Cloudflare KV namespace.
 *
 * All public functions accept the KV namespace binding (env.KV) as their
 * first argument so they remain pure and easy to test.
 */

const LIST_PAGE_SIZE = 100;

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns every key-value entry in the namespace as an array.
 * Handles KV's cursor-based pagination automatically and fetches all
 * values for each page concurrently.
 *
 * @returns {Promise<Array<{key:string, value:string, expiration:number|null, metadata:*}>>}
 */
export async function listAllEntries(namespace) {
  const entries = [];
  let cursor;

  do {
    const page = await namespace.list({
      limit: LIST_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    const pageEntries = await Promise.all(
      page.keys.map(async ({ name, expiration, metadata }) => ({
        key: name,
        value: (await namespace.get(name, { type: 'text' })) ?? '',
        expiration: expiration ?? null,
        metadata: metadata ?? null,
      })),
    );

    entries.push(...pageEntries);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);

  return entries;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Creates or overwrites a key-value entry.
 * Validates that the key is a non-empty string ≤ 512 bytes.
 */
export async function setEntry(namespace, key, value) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) throw new Error('Key must be a non-empty string.');
  if (k.length > 512) throw new Error('Key cannot exceed 512 bytes.');

  await namespace.put(k, value != null ? String(value) : '');
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes the given key from the namespace (no-op if it does not exist).
 */
export async function deleteEntry(namespace, key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) throw new Error('Key must be a non-empty string.');

  await namespace.delete(k);
}
