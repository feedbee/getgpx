import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createTrackInternalRouter } from '../../../../src/backend/track-internal-router.js';
import { createApiRouter } from '../../../../src/backend/api/router.js';
import { request } from './http.js';

function app(service = {}, auth = { getUser: async () => null }, options = {}) {
  const result = express();
  result.use('/api', createApiRouter(service, auth, { origin: 'https://getgpx.test', ...options }));
  return result;
}

describe('versioned API boundary', () => {
  it('serves the contract and both documentation views on the same origin', async () => {
    const server = app();
    for (const url of ['/api/assets/swagger-ui-bundle.js', '/api/assets/swagger-ui.css',
      '/api/assets/scalar/standalone.js', '/api/assets/docs/scalar.js']) {
      expect((await request(server, { method: 'HEAD', url })).status).toBe(200);
    }
    const spec = await request(server, { url: '/api/v1/openapi.json' });
    expect(spec.status).toBe(200);
    expect(spec.json().openapi).toBe('3.0.3');
    for (const url of ['/api/docs', '/api/swagger']) {
      const result = await request(server, { url });
      expect(result.status).toBe(200);
      expect(result.text).toContain('GetGPX API');
      expect(result.headers['content-security-policy']).toContain("script-src 'self'");
      expect(result.text).not.toMatch(/https:\/\//);
    }
  });

  it('returns JSON for unknown paths, versions and unsupported methods', async () => {
    const server = app();
    for (const url of ['/api/v2/tracks/a', '/api/v1/missing', '/api/tracks/a']) {
      expect((await request(server, { url })).json()).toEqual({ error: { code: 'API_NOT_FOUND' } });
    }
    const unsupported = await request(server, { method: 'POST', url: '/api/v1/tracks/a/gpx' });
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.allow).toContain('PUT');
    expect(unsupported.json().error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('rejects cross-origin scripts before identity lookup or mutations', async () => {
    const getUser = vi.fn();
    const server = app({}, { getUser });
    for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' },
      { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' },
      { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'cors' }]) {
      const result = await request(server, { method: 'POST', url: '/api/v1/tracks', headers });
      expect(result.status).toBe(403);
      expect(result.json().error.code).toBe('CROSS_ORIGIN_FORBIDDEN');
      expect(result.headers).not.toHaveProperty('access-control-allow-origin');
    }
    expect(getUser).not.toHaveBeenCalled();
    expect((await request(server, { method: 'OPTIONS', url: '/api/v1/tracks', headers: { origin: 'https://evil.test' } })).status).toBe(403);
  });

  it('applies the same origin policy before an Nginx signing handoff', async () => {
    const fileDescriptor = vi.fn();
    const sign = vi.fn();
    const server = express();
    server.use(createTrackInternalRouter({ fileDescriptor }, { getUser: async () => null },
      { delivery: 'nginx' }, { origin: 'https://getgpx.test', sign }));
    const result = await request(server, { url: '/internal/track-files/example/download',
      headers: { origin: 'https://evil.test' } });
    expect(result.status).toBe(403);
    expect(fileDescriptor).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('allows same-origin and direct calls, preserving guest restrictions', async () => {
    const server = app();
    for (const headers of [{}, { origin: 'https://getgpx.test', 'sec-fetch-site': 'same-origin' }]) {
      expect((await request(server, { method: 'POST', url: '/api/v1/tracks', headers })).status).toBe(401);
    }
  });

  it('preserves automatic session resolution and strips undeclared response fields', async () => {
    const listMyTracks = vi.fn(async () => ({ items: [], nextCursor: null, secret: 'must-not-leak' }));
    const getUser = vi.fn();
    const server = app({ listMyTracks }, { getUser }, { sessionMiddleware: (req, _res, next) => {
      req.authenticatedUser = { id: '0123456789abcdef01234567' }; next();
    } });
    const result = await request(server, { url: '/api/v1/tracks/mine' });
    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ data: { items: [], nextCursor: null } });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('normalizes parser errors and does not leak provider exceptions', async () => {
    const server = app({ getPublicTrack: async () => { throw new Error('private provider URL'); } });
    const malformed = await request(server, { method: 'PATCH', url: '/api/v1/tracks/a', headers: { 'content-type': 'application/json' }, body: '{' });
    expect(malformed.status).toBe(400);
    expect(malformed.json()).toEqual({ error: { code: 'INVALID_JSON' } });
    const oversized = await request(server, { method: 'PATCH', url: '/api/v1/tracks/a', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'a'.repeat(17_000) }) });
    expect(oversized.status).toBe(413);
    const failure = await request(server, { url: '/api/v1/tracks/a' });
    expect(failure.status).toBe(500);
    expect(failure.json()).toEqual({ error: { code: 'INTERNAL_ERROR' } });
  });
});
