import { nearestRoutePointIndex } from '../client/domain/profile-math.js';

// Canonical data shared by MongoDB metadata and the immutable S3 analysis.
// Presentation labels and colors belong to the website.
const metricsFields = ['distanceKm', 'ascentM', 'descentM', 'minElevationM', 'maxElevationM',
  'estimatedDurationMs', 'durationMs', 'movingTimeMs', 'movingAverageSpeedKmh', 'averageSpeedKmh'];
const distribution = (items = []) => items.map(({ id, distanceKm, percent }) => ({ id, distanceKm, percent }));
const terrain = (items = []) => items.map(({ startKm, endKm, lengthM, gainM, dropM, averageGrade, score }) => ({
  startKm, endKm, lengthM, elevationChangeM: dropM ?? gainM, averageGradePercent: averageGrade,
  score, category: score >= 64000 ? 'hc' : score >= 48000 ? '1' : score >= 32000 ? '2'
    : score >= 16000 ? '3' : score >= 8000 ? '4' : 'uncategorized',
}));

export function trackData(analysis) {
  return {
    metrics: { ...Object.fromEntries(metricsFields.map((field) => [field, analysis[field] ?? null])),
      speedKmh: analysis.effectiveSpeedKmh ?? null, hasElevation: Boolean(analysis.hasElevation) },
    distributions: { surfaces: distribution(analysis.surfaces), roadQualities: distribution(analysis.roadQualities),
      wayTypes: distribution(analysis.wayTypes) },
    climbs: terrain(analysis.climbs), descents: terrain(analysis.descents),
    pointsOfInterest: (analysis.pointsOfInterest || []).map((point) => {
      const { lat, lon, name, nameGenerated, type, symbol } = point;
      const index = nearestRoutePointIndex(analysis.points || [], point);
      return { lat, lon, name, nameGenerated: Boolean(nameGenerated), type, symbol,
        distanceKm: index < 0 ? null : analysis.points[index].distanceKm ?? null };
    }),
  };
}

export function analysisDocument({ revision, analysis, completeness, analysisSources }) {
  return { revision, sourceName: analysis.name, completeness, sources: analysisSources, ...trackData(analysis),
    points: analysis.points.map(({ lat, lon, ele, time, distanceKm, grade, surface }) => ({
      lat, lon, elevationM: ele ?? null, time: time ?? null, distanceKm, gradePercent: grade ?? null,
      ...(surface ? { surface: { id: surface.id, raw: surface.raw ?? null, highway: surface.highway ?? null,
        smoothness: surface.smoothness ?? null, tracktype: surface.tracktype ?? null,
        quality: surface.quality.id, inferred: Boolean(surface.inferred) } } : {}),
    })),
  };
}
