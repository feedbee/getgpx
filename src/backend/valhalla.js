import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_URL = 'https://valhalla1.openstreetmap.de/trace_attributes';
const DEFAULT_MAX_SEGMENT_KM = 200;
const MAX_CONCURRENT_MATCH_REQUESTS = 2;
const PUBLIC_REQUEST_INTERVAL_MS = 1_000;
let nextPublicRequestAt = 0;
const ALLOWED_SURFACES = new Set(['paved_smooth', 'paved', 'paved_rough', 'compacted', 'dirt', 'gravel', 'path', 'impassable']);
const ALLOWED_MATCH_TYPES = new Set(['matched', 'interpolated', 'unmatched']);

export function createValhallaPayload(points, { maxPoints = 2_000 } = {}) {
  const count = Math.min(maxPoints, points.length);
  const originalIndexes = Array.from({ length: count }, (_, index) => Math.round(index * (points.length - 1) / Math.max(count - 1, 1)));
  return {
    originalIndexes,
    payload: {
      shape: originalIndexes.map((index) => points[index]),
      costing: 'bicycle',
      shape_match: 'map_snap',
      filters: {
        action: 'include',
        attributes: ['edge.surface', 'edge.road_class', 'edge.use', 'edge.length', 'edge.way_id', 'matched.edge_index', 'matched.type'],
      },
    },
  };
}

