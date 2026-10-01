import { describe, expect, it } from 'vitest';
import { elevationColor, elevationGradientStops, colorRunsForMode, profileColorRuns } from '../../../src/client/domain/route-color.js';

describe('absolute elevation coloring', () => {
  it('anchors sea level and Everest and clamps heights outside the scale', () => {
    expect(elevationColor(0)).toBe('#3569b0');
    expect(elevationColor(-100)).toBe(elevationColor(0));
    expect(elevationColor(8849)).toBe('#c23b36');
    expect(elevationColor(10000)).toBe(elevationColor(8849));
    expect(elevationColor(null)).toBe('#8c918b');
  });
  it('interpolates instead of assigning altitude bands', () => {
    expect(elevationColor(100)).not.toBe(elevationColor(200));
    expect(elevationColor(8849 / 10)).toBe('#3c83ae');
    const points = [0, 100, 200].map(ele => ({ ele, grade: 0 }));
    expect(profileColorRuns(points, 'elevation').area).toEqual(colorRunsForMode(points, 'gradient'));
    expect(colorRunsForMode(points, 'elevation')[0]).toMatchObject({ startColor: elevationColor(0, { min: 0, max: 200 }), color: elevationColor(100, { min: 0, max: 200 }) });
  });
  it('adds local contrast while keeping low routes cooler than high routes', () => {
    const low = { min: 500, max: 800 };
    const high = { min: 7000, max: 7300 };
    expect(elevationColor(500, low)).not.toBe(elevationColor(600, low));
    expect(elevationColor(600, low)).not.toBe(elevationColor(800, low));
    expect(elevationColor(800, low)).not.toBe('#c23b36');
    expect(elevationColor(800, low)).not.toBe(elevationColor(800));
    expect(elevationColor(800, low)).toBe(elevationColor(800 * 0.3 + 8849 * 0.7));
    expect(elevationColor(500, low)).toBe(elevationColor(500 * 0.3));
    expect(elevationColor(7000, high)).not.toBe(elevationColor(500, low));
    expect(elevationColor(7300, high)).not.toBe(elevationColor(800, low));
    expect(elevationColor(500, { min: 500, max: 500 })).toBe(elevationColor(500));
    expect(elevationColor(0, { min: -100, max: 800 })).toBe(elevationColor(0));
    expect(elevationColor(8849, high)).toBe('#c23b36');
    const stops = elevationGradientStops(500, 800, low);
    expect(stops[0].color).toBe(elevationColor(500, low));
    expect(stops.at(-1).color).toBe(elevationColor(800, low));
    expect(elevationGradientStops(800, 500, low).map(stop => stop.color)).toEqual(stops.map(stop => stop.color).reverse());
  });

  it('preserves palette anchors when rendering a smooth gradient', () => {
    const stops = elevationGradientStops(0, 8849);
    expect(stops).toHaveLength(6);
    expect(stops[0]).toEqual({ offset: 0, color: elevationColor(0) });
    expect(stops.at(-1)).toEqual({ offset: 1, color: elevationColor(8849) });
    expect(elevationGradientStops(100, 100)).toEqual([{ offset: 0, color: elevationColor(100) }, { offset: 1, color: elevationColor(100) }]);
    expect(colorRunsForMode([], 'elevation')).toEqual([]);
  });
});
