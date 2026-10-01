import console from 'node:console';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { S3Client } from '@aws-sdk/client-s3';
import { createDatabase } from '../src/backend/database.js';
import { createS3TrackRepository } from '../src/backend/s3-track-repository.js';
import { createTrackObjectStore } from '../src/backend/track-object-store.js';
import { loadTrackStorageConfig } from '../src/backend/track-storage-config.js';
import { createTrackPreviewProvider } from '../src/backend/track-previews/provider.js';
import { createTrackPreviewService } from '../src/backend/track-previews/service.js';
import { parsePreviewRegenerationOptions, runPreviewRegeneration } from '../src/backend/track-previews/regeneration.js';
import { logger } from '../src/backend/logger.js';
import { safeErrorDetails } from '../src/backend/safe-error-details.js';

async function main() {
  const options = parsePreviewRegenerationOptions(process.argv.slice(2));
  if (options.help) {
    console.log('npm run previews:regenerate -- [--dry-run | --apply] [--force] [--track PUBLIC_ID] [--limit N] [--after MONGO_ID]');
    console.log('Default: dry run. Apply updates missing/obsolete previews; force also rebuilds current ones.');
    return;
  }
  if (existsSync('.env')) process.loadEnvFile('.env');
  // This job writes S3 directly and needs no CloudFront signing key or website OAuth settings.
  const config = loadTrackStorageConfig({ ...process.env, TRACK_FILE_DELIVERY: 'stream' });
  const provider = createTrackPreviewProvider();
  if (!provider) throw new Error('A preview provider must be enabled for regeneration.');
  const database = createDatabase();
  const s3 = new S3Client({ region: config.region });
  try {
    const trackRepository = createS3TrackRepository(await database.collection('tracks'));
    const objectStore = createTrackObjectStore({ s3, bucket: config.bucket, prefix: config.prefix });
    const previews = createTrackPreviewService({ trackRepository, objectStore, provider,
      warn: (details) => logger.warn(details, 'Preview regeneration warning') });
    console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', provider: provider.provider,
      style: provider.style, rendererVersion: provider.rendererVersion, version: provider.version, prefix: config.prefix }));
    const summary = await runPreviewRegeneration({ trackRepository, previews, options,
      onProgress: (details) => console.log(JSON.stringify(details)) });
    console.log(JSON.stringify({ summary }));
    if (summary.failed || summary.conflict) process.exitCode = 1;
  } finally {
    try { await database.close(); }
    finally { s3.destroy(); }
  }
}

main().catch((error) => {
  logger.error({ event: 'preview_regeneration_failed', ...safeErrorDetails(error) }, 'Preview regeneration failed');
  process.exitCode = 1;
});
