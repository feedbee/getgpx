import { defineConfig, loadEnv } from 'vite';
import { createAuthentication } from './src/backend/authentication.js';
import { createDatabase } from './src/backend/database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './src/backend/track-analysis.js';
import { createTrackPersistence } from './src/backend/track-persistence.js';
import { createTrackRouter } from './src/backend/track-routes.js';
import { createTrackService } from './src/backend/track-service.js';
import { createRequestLogger } from './src/backend/logger.js';

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const authenticationPlugin = {
    name: 'authentication-api',
    async configureServer(server) {
      server.middlewares.use(createRequestLogger());
      const database = createDatabase({ uri: environment.MONGODB_URI, databaseName: environment.MONGODB_DATABASE });
      await database.connect();
      const authentication = await createAuthentication(database, {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
        redirectUri: environment.GOOGLE_REDIRECT_URI,
        sessionSecret: environment.SESSION_SECRET,
        secureCookies: false,
      });
      const trackPersistence = await createTrackPersistence(database);
      const trackService = createTrackService({
        ...trackPersistence,
        analyzeSource: analyzeGpxSource,
        enrichAnalysis: enrichTrackAnalysis,
      });
      server.middlewares.use(authentication.middleware);
      server.middlewares.use(createTrackRouter(trackService, authentication.service));
      server.httpServer?.once('close', () => database.close());
    },
  };

  const plugins = command === 'serve' && mode !== 'test'
    ? [authenticationPlugin]
    : [];
  return { plugins };
});
