import { describe, expect, it, vi } from 'vitest';
import { createPoiController } from '../../../src/client/poi-controller.js';

function setup() {
  const handlers = {};
  const row = { dataset: { poiIndex: '0' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
  const marker = { dataset: { profilePoiIndex: '0' }, classList: { toggle: vi.fn() } };
  const documentRef = {
    querySelector: () => ({ addEventListener: (name, callback) => { handlers[name] = callback; } }),
    querySelectorAll: (selector) => selector === '[data-poi-index]' ? [row] : [marker],
  };
  const track = { pointsOfInterest: [{ routePointIndex: 7 }] };
  const onActivePoint = vi.fn();
  const onMapSelection = vi.fn();
  const controller = createPoiController({ getTrack: () => track, getActivePointIndex: () => 3,
    onActivePoint, onMapSelection, documentRef });
  return { controller, onActivePoint, onMapSelection, handlers, row };
}

describe('POI controller', () => {
  it('shows a hovered POI, then restores the previous route point on leave', () => {
    const { controller, onActivePoint, onMapSelection, row } = setup();
    controller.hover(0);
    expect(controller.selection).toMatchObject({ hoveredIndex: 0, returnPointIndex: 3 });
    expect(onActivePoint).toHaveBeenCalledWith(7, { showContext: true });
    expect(onMapSelection).toHaveBeenCalledWith(0);
    expect(row.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
    controller.leave();
    expect(controller.selection.hoveredIndex).toBeNull();
    expect(onActivePoint).toHaveBeenLastCalledWith(3);
  });

  it('keeps a pinned POI selected until it is toggled off', () => {
    const { controller, onActivePoint } = setup();
    controller.toggle(0);
    controller.leave();
    expect(controller.selection.pinnedIndex).toBe(0);
    controller.toggle(0);
    expect(controller.selection.pinnedIndex).toBeNull();
    expect(onActivePoint).toHaveBeenLastCalledWith(3);
  });
});
