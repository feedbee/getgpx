import { describe, expect, it, vi } from 'vitest';
import { bindUploadInteractions } from '../../../src/client/upload-interactions.js';

function setup({ authenticated = true, myTracks = false } = {}) {
  const elements = new Map();
  const documentHandlers = {};
  const element = (selector) => {
    if (!elements.has(selector)) {
      const handlers = {};
      const classes = new Set();
      elements.set(selector, { handlers, hidden: true, value: '', dataset: {}, focus: vi.fn(),
        addEventListener: (name, callback) => { handlers[name] = callback; },
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      });
    }
    return elements.get(selector);
  };
  const uploadFlow = { uploadFile: vi.fn(), stop: vi.fn(), saveUploadMetadata: vi.fn(async () => true),
    setUploadMetadataEditing: vi.fn(), renderUploadMetadata: vi.fn(), retryProcessing: vi.fn(), retryExisting: vi.fn() };
  const collection = { load: vi.fn() };
  bindUploadInteractions({ uploadFlow, collection, getCurrentUser: () => authenticated ? { id: 'user' } : null,
    getPublicTrackId: () => 'track-1', isMyTracksPage: myTracks,
    documentRef: { querySelector: element, addEventListener: (name, callback) => { documentHandlers[name] = callback; } },
    windowRef: { location: { assign: vi.fn() } } });
  return { element, documentHandlers, uploadFlow, collection };
}

describe('upload interactions', () => {
  it('uploads a selected file and clears the file input', () => {
    const { element, uploadFlow } = setup();
    const file = { name: 'route.gpx' };
    const target = { files: [file], value: 'route.gpx' };
    element('#gpx-file').handlers.change({ target });
    expect(uploadFlow.uploadFile).toHaveBeenCalledWith(file);
    expect(element('#upload-dialog').hidden).toBe(true);
    expect(target.value).toBe('');
  });

  it('blocks guest drops and saves edited upload metadata', async () => {
    const guest = setup({ authenticated: false });
    guest.element('#upload-dropzone').handlers.drop({ preventDefault: vi.fn(), dataTransfer: { files: [{ name: 'route.gpx' }] } });
    expect(guest.uploadFlow.uploadFile).not.toHaveBeenCalled();
    const { element, uploadFlow } = setup();
    element('#upload-track-title').value = 'New route';
    await element('#upload-title-form').handlers.submit({ preventDefault: vi.fn(), submitter: {} });
    expect(uploadFlow.saveUploadMetadata).toHaveBeenCalledWith({ title: 'New route' }, {});
    expect(uploadFlow.setUploadMetadataEditing).toHaveBeenCalledWith('#upload-title-row', false);
  });
});
