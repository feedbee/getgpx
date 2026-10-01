import { existsSync } from 'node:fs';
import process from 'node:process';
import { createApp } from './app.js';
import { createAuthentication } from './authentication.js';
import { loadConfiguration, loadHomepageTrackIds } from './configuration.js';
import { createDatabase } from './database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './track-analysis.js';
import { createS3TrackPersistence } from './s3-track-persistence.js';
import { createApiRouter } from './api/router.js';
import { createHomepageRouter } from './site/homepage-routes.js';
import { createS3TrackService } from './s3-track-service.js';
import { loadTrackStorageConfig } from './track-storage-config.js';
import { createTrackFileDelivery } from './track-file-delivery.js';
import { logger } from './logger.js';
import { createHomepageTrackCache } from './homepage-track-cache.js';
import { safeErrorDetails } from './safe-error-details.js';

if (existsSync('.env')) process.loadEnvFile('.env');
logger.level = process.env.LOG_LEVEL || 'warn';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const homepageCacheEnabled = process.env.HOMEPAGE_TRACK_CACHE_ENABLED === 'true';
const database = createDatabase();

async function start() {
  const trackConfig = loadTrackStorageConfig();
  await database.connect();
  const [authentication, trackPersistence, configuration] = await Promise.all([
    createAuthentication(database),
    createS3TrackPersistence(database, trackConfig),
    loadConfiguration(database, { loadHomepage: !homepageCacheEnabled }),
  ]);
  const trackService = createS3TrackService({
    ...trackPersistence,
    userRepository: authentication.userRepository,
    analyzeSource: (source, options) => analyzeGpxSource(source, { ...options, previewMaxPoints: trackConfig.previewMaxPoints }),
    enrichAnalysis: enrichTrackAnalysis,
    configuration,
  });
  const homepageCache = homepageCacheEnabled
    ? createHomepageTrackCache({
      load: async () => trackService.getHomepageTracks(await loadHomepageTrackIds(database)),
      log: logger,
    })
    : null;
  if (homepageCache) await homepageCache.start();
  const apiRouter = createApiRouter(trackService, authentication.service, {
    delivery: trackConfig.delivery,
    fileDelivery: trackConfig.delivery === 'nginx' ? createTrackFileDelivery(trackConfig) : null,
    origin: process.env.GOOGLE_REDIRECT_URI,
    sessionMiddleware: authentication.sessionMiddleware,
  });
  const homepageRouter = createHomepageRouter(homepageCache
    ? { getHomepageTracks: homepageCache.getHomepageTracks } : trackService);
  const server = createApp({ database, authRouter: authentication.middleware, apiRouter, homepageRouter }).listen(port, host, () => {
    logger.info({ host, port }, 'Server listening');
  });

  function shutdown(signal) {
    logger.info({ signal }, 'Server shutting down');
    homepageCache?.stop();
    server.close(async (error) => {
      try {
        await database.close();
        if (error) logger.error({ event: 'server_shutdown_failed', ...safeErrorDetails(error) }, 'Server shutdown failed');
        process.exitCode = error ? 1 : 0;
      } catch (closeError) {
        logger.error({ event: 'database_close_failed', ...safeErrorDetails(closeError) }, 'Database shutdown failed');
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.error({ event: 'server_startup_failed', ...safeErrorDetails(error) }, 'Server startup failed');
  process.exitCode = 1;
});
