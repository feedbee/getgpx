import { ObjectId } from 'mongodb';
import { sessionTokenFromRequest } from '../../auth.js';
import { GpxFileTooLargeError, TRACK_UPLOAD_LIMITS, InvalidTrackCursorError, TrackLimitReachedError } from '../../track-contracts.js';
import { normalizeExternalTrackLinks } from '../../external-track-links.js';
import { isRouteType } from '../../../route-types.js';
import { isPublicId } from '../../public-id.js';
import { createRequestProfiler } from '../../request-profile.js';
import { safeErrorDetails } from '../../safe-error-details.js';

const GPX_CONTENT_TYPES = new Set(['application/gpx+xml', 'application/xml', 'text/xml']);

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

function error(response, status, code, message) {
  return send(response, status, { error: { code, message } });
}

function objectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? ObjectId.createFromHexString(value) : null;
}

function filenameFromRequest(request) {
  try {
    const decoded = decodeURIComponent(String(request.headers['x-gpx-filename'] || ''));
    const filename = decoded.split(/[\\/]/).at(-1).trim();
    const hasControlCharacters = [...filename].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    if (!filename || filename.length > 255 || !/\.gpx$/i.test(filename) || hasControlCharacters) return null;
    return filename;
  } catch {
    return null;
  }
}

