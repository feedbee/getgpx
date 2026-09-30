import { describe, expect, it, vi } from 'vitest';
import { createUploadFlow } from '../../../src/client/track-upload-flow.js';

function fakeDocument() {
  const elements = new Map();
  const element = () => ({ hidden: true, dataset: {}, classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    querySelector: () => element() });
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
}

describe('track upload flow', () => {
  it('uploads a file, polls its status, and shows the completed track', async () => {
    vi.useFakeTimers();
    try {
      const documentRef = fakeDocument();
      const api = {
        upload: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'track-1', step: 'QUEUED' } }) }),
        status: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'READY', step: 'COMPLETE' } }) }),
        management: vi.fn().mockResolvedValue({ ok: false }),
      };
      const flow = createUploadFlow({ trackApi: api, isAuthenticated: () => true,
        getPublicTrackId: () => null, documentRef });
      const upload = flow.uploadFile({ name: 'ride.gpx' });
      await vi.advanceTimersByTimeAsync(900);
      await upload;

      expect(api.upload).toHaveBeenCalledWith({ file: { name: 'ride.gpx' }, routeType: 'cycling' });
      expect(api.status).toHaveBeenCalledWith('track-1');
      expect(documentRef.querySelector('#open-uploaded-track').dataset.trackId).toBe('track-1');
      expect(documentRef.querySelector('#open-uploaded-track').hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling when the processing dialog is closed', async () => {
    vi.useFakeTimers();
    try {
      const api = {
        upload: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'track-1', step: 'QUEUED' } }) }),
        status: vi.fn(),
      };
      const flow = createUploadFlow({ trackApi: api, isAuthenticated: () => true,
        getPublicTrackId: () => null, documentRef: fakeDocument() });
      const upload = flow.uploadFile({ name: 'ride.gpx' });
      await vi.advanceTimersByTimeAsync(100);
      flow.stop();
      await vi.advanceTimersByTimeAsync(900);
      await upload;
      expect(api.status).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
