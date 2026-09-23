import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { createRequestProfiler, profileStep } from '../../../src/backend/request-profile.js';
import { createRequestLogger } from '../../../src/backend/logger.js';
import { createTrackHandlers } from '../../../src/backend/track-routes.js';

describe('request profiling', () => {
  it('does not time or log work below debug level', async () => {
    const log = { isLevelEnabled: vi.fn().mockReturnValue(false), debug: vi.fn() };
    const profile = createRequestProfiler(log);

    await expect(profileStep(profile, 'track.find', () => Promise.resolve('result'))).resolves.toBe('result');
    expect(profile).toBeNull();
    expect(log.debug).not.toHaveBeenCalled();
  });

  it('logs a timed step even when the operation fails', async () => {
    const log = { isLevelEnabled: vi.fn().mockReturnValue(true), debug: vi.fn() };
    const profile = createRequestProfiler(log);
    const failure = new Error('failed');

    await expect(profileStep(profile, 'track.find', () => Promise.reject(failure))).rejects.toBe(failure);
    expect(log.debug).toHaveBeenCalledWith(
      { step: 'track.find', durationMs: expect.any(Number) }, 'Request step completed',
    );
  });

  it('keeps step and HTTP logs under the same request ID', async () => {
    const entries = [];
    const log = pino({ level: 'debug' }, { write: (line) => entries.push(JSON.parse(line)) });
    const request = { method: 'GET', url: '/api/tracks/homepage', headers: {} };
    const response = new EventEmitter();
    response.statusCode = 200;
    response.setHeader = () => {};
    response.status = function (code) { this.statusCode = code; return this; };
    response.json = function () { this.emit('finish'); return this; };
    createRequestLogger(log)(request, response, () => {});
    const service = {
      getHomepageTracks: async (profile) => profile('homepage.listTracks', async () => []),
    };

    await createTrackHandlers(service, {}).homepageTracks(request, response);

    expect(entries.map((entry) => entry.level)).toEqual([20, 30]);
    expect(entries[0]).toMatchObject({ step: 'homepage.listTracks', durationMs: expect.any(Number) });
    expect(entries[0].requestId).toBe(entries[1].requestId);
  });
});
