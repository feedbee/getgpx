import { describe, expect, it } from 'vitest';
import { calculateSegmentGrades, gradientColor, groupGradientRuns } from '../../../src/client/domain/gradient.js';

describe('calculateSegmentGrades', () => {
  it('calculates a distance-smoothed grade for every route point', () => {
    const points = [
      { distanceKm: 0, ele: 100 },
      { distanceKm: 0.1, ele: 110 },
      { distanceKm: 0.2, ele: 120 },
    ];

    expect(calculateSegmentGrades(points, 100)).toEqual([10, 10, 10]);
  });
});

describe('gradientColor', () => {
  it('moves from cool downhill colors to dark red on steep gradients', () => {
    expect(gradientColor(-4)).toBe('#4f8f9d');
    expect(gradientColor(2)).toBe('#84a83f');
    expect(gradientColor(5)).toBe('#d6b737');
    expect(gradientColor(8)).toBe('#e47d32');
    expect(gradientColor(11)).toBe('#d64b3c');
    expect(gradientColor(15)).toBe('#8f2938');
  });
});

describe('groupGradientRuns', () => {
  it('groups adjacent map edges without shifting their gradient color', () => {
    const points = [{ grade: 0 }, { grade: 2 }, { grade: 5 }, { grade: 5 }];

    expect(groupGradientRuns(points)).toEqual([
      { startIndex: 0, endIndex: 1, color: '#84a83f' },
      { startIndex: 1, endIndex: 3, color: '#d6b737' },
    ]);
  });
});
