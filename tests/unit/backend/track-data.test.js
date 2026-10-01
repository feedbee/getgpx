import { describe, expect, it } from 'vitest';
import { BSON } from 'mongodb';
import { trackData, analysisDocument } from '../../../src/backend/track-data.js';
import { analyzeGpxSource } from '../../../src/backend/track-analysis.js';

describe('canonical track data', () => {
  it('shares metadata types with S3 and excludes presentation and route geometry from metadata', () => {
    const analysis = analyzeGpxSource('<gpx><trk><name>Original</name><trkseg><trkpt lat="50" lon="20"><ele>10</ele></trkpt><trkpt lat="51" lon="21"><ele>20</ele></trkpt></trkseg></trk></gpx>');
    analysis.climbs = [{ startKm: 0, endKm: 1, lengthM: 1000, gainM: 100, averageGrade: 10, score: 10000, label: 'terrain.category4', color: 'red', startIndex: 0, endIndex: 1 }];
    const metadata = trackData(analysis);
    const document = analysisDocument({ revision: 'one', analysis, completeness: 'PARTIAL', analysisSources: {} });
    for (const field of ['metrics', 'distributions', 'climbs', 'descents', 'pointsOfInterest']) expect(document[field]).toEqual(metadata[field]);
    expect(metadata).not.toHaveProperty('points');
    expect(metadata.climbs[0]).toEqual({ startKm: 0, endKm: 1, lengthM: 1000, elevationChangeM: 100,
      averageGradePercent: 10, score: 10000, category: '4' });
    expect(document.sourceName).toBe('Original');
    expect(document.points[0].elevationM).toBe(10);
    expect(document.metrics.speedKmh).toBe(20);
  });

  it('keeps large terrain and POI collections below MongoDB limits without truncation', () => {
    const data = trackData({ points: [{ lat: 50, lon: 20, distanceKm: 12 }],
      climbs: Array.from({ length: 10000 }, (_, startKm) => ({ startKm, endKm: startKm + 0.1,
        lengthM: 100, gainM: 12, averageGrade: 12, score: 1200 })),
      pointsOfInterest: Array.from({ length: 1000 }, (_, index) => ({ lat: 50, lon: 20, name: `Waypoint ${index}` })) });
    expect(data.climbs).toHaveLength(10000);
    expect(data.pointsOfInterest).toHaveLength(1000);
    expect(data.pointsOfInterest.at(-1)).toMatchObject({ name: 'Waypoint 999', distanceKm: 12 });
    expect(BSON.calculateObjectSize(data)).toBeLessThan(4 * 1024 * 1024);
  });
});
