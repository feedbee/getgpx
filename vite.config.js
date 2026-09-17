import { defineConfig, loadEnv } from 'vite';
import { createAuthentication } from './src/backend/authentication.js';
import { createDatabase } from './src/backend/database.js';
import { valhallaMiddleware } from './src/backend/middleware.js';

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const middleware = () => valhallaMiddleware({
    valhallaEndpoint: environment.VALHALLA_URL,
    overpassEndpoint: environment.OVERPASS_URL,
  });
  const surfaceMatchingPlugin = {
    name: 'surface-matching-api',
    configureServer(server) { server.middlewares.use(middleware()); },
    configurePreviewServer(server) { server.middlewares.use(middleware()); },
  };

  const authenticationPlugin = {
    name: 'authentication-api',
    async configureServer(server) {
      const database = createDatabase({ uri: environment.MONGODB_URI, databaseName: environment.MONGODB_DATABASE });
      await database.connect();
      const { middleware } = await createAuthentication(database, {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
        redirectUri: environment.GOOGLE_REDIRECT_URI,
        sessionSecret: environment.SESSION_SECRET,
        secureCookies: false,
      });
      server.middlewares.use(middleware);
      server.httpServer?.once('close', () => database.close());
    },
  };

  const plugins = command === 'serve' && mode !== 'test'
    ? [authenticationPlugin, surfaceMatchingPlugin]
    : [surfaceMatchingPlugin];
  return { plugins };
});
