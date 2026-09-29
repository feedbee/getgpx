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
      { delivery: 'nginx', prefix: 'dev', cloudFrontDomain: 'example.cloudfront.net', cloudFrontKeyPairId: 'K123', cloudFrontPrivateKey: 'test' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'download' }, headers: {} }, result);
    expect(fileDescriptor).toHaveBeenCalledWith('publicTrackId00000001', 'download', null);
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.cloudfront.net/tracks/0123456789abcdef01234567/active/source.gpx',
    }));
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
    const log = { error: vi.fn() };
    const handler = createTrackInternalHandler({ fileDescriptor: vi.fn() },
      { getUser: async () => { throw Object.assign(new Error('database unavailable'), { name: 'MongoServerError', code: 91 }); } }, { delivery: 'nginx' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'download' }, headers: {}, log }, result);
    expect(result.statusCode).toBe(502);
    expect(result.headers['X-Track-File-URL']).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith({ event: 'track_file_handoff_failed', kind: 'download',
      stage: 'descriptor', errorName: 'MongoServerError', errorCode: 91 }, 'Track file handoff failed');
  });

  it('logs signing failures without returning the signing error or URL', async () => {
    const log = { error: vi.fn() };
    const handler = createTrackInternalHandler({ fileDescriptor: async () => ({ key: 'dev/tracks/0123456789abcdef01234567/r1/analysis.json' }) },
      { getUser: async () => null }, { delivery: 'nginx', prefix: 'dev', cloudFrontDomain: 'example.cloudfront.net' },
      { sign: () => { throw Object.assign(new Error('private key contents'), { name: 'InvalidKey' }); } });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'analysis' }, headers: {}, log }, result);
    expect(result.statusCode).toBe(502);
    expect(log.error).toHaveBeenCalledWith({ event: 'track_file_handoff_failed', kind: 'analysis',
      stage: 'sign', errorName: 'InvalidKey' }, 'Track file handoff failed');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('private key contents');
    expect(result.headers['X-Track-File-URL']).toBeUndefined();
  });

  it('signs the viewer path while retaining the prod-prefixed S3 key', async () => {
    const key = 'prod/tracks/0123456789abcdef01234567/r2/analysis.json';
    const sign = vi.fn(() => 'https://example.cloudfront.net/signed');
    const handler = createTrackInternalHandler({ fileDescriptor: async () => ({ key, revision: 'r2' }) },
      { getUser: async () => null }, { delivery: 'nginx', prefix: 'prod', cloudFrontDomain: 'example.cloudfront.net' }, { sign });
    await handler({ params: { id: 'publicTrackId00000001', kind: 'analysis' }, headers: {} }, response());
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.cloudfront.net/tracks/0123456789abcdef01234567/r2/analysis.json',
    }));
  });

  it('refuses to sign an object outside the configured S3 prefix', async () => {
    const sign = vi.fn();
    const handler = createTrackInternalHandler({ fileDescriptor: async () => ({
      key: 'dev/tracks/0123456789abcdef01234567/r2/analysis.json',
    }) }, { getUser: async () => null },
    { delivery: 'nginx', prefix: 'prod', cloudFrontDomain: 'example.cloudfront.net' }, { sign });
    const result = response();
    await handler({ params: { id: 'publicTrackId00000001', kind: 'analysis' }, headers: {} }, result);
    expect(result.statusCode).toBe(502);
    expect(sign).not.toHaveBeenCalled();
  });
});
