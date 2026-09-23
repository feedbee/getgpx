import { describe, expect, it, vi } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
import { renderPreferencesControl, setupPreferencesControl } from '../../../src/client/preferences-ui.js';

function control() {
  const elements = new Map();
  const make = () => ({ hidden: false, value: '', dataset: {}, listeners: {}, setAttribute: vi.fn(), focus: vi.fn(), addEventListener(type, listener) { this.listeners[type] = listener; } });
  for (const id of ['preferences-trigger', 'preferences-popover', 'preferences-storage-note', 'preferences-blocked-note']) elements.set(`#${id}`, make());
  const root = { querySelector: selector => elements.get(selector), addEventListener: vi.fn() };
  return { root, elements };
}
describe('preference selector', () => {
  it('renders an icon-only trigger and visible options instead of native selects', () => {
    const markup = renderPreferencesControl();
    const trigger = markup.match(/<button id="preferences-trigger"[^>]*>(.*?)<\/button>/s)?.[1];
    expect(trigger).toContain('<svg');
    expect(trigger).not.toContain('<span');
    expect(markup).not.toContain('<select');
    expect(markup.match(/data-preference="language"/g)).toHaveLength(5);
    expect(markup.match(/data-preference="measurementSystem"/g)).toHaveLength(2);
  });
  it('saves only the chosen field and reloads the current URL', () => {
    const { root, elements } = control();
    const save = vi.spyOn(preferences, 'set').mockReturnValue(true);
    const reload = vi.fn();
    setupPreferencesControl(root, { reload });
    const choice = { dataset: { preference: 'language', value: 'pl' } };
    elements.get('#preferences-popover').listeners.click({ target: { closest: () => choice } });
    expect(save).toHaveBeenCalledWith('language', 'pl');
    expect(reload).toHaveBeenCalledOnce();
    save.mockRestore();
  });
  it('blocks processing and dirty edits with a localized explanation', () => {
    const { root, elements } = control();
    const save = vi.spyOn(preferences, 'set');
    const reload = vi.fn();
    setupPreferencesControl(root, { reload, blockedReason: () => 'preferences.blockedEdits' });
    const choice = { dataset: { preference: 'measurementSystem', value: 'imperial' } };
    elements.get('#preferences-popover').listeners.click({ target: { closest: () => choice } });
    expect(save).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(elements.get('#preferences-blocked-note').textContent).toBeTruthy();
    save.mockRestore();
  });
  it('keeps a session-only choice on the current page if storage fails', () => {
    const { root, elements } = control();
    const save = vi.spyOn(preferences, 'set').mockReturnValue(false);
    const reload = vi.fn();
    setupPreferencesControl(root, { reload });
    const choice = { dataset: { preference: 'language', value: 'uk' } };
    elements.get('#preferences-popover').listeners.click({ target: { closest: () => choice } });
    expect(reload).not.toHaveBeenCalled();
    expect(elements.get('#preferences-storage-note').hidden).toBe(false);
    save.mockRestore();
  });
});
