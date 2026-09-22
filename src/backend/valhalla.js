const DEFAULT_URL = 'https://valhalla1.openstreetmap.de/trace_attributes';
const MAX_INPUT_POINTS = 20_000;
const ALLOWED_SURFACES = new Set(['paved_smooth', 'paved', 'paved_rough', 'compacted', 'dirt', 'gravel', 'path', 'impassable']);
const ALLOWED_MATCH_TYPES = new Set(['matched', 'interpolated', 'unmatched']);

export function validateMatchRequest(body) {
  if (!Array.isArray(body?.points) || body.points.length < 2) throw new Error('Нужно передать минимум две точки.');
  if (body.points.length > MAX_INPUT_POINTS) throw new Error('В треке слишком много точек.');
  return body.points.map((point) => {
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error('Трек содержит некорректные координаты.');
    }
    return { lat, lon };
  });
}

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

export async function matchTrackWithValhalla(points, { endpoint = process.env.VALHALLA_URL || DEFAULT_URL, signal } = {}) {
  const { payload, originalIndexes } = createValhallaPayload(points);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`Valhalla HTTP ${response.status}`);
  return normalizeValhallaMatch(await response.json(), originalIndexes);
}

export async function fetchTrackElevations(points, {
  endpoint = process.env.ELEVATION_URL || process.env.VALHALLA_URL || DEFAULT_URL,
  signal,
  fetchImplementation = fetch,
} = {}) {
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/height')) url.pathname = url.pathname.replace(/\/trace_attributes\/?$/, '/height');
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
