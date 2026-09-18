import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { analyzeGpxSource } from '../../src/backend/track-analysis.js';

function largeGpx(pointCount) {
  const points = new Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    const lat = 50 + (index % 10_000) / 1_000_000;
    const lon = 19 + (index % 8_000) / 1_000_000;
    points[index] = `<trkpt lat="${lat}" lon="${lon}"/>`;
  }
  return `<gpx><trk><name>Load test</name><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

describe('large GPX analysis', () => {
  it.each([50_000, 490_000])('analyzes %i source points and bounds persisted geometry', { timeout: 120_000 }, (pointCount) => {
    const source = largeGpx(pointCount);
    const sourceBytes = Buffer.byteLength(source);
    const startedAt = performance.now();
    const analysis = analyzeGpxSource(source, { filename: `${pointCount}.gpx` });
    const elapsedMs = Math.round(performance.now() - startedAt);

    expect(analysis.sourcePointCount).toBe(pointCount);
    expect(analysis.points).toHaveLength(Math.min(pointCount, 10_000));
    expect(analysis.preview.points.length).toBeLessThanOrEqual(200);
    expect(sourceBytes).toBeLessThanOrEqual(25 * 1024 * 1024);
    console.info(`[gpx-load] ${pointCount.toLocaleString('en-US')} points: ${elapsedMs} ms, ${(sourceBytes / 1024 / 1024).toFixed(1)} MiB`);
  });
});
