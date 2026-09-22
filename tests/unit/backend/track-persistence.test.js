import { describe, expect, it, vi } from 'vitest';
import { createTrackPersistence } from '../../../src/backend/track-persistence.js';

describe('track persistence', () => {
  it('initializes track indexes and the dedicated GPX GridFS bucket', async () => {
    const tracks = { createIndex: vi.fn().mockResolvedValue('index') };
    const enrichmentCache = { createIndex: vi.fn().mockResolvedValue('index') };
    const savedTracks = { createIndex: vi.fn().mockResolvedValue('index') };
    const users = { collectionName: 'users' };
    const mongoDatabase = { databaseName: 'getgpx_test' };
    const database = {
      connect: vi.fn().mockResolvedValue(mongoDatabase),
      collection: vi.fn().mockImplementation((name) => Promise.resolve({ tracks, enrichmentCache, savedTracks, users }[name])),
    };
    const bucket = { bucketName: 'gpxSourceFiles' };
    const createBucket = vi.fn().mockReturnValue(bucket);

    const persistence = await createTrackPersistence(database, { createBucket });

    expect(database.collection).toHaveBeenCalledWith('tracks');
    expect(database.collection).toHaveBeenCalledWith('enrichmentCache');
    expect(database.collection).toHaveBeenCalledWith('savedTracks');
    expect(database.collection).toHaveBeenCalledWith('users');
    expect(createBucket).toHaveBeenCalledWith(mongoDatabase, { bucketName: 'gpxSourceFiles' });
    expect(tracks.createIndex).toHaveBeenCalledTimes(5);
    expect(enrichmentCache.createIndex).toHaveBeenCalledTimes(2);
    expect(savedTracks.createIndex).toHaveBeenCalledTimes(2);
    expect(persistence.trackRepository).toBeDefined();
    expect(persistence.enrichmentCacheRepository).toBeDefined();
    expect(persistence.savedTrackRepository).toBeDefined();
    expect(persistence.gpxFileStore).toBeDefined();
  });
});
