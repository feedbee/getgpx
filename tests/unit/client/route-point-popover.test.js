import { describe, expect, it, vi } from 'vitest';
import { coordinatePair, pointPopoverPosition, pointPopoverArrow, createRoutePointPopover } from '../../../src/client/route-point-popover.js';

describe('point popover', () => {
  it('copies latitude then longitude with decimal dots and six places', () => {
    expect(coordinatePair({ lat: 52.12345678, lon: -1.5 })).toBe('52.123457, -1.500000');
  });
  it('prefers above and flips below near the top', () => {
    const bounds = { left: 10, top: 10, right: 500, bottom: 500 };
    expect(pointPopoverPosition({ x: 250, y: 300 }, { width: 200, height: 180 }, bounds)).toEqual({ left: 150, top: 108 });
    expect(pointPopoverPosition({ x: 250, y: 30 }, { width: 200, height: 180 }, bounds)).toEqual({ left: 150, top: 42 });
  });
  it('points down above the anchor and up below it, including at screen edges', () => {
    expect(pointPopoverArrow({ x: 250, y: 300 }, { width: 200, height: 180 }, { left: 150, top: 108 }))
      .toEqual({ left: 100, side: 'bottom' });
    expect(pointPopoverArrow({ x: 310, y: 30 }, { width: 280, height: 200 }, { left: 32, top: 42 }))
      .toEqual({ left: 264, side: 'top' });
  });
  it('keeps the panel inside narrow bounds at a corner', () => {
    expect(pointPopoverPosition({ x: 310, y: 290 }, { width: 280, height: 200 },
      { left: 8, top: 8, right: 312, bottom: 312 })).toEqual({ left: 32, top: 78 });
  });
});


function setup(clipboard = { writeText: vi.fn().mockResolvedValue() }) {
  const handlers = {};
  const nodes = new Map();
  function node() {
    return { style: { setProperty: vi.fn() }, setAttribute: vi.fn(), focus: vi.fn(),
      getBoundingClientRect: () => ({ left: 200, top: 300, width: 200, height: 180 }),
      contains(target) { return target === this || [...nodes.values()].includes(target); },
      addEventListener(event, callback) { this[event] = callback; },
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); } };
  }
  const panel = node();
  const documentRef = { body: { append: vi.fn() }, createElement: () => panel,
    addEventListener: (event, callback) => { handlers[event] = callback; } };
  const windowRef = { innerWidth: 800, innerHeight: 600, scrollX: 0, scrollY: 0,
    navigator: { clipboard }, addEventListener: (event, callback) => { handlers[event] = callback; } };
  const surface = { label: 'surface.asphalt', highway: 'secondary', quality: { label: 'quality.good' } };
  const track = { distanceKm: 1, points: [
    { lat: 52, lon: 21, distanceKm: 0, ele: 100, grade: 0, surface },
    { lat: 53, lon: 22, distanceKm: 1, ele: 120, grade: 2, surface },
  ] };
  const onSelect = vi.fn();
  const popover = createRoutePointPopover({ getTrack: () => track, onSelect, documentRef, windowRef, clipboard });
  const trigger = { getBoundingClientRect: () => ({ left: 290, top: 290, width: 20, height: 20 }), setAttribute: vi.fn(), focus: vi.fn(), contains: target => target === trigger };
  const open = index => popover.open(index, { anchor: { x: 300, y: 300 }, trigger });
  return { popover, panel, trigger, handlers, open, onSelect, clipboard, documentRef, windowRef };
}

describe('point popover interactions', () => {
  it('selects a point, renders its coordinates and maps link, and toggles the same trigger', () => {
    const { popover, panel, open, onSelect } = setup();
    open(1);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(panel.querySelector('.point-coordinates').textContent).toBe('53.000000, 22.000000');
    expect(panel.querySelector('a').href).toBe('https://www.google.com/maps/search/?api=1&query=53.000000%2C%2022.000000');
    expect(panel.innerHTML).toContain('100%');
    expect(popover.isOpen).toBe(true);
    open(1);
    expect(popover.isOpen).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it('ignores inside clicks, dismisses outside, and restores focus on Escape', () => {
    const { popover, panel, trigger, handlers, open } = setup();
    open(0);
    handlers.pointerdown({ target: panel.querySelector('button') });
    expect(popover.isOpen).toBe(true);
    handlers.pointerdown({ target: {} });
    expect(popover.isOpen).toBe(false);
    open(0);
    handlers.keydown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(popover.isOpen).toBe(false);
    expect(trigger.focus).toHaveBeenCalled();
  });

  it('copies the selected coordinates and reports clipboard failure', async () => {
    const { panel, open, clipboard } = setup();
    open(0);
    await panel.querySelector('button').click();
    expect(clipboard.writeText).toHaveBeenCalledWith('52.000000, 21.000000');
    expect(panel.querySelector('.point-copy-status').textContent).toBe('Coordinates copied');
    clipboard.writeText.mockRejectedValue(new Error('denied'));
    await panel.querySelector('button').click();
    expect(panel.querySelector('.point-copy-status').textContent).toContain('Could not copy');
  });

  it('ignores a queued scroll from trigger focus but closes on subsequent scrolling', () => {
    const { popover, open, handlers, windowRef, documentRef } = setup();
    open(0);
    handlers.scroll({ target: documentRef });
    expect(popover.isOpen).toBe(true);
    windowRef.scrollY = 20;
    handlers.scroll({ target: documentRef });
    expect(popover.isOpen).toBe(false);
  });
});
