import { describe, expect, it, vi } from 'vitest';
import { createTrackEditor } from '../../../src/client/track-editor-ui.js';

function setup() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      const handlers = {};
      const classes = new Set();
      const node = { handlers, dataset: {}, value: '', hidden: false, textContent: '',
        addEventListener: (name, callback) => { handlers[name] = callback; },
        setAttribute: vi.fn(), removeAttribute: vi.fn(), showModal: vi.fn(), close: vi.fn(),
        classList: { contains: (value) => classes.has(value), toggle: (value, enabled) => {
          if (enabled) classes.add(value); else classes.delete(value);
        } },
        querySelector: (query) => query === 'input:checked' ? { value: 'road' } : { innerHTML: '', checked: false, textContent: '' },
      };
      elements.set(selector, node);
    }
    return elements.get(selector);
  };
  const trackApi = { update: vi.fn(async () => ({ ok: true, json: async () => ({ data: { title: 'Updated' } }) })) };
  const onUpdated = vi.fn();
  const editor = createTrackEditor({ trackApi, uploadFlow: { replaceTrackFile: vi.fn() },
    getPublicTrackId: () => 'track-1', getPublicTrackData: () => ({ routeType: 'road', externalLinks: {} }),
    onUpdated, documentRef: { querySelector: element } });
  return { editor, trackApi, onUpdated, element };
}

describe('track editor', () => {
  it('saves the edited details and passes the updated track to the page', async () => {
    const { editor, trackApi, onUpdated, element } = setup();
    editor.open({ id: 'track-1', title: 'Original', speedKmh: 20, routeType: 'road', externalLinks: {} });
    element('#edit-track-title').value = 'Updated';
    element('#edit-track-komoot').value = 'https://example.com/route';
    const submitter = element('#submit-edit');
    await element('#edit-track-form').handlers.submit({ preventDefault: vi.fn(), submitter });
    expect(trackApi.update).toHaveBeenCalledWith({ id: 'track-1', details: {
      title: 'Updated', speedKmh: 20, routeType: 'road',
      externalLinks: { komoot: 'https://example.com/route', strava: '', garmin: '', rideWithGps: '' },
    } });
    expect(onUpdated).toHaveBeenCalledWith({ title: 'Updated' });
    expect(element('#edit-track-dialog').close).toHaveBeenCalled();
    expect(editor.managedTitle).toBe('Updated');
  });

  it('does not submit an invalid speed', async () => {
    const { editor, trackApi, element } = setup();
    editor.open({ id: 'track-1', title: 'Original', speedKmh: 20, routeType: 'road', externalLinks: {} });
    element('#edit-track-speed').value = 'invalid';
    await element('#edit-track-form').handlers.submit({ preventDefault: vi.fn(), submitter: element('#submit-edit') });
    expect(trackApi.update).not.toHaveBeenCalled();
    expect(element('#edit-track-error').hidden).toBe(false);
  });
});
