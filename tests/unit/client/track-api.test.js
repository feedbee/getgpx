import { describe, expect, it, vi } from 'vitest';
import { createTrackApi } from '../../../src/client/track-api.js';

describe('track API', () => {
  it('sends GPX uploads with the filename and route type', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    const file = { name: 'Morning ride.gpx' };
    await createTrackApi(fetchImplementation).upload({ file, routeType: 'cycling' });
    expect(fetchImplementation).toHaveBeenCalledWith('/api/tracks', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/gpx+xml',
        'x-gpx-filename': 'Morning%20ride.gpx', 'x-track-type': 'cycling' },
      body: file,
    });
  });

  it('sends bulk saved-track removal to the saved endpoint', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    await createTrackApi(fetchImplementation).remove({ ids: ['track-1'], saved: true });
    expect(fetchImplementation).toHaveBeenCalledWith('/api/tracks/saved', {
      method: 'DELETE', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['track-1'] }),
    });
  });
});
