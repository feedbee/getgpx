import { GridFSBucket } from 'mongodb';
import { createEnrichmentCacheRepository } from './enrichment-cache-repository.js';
import { createGpxFileStore } from './gpx-file-store.js';
import { createTrackRepository } from './track-repository.js';

export async function createTrackPersistence(database, {
  createBucket = (mongoDatabase, options) => new GridFSBucket(mongoDatabase, options),
} = {}) {
  if (!database) throw new Error('A database adapter is required.');

  const [mongoDatabase, tracks, enrichmentCache] = await Promise.all([
    database.connect(),
    database.collection('tracks'),
    database.collection('enrichmentCache'),
  ]);
  const trackRepository = createTrackRepository(tracks);
  const enrichmentCacheRepository = createEnrichmentCacheRepository(enrichmentCache);
  await Promise.all([
    trackRepository.ensureIndexes(),
    enrichmentCacheRepository.ensureIndexes(),
  ]);
  const bucket = createBucket(mongoDatabase, { bucketName: 'gpxSourceFiles' });

  return {
    trackRepository,
    enrichmentCacheRepository,
    gpxFileStore: createGpxFileStore({ bucket }),
  };
}
