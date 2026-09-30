import { describe, expect, it, vi } from 'vitest';
import { createTrackDeletion } from '../../../src/client/track-delete-ui.js';

function setup({ favorite = false, collectionPage = false } = {}) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      const handlers = {};
      const classes = new Set();
      elements.set(selector, { handlers, hidden: false, disabled: false, textContent: '',
        classList: { contains: (value) => classes.has(value), toggle: (value, enabled) => {
          if (enabled) classes.add(value); else classes.delete(value);
        } },
        setAttribute: vi.fn(), removeAttribute: vi.fn(),
        addEventListener: (name, callback) => { handlers[name] = callback; },
        replaceChildren: vi.fn(), append: vi.fn(), showModal: vi.fn(), close: vi.fn() });
    }
    return elements.get(selector);
  };
  const trackApi = { remove: vi.fn(async () => ({ ok: true })) };
  const collection = { load: vi.fn() };
  const windowRef = { location: { assign: vi.fn() } };
  const deletion = createTrackDeletion({ trackApi, collection, isFavoriteTracksPage: favorite,
    isTrackCollectionPage: collectionPage, getPublicTrackId: () => 'public-1',
    getTrackTitle: () => 'Route', documentRef: { querySelector: element, createElement: () => ({ textContent: '' }) }, windowRef });
  return { deletion, trackApi, collection, windowRef, element };
}

describe('track deletion', () => {
  it('deletes one public track by ID and navigates to the library', async () => {
    const { deletion, trackApi, windowRef, element } = setup();
    deletion.openOne({ id: 'public-1', title: 'Route' });
    expect(element('#confirm-delete-dialog').showModal).toHaveBeenCalled();
    await element('#confirm-track-delete').handlers.click();
    expect(trackApi.remove).toHaveBeenCalledWith({ id: 'public-1', ids: null, saved: false });
    expect(windowRef.location.assign).toHaveBeenCalledWith('/my-tracks');
  });

  it('removes a batch of favorites and reloads the collection', async () => {
    const { deletion, trackApi, collection, element } = setup({ favorite: true, collectionPage: true });
    deletion.openMany([{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }]);
    await element('#confirm-track-delete').handlers.click();
    expect(trackApi.remove).toHaveBeenCalledWith({ id: null, ids: ['one', 'two'], saved: true });
    expect(collection.load).toHaveBeenCalledWith({ reset: true });
  });
});
