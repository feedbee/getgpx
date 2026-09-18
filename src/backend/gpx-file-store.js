import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TRACK_UPLOAD_LIMITS } from './track-repository.js';

export class GpxFileTooLargeError extends Error {
  constructor(maxBytes) {
    super(`GPX file exceeds the ${maxBytes} byte limit.`);
    this.name = 'GpxFileTooLargeError';
    this.code = 'GPX_FILE_TOO_LARGE';
  }
}

function createByteLimit(maxBytes) {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        callback(new GpxFileTooLargeError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
}

export function createGpxFileStore({ bucket, maxBytes = TRACK_UPLOAD_LIMITS.maxBytes }) {
  if (!bucket) throw new Error('A GridFS bucket is required.');

  return {
    async save({ filename, ownerId, source }) {
      const upload = bucket.openUploadStream(filename, {
        contentType: 'application/gpx+xml',
        metadata: { ownerId },
      });
      try {
        await pipeline(source, createByteLimit(maxBytes), upload);
        return upload.id;
      } catch (error) {
        await upload.abort?.().catch(() => undefined);
        throw error;
      }
    },

    openDownload(fileId) {
      return bucket.openDownloadStream(fileId);
    },

    delete(fileId) {
      return bucket.delete(fileId);
    },
  };
}
