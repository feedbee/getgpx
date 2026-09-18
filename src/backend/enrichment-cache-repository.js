const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createEnrichmentCacheRepository(cache, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!cache) throw new Error('An enrichment cache collection is required.');

  return {
    async ensureIndexes() {
      await Promise.all([
        cache.createIndex({ key: 1 }, { unique: true }),
        cache.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
    },

    async get(key, now = new Date()) {
      const entry = await cache.findOne({ key, expiresAt: { $gt: now } });
      return entry?.value ?? null;
    },

    async put(key, value, now = new Date()) {
      const expiresAt = new Date(now.getTime() + ttlMs);
      await cache.updateOne(
        { key },
        {
          $set: { value, updatedAt: now, expiresAt },
          $setOnInsert: { key, createdAt: now },
        },
        { upsert: true },
      );
      return { key, value, expiresAt };
    },
  };
}
