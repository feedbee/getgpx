import { describe, expect, it } from 'vitest';
import { elevationGainLoss, pointIndexAtRatio, pointerRatioInPlot } from './profile-math.js';

describe('pointerRatioInPlot', () => {
  it('maps the actual chart edges to zero and one instead of the container edges', () => {
    expect(pointerRatioInPlot(125, 100, 1000)).toBe(0);
    expect(pointerRatioInPlot(1075, 100, 1000)).toBe(1);
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
