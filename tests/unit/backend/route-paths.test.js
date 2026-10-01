import express from 'express';
import { describe, expect, it } from 'vitest';
import { createAuthRouter } from '../../../src/backend/site/auth-routes.js';
import { createHomepageRouter } from '../../../src/backend/site/homepage-routes.js';
import { createApiRouter } from '../../../src/backend/api/router.js';
import { request } from './api/http.js';

function app() {
  const auth = { getUser: async () => null };
  const tracks = { getHomepageTracks: async () => [], getPublicTrack: async (id) => ({ id }), getPublicDownload: async () => null };
  const server = express();
  server.use('/api', createApiRouter(tracks, auth));
  server.use(createAuthRouter(auth));
  server.use(createHomepageRouter(tracks));
  return server;
}

describe('HTTP route separation', () => {
  it('serves homepage and session outside the versioned API', async () => {
    expect((await request(app(), { url: '/homepage' })).json()).toEqual({ data: [] });
    expect((await request(app(), { url: '/auth/session' })).json()).toEqual({ user: null });
  });
  it('serves public v1 tracks and preserves GPX read/write access rules', async () => {
    const server = app();
    const url = '/api/v1/tracks/Abcdef_1234567890XYZ';
    expect((await request(server, { url })).json()).toEqual({ data: { id: 'Abcdef_1234567890XYZ' } });
    expect((await request(server, { url: `${url}/gpx` })).status).toBe(404);
    expect((await request(server, { method: 'PUT', url: `${url}/gpx` })).status).toBe(401);
  });
  it.each([
    ['GET', '/api/tracks/homepage'], ['GET', '/api/auth/session'],
    ['GET', '/api/tracks/Abcdef_1234567890XYZ'],
    ['GET', '/api/v1/tracks/Abcdef_1234567890XYZ/download'],
    ['PUT', '/api/v1/tracks/Abcdef_1234567890XYZ/file'],
  ])('retires %s %s', async (method, url) => {
    expect((await request(app(), { method, url })).status).toBe(404);
  });
});
