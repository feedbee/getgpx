import { describe, expect, it, vi } from 'vitest';
import { createRouteFilters } from '../../../src/client/route-filters.js';

function fakeSection() {
  const handlers = {};
  return { handlers, addEventListener(name, callback) { handlers[name] = callback; } };
}

describe('route filters', () => {
  it('switches between pinned surface and terrain filters, then resets', () => {
    const surface = fakeSection();
    const terrain = fakeSection();
    const documentRef = { querySelector(selector) { return selector === '.surface-section' ? surface : terrain; },
      querySelectorAll: () => [], addEventListener: vi.fn() };
    const onChange = vi.fn();
    const track = { climbs: [{ startIndex: 2, endIndex: 4, color: '#f00' }], descents: [] };
    const filters = createRouteFilters({ getTrack: () => track, onChange, documentRef });
    const surfaceControl = { dataset: { surfaceFilter: 'asphalt' } };
    surface.handlers.click({ target: { closest: () => surfaceControl } });
    expect(filters.selectedRouteFilter()).toEqual({ kind: 'surface', id: 'asphalt' });
    const terrainControl = { dataset: { terrainType: 'climb', terrainIndex: '0', terrainRange: 'climb-0' } };
    terrain.handlers.click({ target: { closest: () => terrainControl } });
    expect(filters.selectedRouteFilter()).toBeNull();
    expect(filters.selectedTerrainRange()).toEqual({ ...track.climbs[0], key: 'climb-0' });
    filters.reset();
    expect(filters.selectedTerrainRange()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
