import { fetchOsmWayTags, matchTrackWithValhalla, validateMatchRequest } from './valhalla.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error('Запрос слишком большой.');
  }
  try { return JSON.parse(body); } catch { throw new Error('Некорректный JSON.'); }
}

export function valhallaMiddleware() {
  return async (request, response, next) => {
    if (request.url !== '/api/surface-match') return next();
    if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Используйте POST.' } });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const points = validateMatchRequest(await readJson(request));
      const valhallaMatches = await matchTrackWithValhalla(points, { signal: controller.signal });
      let matches = valhallaMatches;
      let source = 'valhalla';
      try {
        matches = await fetchOsmWayTags(valhallaMatches, { signal: controller.signal });
        source = 'valhalla+osm';
      } catch {
        // Valhalla data remains a useful fallback when Overpass is unavailable.
      }
      sendJson(response, 200, { data: { source, matches } });
    } catch (error) {
      const isInputError = /точ|координат|много|больш|JSON/.test(error.message);
      sendJson(response, isInputError ? 422 : 502, { error: { code: isInputError ? 'INVALID_TRACK' : 'MATCHING_UNAVAILABLE', message: isInputError ? error.message : 'Сервис сопоставления дорог временно недоступен.' } });
    } finally { clearTimeout(timeout); }
  };
}
