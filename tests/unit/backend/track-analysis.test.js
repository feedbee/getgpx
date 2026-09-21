import { describe, expect, it, vi } from 'vitest';
import { analyzeGpxSource, enrichTrackAnalysis } from '../../../src/backend/track-analysis.js';

const unnamedGpx = `
  <gpx><trk><trkseg>
    <trkpt lat="50" lon="19"><ele>100</ele></trkpt>
    <trkpt lat="50.01" lon="19.01"><ele>150</ele></trkpt>
  </trkseg></trk></gpx>
`;

describe('server track analysis', () => {
  it('uses the original filename and 20 km/h when timestamps are unavailable', () => {
    const analysis = analyzeGpxSource(unnamedGpx, { filename: 'Weekend Ride.gpx' });

    expect(analysis.name).toBe('Weekend Ride');
    expect(analysis.effectiveSpeedKmh).toBe(20);
    expect(analysis.estimatedDurationMs).toBeCloseTo((analysis.distanceKm / 20) * 3_600_000);
    expect(analysis.points).toHaveLength(2);
    expect(analysis.preview.points).toHaveLength(2);
  });

  it('keeps the calculated moving speed and duration when timestamps are available', () => {
    const analysis = analyzeGpxSource(`
      <gpx><trk><name>Timed ride</name><trkseg>
        <trkpt lat="50" lon="19"><ele>100</ele><time>2026-09-17T08:00:00Z</time></trkpt>
        <trkpt lat="50.01" lon="19.01"><ele>150</ele><time>2026-09-17T08:10:00Z</time></trkpt>
      </trkseg></trk></gpx>
    `, { filename: 'ignored.gpx' });

    expect(analysis.name).toBe('Timed ride');
    expect(analysis.effectiveSpeedKmh).toBeCloseTo(analysis.movingAverageSpeedKmh);
    expect(analysis.estimatedDurationMs).toBe(analysis.movingTimeMs);
  });

  it('calculates metrics from every point but bounds the persisted display geometry', () => {
    const analysis = analyzeGpxSource(`
      <gpx><trk><trkseg>
        <trkpt lat="50" lon="19"/><trkpt lat="50.01" lon="19.01"/><trkpt lat="50.02" lon="19.02"/>
      </trkseg></trk></gpx>
    `, { filename: 'ride.gpx', maxPersistedPoints: 2 });

    expect(analysis.sourcePointCount).toBe(3);
    expect(analysis.points).toHaveLength(2);
    expect(analysis.points[0]).toMatchObject({ lat: 50, lon: 19 });
    expect(analysis.points[1]).toMatchObject({ lat: 50.02, lon: 19.02 });
    expect(analysis.distanceKm).toBeGreaterThan(0);
  });

  it('keeps points of interest when persisted route geometry is reduced', () => {
    const analysis = analyzeGpxSource(`
      <gpx><wpt lat="50.005" lon="19.005"><name>Bakery</name></wpt><trk><trkseg>
        <trkpt lat="50" lon="19"/><trkpt lat="50.01" lon="19.01"/><trkpt lat="50.02" lon="19.02"/>
      </trkseg></trk></gpx>
    `, { filename: 'ride.gpx', maxPersistedPoints: 2 });

    expect(analysis.points).toHaveLength(2);
    expect(analysis.pointsOfInterest).toEqual([{
      lat: 50.005,
      lon: 19.005,
      name: 'Bakery',
      type: '',
      symbol: '',
    }]);
  });

  it('fills missing elevations from DEM data and recalculates elevation metrics', async () => {
    const base = analyzeGpxSource(`
      <gpx><trk><trkseg>
        <trkpt lat="50" lon="19"/><trkpt lat="50.01" lon="19.01"/><trkpt lat="50.02" lon="19.02"/>
      </trkseg></trk></gpx>
    `, { filename: 'ride.gpx' });
    const matches = base.points.map((_, pointIndex) => ({
      pointIndex, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: null,
    }));

    const result = await enrichTrackAnalysis(base, {
      fetchElevations: vi.fn().mockResolvedValue([100, 130, 115]),
      matchTrack: vi.fn().mockResolvedValue(matches),
      fetchWayTags: vi.fn().mockImplementation(async (value) => value),
    });

    expect(result.points.map(({ ele }) => ele)).toEqual([100, 130, 115]);
    expect(result).toMatchObject({ hasElevation: true, ascentM: 30, descentM: 15, elevationSource: 'VALHALLA_DEM' });
  });

  it('preserves GPX elevations without requesting DEM data', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const fetchElevations = vi.fn();
    const matches = base.points.map((_, pointIndex) => ({
      pointIndex, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: null,
    }));

    const result = await enrichTrackAnalysis(base, {
      fetchElevations,
      matchTrack: vi.fn().mockResolvedValue(matches),
      fetchWayTags: vi.fn().mockImplementation(async (value) => value),
    });

    expect(fetchElevations).not.toHaveBeenCalled();
    expect(result.elevationSource).toBe('GPX');
    expect(result.points.map(({ ele }) => ele)).toEqual([100, 150]);
  });

  it('keeps available GPX elevations and tolerates unavailable DEM data', async () => {
    const base = analyzeGpxSource(`
      <gpx><trk><trkseg>
        <trkpt lat="50" lon="19"><ele>95</ele></trkpt><trkpt lat="50.01" lon="19.01"/>
      </trkseg></trk></gpx>
    `, { filename: 'ride.gpx' });
    const matches = base.points.map((_, pointIndex) => ({
      pointIndex, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: null,
    }));

    const result = await enrichTrackAnalysis(base, {
      fetchElevations: vi.fn().mockRejectedValue(new Error('height unavailable')),
      matchTrack: vi.fn().mockResolvedValue(matches),
      fetchWayTags: vi.fn().mockImplementation(async (value) => value),
    });

    expect(result.points.map(({ ele }) => ele)).toEqual([95, null]);
    expect(result).toMatchObject({ hasElevation: false, elevationSource: 'GPX_PARTIAL' });
  });

  it('caches external matches and persists derived display data', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const matches = [
      { pointIndex: 0, surface: 'paved_smooth', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: 1 },
      { pointIndex: 1, surface: 'gravel', roadClass: 'tertiary', use: 'road', matchType: 'matched', wayId: 2 },
    ];
    const matchTrack = vi.fn().mockResolvedValue(matches);
    const fetchWayTags = vi.fn().mockImplementation(async (value) => value);
    const values = new Map();
    const cache = {
      get: async (key) => values.get(key) || null,
      put: async (key, value) => values.set(key, value),
    };

    const first = await enrichTrackAnalysis(base, { matchTrack, fetchWayTags, cache });
    const second = await enrichTrackAnalysis(base, { matchTrack, fetchWayTags, cache });

    expect(first.points[0].surface.id).toBe('asphalt');
    expect(first.points[1].surface.id).toBe('gravel');
    expect(first.surfaces.find(({ id }) => id === 'gravel').distanceKm).toBeGreaterThan(0);
    expect(first.enrichmentSource).toBe('VALHALLA_OSM');
    expect(first.preview.points).toHaveLength(2);
    expect(second).toEqual(first);
    expect(matchTrack).toHaveBeenCalledTimes(1);
    expect(fetchWayTags).toHaveBeenCalledTimes(1);
  });

  it('checkpoints successful Valhalla data but does not cache an Overpass failure as complete', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const matches = [
      { pointIndex: 0, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: 1 },
      { pointIndex: 1, surface: 'gravel', roadClass: 'tertiary', use: 'road', matchType: 'matched', wayId: 2 },
    ];

    const cache = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };
    const result = await enrichTrackAnalysis(base, {
      matchTrack: vi.fn().mockResolvedValue(matches),
      fetchWayTags: vi.fn().mockRejectedValue(new Error('Overpass unavailable')),
      cache,
    });

    expect(result.enrichmentSource).toBe('VALHALLA');
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledWith(expect.any(String), { matches, source: 'VALHALLA' });
  });

  it('keeps Valhalla data when the shared timeout interrupts only Overpass', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const controller = new AbortController();
    const matches = [
      { pointIndex: 0, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: 1 },
      { pointIndex: 1, surface: 'gravel', roadClass: 'track', use: 'track', matchType: 'matched', wayId: 2 },
    ];

    const result = await enrichTrackAnalysis(base, {
      signal: controller.signal,
      matchTrack: vi.fn().mockResolvedValue(matches),
      fetchWayTags: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new Error('aborted');
      }),
    });

    expect(result.enrichmentSource).toBe('VALHALLA');
    expect(result.wayTypes.length).toBeGreaterThan(0);
    expect(result.surfaces.find(({ id }) => id === 'gravel')).toBeDefined();
  });

  it('retries Overpass from a cached Valhalla match instead of accepting the partial cache as complete', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const matches = [
      { pointIndex: 0, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: 1 },
      { pointIndex: 1, surface: 'gravel', roadClass: 'track', use: 'track', matchType: 'matched', wayId: 2 },
    ];
    const enrichedMatches = matches.map((match) => ({ ...match, osmTags: { surface: 'asphalt', highway: 'residential' } }));
    const cache = { get: vi.fn().mockResolvedValue({ matches, source: 'VALHALLA' }), put: vi.fn() };
    const matchTrack = vi.fn();
    const fetchWayTags = vi.fn().mockResolvedValue(enrichedMatches);

    const result = await enrichTrackAnalysis(base, { cache, matchTrack, fetchWayTags });

    expect(matchTrack).not.toHaveBeenCalled();
    expect(fetchWayTags).toHaveBeenCalledWith(matches, { signal: undefined });
    expect(cache.put).toHaveBeenCalledWith(expect.any(String), { matches: enrichedMatches, source: 'VALHALLA_OSM' });
    expect(result.enrichmentSource).toBe('VALHALLA_OSM');
  });

  it('treats a legacy unversioned cache value as a resumable Valhalla checkpoint', async () => {
    const base = analyzeGpxSource(unnamedGpx, { filename: 'ride.gpx' });
    const matches = [
      { pointIndex: 0, surface: 'paved', roadClass: 'residential', use: 'road', matchType: 'matched', wayId: 1 },
      { pointIndex: 1, surface: 'gravel', roadClass: 'track', use: 'track', matchType: 'matched', wayId: 2 },
    ];
    const cache = { get: vi.fn().mockResolvedValue(matches), put: vi.fn() };
    const fetchWayTags = vi.fn().mockResolvedValue(matches);

    await enrichTrackAnalysis(base, { cache, matchTrack: vi.fn(), fetchWayTags });

    expect(fetchWayTags).toHaveBeenCalledWith(matches, { signal: undefined });
    expect(cache.put).toHaveBeenCalledWith(expect.any(String), { matches, source: 'VALHALLA_OSM' });
  });
});
