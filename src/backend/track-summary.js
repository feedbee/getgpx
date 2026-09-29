const distribution = (items) => (items || []).map(({ id, distanceKm, percent }) => ({
  id, distanceKm, percent,
}));

const terrain = (items) => (items || []).map(({ startKm, endKm, lengthM, gainM, dropM,
  averageGrade, score, label, color }) => ({
  startKm, endKm, lengthM, gainM, dropM, averageGrade, score, label, color,
}));

export function createTrackSummary(analysis, { analysisSources, completeness }) {
  let minElevationM = null;
  let maxElevationM = null;
  let elevationCount = 0;
  for (const point of analysis.points || []) {
    if (!Number.isFinite(point.ele)) continue;
    minElevationM = minElevationM === null ? point.ele : Math.min(minElevationM, point.ele);
    maxElevationM = maxElevationM === null ? point.ele : Math.max(maxElevationM, point.ele);
    elevationCount += 1;
  }
  const metrics = {
    distanceKm: analysis.distanceKm ?? null,
    ascentM: analysis.ascentM ?? null,
    descentM: analysis.descentM ?? null,
    minElevationM,
    maxElevationM,
    hasElevation: elevationCount > 1 && elevationCount === analysis.points?.length,
    effectiveSpeedKmh: analysis.effectiveSpeedKmh ?? null,
    estimatedDurationMs: analysis.estimatedDurationMs ?? null,
  };
  const pointsOfInterest = (analysis.pointsOfInterest || []).map((point) => {
    const routePointIndex = nearestRoutePointIndex(analysis.points || [], point);
    return {
      name: point.name,
      nameGenerated: point.nameGenerated,
      type: point.type,
      symbol: point.symbol,
      distanceKm: routePointIndex < 0 ? null : analysis.points[routePointIndex].distanceKm ?? null,
    };
  });
  return {
    metrics,
    distributions: {
      surfaces: distribution(analysis.surfaces),
      roadQualities: distribution(analysis.roadQualities),
      wayTypes: distribution(analysis.wayTypes),
    },
    climbs: terrain(analysis.climbs),
    descents: terrain(analysis.descents),
    pointsOfInterest,
    pointsOfInterestCount: pointsOfInterest.length,
    analysisSources,
    completeness,
  };
}
import { nearestRoutePointIndex } from '../client/domain/profile-math.js';
