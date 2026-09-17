import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { valhallaMiddleware } from './middleware.js';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ database, authRouter, staticDirectory = path.join(rootDirectory, 'dist') }) {
  if (!database) throw new Error('A database adapter is required.');

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'"],
      },
    },
  }));

  const health = createHealthHandlers(database);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  if (authRouter) app.use(authRouter);
  app.use(valhallaMiddleware());
  app.use(express.static(staticDirectory, { index: false, maxAge: '1h' }));
  app.get('*splat', (_request, response) => response.sendFile(path.join(staticDirectory, 'index.html')));

  return app;
}

export function createHealthHandlers(database) {
  return {
    live: (_request, response) => response.json({ status: 'ok' }),
    ready: async (_request, response) => {
      try {
        await database.ping();
        response.json({ status: 'ready' });
      } catch {
        response.status(503).json({ status: 'unavailable' });
      }
    },
  };
}
