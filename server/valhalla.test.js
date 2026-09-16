import { describe, expect, it } from 'vitest';
import { createValhallaPayload, normalizeValhallaMatch, validateMatchRequest } from './valhalla.js';

describe('validateMatchRequest', () => {
  it('accepts a bounded coordinate list and rejects malformed or oversized input', () => {
    expect(validateMatchRequest({ points: [{ lat: 52.2, lon: 21 }, { lat: 52.3, lon: 21.1 }] })).toHaveLength(2);
    expect(() => validateMatchRequest({ points: [{ lat: 120, lon: 21 }, { lat: 52, lon: 21 }] })).toThrow(/координат/i);
    expect(() => validateMatchRequest({ points: Array.from({ length: 20_001 }, () => ({ lat: 52, lon: 21 })) })).toThrow(/слишком много/i);
  });
});

describe('createValhallaPayload', () => {
  it('downsamples long tracks while preserving first and last original indexes', () => {
    const points = Array.from({ length: 1001 }, (_, index) => ({ lat: 52 + index / 100_000, lon: 21 }));

    const { payload, originalIndexes } = createValhallaPayload(points, { maxPoints: 100 });

    expect(payload.shape).toHaveLength(100);
    expect(originalIndexes[0]).toBe(0);
    expect(originalIndexes.at(-1)).toBe(1000);
    expect(payload.filters.attributes).toContain('matched.edge_index');
  });
});

describe('normalizeValhallaMatch', () => {
  it('returns safe edge attributes for every sampled input point', () => {
    const response = {
      edges: [
        { surface: 'paved_smooth', road_class: 'secondary', use: 'road', length: 1.2, way_id: 12345 },
        { surface: 'gravel', road_class: 'service_other', use: 'track', length: 0.7 },
      ],
      matched_points: [{ edge_index: 0, type: 'matched' }, { edge_index: 1, type: 'interpolated' }],
    };

    expect(normalizeValhallaMatch(response, [0, 10])).toEqual([
      { pointIndex: 0, surface: 'paved_smooth', roadClass: 'secondary', use: 'road', matchType: 'matched', wayId: 12345 },
      { pointIndex: 10, surface: 'gravel', roadClass: 'service_other', use: 'track', matchType: 'interpolated', wayId: null },
    ]);
  });

  it('rejects malformed third-party responses', () => {
    expect(() => normalizeValhallaMatch({ edges: [], matched_points: [{ edge_index: 8 }] }, [0])).toThrow(/Valhalla/i);
  });

  it('uses the nearest matched edge for isolated unmatched samples', () => {
    const response = {
      edges: [{ surface: 'paved_smooth', road_class: 'secondary', use: 'road', way_id: 99 }],
      matched_points: [{ edge_index: 0, type: 'matched' }, { edge_index: -1, type: 'unmatched' }],
    };

    expect(normalizeValhallaMatch(response, [0, 1])[1]).toMatchObject({
      pointIndex: 1, surface: 'paved_smooth', wayId: 99, matchType: 'unmatched',
    });
  });
});
