import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { createRequestLogger, logger } from './logger.js';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const defaultStaticDirectory = path.join(rootDirectory, 'dist');

export function frontendPageStatus(pathname) {
  return pathname === '/'
    || pathname === '/my-tracks'
    || pathname === '/favorite-tracks'
    || /^\/tracks\/[A-Za-z0-9_]{1,64}$/.test(pathname)
    ? 200
    : 404;
}

export function createApp({ database, authRouter, trackRouter, staticDirectory = defaultStaticDirectory, log = logger }) {
  if (!database) throw new Error('A database adapter is required.');

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://tile.openstreetmap.org', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(createRequestLogger(log));

  const health = createHealthHandlers(database);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  if (authRouter) app.use(authRouter);
  if (trackRouter) app.use(trackRouter);
  app.use(express.static(staticDirectory, { index: false, maxAge: '1h' }));
  app.get('*splat', (request, response) => response
    .status(frontendPageStatus(request.path))
    .sendFile(path.join(staticDirectory, 'index.html')));

  app.use((error, request, response, next) => {
    request.log.error({ reason: error?.name || 'UNKNOWN' }, 'Unhandled request error');
    if (response.headersSent) return next(error);
    response.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
  });

  return app;
}

export function createHealthHandlers(database) {
  return {
    live: (_request, response) => response.json({ status: 'ok' }),
    ready: async (_request, response) => {
      try {
        await database.ping();
        response.json({ status: 'ready' });
      } catch (error) {
        logger.warn({ reason: error?.name || 'UNKNOWN' }, 'Readiness check failed');
        response.status(503).json({ status: 'unavailable' });
      }
    },
  };
}
