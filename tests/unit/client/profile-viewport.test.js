import { describe, expect, it, vi } from 'vitest';
import { createProfileViewport } from '../../../src/client/profile-viewport.js';

function setup() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      const handlers = {};
      elements.set(selector, { disabled: false, handlers,
        addEventListener: (name, callback) => { handlers[name] = callback; } });
    }
    return elements.get(selector);
  };
  const track = { points: Array.from({ length: 11 }, (_, index) => ({ distanceKm: index })) };
  const callbacks = { onResetMetrics: vi.fn(), onDrawProfile: vi.fn(), onClearRangeFocus: vi.fn(),
    onFitFullRange: vi.fn(), onFitRange: vi.fn(), onActivePoint: vi.fn(), onRangeChange: vi.fn() };
  const viewport = createProfileViewport({ getTrack: () => track, ...callbacks,
    documentRef: { querySelector: element } });
  return { viewport, track, callbacks, element };
}

describe('profile viewport', () => {
  it('zooms into a range, returns to the previous range, and resets', () => {
    const { viewport, track, callbacks, element } = setup();
    viewport.reset(track);
    expect(viewport.range).toEqual([0, 10]);
    expect(callbacks.onRangeChange).toHaveBeenLastCalledWith(track, [0, 10]);
    viewport.setRange([8, 2]);
    expect(viewport.range).toEqual([2, 8]);
    expect(callbacks.onRangeChange).toHaveBeenLastCalledWith(track, [2, 8]);
    expect(callbacks.onFitRange).toHaveBeenCalledWith(track, [2, 8]);
    expect(element('#zoom-back').disabled).toBe(false);
    element('#zoom-back').handlers.click();
    expect(viewport.range).toEqual([0, 10]);
    expect(callbacks.onRangeChange).toHaveBeenLastCalledWith(track, [0, 10]);
    expect(callbacks.onFitFullRange).toHaveBeenCalled();
    expect(element('#zoom-back').disabled).toBe(true);
    viewport.setRange([1, 9]);
    element('#zoom-reset').handlers.click();
    expect(viewport.range).toEqual([0, 10]);
    expect(callbacks.onRangeChange).toHaveBeenLastCalledWith(track, [0, 10]);
    expect(element('#zoom-reset').disabled).toBe(true);
  });

  it('ignores selections shorter than three points', () => {
    const { viewport, track, callbacks } = setup();
    viewport.reset(track);
    callbacks.onRangeChange.mockClear();
    viewport.setRange([3, 4]);
    expect(viewport.range).toEqual([0, 10]);
    expect(callbacks.onDrawProfile).not.toHaveBeenCalled();
    expect(callbacks.onRangeChange).not.toHaveBeenCalled();
  });
});
