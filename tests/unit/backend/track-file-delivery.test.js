import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createTrackFileDelivery } from '../../../src/backend/track-file-delivery.js';

const config = { prefix: 'prod', cloudFrontDomain: 'example.cloudfront.net',
  cloudFrontKeyPairId: 'K123', cloudFrontPrivateKey: 'private' };
const query = '?Expires=123&Signature=abc~_-&Key-Pair-Id=K123';

describe('nginx track file delivery', () => {
  it.each([['gpx', 'source.gpx'], ['analysis', 'analysis.json']])('signs %s without the S3 prefix and returns only a local redirect', (kind, filename) => {
    const sign = vi.fn(({ url }) => url + query);
    const key = `prod/tracks/object/revision/${filename}`;
    const redirect = createTrackFileDelivery(config, { sign }).redirectFor({ key }, kind);
    expect(redirect).toBe(`/_track_files/tracks/object/revision/${filename}${query}`);
    expect(sign).toHaveBeenCalledWith({ url: `https://example.cloudfront.net/tracks/object/revision/${filename}`,
      keyPairId: 'K123', privateKey: 'private', dateLessThan: expect.any(String) });
    expect(Date.parse(sign.mock.calls[0][0].dateLessThan) - Date.now()).toBeGreaterThan(55_000);
  });

  it('accepts the real AWS signer output without exposing its host', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const redirect = createTrackFileDelivery({ ...config, cloudFrontPrivateKey: privateKey })
      .redirectFor({ key: 'prod/tracks/object/revision/source.gpx' }, 'gpx');
    const url = new URL(redirect, 'http://nginx.test');
    expect(url.pathname).toBe('/_track_files/tracks/object/revision/source.gpx');
    expect(Number(url.searchParams.get('Expires'))).toBeGreaterThan(Date.now() / 1000 + 50);
    expect(url.searchParams.get('Signature')).toBeTruthy();
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K123');
    expect(redirect).not.toContain('example.cloudfront.net');
  });

  it.each(['dev/tracks/object/revision/analysis.json', 'prod/tracks/../revision/analysis.json',
    'prod/tracks/object/revision/source.gpx', 'prod/tracks/object/revision/analysis.json?secret=1'])('refuses invalid object %s before signing', (key) => {
    const sign = vi.fn();
    expect(() => createTrackFileDelivery(config, { sign }).redirectFor({ key }, 'analysis')).toThrow();
    expect(sign).not.toHaveBeenCalled();
  });

  it.each(['https://evil.test/tracks/object/revision/analysis.json' + query,
    'https://example.cloudfront.net/other' + query,
    'https://example.cloudfront.net/tracks/object/revision/analysis.json?Signature=abc',
    'https://example.cloudfront.net/tracks/object/revision/analysis.json' + query + '#fragment',
    'https://example.cloudfront.net/tracks/object/revision/analysis.json' + query + '&Signature=duplicate'])('refuses unsafe signed URLs', (signed) => {
    expect(() => createTrackFileDelivery(config, { sign: () => signed })
      .redirectFor({ key: 'prod/tracks/object/revision/analysis.json' }, 'analysis')).toThrow();
  });
});
