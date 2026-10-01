import { describe, expect, it } from 'vitest';
import { analysisForView } from '../../../src/client/track-data.js';

describe('analysis transport to website', () => {
  it('preserves profile values, terrain selection, categories and edited speed/title', () => {
    const data = { sourceName: 'GPX name', metrics: { speedKmh: 20 },
      points: [0, 1, 2].map((distanceKm) => ({ lat: 50, lon: 20, distanceKm,
        elevationM: 100 + distanceKm, gradePercent: 5, surface: { id: 'asphalt', quality: 'good' } })),
      pointsOfInterest: [{ lat: 50, lon: 20, name: 'Water', distanceKm: 1 }],
      climbs: [{ startKm: 0, endKm: 1, elevationChangeM: 100, averageGradePercent: 10, score: 10000 }],
      descents: [{ startKm: 1, endKm: 2, elevationChangeM: 100, averageGradePercent: 10, score: 10000 }] };
    const view = analysisForView(data, { title: 'Edited', metrics: { speedKmh: 25 } });
    expect(view.name).toBe('Edited');
    expect(view.effectiveSpeedKmh).toBe(25);
    expect(view.points[1]).toMatchObject({ ele: 101, grade: 5, surface: { id: 'asphalt', quality: { id: 'good' } } });
    expect(view.climbs[0]).toMatchObject({ startIndex: 0, endIndex: 1, gainM: 100, averageGrade: 10, label: 'terrain.category4' });
    expect(view.descents[0]).toMatchObject({ startIndex: 1, endIndex: 2, dropM: 100 });
    expect(analysisForView(data).name).toBe('GPX name');
  });
});
