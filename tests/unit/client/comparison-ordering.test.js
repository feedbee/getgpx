import { describe, expect, it, vi } from 'vitest';
import { bindComparisonOrdering } from '../../../src/client/comparison-ordering.js';

function setup() {
  const listeners = {};
  const previews = [];
  const classes = () => ({ add: vi.fn(), remove: vi.fn() });
  const list = { ownerDocument: { body: { append: vi.fn() } }, children: [], classList: classes(), parentElement: { scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 300 }) },
    querySelectorAll() { return this.children; },
    insertBefore(row, before) {
      if (row === before) return;
      this.children = this.children.filter(item => item !== row);
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, row);
    },
    append(row) { this.insertBefore(row, null); },
    addEventListener: (name, handler) => { listeners[name] = handler; },
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true,
  };
  for (const id of ['first', 'second', 'third']) {
    const number = { textContent: id };
    const row = { dataset: { comparisonId: id }, classList: classes(), querySelector: () => number,
      cloneNode() {
        const preview = { style: {}, classList: classes(), removeAttribute: vi.fn(), setAttribute: vi.fn(), remove: vi.fn(),
          querySelector: () => ({ textContent: number.textContent }) };
        previews.push(preview); return preview;
      },
      getBoundingClientRect() { return { left: 0, top: list.children.indexOf(this) * 100 - list.parentElement.scrollTop, height: 100, width: 200 }; } };
    row.handle = { focus: vi.fn(), closest: selector => selector === '[data-comparison-drag]' ? row.handle : row };
    list.children.push(row);
  }
  const original = [...list.children];
  const onReorder = vi.fn();
  const onFinish = vi.fn();
  const windowRef = { addEventListener: vi.fn(), requestAnimationFrame: vi.fn().mockReturnValue(1), cancelAnimationFrame: vi.fn() };
  const controller = bindComparisonOrdering({ list, onReorder, onFinish, windowRef });
  const event = (index, extra = {}) => ({ target: original[index].handle, preventDefault: vi.fn(), pointerId: 1, button: 0, clientX: 50, clientY: 50, ...extra });
  return { list, listeners, onReorder, onFinish, controller, event, original, windowRef, previews };
}

