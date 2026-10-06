import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { createRequestLogger, logger } from './logger.js';
import { safeErrorDetails } from './safe-error-details.js';
import { createClientConfigurationMiddleware } from './site/client-configuration.js';

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

function normalizedStaticPath(pathname) {
  try { return path.posix.normalize(decodeURIComponent(pathname)); }
  catch { return pathname; }
}

export function createApp({ database, authRouter, apiRouter, homepageRouter, trackPreviewRouter, socialPageRouter, clientConfigurationMiddleware = createClientConfigurationMiddleware(), staticDirectory = defaultStaticDirectory, log = logger }) {
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
  app.use(clientConfigurationMiddleware);
  if (apiRouter) app.use('/api', apiRouter);
  if (authRouter) app.use(authRouter);
  if (homepageRouter) app.use(homepageRouter);
  if (trackPreviewRouter) app.use(trackPreviewRouter);
  const serveAppShell = async (request, response) => response
    .status(normalizedStaticPath(request.path) === '/index.html' ? 200 : frontendPageStatus(request.path))
    .set('Cache-Control', 'private, no-store')
    .type('html')
    .send(await readFile(path.join(staticDirectory, 'index.html'), 'utf8'));
  app.get('/index.html', serveAppShell);
  const serveStatic = express.static(staticDirectory, { index: false, maxAge: '1h' });
  app.use((request, response, next) => {
    // Static streams bypass HTML configuration; keep every HTML path in the page handlers.
    if (/\.html?$/i.test(normalizedStaticPath(request.path))) return next();
    return serveStatic(request, response, next);
  });
  if (socialPageRouter) app.use(socialPageRouter);
  app.get('*splat', serveAppShell);

  app.use((error, request, response, next) => {
    request.log.error({ event: 'unhandled_request_error', ...safeErrorDetails(error) }, 'Unhandled request error');
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
        logger.warn({ event: 'readiness_check_failed', ...safeErrorDetails(error) }, 'Readiness check failed');
        response.status(503).json({ status: 'unavailable' });
      }
    },
  };
}
