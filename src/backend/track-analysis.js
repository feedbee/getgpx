import { createHash } from 'node:crypto';
import { analyzeTrack, parseGpx } from '../client/domain/gpx.js';
import { detectClimbs, detectDescents } from '../client/domain/climbs.js';
import { calculateSegmentGrades } from '../client/domain/gradient.js';
import { applyValhallaMatches, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes } from '../client/domain/surface.js';
import { fetchOsmWayTags, matchTrackWithValhalla } from './valhalla.js';
import { TRACK_UPLOAD_LIMITS } from './track-repository.js';

const DEFAULT_SPEED_KMH = 20;

function filenameTitle(filename) {
  const basename = String(filename || '').split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim();
  return basename || 'Маршрут без названия';
}

function cacheKey(points) {
  const hash = createHash('sha256');
  hash.update('road-enrichment:v1\0');
  points.forEach(({ lat, lon }) => hash.update(`${lat.toFixed(5)},${lon.toFixed(5)};`));
  return `road-enrichment:v1:${hash.digest('hex')}`;
}

function createPreview(points, maxPoints = 200) {
  const count = Math.min(maxPoints, points.length);
  const sampled = Array.from({ length: count }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(count - 1, 1))]);
  const minLat = Math.min(...sampled.map(({ lat }) => lat));
  const maxLat = Math.max(...sampled.map(({ lat }) => lat));
  const minLon = Math.min(...sampled.map(({ lon }) => lon));
  const maxLon = Math.max(...sampled.map(({ lon }) => lon));
  const latRange = Math.max(maxLat - minLat, Number.EPSILON);
  const lonRange = Math.max(maxLon - minLon, Number.EPSILON);
  return {
    viewBox: '0 0 100 100',
    points: sampled.map(({ lat, lon }) => [
      Number((((lon - minLon) / lonRange) * 100).toFixed(2)),
      Number((100 - ((lat - minLat) / latRange) * 100).toFixed(2)),
    ]),
  };
}

export function analyzeGpxSource(xml, { filename, maxPersistedPoints = 10_000 } = {}) {
  const track = analyzeTrack(parseGpx(xml, {
    fallbackName: filenameTitle(filename),
    maxPoints: TRACK_UPLOAD_LIMITS.maxPoints,
  }));
  const effectiveSpeedKmh = track.movingAverageSpeedKmh || DEFAULT_SPEED_KMH;
  const estimatedDurationMs = track.movingTimeMs
    || (track.distanceKm / effectiveSpeedKmh) * 3_600_000;
  const pointLimit = Math.max(2, maxPersistedPoints);
  const sourcePointCount = track.points.length;
  const points = sourcePointCount <= pointLimit
    ? track.points
    : Array.from({ length: pointLimit }, (_, index) => track.points[Math.round(index * (sourcePointCount - 1) / (pointLimit - 1))]);
  return { ...track, points, sourcePointCount, effectiveSpeedKmh, estimatedDurationMs, preview: createPreview(points) };
}

export async function enrichTrackAnalysis(baseAnalysis, {
  matchTrack = matchTrackWithValhalla,
  fetchWayTags = fetchOsmWayTags,
  cache,
  signal,
} = {}) {
  const key = cacheKey(baseAnalysis.points);
  const cached = await cache?.get(key);
  let matches = Array.isArray(cached) ? cached : cached?.matches;
  // Legacy cache entries did not record whether Overpass completed, so they
  // are safe Valhalla checkpoints rather than proof of full enrichment.
  let enrichmentSource = Array.isArray(cached) ? 'VALHALLA' : cached?.source;
  if (!matches) {
    matches = await matchTrack(baseAnalysis.points, { signal });
    enrichmentSource = 'VALHALLA';
    await cache?.put(key, { matches, source: enrichmentSource });
  }
  if (enrichmentSource !== 'VALHALLA_OSM') {
    try {
      matches = await fetchWayTags(matches, { signal });
      enrichmentSource = 'VALHALLA_OSM';
      await cache?.put(key, { matches, source: enrichmentSource });
    } catch {
      enrichmentSource = 'VALHALLA';
    }
  }

  let points = applyValhallaMatches(baseAnalysis.points, matches);
  const grades = calculateSegmentGrades(points);
  points = points.map((point, index) => ({ ...point, grade: grades[index] }));
  return {
    ...baseAnalysis,
    enrichmentSource,
    points,
    climbs: detectClimbs(points),
    descents: detectDescents(points),
    surfaces: summarizeSurfaces(points),
    roadQualities: summarizeRoadQuality(points),
    wayTypes: summarizeWayTypes(points),
    preview: createPreview(points),
  };
}