describe('comparison ordering', () => {
  it('moves a row by pointer and commits its live layer order on drop', () => {
    const { listeners, event, onReorder, onFinish, controller } = setup();
    listeners.pointerdown(event(0));
    listeners.pointermove(event(0, { clientY: 260 }));
    expect(onReorder).toHaveBeenLastCalledWith(['second', 'third', 'first'], 'first');
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(controller.dragging).toBe(false);
    expect(onFinish).toHaveBeenCalledWith('first');
  });
  it('sorts by the dragged card center when grabbing near its top', () => {
    const { listeners, event, onReorder } = setup();
    listeners.pointerdown(event(0, { clientY: 10 }));
    listeners.pointermove(event(0, { clientY: 120 }));
    expect(onReorder).toHaveBeenLastCalledWith(['second', 'first', 'third'], 'first');
  });
  it('uses the release position even without a final pointermove', () => {
    const { listeners, event, onReorder } = setup();
    listeners.pointerdown(event(0));
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(onReorder).toHaveBeenLastCalledWith(['second', 'third', 'first'], 'first');
  });
  it('keeps sorting when the pointer drifts sideways outside the list', () => {
    const { listeners, event, onReorder } = setup();
    listeners.pointerdown(event(0));
    listeners.pointermove(event(0, { clientX: 220, clientY: 260 }));
    expect(onReorder).toHaveBeenLastCalledWith(['second', 'third', 'first'], 'first');
  });
  it('shows a floating card that follows the pointer and removes it on drop', () => {
    const { listeners, event, previews, list } = setup();
    listeners.pointerdown(event(0));
    expect(list.ownerDocument.body.append).toHaveBeenCalledWith(previews[0]);
    expect(previews[0].style).toMatchObject({ left: '0px', top: '0px', width: '200px', height: '100px' });
    listeners.pointermove(event(0, { clientX: 70, clientY: 260 }));
    expect(previews[0].style.transform).toBe('translate3d(20px, 210px, 0)');
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(previews[0].remove).toHaveBeenCalled();
  });
  it('animates neighboring cards from their old positions into the new layout', () => {
    const { listeners, event, original } = setup();
    original[1].animate = vi.fn(() => ({ cancel: vi.fn() }));
    listeners.pointerdown(event(0));
    listeners.pointermove(event(0, { clientY: 260 }));
    expect(original[1].animate).toHaveBeenCalledWith([
      { transform: 'translateY(100px)' }, { transform: 'translateY(0)' },
    ], expect.objectContaining({ duration: 180 }));
  });
  it('honors reduced motion while keeping the dragged card under the pointer', () => {
    const { listeners, event, original, previews, windowRef } = setup();
    windowRef.matchMedia = () => ({ matches: true });
    original[1].animate = vi.fn();
    listeners.pointerdown(event(0));
    previews[0].animate = vi.fn();
    listeners.pointermove(event(0, { clientY: 260 }));
    expect(previews[0].style.transform).toBe('translate3d(0px, 210px, 0)');
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(original[1].animate).not.toHaveBeenCalled();
    expect(previews[0].animate).not.toHaveBeenCalled();
    expect(previews[0].remove).toHaveBeenCalled();
  });
  it('waits for the card to settle before rebuilding the rows', async () => {
    const { listeners, event, previews, controller, onFinish } = setup();
    listeners.pointerdown(event(0));
    let resolve;
    previews[0].animate = vi.fn(() => ({ finished: new Promise(done => { resolve = done; }) }));
    listeners.pointermove(event(0, { clientY: 260 }));
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(controller.dragging).toBe(true);
    expect(onFinish).not.toHaveBeenCalled();
    resolve();
    await Promise.resolve();
    expect(controller.dragging).toBe(false);
    expect(onFinish).toHaveBeenCalledWith('first');
  });
  it('restores the previous order on cancellation', () => {
    const { listeners, event, onReorder, list } = setup();
    listeners.pointerdown(event(0));
    listeners.pointermove(event(0, { clientY: 260 }));
    listeners.pointercancel(event(0));
    expect(onReorder).toHaveBeenLastCalledWith(['first', 'second', 'third'], 'first');
    expect(list.children.map(row => row.dataset.comparisonId)).toEqual(['first', 'second', 'third']);
  });
  it('supports keyboard moves and does nothing beyond the first position', () => {
    const { listeners, event, onReorder, original } = setup();
    listeners.keydown(event(0, { key: 'ArrowUp' }));
    expect(onReorder).not.toHaveBeenCalled();
    listeners.keydown(event(0, { key: 'ArrowDown' }));
    expect(onReorder).toHaveBeenLastCalledWith(['second', 'first', 'third'], 'first');
    listeners.keydown(event(2, { key: 'Home' }));
    expect(onReorder).toHaveBeenLastCalledWith(['third', 'second', 'first'], 'third');
    expect(original[2].handle.focus).toHaveBeenCalled();
  });
  it('scrolls near an edge during touch dragging and cancels the animation on release', () => {
    const { listeners, event, windowRef, list } = setup();
    listeners.pointerdown(event(0, { pointerType: 'touch', clientY: 290 }));
    windowRef.requestAnimationFrame.mock.calls[0][0]();
    expect(list.parentElement.scrollTop).toBe(12);
    listeners.pointerup(event(0, { clientY: 260 }));
    expect(windowRef.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
  it('ignores other pointers and ordinary row links', () => {
    const { listeners, event, onReorder, controller } = setup();
    listeners.pointerdown(event(0, { target: { closest: () => null } }));
    expect(controller.dragging).toBe(false);
    listeners.pointerdown(event(0));
    listeners.pointermove(event(0, { pointerId: 2, clientY: 260 }));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
