import { createHash } from 'node:crypto';
import { analyzeTrack, parseGpx } from '../client/domain/gpx.js';
import { detectClimbs, detectDescents } from '../client/domain/climbs.js';
import { calculateSegmentGrades } from '../client/domain/gradient.js';
import { applyValhallaMatches, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes } from '../client/domain/surface.js';
import { fetchOsmWayTags, fetchTrackElevations, matchTrackWithValhalla } from './valhalla.js';
import { TRACK_UPLOAD_LIMITS } from './track-repository.js';
import { analysisFailure } from './analysis-warning.js';
import { logger } from './logger.js';
import { createRoutePreview, simplifyRoute } from '../client/domain/route-simplification.js';

const DEFAULT_SPEED_KMH = 20;

function filenameTitle(filename) {
  const basename = String(filename || '').split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim();
  return basename;
}

function cacheKey(points) {
  const hash = createHash('sha256');
  hash.update('road-enrichment:v1\0');
  points.forEach(({ lat, lon }) => hash.update(`${lat.toFixed(5)},${lon.toFixed(5)};`));
  return `road-enrichment:v1:${hash.digest('hex')}`;
}

export function analyzeGpxSource(xml, { filename, maxPersistedPoints = 10_000, previewMaxPoints = 200 } = {}) {
  const track = analyzeTrack(parseGpx(xml, {
    fallbackName: filenameTitle(filename),
    maxPoints: TRACK_UPLOAD_LIMITS.maxPoints,
  }));
  const effectiveSpeedKmh = track.movingAverageSpeedKmh || DEFAULT_SPEED_KMH;
  const estimatedDurationMs = track.movingTimeMs
    || (track.distanceKm / effectiveSpeedKmh) * 3_600_000;
  const pointLimit = Math.max(2, maxPersistedPoints);
  const sourcePointCount = track.points.length;
  const points = simplifyRoute(track.points, pointLimit);
  const elevationSource = points.every(({ ele }) => Number.isFinite(ele)) ? 'GPX'
    : points.some(({ ele }) => Number.isFinite(ele)) ? 'GPX_PARTIAL' : 'NONE';
  // Preview uses original geometry so turns discarded by the 10,000-point analysis cap remain available.
  return { ...track, points, sourcePointCount, effectiveSpeedKmh, estimatedDurationMs, elevationSource,
    preview: createRoutePreview(track.points, previewMaxPoints) };
}

export async function enrichTrackAnalysis(baseAnalysis, {
  matchTrack = matchTrackWithValhalla,
  fetchElevations = fetchTrackElevations,
  fetchWayTags = fetchOsmWayTags,
  cache,
  signal,
  warn = (details) => logger.warn(details, 'Track analysis warning'),
} = {}) {
  let analysis = baseAnalysis;
  if (baseAnalysis.points.some(({ ele }) => !Number.isFinite(ele))) {
    try {
      const elevations = await fetchElevations(baseAnalysis.points, { signal });
      const points = baseAnalysis.points.map((point, index) => ({
        ...point,
        ele: Number.isFinite(point.ele) ? point.ele : elevations[index],
      }));
      if (points.some(({ ele }, index) => ele !== baseAnalysis.points[index].ele && Number.isFinite(ele))) {
        analysis = { ...analyzeTrack({ ...baseAnalysis, points }), elevationSource: 'VALHALLA_DEM' };
      }
    } catch (error) {
      warn({ event: 'track_analysis_partial', step: 'ELEVATION', pointCount: baseAnalysis.points.length,
        ...analysisFailure(error, signal) });
      // Elevation is optional; road enrichment can still complete without DEM coverage.
    }
  }

  const key = cacheKey(analysis.points);
  const cached = await cache?.get(key);
  let matches = Array.isArray(cached) ? cached : cached?.matches;
  // Legacy cache entries did not record whether Overpass completed, so they
  // are safe Valhalla checkpoints rather than proof of full enrichment.
  let enrichmentSource = Array.isArray(cached) ? 'VALHALLA' : cached?.source;
  if (!matches) {
    matches = await matchTrack(analysis.points, { signal });
    enrichmentSource = 'VALHALLA';
    await cache?.put(key, { matches, source: enrichmentSource });
  }
  if (enrichmentSource !== 'VALHALLA_OSM') {
    try {
      matches = await fetchWayTags(matches, { signal });
      enrichmentSource = 'VALHALLA_OSM';
      await cache?.put(key, { matches, source: enrichmentSource });
    } catch (error) {
      warn({ event: 'track_analysis_partial', step: 'OVERPASS', matchCount: matches.length,
        ...analysisFailure(error, signal) });
      enrichmentSource = 'VALHALLA';
    }
  }

  let points = applyValhallaMatches(analysis.points, matches);
  const grades = calculateSegmentGrades(points);
  points = points.map((point, index) => ({ ...point, grade: grades[index] }));
  return {
    ...analysis,
    enrichmentSource,
    points,
    climbs: detectClimbs(points),
    descents: detectDescents(points),
    surfaces: summarizeSurfaces(points),
    roadQualities: summarizeRoadQuality(points),
    wayTypes: summarizeWayTypes(points),
    preview: baseAnalysis.preview,
  };
}
