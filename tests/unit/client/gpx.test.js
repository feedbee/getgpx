import { describe, expect, it } from 'vitest';
import { analyzeTrack, parseGpx } from '../../../src/client/domain/gpx.js';

const SAMPLE = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <metadata><name>Morning Ridge</name></metadata>
  <trk><name>Morning Ridge</name><trkseg>
    <trkpt lat="50.0000" lon="19.0000"><ele>100</ele><time>2026-09-13T08:00:00Z</time></trkpt>
    <trkpt lat="50.0010" lon="19.0000"><ele>118</ele><time>2026-09-13T08:01:00Z</time></trkpt>
    <trkpt lat="50.0020" lon="19.0000"><ele>110</ele><time>2026-09-13T08:02:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

describe('parseGpx', () => {
  it('extracts track metadata, coordinates, elevation and timestamps', () => {
    const track = parseGpx(SAMPLE);

    expect(track.name).toBe('Morning Ridge');
    expect(track.points).toHaveLength(3);
    expect(track.points[1]).toMatchObject({ lat: 50.001, lon: 19, ele: 118 });
    expect(track.points[1].time).toBeInstanceOf(Date);
  });

  it('extracts named GPX waypoints as points of interest', () => {
    const track = parseGpx(`
      <gpx><wpt lat="50.005" lon="19.006"><name>Water stop</name><type>Drinking Water</type><sym>Water Source</sym></wpt>
        <wpt lat="invalid" lon="19.1"><name>Broken point</name></wpt>
        <trk><trkseg><trkpt lat="50" lon="19"/><trkpt lat="50.01" lon="19.01"/></trkseg></trk>
      </gpx>
    `);

    expect(track.pointsOfInterest).toEqual([{
      lat: 50.005,
      lon: 19.006,
      name: 'Water stop',
      type: 'Drinking Water',
      symbol: 'Water Source',
    }]);
  });

  it('rejects files without a usable track', () => {
    expect(() => parseGpx('<gpx><trk /></gpx>')).toThrow(/точек маршрута/i);
  });
});

describe('analyzeTrack', () => {
  it('calculates cumulative distance and elevation metrics', () => {
    const analyzed = analyzeTrack(parseGpx(SAMPLE));

    expect(analyzed.distanceKm).toBeCloseTo(0.222, 2);
    expect(analyzed.ascentM).toBe(18);
    expect(analyzed.descentM).toBe(8);
    expect(analyzed.minElevationM).toBe(100);
    expect(analyzed.maxElevationM).toBe(118);
    expect(analyzed.durationMs).toBe(120_000);
    expect(analyzed.movingTimeMs).toBe(120_000);
    expect(analyzed.movingSpeedThresholdKmh).toBe(1);
    expect(analyzed.points[2].distanceKm).toBeCloseTo(0.222, 2);
  });

  it('counts moving time only for segments faster than 1 km/h', () => {
    const analyzed = analyzeTrack({ name: 'Stop test', points: [
      { lat: 50, lon: 19, ele: 100, time: new Date('2026-09-13T08:00:00Z') },
      { lat: 50.001, lon: 19, ele: 101, time: new Date('2026-09-13T08:01:00Z') },
      { lat: 50.002, lon: 19, ele: 102, time: new Date('2026-09-13T08:21:00Z') },
    ] });

    expect(analyzed.durationMs).toBe(21 * 60_000);
    expect(analyzed.movingTimeMs).toBe(60_000);
    expect(analyzed.movingAverageSpeedKmh).toBeCloseTo(6.67, 1);
  });

  it('uses the filename fallback when the GPX has no embedded name', () => {
    const track = parseGpx(`
      <gpx><trk><trkseg>
        <trkpt lat="50" lon="19"/><trkpt lat="50.1" lon="19.1"/>
      </trkseg></trk></gpx>
    `, { fallbackName: 'Weekend ride' });

    expect(track.name).toBe('Weekend ride');
  });

  it('rejects a GPX over the configured point limit', () => {
    expect(() => parseGpx(`
      <gpx><trk><trkseg>
        <trkpt lat="50" lon="19"/><trkpt lat="50.1" lon="19.1"/><trkpt lat="50.2" lon="19.2"/>
      </trkseg></trk></gpx>
    `, { maxPoints: 2 })).toThrow('не более 2 точек');
  });

  it('rejects XML document type and entity declarations', () => {
    expect(() => parseGpx('<!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx>&xxe;</gpx>'))
      .toThrow('неподдерживаемую XML-конструкцию');
  });
});
