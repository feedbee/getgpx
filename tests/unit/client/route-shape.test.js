import { describe, expect, it } from 'vitest';
import { endpointDistanceM, isClosedRoute } from '../../../src/client/domain/route-shape.js';

describe('isClosedRoute', () => {
  it('treats endpoints less than 10 metres apart as one start/finish point', () => {
    const points = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.00005 }];

    expect(endpointDistanceM(points)).toBeCloseTo(5.56, 1);
    expect(isClosedRoute(points)).toBe(true);
  });

  it('keeps separate A and B markers when endpoints are at least 10 metres apart', () => {
    const points = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }];

    expect(endpointDistanceM(points)).toBeGreaterThan(10);
    expect(isClosedRoute(points)).toBe(false);
  });
});
