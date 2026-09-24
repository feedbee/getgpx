import { describe, expect, it, vi } from 'vitest';
import { createTrackInternalHandler } from '../../../src/backend/track-internal-router.js';

function response() {
  const headers = {};
  return { headers, statusCode: 200, setHeader: (key, value) => { headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, end() { this.ended = true; return this; } };
}

describe('internal track handoff', () => {
  it('returns a signed URL only after selecting the current authorized object', async () => {
    const fileDescriptor = vi.fn(async () => ({ key: 'dev/tracks/0123456789abcdef01234567/active/source.gpx',
      revision: 'active', filename: 'ride.gpx' }));
    const sign = vi.fn(() => 'https://example.cloudfront.net/signed');
    const handler = createTrackInternalHandler({ fileDescriptor }, { getUser: vi.fn(async () => null) },
      { delivery: 'nginx', cloudFrontDomain: 'example.cloudfront.net', cloudFrontKeyPairId: 'K123', cloudFrontPrivateKey: 'test' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'download' }, headers: {} }, result);
    expect(fileDescriptor).toHaveBeenCalledWith('publicTrackId00000001', 'download', null);
    expect(result.headers['X-Track-File-URL']).toBe('https://example.cloudfront.net/signed');
    expect(result.ended).toBe(true);
    expect(result.body).toBeUndefined();
  });

  it('does not sign unavailable analysis', async () => {
    const sign = vi.fn();
    const handler = createTrackInternalHandler({ fileDescriptor: async () => ({ key: null }) },
      { getUser: async () => null }, { delivery: 'nginx' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'analysis' }, headers: {} }, result);
    expect(result.statusCode).toBe(409);
    expect(sign).not.toHaveBeenCalled();
  });

  it('does not sign when identity lookup fails', async () => {
    const sign = vi.fn();
    const handler = createTrackInternalHandler({ fileDescriptor: vi.fn() },
      { getUser: async () => { throw new Error('database unavailable'); } }, { delivery: 'nginx' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'download' }, headers: {} }, result);
    expect(result.statusCode).toBe(502);
    expect(result.headers['X-Track-File-URL']).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
  });
});
