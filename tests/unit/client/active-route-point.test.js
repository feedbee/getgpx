import { describe, expect, it, vi } from 'vitest';
import { createActiveRoutePoint } from '../../../src/client/active-route-point.js';

function fakeDocument() {
  const nodes = new Map();
  const filter = { dataset: { surfaceFilter: 'asphalt' }, classList: { toggle: vi.fn() } };
  return { filter,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { setAttribute: vi.fn(), innerHTML: '' });
      return nodes.get(selector);
    },
    querySelectorAll: () => [filter],
  };
}

describe('active route point', () => {
  it('clamps the point index and updates map, chart, and surface context', () => {
    const surface = { id: 'asphalt', label: 'surface.asphalt', highway: 'secondary',
      quality: { id: 'good', label: 'quality.good' } };
    const track = { distanceKm: 2, points: [
      { distanceKm: 0, ele: 100, grade: 0, surface },
      { distanceKm: 2, ele: 120, grade: 3, surface },
    ] };
    const documentRef = fakeDocument();
    const onMapPoint = vi.fn();
    const point = createActiveRoutePoint({ getTrack: () => track, chartCoordinates: () => ({ x: 1200, y: 40 }),
      onMapPoint, documentRef });
    point.set(100, { showContext: true });
    expect(point.index).toBe(1);
    expect(onMapPoint).toHaveBeenCalledWith(track.points[1]);
    expect(documentRef.querySelector('#profile-cursor').setAttribute).toHaveBeenCalledWith('x1', 1200);
    expect(documentRef.querySelector('#profile-wrap').setAttribute).toHaveBeenCalledWith('aria-valuenow', 100);
    expect(documentRef.filter.classList.toggle).toHaveBeenCalledWith('is-current', true);
    point.set(-5);
    expect(point.index).toBe(0);
    expect(documentRef.filter.classList.toggle).toHaveBeenLastCalledWith('is-current', false);
  });
  it('hides the chart cursor outside the viewport and restores it at either boundary', () => {
    const surface = { id: 'asphalt', label: 'surface.asphalt', highway: 'secondary', quality: { id: 'good', label: 'quality.good' } };
    const track = { distanceKm: 2, points: [{ distanceKm: 1, ele: 100, grade: 0, surface }] };
    const documentRef = fakeDocument();
    let x = -10;
    const onMapPoint = vi.fn();
    const point = createActiveRoutePoint({ getTrack: () => track, chartCoordinates: () => ({ x, y: 100 }), onMapPoint, documentRef });
    for (const position of [-10, 0, 600, 1200, 1210, 600]) {
      x = position;
      point.set(0, { showContext: true });
      for (const selector of ['#profile-cursor', '#profile-dot']) {
        expect(documentRef.querySelector(selector).setAttribute).toHaveBeenLastCalledWith('visibility', position < 0 || position > 1200 ? 'hidden' : 'visible');
      }
      expect(documentRef.filter.classList.toggle).toHaveBeenLastCalledWith('is-current', true);
    }
    expect(onMapPoint).toHaveBeenCalledTimes(6);
  });

});
