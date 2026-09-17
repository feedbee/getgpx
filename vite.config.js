import { defineConfig, loadEnv } from 'vite';
import { valhallaMiddleware } from './src/backend/middleware.js';

export default defineConfig(({ mode }) => {
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

  return { plugins: [surfaceMatchingPlugin] };
});
