import { describe, expect, it, vi } from 'vitest';
import { createRouteDetailView, prepareRenderableTrack, renderLoadedTrackHeader } from '../../../src/client/route-detail-ui.js';

function fakeDocument() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: false, disabled: false, dataset: {}, innerHTML: '',
      classList: { toggle: vi.fn() }, setAttribute: vi.fn(), textContent: '' });
    return nodes.get(selector);
  };
  return { querySelector: node, querySelectorAll: (selector) => {
    if (selector === '.profile-card .route-legend') return [{ id: 'gradient-legend', hidden: false }, { id: 'surface-legend', hidden: false }];
    if (selector.startsWith('[data-surface-filter]')) return [{ disabled: false, dataset: { summaryEmpty: 'true' } }];
    return [];
  } };
}

describe('route detail view', () => {
  it('prepares route geometry, elevation grades, and POI indices', () => {
    const track = prepareRenderableTrack({ name: 'Route', points: [
      { lat: 50, lon: 19, ele: 100, distanceKm: 0, surfaceTags: { surface: 'asphalt' } },
      { lat: 50.001, lon: 19, ele: 110, distanceKm: 0.1, surfaceTags: { surface: 'gravel' } },
      { lat: 50.002, lon: 19, ele: 105, distanceKm: 0.2, surfaceTags: { surface: 'gravel' } },
    ], pointsOfInterest: [{ lat: 50.001, lon: 19, name: 'Stop' }] });
    expect(track.points[0].surface.id).toBe('asphalt');
    expect(track.points[1].surface.id).toBe('gravel');
    expect(track.points.every((point) => Number.isFinite(point.grade))).toBe(true);
    expect(track.pointsOfInterest[0].routePointIndex).toBe(1);
    expect(track.climbs).toEqual(expect.any(Array));
  });

  it('switches loading and ready controls and renders route metrics', () => {
    const documentRef = fakeDocument();
    const onReady = vi.fn();
    const view = createRouteDetailView({ getProfileColorMode: () => 'gradient', onReady, documentRef });
    view.setDetailedView('loading');
    expect(documentRef.querySelector('#map').hidden).toBe(true);
    expect(onReady).not.toHaveBeenCalled();
    view.setDetailedView('ready');
    expect(documentRef.querySelector('#map').hidden).toBe(false);
    expect(onReady).toHaveBeenCalledOnce();
    renderLoadedTrackHeader({ name: 'Route', distanceKm: 2, ascentM: 100, descentM: 50,
      hasElevation: true, movingAverageSpeedKmh: 15, estimatedDurationMs: 600000 }, 'road', vi.fn(), documentRef);
    expect(documentRef.querySelector('#track-name').textContent).toBe('Route');
    expect(documentRef.querySelector('#distance').textContent).not.toBe('');
  });
});
