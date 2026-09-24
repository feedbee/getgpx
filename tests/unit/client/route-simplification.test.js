import { describe, expect, it } from 'vitest';
import { createRoutePreview, simplifyRoute } from '../../../src/client/domain/route-simplification.js';

describe('route simplification', () => {
  it('keeps a characteristic turn and the original point objects', () => {
    const points = Array.from({ length: 101 }, (_, index) => ({ lat: index === 50 ? 1 : 0, lon: index, ele: index }));
    const result = simplifyRoute(points, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(points[0]);
    expect(result[1]).toBe(points[50]);
    expect(result[2]).toBe(points[100]);
  });

  it('leaves a route within the budget untouched', () => {
    const points = [{ lat: 50, lon: 19 }, { lat: 51, lon: 20 }];
    expect(simplifyRoute(points, 2)).toBe(points);
  });

  it('keeps a wide route wide in the card preview', () => {
    const preview = createRoutePreview([{ lat: 50, lon: 10 }, { lat: 50.1, lon: 10.5 }, { lat: 50, lon: 11 }], 3);
    const width = Math.max(...preview.points.map((point) => point[0])) - Math.min(...preview.points.map((point) => point[0]));
    const height = Math.max(...preview.points.map((point) => point[1])) - Math.min(...preview.points.map((point) => point[1]));
    expect(width).toBeGreaterThan(height * 3);
  });
});
