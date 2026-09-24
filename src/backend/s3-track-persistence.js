import { S3Client } from '@aws-sdk/client-s3';
import { createEnrichmentCacheRepository } from './enrichment-cache-repository.js';
import { createSavedTrackRepository } from './saved-track-repository.js';
import { createS3TrackRepository } from './s3-track-repository.js';
import { createTrackObjectStore } from './track-object-store.js';

export async function createS3TrackPersistence(database, config, { s3 = new S3Client({ region: config.region }) } = {}) {
  const [tracks, enrichmentCache, savedTracks, users] = await Promise.all([
    database.collection('tracks'), database.collection('enrichmentCache'),
    database.collection('savedTracks'), database.collection('users'),
  ]);
  const trackRepository = createS3TrackRepository(tracks);
  const enrichmentCacheRepository = createEnrichmentCacheRepository(enrichmentCache);
  const savedTrackRepository = createSavedTrackRepository(savedTracks, tracks, users);
  await Promise.all([trackRepository.ensureIndexes(), enrichmentCacheRepository.ensureIndexes(), savedTrackRepository.ensureIndexes()]);
  return { trackRepository, enrichmentCacheRepository, savedTrackRepository,
    objectStore: createTrackObjectStore({ s3, bucket: config.bucket, prefix: config.prefix }) };
}
