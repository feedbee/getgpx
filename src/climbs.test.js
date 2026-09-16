import { describe, expect, it } from 'vitest';
import { classifyClimb, detectClimbs, detectDescents } from './climbs.js';

function point(distanceM, ele) {
  return { distanceKm: distanceM / 1000, ele, lat: 50 + distanceM / 100_000, lon: 19 };
}

describe('detectClimbs', () => {
  it('detects Garmin-compatible climbs and calculates standard metrics', () => {
    const points = [
      point(0, 100), point(250, 112), point(500, 124), point(750, 136), point(1000, 148),
      point(1150, 120),
    ];

    const [climb] = detectClimbs(points);

    expect(climb).toMatchObject({ startIndex: 0, endIndex: 4, lengthM: 1000, gainM: 48 });
    expect(climb.averageGrade).toBeCloseTo(4.8, 1);
    expect(climb.score).toBe(4800);
  });

  it('keeps short dips inside one climb when the whole segment still qualifies', () => {
    const points = [
      point(0, 100), point(250, 125), point(500, 120), point(750, 150), point(1000, 170),
    ];

    const climbs = detectClimbs(points);

    expect(climbs).toHaveLength(1);
    expect(climbs[0]).toMatchObject({ startIndex: 0, endIndex: 4, gainM: 75 });
  });

  it('rejects rises shorter than 500 m or flatter than 3 percent', () => {
    expect(detectClimbs([point(0, 100), point(400, 140)])).toEqual([]);
    expect(detectClimbs([point(0, 100), point(1000, 125)])).toEqual([]);
  });

  it('splits climbs around a meaningful descent', () => {
    const points = [
      point(0, 100), point(600, 145), point(800, 110), point(1400, 160), point(1600, 120),
    ];

    const climbs = detectClimbs(points, { smoothingRadiusM: 0, splitDescentM: 25 });

    expect(climbs).toHaveLength(2);
    expect(climbs.map(({ startIndex, endIndex }) => [startIndex, endIndex])).toEqual([[0, 1], [2, 3]]);
  });
});

describe('classifyClimb', () => {
  it('uses Garmin climb-score category thresholds', () => {
    expect(classifyClimb(2_000).label).toBe('Без категории');
    expect(classifyClimb(9_000).label).toBe('Кат. 4');
    expect(classifyClimb(70_000).label).toBe('HC');
  });
});

describe('detectDescents', () => {
  it('detects meaningful descents and reports drop instead of gain', () => {
    const points = [point(0, 180), point(500, 160), point(1000, 130), point(1200, 165)];

    const [descent] = detectDescents(points);

    expect(descent).toMatchObject({ startIndex: 0, endIndex: 2, lengthM: 1000, dropM: 50 });
    expect(descent.averageGrade).toBeCloseTo(5, 1);
  });
});
