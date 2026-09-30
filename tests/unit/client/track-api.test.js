import { describe, expect, it, vi } from 'vitest';
import { createTrackApi, readPublicTrackMetadata } from '../../../src/client/track-api.js';

describe('track API', () => {
  it('requests geometry explicitly while keeping metadata reads lightweight', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    const api = createTrackApi(fetchImplementation);
    await api.publicTrack('track-1');
    await api.publicTrack('track-1', { includeGeometry: true });
    await api.replace({ id: 'track-1', file: { name: 'ride.gpx' } });
    expect(fetchImplementation.mock.calls[0][0]).toBe('/api/v1/tracks/track-1');
    expect(fetchImplementation.mock.calls[1][0]).toBe('/api/v1/tracks/track-1?include=geometry');
    expect(fetchImplementation.mock.calls[2]).toEqual(['/api/v1/tracks/track-1/gpx',
      expect.objectContaining({ method: 'PUT' })]);
  });

  it('reports network and invalid JSON failures as unavailable', async () => {
    const network = await readPublicTrackMetadata({ publicTrack: () => Promise.reject(new Error('offline')) }, 'track-1');
    const invalidJson = await readPublicTrackMetadata({ publicTrack: () => Promise.resolve({ ok: true,
      json: () => Promise.reject(new SyntaxError('invalid JSON')) }) }, 'track-1');
    expect(network).toEqual({ kind: 'unavailable' });
    expect(invalidJson).toEqual({ kind: 'unavailable' });
  });

  it('distinguishes missing tracks from temporary server failures', async () => {
    const missing = await readPublicTrackMetadata({ publicTrack: () => Promise.resolve({ ok: false, status: 404 }) }, 'track-1');
    const failure = await readPublicTrackMetadata({ publicTrack: () => Promise.resolve({ ok: false, status: 503 }) }, 'track-1');
    expect(missing).toEqual({ kind: 'not-found' });
    expect(failure).toEqual({ kind: 'unavailable' });
  });

  it('returns valid public track metadata', async () => {
    const data = { title: 'Forest ride', analysisUrl: '/analysis/track-1' };
    const result = await readPublicTrackMetadata({ publicTrack: () => Promise.resolve({ ok: true,
      json: () => Promise.resolve({ data }) }) }, 'track-1');
    expect(result).toEqual({ kind: 'ready', data });
  });

  it('sends GPX uploads with the filename and route type', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    const file = { name: 'Morning ride.gpx' };
    await createTrackApi(fetchImplementation).upload({ file, routeType: 'cycling' });
    expect(fetchImplementation).toHaveBeenCalledWith('/api/v1/tracks', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/gpx+xml',
        'x-gpx-filename': 'Morning%20ride.gpx', 'x-track-type': 'cycling' },
      body: file,
    });
  });

  it('sends bulk saved-track removal to the saved endpoint', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    await createTrackApi(fetchImplementation).remove({ ids: ['track-1'], saved: true });
    expect(fetchImplementation).toHaveBeenCalledWith('/api/v1/tracks/saved', {
      method: 'DELETE', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['track-1'] }),
    });
  });
});
