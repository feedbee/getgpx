import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApp, createHealthHandlers, defaultStaticDirectory, frontendPageStatus } from '../../../src/backend/app.js';

describe('production static files', () => {
  it('allows the browser to identify the site to OpenStreetMap tile servers', async () => {
    const app = createApp({ database: { ping: vi.fn() } });
    const headers = new Map();
    const response = {
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      removeHeader(name) { headers.delete(name.toLowerCase()); },
    };
    await new Promise((resolve, reject) => app.router.stack[0].handle({}, response, (error) => error ? reject(error) : resolve()));
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('content-security-policy')).toContain('https://tile.openstreetmap.org');
  });

  it('serves the root Vite dist directory rather than src/dist', () => {
    const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
    expect(defaultStaticDirectory).toBe(path.join(projectRoot, 'dist'));
  });

  it('returns the app shell only for known frontend routes', () => {
    expect(frontendPageStatus('/')).toBe(200);
    expect(frontendPageStatus('/my-tracks')).toBe(200);
    expect(frontendPageStatus('/favorite-tracks')).toBe(200);
    expect(frontendPageStatus('/tracks/AxoslgzL_iLHv88P5AYoe')).toBe(200);
    expect(frontendPageStatus('/missing-page')).toBe(404);
    expect(frontendPageStatus('/tracks/with-hyphen')).toBe(404);
  });
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('health endpoints', () => {
  it('reports process liveness without touching MongoDB', async () => {
    const database = { ping: vi.fn() };
    const response = createResponse();

    createHealthHandlers(database).live({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it('reports readiness only when MongoDB responds', async () => {
    const ready = createResponse();
    const unavailable = createResponse();

    await createHealthHandlers({ ping: vi.fn().mockResolvedValue(true) }).ready({}, ready);
    await createHealthHandlers({ ping: vi.fn().mockRejectedValue(new Error('offline')) }).ready({}, unavailable);

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toEqual({ status: 'ready' });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.body).toEqual({ status: 'unavailable' });
  });
});
