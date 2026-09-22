import { describe, expect, it, vi } from 'vitest';
import { createTrackPersistence } from '../../../src/backend/track-persistence.js';

describe('track persistence', () => {
  it('initializes track indexes and the dedicated GPX GridFS bucket', async () => {
    const tracks = { createIndex: vi.fn().mockResolvedValue('index') };
    const enrichmentCache = { createIndex: vi.fn().mockResolvedValue('index') };
    const mongoDatabase = { databaseName: 'getgpx_test' };
    const database = {
      connect: vi.fn().mockResolvedValue(mongoDatabase),
      collection: vi.fn().mockImplementation((name) => Promise.resolve(name === 'tracks' ? tracks : enrichmentCache)),
    };
    const bucket = { bucketName: 'gpxSourceFiles' };
    const createBucket = vi.fn().mockReturnValue(bucket);

    const persistence = await createTrackPersistence(database, { createBucket });

    expect(database.collection).toHaveBeenCalledWith('tracks');
    expect(database.collection).toHaveBeenCalledWith('enrichmentCache');
    expect(createBucket).toHaveBeenCalledWith(mongoDatabase, { bucketName: 'gpxSourceFiles' });
    expect(tracks.createIndex).toHaveBeenCalledTimes(5);
    expect(enrichmentCache.createIndex).toHaveBeenCalledTimes(2);
    expect(persistence.trackRepository).toBeDefined();
    expect(persistence.enrichmentCacheRepository).toBeDefined();
    expect(persistence.gpxFileStore).toBeDefined();
  });
});
