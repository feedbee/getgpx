import { createApp } from './app.js';
import { createAuthentication } from './authentication.js';
import { loadConfiguration } from './configuration.js';
import { createDatabase } from './database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './track-analysis.js';
import { createTrackPersistence } from './track-persistence.js';
import { createTrackRouter } from './track-routes.js';
import { createTrackService } from './track-service.js';
import { logger } from './logger.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const database = createDatabase();

async function start() {
  await database.connect();
  const [authentication, trackPersistence, configuration] = await Promise.all([
    createAuthentication(database),
    createTrackPersistence(database),
    loadConfiguration(database),
  ]);
  const trackService = createTrackService({
    ...trackPersistence,
    userRepository: authentication.userRepository,
    analyzeSource: analyzeGpxSource,
    enrichAnalysis: enrichTrackAnalysis,
    configuration,
  });
  const trackRouter = createTrackRouter(trackService, authentication.service);
  const server = createApp({ database, authRouter: authentication.middleware, trackRouter }).listen(port, host, () => {
    logger.info({ host, port }, 'Server listening');
  });

  function shutdown(signal) {
    logger.info({ signal }, 'Server shutting down');
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
  logger.fatal({ reason: error?.name || 'UNKNOWN' }, 'Server startup failed');
  process.exitCode = 1;
});
