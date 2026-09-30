import { describe, expect, it, vi } from 'vitest';
import { createTrackCollection } from '../../../src/client/track-collection.js';

function fakeDocument() {
  const elements = new Map();
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        addEventListener: vi.fn(), replaceChildren: vi.fn(), hidden: true, value: '',
      });
      return elements.get(selector);
    },
  };
}

describe('track collection', () => {
  it('restores the search query and shows the sign-in state without requesting tracks', async () => {
    const documentRef = fakeDocument();
    const trackApi = { list: vi.fn() };
    const collection = createTrackCollection({ trackApi, isMyTracksPage: true, isFavoriteTracksPage: false,
      getCurrentUser: () => null, onEdit: vi.fn(), onDelete: vi.fn(), onDeleteMany: vi.fn(),
      documentRef, browserWindow: { location: { search: '?query=forest' }, history: {} } });

    await collection.load({ reset: true });

    expect(documentRef.querySelector('#track-query').value).toBe('forest');
    expect(documentRef.querySelector('#my-tracks-message').innerHTML).toContain('/auth/google');
    expect(documentRef.querySelector('#load-more-tracks').hidden).toBe(true);
    expect(trackApi.list).not.toHaveBeenCalled();
  });
});
