import express from 'express';
import { createV1Router } from './v1/router.js';
import { createApiAccessPolicy } from './access-policy.js';
import { createDocumentationRouter } from './documentation.js';
import { safeErrorDetails } from '../safe-error-details.js';

export function createApiRouter(trackService, authService, { sessionMiddleware, origin, ...options } = {}) {
  const router = express.Router();
  router.use(createApiAccessPolicy({ origin }));
  router.use(createDocumentationRouter());
  if (sessionMiddleware) router.use(sessionMiddleware);
  router.use('/v1', createV1Router(trackService, authService, options));
  router.use((_request, response) => response.status(404).json({ error: { code: 'API_NOT_FOUND' } }));
  router.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const known = { 'entity.parse.failed': [400, 'INVALID_JSON'], 'entity.too.large': [413, 'PAYLOAD_TOO_LARGE'],
      'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE'], 'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE'] }[error.type];
    if (!known) request.log?.error({ event: 'api_request_failed', ...safeErrorDetails(error) }, 'API request failed');
    const [status, code] = known || [500, 'INTERNAL_ERROR'];
    response.status(status).json({ error: { code } });
  });
  return router;
}
