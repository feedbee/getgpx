import { GridFSBucket } from 'mongodb';
import { createEnrichmentCacheRepository } from './enrichment-cache-repository.js';
import { createGpxFileStore } from './gpx-file-store.js';
import { createTrackRepository } from './track-repository.js';
import { createSavedTrackRepository } from './saved-track-repository.js';

export async function createTrackPersistence(database, {
  createBucket = (mongoDatabase, options) => new GridFSBucket(mongoDatabase, options),
} = {}) {
  if (!database) throw new Error('A database adapter is required.');

  const [mongoDatabase, tracks, enrichmentCache, savedTracks, users] = await Promise.all([
    database.connect(),
    database.collection('tracks'),
    database.collection('enrichmentCache'),
    database.collection('savedTracks'),
    database.collection('users'),
  ]);
  const trackRepository = createTrackRepository(tracks);
  const enrichmentCacheRepository = createEnrichmentCacheRepository(enrichmentCache);
  const savedTrackRepository = createSavedTrackRepository(savedTracks, tracks, users);
  await Promise.all([
    trackRepository.ensureIndexes(),
    enrichmentCacheRepository.ensureIndexes(),
    savedTrackRepository.ensureIndexes(),
  ]);
  const bucket = createBucket(mongoDatabase, { bucketName: 'gpxSourceFiles' });

  return {
    trackRepository,
    enrichmentCacheRepository,
    savedTrackRepository,
    gpxFileStore: createGpxFileStore({ bucket }),
  };
}
