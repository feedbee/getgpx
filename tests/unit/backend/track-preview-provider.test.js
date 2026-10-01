import { describe, expect, it, vi } from 'vitest';
import { createTrackPreviewProvider } from '../../../src/backend/track-previews/provider.js';

const points = [{ lat: 50, lon: 20 }, { lat: 50.1, lon: 20.2 }];
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d494844520000020000000200', 'hex'), Buffer.alloc(13), Buffer.from('0000000049454e44ae426082', 'hex')]);

describe('track preview provider', () => {
  it('is disabled by default and validates provider configuration', () => {
    expect(createTrackPreviewProvider({})).toBeNull();
    expect(() => createTrackPreviewProvider({ TRACK_PREVIEW_PROVIDER: 'carto' })).toThrow();
    expect(() => createTrackPreviewProvider({ TRACK_PREVIEW_PROVIDER: 'mapbox' })).toThrow('MAPBOX_ACCESS_TOKEN');
  });

  it('requests a square softly colored map with a white outline and blue route, without exposing the token', async () => {
    const fetch = vi.fn(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }));
    const provider = createTrackPreviewProvider({ TRACK_PREVIEW_PROVIDER: 'mapbox', MAPBOX_ACCESS_TOKEN: 'test-secret' }, { fetch });
    expect(await provider.render(points)).toEqual(png);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toContain('/mapbox/streets-v12/static/path-15+ffffff-1');
    expect(url.pathname).toContain('path-6+1769d2-1');
    expect(url.pathname).toContain('/auto/256x256@2x');
    expect(url.searchParams.get('attribution')).toBe('false');
    expect(url.searchParams.get('access_token')).toBe('test-secret');
    expect(JSON.stringify(provider)).not.toContain('test-secret');
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });

  it('rejects non-PNG responses and oversized routes before requesting a map', async () => {
    const fetch = vi.fn(async () => new Response('bad', { headers: { 'Content-Type': 'image/png' } }));
    const provider = createTrackPreviewProvider({ TRACK_PREVIEW_PROVIDER: 'mapbox', MAPBOX_ACCESS_TOKEN: 'test-secret' }, { fetch });
    await expect(provider.render(points)).rejects.toThrow('Invalid preview image');
    await expect(provider.render([{ lat: 91, lon: 20 }, points[1]])).rejects.toThrow('Invalid preview coordinates');
    const largeRoute = Array.from({ length: 2000 }, (_, i) => ({ lat: i % 2 ? 50 : -50, lon: i % 2 ? 20 : -20 }));
    await expect(provider.render(largeRoute)).rejects.toThrow('URL limit');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('versions images when the style changes, independently of credentials', () => {
    const config = { TRACK_PREVIEW_PROVIDER: 'mapbox', MAPBOX_ACCESS_TOKEN: 'first' };
    expect(createTrackPreviewProvider(config).version).toBe(createTrackPreviewProvider({ ...config, MAPBOX_ACCESS_TOKEN: 'second' }).version);
    expect(createTrackPreviewProvider(config).version).not.toBe(createTrackPreviewProvider({ ...config, MAPBOX_PREVIEW_STYLE: 'owner/custom' }).version);
  });
});
