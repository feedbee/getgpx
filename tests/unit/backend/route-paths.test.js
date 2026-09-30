import { describe, expect, it } from 'vitest';
import { createAuthRouter } from '../../../src/backend/auth.js';
import { createTrackRouter } from '../../../src/backend/track-routes.js';

function dispatch(router, method, url) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    router.handle({ method, url, headers: {} }, response, (error) => {
      if (error) reject(error);
      else resolve({ unmatched: true });
    });
  });
}

describe('HTTP route migration', () => {
  const auth = { getUser: async () => null };
  const tracks = {
    getHomepageTracks: async () => [],
    getPublicTrack: async (id) => ({ id }),
    getPublicDownload: async () => null,
  };

  it('serves homepage and session outside the versioned API', async () => {
    expect(await dispatch(createTrackRouter(tracks, auth), 'GET', '/homepage'))
      .toEqual({ status: 200, body: { data: [] } });
    expect(await dispatch(createAuthRouter(auth), 'GET', '/auth/session'))
      .toEqual({ status: 200, body: { user: null } });
  });

  it('serves public v1 tracks and preserves GPX read/write access rules', async () => {
    const router = createTrackRouter(tracks, auth);
    const path = '/api/v1/tracks/Abcdef_1234567890XYZ';
    expect(await dispatch(router, 'GET', path))
      .toEqual({ status: 200, body: { data: { id: 'Abcdef_1234567890XYZ' } } });
    expect(await dispatch(router, 'GET', `${path}/gpx`))
      .toMatchObject({ status: 404, body: { error: { code: 'TRACK_NOT_FOUND' } } });
    expect(await dispatch(router, 'PUT', `${path}/gpx`))
      .toMatchObject({ status: 401, body: { error: { code: 'AUTHENTICATION_REQUIRED' } } });
  });

  it.each([
    ['GET', '/api/tracks/homepage'],
    ['GET', '/api/tracks/Abcdef_1234567890XYZ'],
    ['GET', '/api/v1/tracks/Abcdef_1234567890XYZ/download'],
    ['PUT', '/api/v1/tracks/Abcdef_1234567890XYZ/file'],
  ])('retires %s %s', async (method, path) => {
    expect(await dispatch(createTrackRouter(tracks, auth), method, path)).toEqual({ unmatched: true });
  });

  it('retires the old auth namespace', async () => {
    expect(await dispatch(createAuthRouter(auth), 'GET', '/api/auth/session')).toEqual({ unmatched: true });
  });
});
