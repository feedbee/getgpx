import express from 'express';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createTrackPreviewRouter } from '../../../src/backend/site/track-preview-routes.js';
import { request } from './api/http.js';

function app(service, authenticated = true, options = {}) {
  const server = express();
  server.use(createTrackPreviewRouter(service, { ...options, sessionMiddleware: (req, _res, next) => {
    req.authenticatedUser = authenticated ? { id: 'user' } : null; next();
  } }));
  return server;
}

describe('website track previews', () => {
  it('requires login before doing provider work', async () => {
    const getPreview = vi.fn();
    expect((await request(app({ getPreview }, false), { url: '/track-previews/route.png' })).status).toBe(401);
    expect(getPreview).not.toHaveBeenCalled();
  });
  it('streams PNGs privately without adding anything to API v1', async () => {
    const result = await request(app({ getPreview: async () => Readable.from('png bytes') }), { url: '/track-previews/route.png' });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.text).toBe('png bytes');
  });
  it('hands preview delivery to nginx without opening S3 in Node', async () => {
    const getPreview = vi.fn();
    const previewDescriptor = vi.fn(async () => ({ key: 'prod/tracks/object/revision/preview-aaaaaaaaaaaaaaaa.png' }));
    const redirect = '/_track_files/tracks/object/revision/preview-aaaaaaaaaaaaaaaa.png?Signature=test';
    const result = await request(app({ previewDescriptor, getPreview }, true, {
      delivery: 'nginx', fileDelivery: { redirectFor: () => redirect },
    }), { url: '/track-previews/route.png' });
    expect(result.status).toBe(200);
    expect(result.text).toBe('');
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.headers['x-accel-redirect']).toBe(redirect);
    expect(previewDescriptor).toHaveBeenCalledWith('route', { id: 'user' });
    expect(getPreview).not.toHaveBeenCalled();
  });

  it('lets anonymous bots stream sharing images but keeps list images protected', async () => {
    const service = { previewDescriptor: vi.fn(async () => ({ key: 'stored-image' })),
      getPreview: vi.fn(async () => Readable.from('social png')) };
    const result = await request(app(service, false), { url: '/share-images/tracks/route.png' });
    expect(result.status).toBe(200);
    expect(result.text).toBe('social png');
    expect(service.previewDescriptor).toHaveBeenCalledWith('route', null, 'social');
    expect(service.getPreview).toHaveBeenCalledWith('route', null, 'social');
    expect((await request(app(service, false), { url: '/track-previews/route.png' })).status).toBe(401);
  });
  it('does not hand inaccessible sharing images to nginx', async () => {
    const sign = vi.fn();
    const result = await request(app({ previewDescriptor: async () => null }, false,
      { delivery: 'nginx', fileDelivery: { redirectFor: sign } }), { url: '/share-images/tracks/route.png' });
    expect(result.status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it('returns no image for unavailable previews and rejects invalid identities', async () => {
    const server = app({ getPreview: async () => null });
    expect((await request(server, { url: '/track-previews/route.png' })).status).toBe(204);
    expect((await request(server, { url: '/track-previews/a-b.png' })).status).toBe(404);
  });
});