function contentDisposition(filename) {
  const ascii = [...filename].map((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code <= 126 ? character : '_';
  }).join('').replace(/["\\]/g, '_') || 'track.gpx';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function createTrackHandlers(trackService, authService, { delivery = 'stream', fileDelivery } = {}) {
  if (!trackService || !authService) throw new Error('Track and authentication services are required.');

  async function nginxFile(request, response, publicId, kind) {
    let stage = 'descriptor';
    try {
      const user = request.authenticatedUser === undefined
        ? await authService.getUser(sessionTokenFromRequest(request)) : request.authenticatedUser;
      const descriptor = await trackService.fileDescriptor(publicId, kind, user);
      if (!descriptor) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      if (!descriptor.key) return error(response, 409, 'TRACK_ANALYSIS_NOT_READY',
        kind === 'gpx' ? 'Файл ещё не готов.' : 'Анализ ещё не готов.');
      stage = 'sign';
      const redirect = fileDelivery.redirectFor(descriptor, kind);
      const disposition = kind === 'gpx' ? contentDisposition(descriptor.filename) : null;
      response.setHeader('Content-Type', kind === 'gpx' ? 'application/gpx+xml' : 'application/json');
      if (disposition) response.setHeader('Content-Disposition', disposition);
      response.setHeader('X-Accel-Redirect', redirect);
      response.setHeader('Cache-Control', 'private, no-store');
      return response.status(200).end();
    } catch (deliveryError) {
      request.log?.error({ event: 'track_file_delivery_failed', publicId, kind, stage,
        ...safeErrorDetails(deliveryError) }, 'Track file delivery failed');
      return error(response, 502, 'TRACK_FILE_UNAVAILABLE',
        kind === 'gpx' ? 'Файл временно недоступен.' : 'Анализ временно недоступен.');
    }
  }

  async function authenticatedOwner(request, response) {
    const user = request.authenticatedUser === undefined
      ? await authService.getUser(sessionTokenFromRequest(request)) : request.authenticatedUser;
    if (!user) {
      error(response, 401, 'AUTHENTICATION_REQUIRED', 'Войдите, чтобы управлять треками.');
      return null;
    }
    const ownerId = objectId(user.id);
    if (!ownerId) {
      error(response, 401, 'INVALID_SESSION', 'Сессия недействительна. Войдите снова.');
      return null;
    }
    return { ownerId, tier: user.tier || 'BASIC' };
  }

  return {
    async mine(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const query = typeof request.query?.query === 'string' ? request.query.query.trim() : '';
      const cursor = typeof request.query?.cursor === 'string' ? request.query.cursor : '';
      if (query.length > 100) return error(response, 422, 'INVALID_SEARCH_QUERY', 'Поисковый запрос должен быть не длиннее 100 символов.');
      try {
        return send(response, 200, { data: await trackService.listMyTracks({ ownerId, query, cursor }) });
      } catch (listError) {
        if (listError instanceof InvalidTrackCursorError) return error(response, 400, listError.code, 'Не удалось продолжить список. Обновите страницу.');
        throw listError;
      }
    },

    async saved(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const query = typeof request.query?.query === 'string' ? request.query.query.trim() : '';
      const cursor = typeof request.query?.cursor === 'string' ? request.query.cursor : '';
      if (query.length > 100) return error(response, 422, 'INVALID_SEARCH_QUERY', 'Поисковый запрос должен быть не длиннее 100 символов.');
      try {
        return send(response, 200, { data: await trackService.listSavedTracks({ userId: identity.ownerId, query, cursor }) });
      } catch (listError) {
        if (listError instanceof InvalidTrackCursorError) return error(response, 400, listError.code, 'Не удалось продолжить список. Обновите страницу.');
        throw listError;
      }
    },

    async savedState(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const saved = await trackService.getSavedState({ publicId, userId: identity.ownerId });
      if (saved === null) return error(response, 404, 'TRACK_NOT_FOUND');
      return send(response, 200, { data: { saved } });
    },

    async save(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const saved = await trackService.saveTrack({ publicId, userId: identity.ownerId });
      return saved
        ? send(response, 200, { data: { saved: true } })
        : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async unsave(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      await trackService.unsaveTrack({ publicId, userId: identity.ownerId });
      return send(response, 200, { data: { saved: false } });
    },

    async unsaveMany(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      if (!Array.isArray(request.body?.ids) || request.body.ids.length < 1 || request.body.ids.length > 100) {
        return error(response, 422, 'INVALID_TRACK_IDS', 'Выберите от 1 до 100 треков.');
      }
      const publicIds = [...new Set(request.body.ids)];
      if (publicIds.some((publicId) => !isPublicId(publicId))) {
        return error(response, 422, 'INVALID_TRACK_IDS', 'Список треков содержит некорректный идентификатор.');
      }
      const removedIds = await trackService.unsaveTracks({ publicIds, userId: identity.ownerId });
      return send(response, 200, { data: { ids: removedIds } });
    },

    async publicTrack(request, response) {
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const track = await trackService.getPublicTrack(publicId, createRequestProfiler(request.log));
      return track
        ? send(response, 200, { data: track })
        : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async update(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const body = request.body;
      const fields = ['title', 'speedKmh', 'routeType', 'externalLinks'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
        || Object.keys(body).some((key) => !fields.includes(key))) {
        return error(response, 422, 'INVALID_REQUEST_BODY');
      }
      const changes = {};
      if (Object.hasOwn(body, 'title')) {
        const title = typeof body.title === 'string' ? body.title.normalize('NFKC').trim() : '';
        if (!title || title.length > 200) return error(response, 422, 'INVALID_TRACK_TITLE');
        changes.title = title;
      }
      if (Object.hasOwn(body, 'speedKmh')) {
        const speedKmh = body.speedKmh;
        if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || speedKmh < 1 || speedKmh > 50) {
          return error(response, 422, 'INVALID_TRACK_SPEED');
        }
        changes.speedKmh = speedKmh;
      }
      if (Object.hasOwn(body, 'routeType')) {
        if (!isRouteType(body.routeType)) return error(response, 422, 'INVALID_ROUTE_TYPE');
        changes.routeType = body.routeType;
      }
      if (Object.hasOwn(body, 'externalLinks')) {
        const links = normalizeExternalTrackLinks(body.externalLinks);
        if (!links || !body.externalLinks || typeof body.externalLinks !== 'object' || Array.isArray(body.externalLinks)) {
          return error(response, 422, 'INVALID_EXTERNAL_LINKS');
        }
        changes.externalLinks = links;
      }
      const track = await trackService.updateDetails({ publicId, ownerId, ...changes });
      return track ? send(response, 200, { data: track }) : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async replace(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const filename = filenameFromRequest(request);
      if (!GPX_CONTENT_TYPES.has(contentType)) return error(response, 415, 'UNSUPPORTED_GPX_TYPE');
      if (!filename) return error(response, 422, 'INVALID_GPX_FILENAME');
      let replacementStage = 'track_lookup';
      try {
        const status = await trackService.replaceFile({ publicId, ownerId, filename, source: request,
          onStage: (stage) => { replacementStage = stage; } });
        return status ? send(response, 202, { data: status }) : error(response, 409, 'REPLACEMENT_IN_PROGRESS', 'Замена этого трека уже выполняется.');
      } catch (replaceError) {
        if (replaceError?.code === 'TRACK_NOT_FOUND') return error(response, 404, 'TRACK_NOT_FOUND');
        if (replaceError instanceof GpxFileTooLargeError) return error(response, 413, replaceError.code, 'GPX-файл должен быть не больше 25 MiB.');
        request.log?.error({ event: 'track_replacement_failed', stage: replacementStage,
          ...safeErrorDetails(replaceError) }, 'Track replacement failed');
        return error(response, 500, 'REPLACEMENT_FAILED', 'Не удалось сохранить новый GPX-файл.');
      }
    },

    async remove(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const deleted = await trackService.deleteTrack({ publicId, ownerId });
      return deleted ? send(response, 200, { data: { deleted: true } }) : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async removeMany(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      if (!Array.isArray(request.body?.ids) || request.body.ids.length < 1 || request.body.ids.length > 100) {
        return error(response, 422, 'INVALID_TRACK_IDS', 'Выберите от 1 до 100 треков.');
      }
      const uniqueIds = [...new Set(request.body.ids)];
      if (uniqueIds.some((publicId) => !isPublicId(publicId))) {
        return error(response, 422, 'INVALID_TRACK_IDS', 'Список треков содержит некорректный идентификатор.');
      }
      const deletedIds = await trackService.deleteTracks({ publicIds: uniqueIds, ownerId });
      return send(response, 200, { data: { ids: deletedIds.map(String) } });
    },

    async gpx(request, response) {
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      if (delivery === 'nginx') return nginxFile(request, response, publicId, 'gpx');
      if (request.method === 'HEAD' && trackService.fileDescriptor) {
        const descriptor = await trackService.fileDescriptor(publicId, 'gpx');
        if (!descriptor) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
        if (!descriptor.key) return error(response, 409, 'TRACK_ANALYSIS_NOT_READY', 'Файл ещё не готов.');
        response.setHeader('Content-Type', 'application/gpx+xml');
        response.setHeader('Content-Disposition', contentDisposition(descriptor.filename));
        response.setHeader('Cache-Control', 'private, no-store');
        return response.status(200).end();
      }
      let gpx;
      try { gpx = await trackService.getPublicGpx(publicId); }
      catch (readError) {
        request.log?.error({ event: 'track_file_delivery_failed', kind: 'gpx', stage: 'open',
          ...safeErrorDetails(readError) }, 'Track GPX delivery failed');
        return error(response, 502, 'TRACK_FILE_UNAVAILABLE', 'Файл временно недоступен.');
      }
      if (!gpx) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      if (gpx.unavailable) return error(response, 409, 'TRACK_ANALYSIS_NOT_READY', 'Файл ещё не готов.');
      response.setHeader('Content-Type', 'application/gpx+xml');
      response.setHeader('Content-Disposition', contentDisposition(gpx.filename));
      response.setHeader('Cache-Control', 'private, no-store');
      response.on?.('close', () => { if (!response.writableEnded) gpx.stream.destroy?.(); });
      gpx.stream.on('error', (streamError) => {
        request.log?.error({ event: 'track_file_delivery_failed', kind: 'gpx', stage: 'stream',
          ...safeErrorDetails(streamError) }, 'Track GPX delivery failed');
        response.destroy?.();
      });
      gpx.stream.pipe(response);
    },

    async analysis(request, response) {
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      if (delivery === 'nginx') return nginxFile(request, response, publicId, 'analysis');
      if (request.method === 'HEAD' && trackService.fileDescriptor) {
        const descriptor = await trackService.fileDescriptor(publicId, 'analysis');
        if (!descriptor) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
        if (!descriptor.key) return error(response, 409, 'TRACK_ANALYSIS_NOT_READY', 'Анализ ещё не готов.');
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'private, no-store');
        return response.status(200).end();
      }
      let result;
      try { result = await trackService.getPublicAnalysis(publicId); }
      catch (readError) {
        request.log?.error({ event: 'track_file_delivery_failed', kind: 'analysis', stage: 'open',
          ...safeErrorDetails(readError) }, 'Track analysis delivery failed');
        return error(response, 502, 'TRACK_FILE_UNAVAILABLE', 'Анализ временно недоступен.');
      }
      if (!result) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      if (result.unavailable) return error(response, 409, 'TRACK_ANALYSIS_NOT_READY', 'Анализ ещё не готов.');
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'private, no-store');
      response.on?.('close', () => { if (!response.writableEnded) result.stream.destroy?.(); });
      result.stream.on('error', (streamError) => {
        request.log?.error({ event: 'track_file_delivery_failed', kind: 'analysis', stage: 'stream',
          ...safeErrorDetails(streamError) }, 'Track analysis delivery failed');
        response.destroy?.();
      });
      result.stream.pipe(response);
    },

    async upload(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId, tier } = identity;
      const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!GPX_CONTENT_TYPES.has(contentType)) {
        error(response, 415, 'UNSUPPORTED_GPX_TYPE', 'Выберите GPX-файл.');
        return;
      }
      const filename = filenameFromRequest(request);
      if (!filename) {
        error(response, 422, 'INVALID_GPX_FILENAME', 'Имя файла должно оканчиваться на .gpx.');
        return;
      }
      const routeType = String(request.headers['x-track-type'] || '');
      if (!isRouteType(routeType)) {
        error(response, 422, 'INVALID_ROUTE_TYPE', 'Выберите тип маршрута.');
        return;
      }
      const declaredBytes = Number(request.headers['content-length']);
      if (Number.isFinite(declaredBytes) && declaredBytes > TRACK_UPLOAD_LIMITS.maxBytes) {
        error(response, 413, 'GPX_FILE_TOO_LARGE', 'GPX-файл должен быть не больше 25 MiB.');
        return;
      }
      let uploadStage = 'quota_check';
      try {
        const status = await trackService.upload({ ownerId, tier, filename, routeType, source: request,
          profile: createRequestProfiler(request.log), onStage: (stage) => { uploadStage = stage; } });
        response.setHeader('Location', `/api/v1/tracks/${status.id}/status`);
        send(response, 202, { data: status });
      } catch (uploadError) {
        if (uploadError instanceof GpxFileTooLargeError) {
          error(response, 413, uploadError.code, 'GPX-файл должен быть не больше 25 MiB.');
          return;
        }
        if (uploadError instanceof TrackLimitReachedError) {
          error(response, 409, uploadError.code, `Достигнут лимит: ${uploadError.limit} треков.`);
          return;
        }
        request.log?.error({ event: 'track_upload_failed', stage: uploadStage,
          ...safeErrorDetails(uploadError) }, 'Track upload failed');
        error(response, 500, 'UPLOAD_FAILED', 'Не удалось сохранить GPX-файл. Попробуйте снова.');
      }
    },

    async status(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const status = await trackService.getStatus({ publicId, ownerId });
      return status
        ? send(response, 200, { data: status })
        : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async retry(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const publicId = isPublicId(request.params.id) ? request.params.id : null;
      if (!publicId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      let status;
      try { status = await trackService.retryAnalysis({ publicId, ownerId }); }
      catch (retryError) {
        if (retryError?.code === 'TRACK_NOT_FOUND') return error(response, 404, 'TRACK_NOT_FOUND');
        throw retryError;
      }
      return status
        ? send(response, 202, { data: status })
        : error(response, 409, 'ANALYSIS_NOT_RETRYABLE', 'Для этого трека сейчас нельзя повторить анализ.');
    },
  };
}
