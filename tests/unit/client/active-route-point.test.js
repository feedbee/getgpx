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
});
