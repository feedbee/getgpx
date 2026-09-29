import { defineConfig, loadEnv } from 'vite';
import { createAuthentication } from './src/backend/authentication.js';
import { createDatabase } from './src/backend/database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './src/backend/track-analysis.js';
import { createS3TrackPersistence } from './src/backend/s3-track-persistence.js';
import { createTrackRouter } from './src/backend/track-routes.js';
import { createS3TrackService } from './src/backend/s3-track-service.js';
import { loadTrackStorageConfig } from './src/backend/track-storage-config.js';
import { createTrackInternalRouter } from './src/backend/track-internal-router.js';
import { createRequestLogger, logger } from './src/backend/logger.js';

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const trackConfig = command === 'serve' && mode !== 'test' ? loadTrackStorageConfig(environment) : null;
  const authenticationPlugin = {
    name: 'authentication-api',
    async configureServer(server) {
      if (environment.LOG_LEVEL) logger.level = environment.LOG_LEVEL;
      for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE']) {
        if (environment[name]) process.env[name] = environment[name];
      }
      server.middlewares.use(createRequestLogger());
      const database = createDatabase({ uri: environment.MONGODB_URI });
      await database.connect();
      const authentication = await createAuthentication(database, {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
        redirectUri: environment.GOOGLE_REDIRECT_URI,
        sessionSecret: environment.SESSION_SECRET,
        secureCookies: false,
      });
      const trackPersistence = await createS3TrackPersistence(database, trackConfig);
      const trackService = createS3TrackService({
        ...trackPersistence,
        analyzeSource: (source, options) => analyzeGpxSource(source, { ...options, previewMaxPoints: trackConfig.previewMaxPoints }),
        enrichAnalysis: enrichTrackAnalysis,
      });
      server.middlewares.use(authentication.middleware);
      server.middlewares.use(createTrackRouter(trackService, authentication.service, { delivery: trackConfig.delivery }));
      if (trackConfig.delivery === 'nginx') {
        server.middlewares.use(createTrackInternalRouter(trackService, authentication.service, trackConfig));
      }
      server.httpServer?.once('close', () => database.close());
    },
  };

  const plugins = command === 'serve' && mode !== 'test'
    ? [authenticationPlugin]
    : [];
  return { plugins };
});
