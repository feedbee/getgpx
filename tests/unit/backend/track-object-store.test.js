import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createTrackObjectStore } from '../../../src/backend/track-object-store.js';

describe('S3 track object store', () => {
  it('requires an explicit safe prefix when created directly', () => {
    expect(() => createTrackObjectStore({ bucket: 'track-files' })).toThrow('Invalid track object store configuration.');
  });

  it('uses revisioned prefixed keys and preserves original source bytes', async () => {
    const stored = new Map();
    const store = createTrackObjectStore({
      bucket: 'track-files', prefix: 'dev',
      upload: vi.fn(async ({ Key, Body }) => { const chunks = []; for await (const chunk of Body) chunks.push(Buffer.from(chunk)); stored.set(Key, Buffer.concat(chunks)); }),
      send: vi.fn(async (command) => {
        if (command.constructor.name === 'GetObjectCommand') return { Body: Readable.from(stored.get(command.input.Key)) };
      }),
    });
    const source = Buffer.from('<gpx>source</gpx>');
    const sourceKey = await store.writeSource({ trackId: '0123456789abcdef01234567', revision: 'one', source: Readable.from(source) });
    expect(sourceKey).toBe('dev/tracks/0123456789abcdef01234567/one/source.gpx');
    expect(await store.readSource(sourceKey)).toBe(source.toString());
  });

  it('rejects reads outside its prefix', async () => {
    const store = createTrackObjectStore({ bucket: 'track-files', prefix: 'dev', send: vi.fn() });
    await expect(store.openRead('prod/tracks/x/one/source.gpx')).rejects.toThrow();
  });

  it('rejects a source larger than 25 MiB even without a declared length', async () => {
    const store = createTrackObjectStore({ bucket: 'track-files', prefix: 'dev',
      upload: async ({ Body }) => { for await (const chunk of Body) { expect(chunk.length).toBeGreaterThan(0); } },
      send: vi.fn(async () => undefined) });
    await expect(store.writeSource({ trackId: '0123456789abcdef01234567', revision: 'large',
      source: Readable.from(Buffer.alloc(25 * 1024 * 1024 + 1)) })).rejects.toMatchObject({ code: 'GPX_FILE_TOO_LARGE' });
  });

  it('logs a failed best-effort cleanup without replacing the original upload error', async () => {
    const warn = vi.fn();
    const store = createTrackObjectStore({ bucket: 'track-files', prefix: 'dev', warn,
      upload: async () => { throw Object.assign(new Error('source upload failed'), { name: 'AccessDenied' }); },
      send: async () => { throw Object.assign(new Error('secret in cleanup response'), { name: 'ServiceUnavailable',
        $metadata: { httpStatusCode: 503 } }); },
    });
    await expect(store.writeSource({ trackId: '0123456789abcdef01234567', revision: 'one',
      source: Readable.from('<gpx/>') })).rejects.toMatchObject({ name: 'AccessDenied' });
    expect(warn).toHaveBeenCalledWith({ event: 'track_source_cleanup_failed',
      trackId: '0123456789abcdef01234567', revision: 'one', errorName: 'ServiceUnavailable',
      upstreamStatusCode: 503 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret in cleanup response');
  });
});
