import { createApp } from './app.js';
import { createAuthentication } from './authentication.js';
import { loadConfiguration, loadHomepageTrackIds } from './configuration.js';
import { createDatabase } from './database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './track-analysis.js';
import { createTrackPersistence } from './track-persistence.js';
import { createTrackRouter } from './track-routes.js';
import { createTrackService } from './track-service.js';
import { logger } from './logger.js';
import { createHomepageTrackCache } from './homepage-track-cache.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const homepageCacheEnabled = process.env.HOMEPAGE_TRACK_CACHE_ENABLED === 'true';
const database = createDatabase();

async function start() {
  await database.connect();
  const [authentication, trackPersistence, configuration] = await Promise.all([
    createAuthentication(database),
    createTrackPersistence(database),
    loadConfiguration(database, { loadHomepage: !homepageCacheEnabled }),
  ]);
  const trackService = createTrackService({
    ...trackPersistence,
    userRepository: authentication.userRepository,
    analyzeSource: analyzeGpxSource,
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
  const trackRouter = createTrackRouter(
    homepageCache ? { ...trackService, getHomepageTracks: homepageCache.getHomepageTracks } : trackService,
    authentication.service,
  );
  const server = createApp({ database, authRouter: authentication.middleware, trackRouter }).listen(port, host, () => {
    logger.info({ host, port }, 'Server listening');
  });

  function shutdown(signal) {
    logger.info({ signal }, 'Server shutting down');
    homepageCache?.stop();
    server.close(async (error) => {
      try {
        await database.close();
        if (error) logger.error({ reason: error.name }, 'Server shutdown failed');
        process.exitCode = error ? 1 : 0;
      } catch (closeError) {
        logger.error({ reason: closeError?.name || 'UNKNOWN' }, 'Database shutdown failed');
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.error({ reason: error?.name || 'UNKNOWN' }, 'Server startup failed');
  process.exitCode = 1;
});
