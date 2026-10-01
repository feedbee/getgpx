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
    const fileDescriptor = vi.fn(async () => ({ key: 'prod/tracks/object/revision/preview-aaaaaaaaaaaaaaaa.png' }));
    const redirect = '/_track_files/tracks/object/revision/preview-aaaaaaaaaaaaaaaa.png?Signature=test';
    const result = await request(app({ fileDescriptor, getPreview }, true, {
      delivery: 'nginx', fileDelivery: { redirectFor: () => redirect },
    }), { url: '/track-previews/route.png' });
    expect(result.status).toBe(200);
    expect(result.text).toBe('');
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.headers['x-accel-redirect']).toBe(redirect);
    expect(fileDescriptor).toHaveBeenCalledWith('route', 'preview', { id: 'user' });
    expect(getPreview).not.toHaveBeenCalled();
  });

  it('returns no image for unavailable previews and rejects invalid identities', async () => {
    const server = app({ getPreview: async () => null });
    expect((await request(server, { url: '/track-previews/route.png' })).status).toBe(204);
    expect((await request(server, { url: '/track-previews/a-b.png' })).status).toBe(404);
  });
});
