import { describe, expect, it, vi } from 'vitest';
import { bindProfileInteractions } from '../../../src/client/profile-interactions.js';

function setup() {
  const handlers = {};
  const profile = { addEventListener: (name, callback) => { handlers[name] = callback; },
    getBoundingClientRect: () => ({ left: 0, width: 100 }), setPointerCapture: vi.fn() };
  const selection = { classList: { add: vi.fn(), remove: vi.fn() }, setAttribute: vi.fn() };
  const track = { points: Array.from({ length: 11 }, (_, index) => ({ distanceKm: index })), pointsOfInterest: [{ routePointIndex: 7 }] };
  const callbacks = { onHoverPoi: vi.fn(), onLeavePoi: vi.fn(), onTogglePoi: vi.fn(),
    onOpenPoint: vi.fn(), onActivePoint: vi.fn(), onPointContext: vi.fn(), onViewRange: vi.fn() };
  let menuOpen = false;
  let poiSelection = { hoveredIndex: null, pinnedIndex: null };
  bindProfileInteractions({ getTrack: () => track, getViewRange: () => [0, 10],
    getPointMenuOpen: () => menuOpen, getPoiSelection: () => poiSelection, getActivePointIndex: () => 4, ...callbacks,
    documentRef: { querySelector: (selector) => selector === '#profile-wrap' ? profile : selection } });
  const target = { closest: () => null };
  return { handlers, profile, selection, callbacks, target,
    setMenuOpen(value) { menuOpen = value; },
    setPoiSelection(value) { poiSelection = value; } };
}

describe('profile interactions', () => {
  it('selects a range by dragging and moves the active point with the keyboard', () => {
    const { handlers, profile, selection, callbacks, target } = setup();
    handlers.pointerdown({ target, button: 0, clientX: 20, pointerId: 1 });
    expect(profile.setPointerCapture).toHaveBeenCalledWith(1);
    handlers.pointermove({ target, clientX: 80 });
    expect(selection.classList.add).toHaveBeenCalledWith('visible');
    handlers.pointerup({ clientX: 80 });
    expect(callbacks.onViewRange).toHaveBeenCalledWith([2, 8]);
    expect(selection.classList.remove).toHaveBeenCalledWith('visible');
    const preventDefault = vi.fn();
    handlers.keydown({ key: 'ArrowRight', preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(callbacks.onActivePoint).toHaveBeenCalledWith(5);
  });

  it('opens the navigation point without starting a range drag', () => {
    const { handlers, profile, callbacks } = setup();
    const target = { closest: selector => selector === '#profile-dot' ? {} : null };
    handlers.pointerdown({ target, button: 0, clientX: 40, pointerId: 1 });
    expect(profile.setPointerCapture).not.toHaveBeenCalled();
    handlers.click({ target });
    expect(callbacks.onOpenPoint).toHaveBeenCalledWith(4, expect.any(Object));
    handlers.keydown({ key: 'Enter', preventDefault: vi.fn() });
    expect(callbacks.onOpenPoint).toHaveBeenCalledTimes(2);
  });

  it('anchors POI clicks and keyboard activation to the numbered marker', () => {
    const { handlers, callbacks } = setup();
    const marker = { dataset: { profilePoiIndex: '0' } };
    const target = { closest: selector => selector === '[data-profile-poi-index]' ? marker : null };
    handlers.click({ target });
    expect(callbacks.onOpenPoint).toHaveBeenCalledWith(7, { trigger: marker, context: { poiIndex: 0 } });
    handlers.keydown({ target, key: 'Enter', preventDefault: vi.fn() });
    expect(callbacks.onOpenPoint).toHaveBeenCalledTimes(2);
  });

  it('keeps the active point fixed while its menu is open', () => {
    const { handlers, callbacks, target, setMenuOpen } = setup();
    setMenuOpen(true);
    handlers.pointermove({ target, clientX: 90 });
    handlers.keydown({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(callbacks.onActivePoint).not.toHaveBeenCalled();
    setMenuOpen(false);
    handlers.pointermove({ target, clientX: 90 });
    expect(callbacks.onActivePoint).toHaveBeenCalledWith(9, { showContext: true });
  });

  it('keeps a pinned point of interest selected during pointer movement', () => {
    const { handlers, callbacks, target, setPoiSelection } = setup();
    setPoiSelection({ hoveredIndex: null, pinnedIndex: 1 });
    handlers.pointermove({ target, clientX: 50 });
    expect(callbacks.onActivePoint).not.toHaveBeenCalled();
    handlers.keydown({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(callbacks.onActivePoint).not.toHaveBeenCalled();
  });
});
