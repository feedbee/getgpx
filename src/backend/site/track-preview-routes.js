import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { isPublicId } from '../public-id.js';
import { safeErrorDetails } from '../safe-error-details.js';

export function createTrackPreviewRouter(trackService, { sessionMiddleware, delivery = 'stream', fileDelivery } = {}) {
  const router = Router();
  router.get('/share-images/tracks/:id.png', async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store');
    if (!isPublicId(request.params.id)) return response.status(404).end();
    try {
      const descriptor = await trackService.previewDescriptor(request.params.id, null, 'social');
      if (!descriptor?.key) return response.status(404).end();
      response.type('png');
      if (delivery === 'nginx') {
        response.setHeader('X-Accel-Redirect', fileDelivery.redirectFor(descriptor, 'preview'));
        return response.status(200).end();
      }
      const stream = await trackService.getPreview(request.params.id, null, 'social');
      if (!stream) return response.status(404).end();
      await pipeline(stream, response);
    } catch (error) {
      request.log?.warn({ event: 'track_preview_delivery_failed', ...safeErrorDetails(error) }, 'Share image unavailable');
      if (!response.headersSent) response.status(502).end(); else response.destroy();
    }
  });
  if (sessionMiddleware) router.use('/track-previews', sessionMiddleware);
  router.use('/track-previews', (request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    if (!request.authenticatedUser) return response.status(401).end();
    next();
  });
  router.get('/track-previews/config', (_request, response) => response.json(trackService.previewConfiguration()));
  router.get('/track-previews/:id.png', async (request, response) => {
    if (!isPublicId(request.params.id)) return response.status(404).end();
    try {
      if (delivery === 'nginx') {
        const descriptor = await trackService.previewDescriptor(request.params.id, request.authenticatedUser);
        if (!descriptor?.key) return response.status(204).end();
        response.type('png');
        response.setHeader('X-Accel-Redirect', fileDelivery.redirectFor(descriptor, 'preview'));
        return response.status(200).end();
      }
      const stream = await trackService.getPreview(request.params.id, request.authenticatedUser);
      if (!stream) return response.status(204).end();
      response.type('png');
      await pipeline(stream, response);
    } catch (error) {
      request.log?.warn({ event: 'track_preview_delivery_failed', ...safeErrorDetails(error) }, 'Track preview delivery failed');
      if (!response.headersSent) response.status(502).json({ error: { code: 'TRACK_FILE_UNAVAILABLE' } });
      else response.destroy();
    }
  });
  return router;
}
