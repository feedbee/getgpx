import { describe, expect, it, vi } from 'vitest';
import { createValhallaPayload, fetchTrackElevations, normalizeValhallaMatch } from '../../../src/backend/valhalla.js';

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

describe('fetchTrackElevations', () => {
  it('loads DEM heights from the elevation endpoint derived from Valhalla URL', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ height: [101.2, null, 123.4] }),
    });

    const elevations = await fetchTrackElevations([
      { lat: 50, lon: 19 }, { lat: 50.01, lon: 19.01 }, { lat: 50.02, lon: 19.02 },
    ], {
      endpoint: 'https://valhalla.example/trace_attributes',
      fetchImplementation,
    });

    expect(elevations).toEqual([101.2, null, 123.4]);
    expect(fetchImplementation).toHaveBeenCalledWith('https://valhalla.example/height', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ shape: [
        { lat: 50, lon: 19 }, { lat: 50.01, lon: 19.01 }, { lat: 50.02, lon: 19.02 },
      ], height_precision: 1 }),
    }));
  });
});
