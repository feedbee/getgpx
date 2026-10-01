import { describe, expect, it, vi } from 'vitest';
import { createUploadFlow } from '../../../src/client/track-upload-flow.js';

function fakeDocument() {
  const elements = new Map();
  const element = () => ({ hidden: true, dataset: {}, elements: [], replaceChildren: vi.fn(), classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
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

  it.each(['create', 'replace'])('allows saving metadata after parsing during %s', async (operation) => {
    vi.useFakeTimers();
    try {
      const documentRef = fakeDocument();
      documentRef.querySelector('#upload-metadata').hidden = false;
      documentRef.querySelector('#upload-metadata-error').hidden = false;
      documentRef.querySelector('#open-uploaded-track').hidden = false;
      const api = {
        upload: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'track-1', step: 'QUEUED' } }) }),
        replace: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { step: 'QUEUED' } }) }),
        status: vi.fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'PROCESSING', step: 'ENRICHING' } }) })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'READY' } }) }),
        publicTrack: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
          title: 'Parsed title', routeType: 'cycling', metrics: { speedKmh: 20 }, externalLinks: {} } }) }),
        update: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
          title: 'Parsed title', routeType: 'hiking', externalLinks: {} } }) }),
      };
      const flow = createUploadFlow({ trackApi: api, isAuthenticated: () => true,
        getPublicTrackId: () => 'track-1', documentRef });
      const replacement = operation === 'create' ? flow.uploadFile({ name: 'new.gpx' })
        : flow.replaceTrackFile({ name: 'new.gpx' });
      expect(documentRef.querySelector('#upload-metadata').hidden).toBe(true);
      expect(documentRef.querySelector('#upload-metadata-error').hidden).toBe(true);
      expect(documentRef.querySelector('#open-uploaded-track').hidden).toBe(true);
      expect(documentRef.querySelector('#processing-title').textContent).toBe(operation === 'create' ? 'Creating track' : 'Replacing GPX file');
      await vi.advanceTimersByTimeAsync(900);
      expect(documentRef.querySelector('#upload-metadata').hidden).toBe(false);
      expect(documentRef.querySelector('#upload-track-title').value).toBe('Parsed title');
      documentRef.querySelector('#upload-title-form').hidden = false;
      documentRef.querySelector('#upload-track-title').value = 'Unsaved title';
      expect(await flow.saveUploadMetadata({ routeType: 'hiking' })).toBe(true);
      expect(documentRef.querySelector('#upload-track-title').value).toBe('Unsaved title');
      expect(api.update).toHaveBeenCalledWith({ id: 'track-1', details: { routeType: 'hiking' } });
      let completeSave;
      api.update.mockImplementationOnce(() => new Promise(resolve => { completeSave = () => resolve({
        ok: true, json: async () => ({ data: { title: 'Saved title', routeType: 'hiking', externalLinks: {} } }),
      }); }));
      const firstSave = flow.saveUploadMetadata({ title: 'Saved title' });
      const secondSave = flow.saveUploadMetadata({ links: {} });
      await Promise.resolve();
      expect(api.update).toHaveBeenCalledTimes(2);
      completeSave();
      await Promise.all([firstSave, secondSave]);
      expect(api.update).toHaveBeenNthCalledWith(2, { id: 'track-1', details: { title: 'Saved title' } });
      expect(api.update).toHaveBeenNthCalledWith(3, { id: 'track-1', details: { externalLinks: {} } });
      await vi.advanceTimersByTimeAsync(900);
      await replacement;
      expect(api.publicTrack).toHaveBeenCalledOnce();
      expect(documentRef.querySelector('#processing-title').textContent).toBe(operation === 'create' ? 'Track created' : 'GPX file replaced');
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
