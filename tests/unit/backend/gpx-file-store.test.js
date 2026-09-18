import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createGpxFileStore, GpxFileTooLargeError } from '../../../src/backend/gpx-file-store.js';

function createBucket() {
  const uploads = [];
  return {
    uploads,
    openUploadStream(filename, options) {
      const stream = new PassThrough();
      const chunks = [];
      stream.id = 'file-1';
      stream.abort = vi.fn().mockResolvedValue(undefined);
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('finish', () => uploads.push({ filename, options, contents: Buffer.concat(chunks).toString() }));
      return stream;
    },
    openDownloadStream: vi.fn().mockReturnValue(Readable.from('download')),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('GPX file store', () => {
  it('streams a GPX into the dedicated GridFS bucket with allowlisted metadata', async () => {
    const bucket = createBucket();
    const store = createGpxFileStore({ bucket, maxBytes: 100 });

    const fileId = await store.save({
      filename: 'ride.gpx',
      ownerId: 'owner-1',
      source: Readable.from('<gpx />'),
    });

    expect(fileId).toBe('file-1');
    expect(bucket.uploads).toEqual([{
      filename: 'ride.gpx',
      options: {
        contentType: 'application/gpx+xml',
        metadata: { ownerId: 'owner-1' },
      },
      contents: '<gpx />',
    }]);
  });

  it('aborts the GridFS upload when the source exceeds the byte limit', async () => {
    const bucket = createBucket();
    const store = createGpxFileStore({ bucket, maxBytes: 5 });

    await expect(store.save({
      filename: 'large.gpx',
      ownerId: 'owner-1',
      source: Readable.from('123456'),
    })).rejects.toBeInstanceOf(GpxFileTooLargeError);

    expect(bucket.uploads).toEqual([]);
  });

  it('opens public downloads and deletes files by their database id', async () => {
    const bucket = createBucket();
    const store = createGpxFileStore({ bucket });

    expect(store.openDownload('file-1')).toBeInstanceOf(Readable);
    await store.delete('file-1');

    expect(bucket.openDownloadStream).toHaveBeenCalledWith('file-1');
    expect(bucket.delete).toHaveBeenCalledWith('file-1');
  });
});
