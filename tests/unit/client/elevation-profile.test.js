import { describe, expect, it, vi } from 'vitest';
import { createElevationProfile } from '../../../src/client/elevation-profile.js';

function fakeDocument() {
  const elements = new Map();
  return {
    createElement: () => ({ dataset: {}, style: {}, setAttribute: vi.fn() }),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        innerHTML: '', textContent: '', setAttribute: vi.fn(), replaceChildren: vi.fn(), append: vi.fn(),
      });
      return elements.get(selector);
    },
  };
}

describe('elevation profile', () => {
  it.each(['gradient', 'elevation'])('draws %s colors and recalculates coordinates after a range change', (mode) => {
    const surface = { id: 'asphalt', color: '#111', highway: 'secondary', quality: { id: 'good', color: '#0a0' } };
    const track = { points: [
      { distanceKm: 0, ele: 100, grade: 1, surface },
      { distanceKm: 1, ele: 110, grade: 2, surface },
      { distanceKm: 2, ele: 120, grade: 3, surface },
    ], climbs: [], pointsOfInterest: [] };
    const documentRef = fakeDocument();
    let range = [0, 2];
    const profile = createElevationProfile({ getTrack: () => track, getViewRange: () => range,
      getSummaryMetrics: () => null, getColorMode: () => mode, getFocusPlacement: () => 'ribbon',
      getRouteFilter: () => null, getTerrainRange: () => null, documentRef });

    profile.drawProfile(track);
    expect(documentRef.querySelector('#profile-area').setAttribute).toHaveBeenCalledWith('d', expect.stringContaining('M0.0'));
    expect(profile.chartCoordinates(track.points[1]).x).toBe(600);
    expect(documentRef.querySelector('#profile-pois').append.mock.calls.map(([marker]) => marker.dataset.profileEndpoint)).toEqual(['start', 'finish']);
    expect(documentRef.querySelector('#profile-distance').textContent).toBe('2 km');
    if (mode === 'elevation') {
      expect(documentRef.querySelector('#elevation-legend').innerHTML).toContain('100 m');
      expect(documentRef.querySelector('#elevation-legend').innerHTML).toContain('120 m');
      expect(documentRef.querySelector('#gradient-line').innerHTML).toContain('url(#profile-elevation-stroke)');
    }

    documentRef.querySelector('#profile-pois').append.mockClear();
    range = [1, 2];
    profile.resetMetrics();
    expect(profile.chartCoordinates(track.points[1]).x).toBe(0);
    profile.drawProfile(track);
    expect(documentRef.querySelector('#profile-distance').textContent).toBe('1 km');
    expect(documentRef.querySelector('#profile-pois').append.mock.calls.map(([marker]) => marker.dataset.profileEndpoint)).toEqual(['finish']);
    expect(documentRef.querySelector('#min-label').textContent).toBe('110 m');
    expect(documentRef.querySelector('#max-label').textContent).toBe('120 m');
    if (mode === 'elevation') {
      expect(documentRef.querySelector('#elevation-legend').innerHTML).toContain('100 m');
      expect(documentRef.querySelector('#gradient-line').innerHTML).toContain('url(#profile-elevation-stroke)');
    }
  });
});