function distanceKm(first, second) {
  const radians = Math.PI / 180;
  const latitude = (second.lat - first.lat) * radians;
  const longitude = (second.lon - first.lon) * radians;
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(first.lat * radians) * Math.cos(second.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

function splitValhallaPayload(payload, originalIndexes, maxDistanceKm) {
  if (payload.shape.length < 2) return [{ payload, originalIndexes }];
  const chunks = [];
  for (let start = 0; start < payload.shape.length - 1;) {
    let end = start + 1;
    let lengthKm = distanceKm(payload.shape[start], payload.shape[end]);
    while (end + 1 < payload.shape.length) {
      const nextKm = distanceKm(payload.shape[end], payload.shape[end + 1]);
      if (lengthKm + nextKm > maxDistanceKm) break;
      lengthKm += nextKm;
      end += 1;
    }
    chunks.push({ payload: { ...payload, shape: payload.shape.slice(start, end + 1) },
      originalIndexes: originalIndexes.slice(start, end + 1) });
    start = end;
  }
  return chunks;
}

function configuredMaxSegmentKm() {
  const value = Number(process.env.VALHALLA_MAX_SEGMENT_KM);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_SEGMENT_KM;
}

async function waitForPublicRequestSlot(endpoint, signal) {
  if (!/^valhalla\d*\.openstreetmap\.de$/.test(new URL(endpoint).hostname)) return;
  const now = Date.now();
  const startAt = Math.max(now, nextPublicRequestAt);
  nextPublicRequestAt = startAt + PUBLIC_REQUEST_INTERVAL_MS;
  if (startAt > now) await delay(startAt - now, undefined, { signal });
}

function safeEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

export function normalizeValhallaMatch(response, originalIndexes) {
  if (!Array.isArray(response?.edges) || !Array.isArray(response?.matched_points) || response.matched_points.length !== originalIndexes.length) {
    throw new Error('Valhalla вернула некорректный ответ.');
  }
  const validMatches = response.matched_points.map((match, index) => ({ index, edgeIndex: Number(match?.edge_index) }))
    .filter(({ edgeIndex }) => Number.isInteger(edgeIndex) && response.edges[edgeIndex] && typeof response.edges[edgeIndex] === 'object');
  if (!validMatches.length) throw new Error('Valhalla не сопоставила часть маршрута.');
  return response.matched_points.map((match, index) => {
    const requestedEdgeIndex = Number(match?.edge_index);
    const nearest = validMatches.reduce((best, candidate) => (
      Math.abs(candidate.index - index) < Math.abs(best.index - index) ? candidate : best
    ));
    const edgeIndex = Number.isInteger(requestedEdgeIndex) && response.edges[requestedEdgeIndex] ? requestedEdgeIndex : nearest.edgeIndex;
    const edge = response.edges[edgeIndex];
    return {
      pointIndex: originalIndexes[index],
      surface: safeEnum(edge.surface, ALLOWED_SURFACES, 'path'),
      roadClass: typeof edge.road_class === 'string' && edge.road_class.length <= 40 ? edge.road_class : null,
      use: typeof edge.use === 'string' && edge.use.length <= 40 ? edge.use : null,
      matchType: safeEnum(match.type, ALLOWED_MATCH_TYPES, 'unmatched'),
      wayId: Number.isSafeInteger(Number(edge.way_id)) && Number(edge.way_id) > 0 ? Number(edge.way_id) : null,
    };
  });
}

export async function fetchOsmWayTags(matches, { endpoint = process.env.OVERPASS_URL, signal } = {}) {
  const wayIds = [...new Set(matches.map((match) => match.wayId).filter(Number.isSafeInteger))];
  if (!wayIds.length) return matches;
  const query = `[out:json][timeout:25];way(id:${wayIds.join(',')});out tags;`;
  const endpoints = endpoint ? [endpoint] : [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let payload;
  let lastError;
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'user-agent': 'getgpx/0.1 surface-enrichment', accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      payload = await response.json();
      break;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }
  if (!payload) throw lastError || new Error('Overpass unavailable');
  const tagsByWay = new Map((payload?.elements || []).filter((item) => item?.type === 'way' && Number.isSafeInteger(item.id))
    .map((item) => [item.id, sanitizeOsmTags(item.tags)]));
  return matches.map((match) => ({ ...match, osmTags: tagsByWay.get(match.wayId) || null }));
}

function sanitizeOsmTags(tags = {}) {
  const allowed = ['surface', 'highway', 'smoothness', 'tracktype'];
  return Object.fromEntries(allowed.filter((key) => typeof tags[key] === 'string' && tags[key].length <= 80)
    .map((key) => [key, tags[key]]));
}

export async function matchTrackWithValhalla(points, {
  endpoint = process.env.VALHALLA_URL || DEFAULT_URL,
  signal,
  fetchImplementation = fetch,
  maxDistanceKm = configuredMaxSegmentKm(),
} = {}) {
  const { payload, originalIndexes } = createValhallaPayload(points);
  const chunks = splitValhallaPayload(payload, originalIndexes, maxDistanceKm);
  const results = new Array(chunks.length);
  let nextChunk = 0;
  let failed = false;
  async function worker() {
    while (nextChunk < chunks.length && !failed) {
      const index = nextChunk++;
      const chunk = chunks[index];
      try {
        await waitForPublicRequestSlot(endpoint, signal);
        if (failed) return;
        const response = await fetchImplementation(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(chunk.payload),
          signal,
        });
        if (!response.ok) throw new Error(`Valhalla HTTP ${response.status}`);
        results[index] = normalizeValhallaMatch(await response.json(), chunk.originalIndexes);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_MATCH_REQUESTS, chunks.length) }, worker));
  return results.flatMap((matches, index) => (index ? matches.slice(1) : matches));
}

export async function fetchTrackElevations(points, {
  endpoint = process.env.ELEVATION_URL || process.env.VALHALLA_URL || DEFAULT_URL,
  signal,
  fetchImplementation = fetch,
} = {}) {
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/height')) url.pathname = url.pathname.replace(/\/trace_attributes\/?$/, '/height');
  await waitForPublicRequestSlot(url.toString(), signal);
  const response = await fetchImplementation(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shape: points.map(({ lat, lon }) => ({ lat, lon })), height_precision: 1 }),
    signal,
  });
  if (!response.ok) throw new Error(`Valhalla elevation HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.height) || payload.height.length !== points.length) {
    throw new Error('Valhalla вернула некорректные данные высот.');
  }
  return payload.height.map((height) => (Number.isFinite(height) ? height : null));
}
