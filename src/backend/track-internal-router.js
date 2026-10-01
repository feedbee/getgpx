import express from 'express';
import { createApiAccessPolicy } from './api/access-policy.js';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { isPublicId } from './public-id.js';
import { sessionTokenFromRequest } from './auth.js';
import { safeErrorDetails } from './safe-error-details.js';

function fileError(response, status, code) {
  const messages = {
    TRACK_NOT_FOUND: 'Трек не найден.',
    TRACK_ANALYSIS_NOT_READY: 'Анализ ещё не готов.',
    TRACK_FILE_UNAVAILABLE: 'Файл временно недоступен.',
  };
  return response.status(status).json({ error: { code, message: messages[code] } });
}

export function createTrackInternalHandler(trackService, authService, config, { sign = getSignedUrl } = {}) {
  if (config.delivery !== 'nginx') throw new Error('Internal file routing requires nginx delivery.');
  return async (request, response) => {
    const { id, kind } = request.params;
    if (!isPublicId(id) || !['analysis', 'download'].includes(kind)) {
      return fileError(response, 404, 'TRACK_NOT_FOUND');
    }
    let descriptor;
    try {
      const user = request.authenticatedUser === undefined
        ? await authService.getUser(sessionTokenFromRequest(request)) : request.authenticatedUser;
      descriptor = await trackService.fileDescriptor(id, kind, user);
    } catch (lookupError) {
      request.log?.error({ event: 'track_file_handoff_failed', kind, stage: 'descriptor',
        ...safeErrorDetails(lookupError) }, 'Track file handoff failed');
      return fileError(response, 502, 'TRACK_FILE_UNAVAILABLE');
    }
    if (!descriptor) return fileError(response, 404, 'TRACK_NOT_FOUND');
    if (!descriptor.key) return fileError(response, 409, 'TRACK_ANALYSIS_NOT_READY');
    let url;
    try {
      const prefix = `${config.prefix}/`;
      if (!descriptor.key.startsWith(prefix)) throw new Error('Track object key is outside configured prefix.');
      // CloudFront's originPath supplies the S3 prefix; the viewer URL starts at tracks/.
      const viewerKey = descriptor.key.slice(prefix.length);
      url = sign({
        url: `https://${config.cloudFrontDomain}/${viewerKey.split('/').map(encodeURIComponent).join('/')}`,
        keyPairId: config.cloudFrontKeyPairId,
        privateKey: config.cloudFrontPrivateKey,
        dateLessThan: new Date(Date.now() + 60_000).toISOString(),
      });
    } catch (signError) {
      request.log?.error({ event: 'track_file_handoff_failed', kind, stage: 'sign',
        ...safeErrorDetails(signError) }, 'Track file handoff failed');
      return fileError(response, 502, 'TRACK_FILE_UNAVAILABLE');
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Track-File-URL', url);
    response.setHeader('X-Track-File-Content-Type', kind === 'analysis' ? 'application/json' : 'application/gpx+xml');
    response.setHeader('X-Track-File-Revision', descriptor.revision);
    if (kind === 'download') {
      const filename = [...descriptor.filename].map((character) => (
        character === '"' || character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character
      )).join('');
      response.setHeader('X-Track-File-Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
    return response.status(200).end();
  };
}

export function createTrackInternalRouter(trackService, authService, config, options) {
  const router = express.Router();
  router.get('/internal/track-files/:id/:kind', createApiAccessPolicy({ origin: options?.origin }), createTrackInternalHandler(trackService, authService, config, options));
  return router;
}
