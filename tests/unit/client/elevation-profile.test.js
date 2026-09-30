import { describe, expect, it, vi } from 'vitest';
import { createElevationProfile } from '../../../src/client/elevation-profile.js';

function fakeDocument() {
  const elements = new Map();
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        innerHTML: '', textContent: '', setAttribute: vi.fn(), replaceChildren: vi.fn(),
      });
      return elements.get(selector);
    },
  };
}

describe('elevation profile', () => {
  it('draws the visible points and recalculates coordinates after a range change', () => {
    const surface = { id: 'asphalt', color: '#111', highway: 'secondary', quality: { id: 'good', color: '#0a0' } };
    const track = { points: [
      { distanceKm: 0, ele: 100, grade: 1, surface },
      { distanceKm: 1, ele: 110, grade: 2, surface },
      { distanceKm: 2, ele: 120, grade: 3, surface },
    ], climbs: [], pointsOfInterest: [] };
    const documentRef = fakeDocument();
    let range = [0, 2];
    const profile = createElevationProfile({ getTrack: () => track, getViewRange: () => range,
      getSummaryMetrics: () => null, getColorMode: () => 'gradient', getFocusPlacement: () => 'ribbon',
      getRouteFilter: () => null, getTerrainRange: () => null, documentRef });

    profile.drawProfile(track);
    expect(documentRef.querySelector('#profile-area').setAttribute).toHaveBeenCalledWith('d', expect.stringContaining('M0.0'));
    expect(profile.chartCoordinates(track.points[1]).x).toBe(600);

    range = [1, 2];
    profile.resetMetrics();
    expect(profile.chartCoordinates(track.points[1]).x).toBe(0);
  });
});
