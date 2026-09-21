import express, { Router } from 'express';
import { ObjectId } from 'mongodb';
import { sessionTokenFromRequest } from './auth.js';
import { GpxFileTooLargeError } from './gpx-file-store.js';
import { TRACK_UPLOAD_LIMITS } from './track-repository.js';
import { InvalidTrackCursorError, TrackLimitReachedError } from './track-service.js';
import { normalizeExternalTrackLinks } from './external-track-links.js';
import { isRouteType } from '../route-types.js';

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

export function createTrackHandlers(trackService, authService) {
  if (!trackService || !authService) throw new Error('Track and authentication services are required.');

  async function authenticatedOwner(request, response) {
    const user = await authService.getUser(sessionTokenFromRequest(request));
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

    async publicTrack(request, response) {
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const track = await trackService.getPublicTrack(trackId);
      return track
        ? send(response, 200, { data: track })
        : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async management(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const track = await trackService.getManagement({ trackId, ownerId });
      return track ? send(response, 200, { data: track }) : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async update(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const title = typeof request.body?.title === 'string' ? request.body.title.normalize('NFKC').trim() : '';
      const speedKmh = Number(request.body?.speedKmh);
      const routeType = request.body?.routeType;
      const externalLinks = normalizeExternalTrackLinks(request.body?.externalLinks);
      if (!title || title.length > 200) return error(response, 422, 'INVALID_TRACK_TITLE', 'Название должно содержать от 1 до 200 символов.');
      if (!Number.isFinite(speedKmh) || speedKmh < 1 || speedKmh > 50) return error(response, 422, 'INVALID_TRACK_SPEED', 'Скорость должна быть от 1 до 50 км/ч.');
      if (!isRouteType(routeType)) return error(response, 422, 'INVALID_ROUTE_TYPE', 'Выберите тип маршрута.');
      if (!externalLinks) return error(response, 422, 'INVALID_EXTERNAL_LINKS', 'Проверьте ссылки на внешние сервисы. Допустимы только HTTPS-ссылки на соответствующий сервис.');
      const track = await trackService.updateDetails({ trackId, ownerId, title, speedKmh, routeType, externalLinks });
      return track ? send(response, 200, { data: track }) : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async replace(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const filename = filenameFromRequest(request);
      if (!GPX_CONTENT_TYPES.has(contentType) || !filename) return error(response, 422, 'INVALID_GPX_FILE', 'Выберите GPX-файл.');
      try {
        const status = await trackService.replaceFile({ trackId, ownerId, filename, source: request });
        return status ? send(response, 202, { data: status }) : error(response, 409, 'REPLACEMENT_IN_PROGRESS', 'Замена этого трека уже выполняется.');
      } catch (replaceError) {
        if (replaceError instanceof GpxFileTooLargeError) return error(response, 413, replaceError.code, 'GPX-файл должен быть не больше 25 MiB.');
        return error(response, 500, 'REPLACEMENT_FAILED', 'Не удалось сохранить новый GPX-файл.');
      }
    },

    async remove(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const deleted = await trackService.deleteTrack({ trackId, ownerId });
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
      const trackIds = uniqueIds.map(objectId);
      if (trackIds.some((trackId) => !trackId)) {
        return error(response, 422, 'INVALID_TRACK_IDS', 'Список треков содержит некорректный идентификатор.');
      }
      const deletedIds = await trackService.deleteTracks({ trackIds, ownerId });
      return send(response, 200, { data: { deletedIds: deletedIds.map(String) } });
    },

    async download(request, response) {
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const download = await trackService.getPublicDownload(trackId);
      if (!download) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      response.setHeader('Content-Type', 'application/gpx+xml');
      response.setHeader('Content-Disposition', contentDisposition(download.filename));
      response.setHeader('Cache-Control', 'private, no-store');
      download.stream.on('error', () => response.destroy?.());
      download.stream.pipe(response);
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
      try {
        const status = await trackService.upload({ ownerId, tier, filename, routeType, source: request });
        response.setHeader('Location', `/api/tracks/${status.id}/status`);
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
        error(response, 500, 'UPLOAD_FAILED', 'Не удалось сохранить GPX-файл. Попробуйте снова.');
      }
    },

    async status(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const status = await trackService.getStatus({ trackId, ownerId });
      return status
        ? send(response, 200, { data: status })
        : error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
    },

    async retry(request, response) {
      const identity = await authenticatedOwner(request, response);
      if (!identity) return;
      const { ownerId } = identity;
      const trackId = objectId(request.params.id);
      if (!trackId) return error(response, 404, 'TRACK_NOT_FOUND', 'Трек не найден.');
      const status = await trackService.retryAnalysis({ trackId, ownerId });
      return status
        ? send(response, 202, { data: status })
        : error(response, 409, 'ANALYSIS_NOT_RETRYABLE', 'Для этого трека сейчас нельзя повторить анализ.');
    },
  };
}

export function createTrackRouter(trackService, authService) {
  const handlers = createTrackHandlers(trackService, authService);
  const router = Router();
  router.post('/api/tracks', handlers.upload);
  router.get('/api/tracks/mine', handlers.mine);
  router.delete('/api/tracks', express.json({ limit: '16kb' }), handlers.removeMany);
  router.get('/api/tracks/:id/status', handlers.status);
  router.get('/api/tracks/:id/manage', handlers.management);
  router.patch('/api/tracks/:id', express.json({ limit: '16kb' }), handlers.update);
  router.put('/api/tracks/:id/file', handlers.replace);
  router.post('/api/tracks/:id/retry-analysis', handlers.retry);
  router.delete('/api/tracks/:id', handlers.remove);
  router.get('/api/tracks/:id/download', handlers.download);
  router.get('/api/tracks/:id', handlers.publicTrack);
  return router;
}
