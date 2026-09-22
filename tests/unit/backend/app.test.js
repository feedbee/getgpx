import { describe, expect, it, vi } from 'vitest';
import { createHealthHandlers, defaultStaticDirectory } from '../../../src/backend/app.js';

describe('production static files', () => {
  it('serves the root Vite dist directory rather than src/dist', () => {
    expect(defaultStaticDirectory).toMatch(/\/(?:track-hub|getgpx)\/dist$/);
    expect(defaultStaticDirectory).not.toMatch(/\/src\/dist$/);
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
