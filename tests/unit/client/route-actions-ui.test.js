import { describe, expect, it, vi } from 'vitest';
import { closeOverflowMenuOnOutsideClick, renderOwnerTrackActions } from '../../../src/client/route-actions-ui.js';

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

describe('owner track action menu', () => {
  it('keeps both actions and gives each one a matching icon', () => {
    const markup = renderOwnerTrackActions();

    expect(markup).toContain('id="edit-track"');
    expect(markup).toContain('Редактировать');
    expect(markup).toContain('data-action-icon="edit"');
    expect(markup).toContain('id="delete-track"');
    expect(markup).toContain('Удалить');
    expect(markup).toContain('data-action-icon="delete"');
  });
});
