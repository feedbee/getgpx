import { describe, expect, it, vi } from 'vitest';
import { createEnrichmentCacheRepository } from '../../../src/backend/enrichment-cache-repository.js';

function createCacheCollection() {
  const documents = new Map();
  return {
    createIndex: vi.fn().mockResolvedValue('index'),
    async findOne(query) {
      const document = documents.get(query.key);
      return document && document.expiresAt > query.expiresAt.$gt ? document : null;
    },
    async updateOne(query, update) {
      documents.set(query.key, { ...update.$set, ...update.$setOnInsert });
    },
  };
}

describe('enrichment cache repository', () => {
  it('creates a unique key index and a MongoDB TTL index', async () => {
    const collection = createCacheCollection();
    const repository = createEnrichmentCacheRepository(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ key: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });

  it('returns unexpired values and treats expired values as misses', async () => {
    const repository = createEnrichmentCacheRepository(createCacheCollection());
    const storedAt = new Date('2026-09-17T10:00:00.000Z');
    await repository.put('valhalla:v1:segment', { surface: 'asphalt' }, storedAt);

    await expect(repository.get('valhalla:v1:segment', new Date('2026-10-16T10:00:00.000Z')))
      .resolves.toEqual({ surface: 'asphalt' });
    await expect(repository.get('valhalla:v1:segment', new Date('2026-10-18T10:00:00.000Z')))
      .resolves.toBeNull();
  });

  it('refreshes an existing cache key instead of creating duplicates', async () => {
    const collection = createCacheCollection();
    const repository = createEnrichmentCacheRepository(collection);

    await repository.put('overpass:v1:cell', { version: 1 });
    await repository.put('overpass:v1:cell', { version: 2 });

    await expect(repository.get('overpass:v1:cell')).resolves.toEqual({ version: 2 });
  });
});
