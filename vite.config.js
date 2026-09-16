import { defineConfig } from 'vite';
import { valhallaMiddleware } from './server/middleware.js';

const surfaceMatchingPlugin = {
  name: 'surface-matching-api',
  configureServer(server) { server.middlewares.use(valhallaMiddleware()); },
  configurePreviewServer(server) { server.middlewares.use(valhallaMiddleware()); },
};

export default defineConfig({ plugins: [surfaceMatchingPlugin] });
