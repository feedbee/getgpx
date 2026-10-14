import { beforeEach } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
beforeEach(() => { preferences.set('language', 'ru'); preferences.set('measurementSystem', 'metric'); });
import { describe, expect, it, vi } from 'vitest';
import { closeOverflowMenuOnOutsideClick, copyPublicTrackLink, copyPageLink, sharePageLink, favoriteButtonState, publicTrackIdFromPath, renderOwnerTrackActions } from '../../../src/client/route-actions-ui.js';

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

describe('public track sharing', () => {
  it('recognizes case-sensitive public ids in track paths', () => {
    expect(publicTrackIdFromPath('/tracks/AxoslgzL_iLHv88P5AYoe')).toBe('AxoslgzL_iLHv88P5AYoe');
    expect(publicTrackIdFromPath('/tracks/with-hyphen')).toBeNull();
    expect(publicTrackIdFromPath('/my-tracks')).toBeNull();
  });

  it('copies the full public track URL', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await copyPublicTrackLink({
      trackId: '507f1f77bcf86cd799439011',
      origin: 'https://getgpx.example',
      clipboard,
    });

    expect(clipboard.writeText).toHaveBeenCalledWith(
      'https://getgpx.example/tracks/507f1f77bcf86cd799439011',
    );
  });
});

describe('favorite track action', () => {
  it('keeps the label stable and exposes accessible on/off state', () => {
    expect(favoriteButtonState(false)).toEqual({ pressed: 'false', label: 'Добавить в избранное' });
    expect(favoriteButtonState(true)).toEqual({ pressed: 'true', label: 'Удалить из избранного' });
  });
});


describe('shared page sharing', () => {
  it('copies comparison order in the full page link', async () => {
    const clipboard = { writeText: vi.fn() };
    await copyPageLink({ path: '/compare?tracks=second,first', origin: 'https://example.test', clipboard });
    expect(clipboard.writeText).toHaveBeenCalledWith('https://example.test/compare?tracks=second,first');
  });
  it('restores the button and reports clipboard failure', async () => {
    const classes = new Set();
    const button = { disabled: false, setAttribute: vi.fn(), removeAttribute: vi.fn(),
      classList: { contains: key => classes.has(key), toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key) } };
    const toast = { classList: { add: vi.fn(), remove: vi.fn() } };
    const windowRef = { location: { origin: 'https://example.test' },
      navigator: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } },
      setTimeout: vi.fn(), clearTimeout: vi.fn() };
    await sharePageLink({ button, path: '/compare?tracks=first', documentRef: { querySelector: () => toast }, windowRef });
    expect(button.disabled).toBe(false);
    expect(classes.has('is-loading')).toBe(false);
    expect(toast.textContent).toBe('Не удалось скопировать ссылку');
  });
});
