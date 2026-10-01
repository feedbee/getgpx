import { createTrackPreviewProvider } from './src/backend/track-previews/provider.js';
import { createTrackPreviewRouter } from './src/backend/site/track-preview-routes.js';
import { defineConfig, loadEnv } from 'vite';
import { createAuthentication } from './src/backend/authentication.js';
import { createDatabase } from './src/backend/database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './src/backend/track-analysis.js';
import { createS3TrackPersistence } from './src/backend/s3-track-persistence.js';
import { createApiRouter } from './src/backend/api/router.js';
import { createHomepageRouter } from './src/backend/site/homepage-routes.js';
import express from 'express';
import { createS3TrackService } from './src/backend/s3-track-service.js';
import { loadTrackStorageConfig } from './src/backend/track-storage-config.js';
import { createTrackFileDelivery } from './src/backend/track-file-delivery.js';
import { createRequestLogger, logger } from './src/backend/logger.js';

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const trackConfig = command === 'serve' && mode !== 'test' ? loadTrackStorageConfig(environment) : null;
  const previewProvider = trackConfig ? createTrackPreviewProvider(environment) : null;
  const authenticationPlugin = {
    name: 'authentication-api',
    async configureServer(server) {
      if (environment.LOG_LEVEL) logger.level = environment.LOG_LEVEL;
      for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
        'VALHALLA_URL', 'VALHALLA_MAX_SEGMENT_KM', 'ELEVATION_URL', 'OVERPASS_URL']) {
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
        previewProvider,
      });
      const http = express();
      http.disable('x-powered-by');
      http.use('/api', createApiRouter(trackService, authentication.service, {
        delivery: trackConfig.delivery,
        fileDelivery: trackConfig.delivery === 'nginx' ? createTrackFileDelivery(trackConfig) : null, origin: environment.GOOGLE_REDIRECT_URI,
        sessionMiddleware: authentication.sessionMiddleware,
      }));
      http.use(authentication.middleware);
      http.use(createHomepageRouter(trackService));
      http.use(createTrackPreviewRouter(trackService, { sessionMiddleware: authentication.sessionMiddleware,
        delivery: trackConfig.delivery,
        fileDelivery: trackConfig.delivery === 'nginx' ? createTrackFileDelivery(trackConfig) : null }));
      server.middlewares.use(http);
      server.httpServer?.once('close', () => database.close());
    },
  };

  const plugins = command === 'serve' && mode !== 'test'
    ? [authenticationPlugin]
    : [];
  return { plugins };
});
