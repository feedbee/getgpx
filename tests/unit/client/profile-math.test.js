import { describe, expect, it } from 'vitest';
import { areaPathFromCoordinates, elevationGainLoss, nearestRoutePointIndex, pointIndexAtRatio, pointerRatioInPlot, visibleRangeIndices } from '../../../src/client/domain/profile-math.js';

describe('areaPathFromCoordinates', () => {
  it('closes a profile segment against the chart baseline', () => {
    expect(areaPathFromCoordinates([{ x: 12, y: 80 }, { x: 36, y: 42 }], 264))
      .toBe('M12.0,80.0 L36.0,42.0 L36.0,264 L12.0,264 Z');
  });

  it('does not draw an area for fewer than two coordinates', () => {
    expect(areaPathFromCoordinates([{ x: 12, y: 80 }], 264)).toBe('');
  });
});

describe('visibleRangeIndices', () => {
  it('clips a terrain range to the visible profile window', () => {
    expect(visibleRangeIndices({ startIndex: 2, endIndex: 8 }, 4, 10)).toEqual([4, 8]);
  });

  it('rejects ranges without a visible line segment', () => {
    expect(visibleRangeIndices({ startIndex: 2, endIndex: 3 }, 4, 10)).toBeNull();
    expect(visibleRangeIndices({ startIndex: 4, endIndex: 4 }, 4, 10)).toBeNull();
  });
});

describe('pointerRatioInPlot', () => {
  it('maps the full SVG width to zero and one', () => {
    expect(pointerRatioInPlot(100, 100, 1000)).toBe(0);
    expect(pointerRatioInPlot(1100, 100, 1000)).toBe(1);
    expect(pointerRatioInPlot(350, 100, 1000)).toBe(0.25);
    expect(pointerRatioInPlot(600, 100, 1000)).toBe(0.5);
  });

  it('clamps pointer positions outside the plot area', () => {
    expect(pointerRatioInPlot(50, 100, 1000)).toBe(0);
    expect(pointerRatioInPlot(1200, 100, 1000)).toBe(1);
  });
});

describe('pointIndexAtRatio', () => {
  it('selects by accumulated distance rather than assuming evenly spaced GPX points', () => {
    const points = [0, 0.1, 0.2, 0.3, 1].map((distanceKm) => ({ distanceKm }));

    expect(pointIndexAtRatio(points, 0, 4, 0.5)).toBe(3);
  });

  it('keeps exact range endpoints', () => {
    const points = [0, 0.2, 1].map((distanceKm) => ({ distanceKm }));
    expect(pointIndexAtRatio(points, 0, 2, 0)).toBe(0);
    expect(pointIndexAtRatio(points, 0, 2, 1)).toBe(2);
  });
});

describe('elevationGainLoss', () => {
  const points = [100, 118, 110, 125, 121].map((ele) => ({ ele }));

  it('calculates ascent and descent only inside the selected range', () => {
    expect(elevationGainLoss(points, 1, 4)).toEqual({ ascentM: 15, descentM: 12 });
  });

  it('ignores intervals without two valid elevation values', () => {
    expect(elevationGainLoss([{ ele: 10 }, { ele: null }, { ele: 16 }], 0, 2)).toEqual({ ascentM: 0, descentM: 0 });
  });
});

describe('nearestRoutePointIndex', () => {
  it('places a point of interest at the closest route point', () => {
    const points = [
      { lat: 50, lon: 19, distanceKm: 0 },
      { lat: 50.1, lon: 19.1, distanceKm: 5 },
      { lat: 50.2, lon: 19.2, distanceKm: 10 },
    ];

    expect(nearestRoutePointIndex(points, { lat: 50.11, lon: 19.09 })).toBe(1);
  });

  it('returns no index for invalid coordinates or an empty route', () => {
    expect(nearestRoutePointIndex([], { lat: 50, lon: 19 })).toBe(-1);
    expect(nearestRoutePointIndex([{ lat: 50, lon: 19 }], { lat: Number.NaN, lon: 19 })).toBe(-1);
  });
});
