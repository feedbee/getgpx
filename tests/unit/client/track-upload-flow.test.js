import { describe, expect, it, vi } from 'vitest';
import { createUploadFlow } from '../../../src/client/track-upload-flow.js';

function fakeDocument() {
  const elements = new Map();
  const element = () => ({ hidden: true, dataset: {}, elements: [], classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
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
        publicTrack: vi.fn().mockResolvedValue({ ok: false }),
      };
      const flow = createUploadFlow({ trackApi: api, isAuthenticated: () => true,
        getPublicTrackId: () => null, documentRef });
      const upload = flow.uploadFile({ name: 'ride.gpx' });
      await vi.advanceTimersByTimeAsync(900);
      await upload;

      expect(documentRef.querySelector('#processing-title').textContent).toBe('Track created');
      expect(api.upload).toHaveBeenCalledWith({ file: { name: 'ride.gpx' }, routeType: 'cycling' });
      expect(api.status).toHaveBeenCalledWith('track-1');
      expect(documentRef.querySelector('#open-uploaded-track').dataset.trackId).toBe('track-1');
      expect(documentRef.querySelector('#open-uploaded-track').hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides stale editors throughout replacement and only loads metadata after READY', async () => {
    vi.useFakeTimers();
    try {
      const documentRef = fakeDocument();
      documentRef.querySelector('#upload-metadata').hidden = false;
      documentRef.querySelector('#upload-metadata-error').hidden = false;
      documentRef.querySelector('#open-uploaded-track').hidden = false;
      const api = {
        replace: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { step: 'QUEUED' } }) }),
        status: vi.fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'PROCESSING', step: 'ENRICHING' } }) })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'READY' } }) }),
        publicTrack: vi.fn().mockResolvedValue({ ok: false }),
        update: vi.fn(),
      };
      const flow = createUploadFlow({ trackApi: api, isAuthenticated: () => true,
        getPublicTrackId: () => 'track-1', documentRef });
      const replacement = flow.replaceTrackFile({ name: 'new.gpx' });
      expect(documentRef.querySelector('#upload-metadata').hidden).toBe(true);
      expect(documentRef.querySelector('#upload-metadata-error').hidden).toBe(true);
      expect(documentRef.querySelector('#open-uploaded-track').hidden).toBe(true);
      expect(documentRef.querySelector('#processing-title').textContent).toBe('Replacing GPX file');
      await vi.advanceTimersByTimeAsync(900);
      expect(api.publicTrack).not.toHaveBeenCalled();
      expect(await flow.saveUploadMetadata({ routeType: 'hiking' })).toBe(false);
      expect(api.update).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(900);
      await replacement;
      expect(api.publicTrack).toHaveBeenCalledOnce();
      expect(documentRef.querySelector('#processing-title').textContent).toBe('GPX file replaced');
    } finally { vi.useRealTimers(); }
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
