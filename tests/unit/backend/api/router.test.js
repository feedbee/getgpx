import express from 'express';
import { describe, expect, it, vi } from 'vitest';
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
    const server = app({ fileDescriptor }, { getUser: async () => null },
      { delivery: 'nginx', fileDelivery: { redirectFor: sign } });
    const result = await request(server, { url: '/api/v1/tracks/example/gpx',
      headers: { origin: 'https://evil.test' } });
    expect(result.status).toBe(403);
    expect(fileDescriptor).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'])('uses the public API for nginx %s handoff without opening S3', async (method) => {
    const fileDescriptor = vi.fn(async () => ({ key: 'prod/tracks/object/revision/source.gpx', filename: 'Заезд.gpx' }));
    const getPublicGpx = vi.fn();
    const redirectFor = vi.fn(() => '/_track_files/tracks/object/revision/source.gpx?Expires=1&Signature=test&Key-Pair-Id=K1');
    const server = app({ fileDescriptor, getPublicGpx }, {}, { delivery: 'nginx', fileDelivery: { redirectFor },
      sessionMiddleware: (req, _res, next) => { req.authenticatedUser = null; next(); } });
    const result = await request(server, { method, url: '/api/v1/tracks/example/gpx' });
    expect(result.status).toBe(200);
    expect(result.headers['x-accel-redirect']).toContain('/_track_files/');
    expect(result.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.text).toBe('');
    expect(getPublicGpx).not.toHaveBeenCalled();
    expect(fileDescriptor).toHaveBeenCalledWith('example', 'gpx', null);
  });

  it.each([[null, 404, 'TRACK_NOT_FOUND'], [{ key: null }, 409, 'TRACK_ANALYSIS_NOT_READY']])('returns nginx file errors as API JSON', async (descriptor, status, code) => {
    const redirectFor = vi.fn();
    const server = app({ fileDescriptor: async () => descriptor }, { getUser: async () => null },
      { delivery: 'nginx', fileDelivery: { redirectFor } });
    const result = await request(server, { url: '/api/v1/tracks/example/analysis' });
    expect(result.status).toBe(status);
    expect(result.json().error.code).toBe(code);
    expect(result.headers).not.toHaveProperty('x-accel-redirect');
    expect(redirectFor).not.toHaveBeenCalled();
  });

  it.each(['descriptor', 'sign'])('logs nginx %s failures and keeps details out of the response', async (stage) => {
    const log = { error: vi.fn() };
    const failure = Object.assign(new Error('private signature'), { code: 'FAILED' });
    const server = app({ fileDescriptor: async () => {
      if (stage === 'descriptor') throw failure;
      return { key: 'key' };
    } }, { getUser: async () => null }, { delivery: 'nginx',
      fileDelivery: { redirectFor: () => { throw failure; } },
      sessionMiddleware: (req, _res, next) => { req.log = log; next(); } });
    const result = await request(server, { url: '/api/v1/tracks/example/analysis' });
    expect(result.status).toBe(502);
    expect(result.json().error.code).toBe('TRACK_FILE_UNAVAILABLE');
    expect(result.text).not.toContain('private signature');
    expect(result.headers).not.toHaveProperty('x-accel-redirect');
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_file_delivery_failed', kind: 'analysis', publicId: 'example', stage, errorCode: 'FAILED',
    }), 'Track file delivery failed');
  });

  it('keeps PUT GPX in Node and removes the old signing endpoint', async () => {
    const redirectFor = vi.fn();
    const server = app({}, { getUser: async () => null }, { delivery: 'nginx', fileDelivery: { redirectFor } });
    expect((await request(server, { method: 'PUT', url: '/api/v1/tracks/example/gpx' })).status).toBe(401);
    expect((await request(server, { method: 'POST', url: '/api/v1/tracks/example/gpx' })).status).toBe(405);
    expect((await request(server, { url: '/internal/track-files/example/gpx' })).status).toBe(404);
    expect(redirectFor).not.toHaveBeenCalled();
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
