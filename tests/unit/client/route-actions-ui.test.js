import { describe, expect, it, vi } from 'vitest';
import { closeOverflowMenuOnOutsideClick } from '../../../src/client/route-actions-ui.js';

describe('route action overflow menu', () => {
  it('closes an open menu when the click is outside', () => {
    const outsideTarget = {};
    const menu = { open: true, contains: vi.fn().mockReturnValue(false) };

    expect(closeOverflowMenuOnOutsideClick(menu, outsideTarget)).toBe(true);
    expect(menu.open).toBe(false);
  });

  it('keeps the menu open when the click is inside', () => {
    const insideTarget = {};
    const menu = { open: true, contains: vi.fn().mockReturnValue(true) };

    expect(closeOverflowMenuOnOutsideClick(menu, insideTarget)).toBe(false);
    expect(menu.open).toBe(true);
  });
});
