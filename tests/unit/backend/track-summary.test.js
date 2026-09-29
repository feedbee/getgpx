import { describe, expect, it } from 'vitest';
import { BSON } from 'mongodb';
import { createTrackSummary } from '../../../src/backend/track-summary.js';

describe('track summary', () => {
  it('keeps route aggregates and terrain lists without point geometry', () => {
    const summary = createTrackSummary({
      distanceKm: 12, ascentM: 210, descentM: 180, effectiveSpeedKmh: 20,
      estimatedDurationMs: 2_160_000,
      points: [{ lat: 1, lon: 2, ele: 10, distanceKm: 0 }, { lat: 2, lon: 3, ele: 40, distanceKm: 12 }],
      surfaces: [{ id: 'gravel', label: 'surface.gravel', color: 'red', distanceKm: 12, percent: 100 }],
      climbs: [{ startIndex: 0, endIndex: 1, startKm: 0, endKm: 2, lengthM: 2000,
        gainM: 30, averageGrade: 3, label: 'terrain.category4', color: '#91aa39' }],
      pointsOfInterest: [{ lat: 1, lon: 2, name: 'Water', type: 'WATER' }],
    }, { analysisSources: { gpx: 'SUCCESS' }, completeness: 'FULL' });
    expect(summary).toMatchObject({ metrics: { distanceKm: 12, minElevationM: 10,
      maxElevationM: 40, hasElevation: true }, pointsOfInterestCount: 1,
    pointsOfInterest: [{ name: 'Water', type: 'WATER', distanceKm: 0 }],
    distributions: { surfaces: [{ id: 'gravel', distanceKm: 12, percent: 100 }] },
    climbs: [{ startKm: 0, endKm: 2, lengthM: 2000 }] });
    expect(JSON.stringify(summary)).not.toContain('lat');
    expect(JSON.stringify(summary)).not.toContain('startIndex');
  });

  it('keeps even a maximal terrain list well below MongoDB document limits without truncation', () => {
    const climbs = Array.from({ length: 10_000 }, (_, index) => ({
      startKm: index, endKm: index + 0.1, lengthM: 100, gainM: 12,
      averageGrade: 12, score: 1200, label: 'terrain.uncategorized', color: '#87a834',
    }));
    const summary = createTrackSummary({ points: [], climbs }, { analysisSources: {}, completeness: 'FULL' });
    expect(summary.climbs).toHaveLength(10_000);
    expect(BSON.calculateObjectSize(summary)).toBeLessThan(4 * 1024 * 1024);
  });

  it('keeps every POI label and route distance without storing its coordinates', () => {
    const pointsOfInterest = Array.from({ length: 1_000 }, (_, index) => ({
      lat: 2, lon: 3, name: `Waypoint ${index}`, type: 'WATER',
    }));
    const summary = createTrackSummary({
      points: [{ lat: 1, lon: 2, distanceKm: 0 }, { lat: 2, lon: 3, distanceKm: 12 }],
      pointsOfInterest,
    }, { analysisSources: {}, completeness: 'FULL' });
    expect(summary.pointsOfInterest).toHaveLength(1_000);
    expect(summary.pointsOfInterest.at(-1)).toMatchObject({ name: 'Waypoint 999', distanceKm: 12 });
    expect(summary.pointsOfInterest[0]).not.toHaveProperty('lat');
    expect(BSON.calculateObjectSize(summary)).toBeLessThan(1 * 1024 * 1024);
  });
});
