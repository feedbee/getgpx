import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { GpxFileTooLargeError } from './gpx-file-store.js';
import { TRACK_UPLOAD_LIMITS } from './track-repository.js';

const TRACK_ID = /^[a-f\d]{24}$/i;
const REVISION = /^[A-Za-z0-9_-]+$/;

export function createTrackObjectStore({ s3, send = (command) => s3.send(command), upload, bucket, prefix }) {
  if (!bucket || !prefix || !/^[A-Za-z0-9_-]+$/.test(prefix)) throw new Error('Invalid track object store configuration.');
  const base = `${prefix}/tracks/`;
  const keyFor = (trackId, revision, filename) => {
    if (!TRACK_ID.test(String(trackId)) || !REVISION.test(String(revision))) throw new Error('Invalid track object identity.');
    return `${base}${trackId}/${revision}/${filename}`;
  };
  const assertKey = (key) => {
    if (typeof key !== 'string' || !new RegExp(`^${base}[a-f\\d]{24}/[A-Za-z0-9_-]+/(?:source\\.gpx|analysis\\.json)$`, 'i').test(key)) {
      throw new Error('Track object key is outside the configured prefix.');
    }
    return key;
  };
  const uploadBody = upload || (async ({ Key, Body, ContentType }) => {
    await new Upload({ client: s3, params: { Bucket: bucket, Key, Body, ContentType }, leavePartsOnError: false }).done();
  });

  return {
    keyFor,
    assertKey,
    async writeSource({ trackId, revision, source }) {
      const key = keyFor(trackId, revision, 'source.gpx');
      let bytes = 0;
      const bounded = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > TRACK_UPLOAD_LIMITS.maxBytes ? new GpxFileTooLargeError(TRACK_UPLOAD_LIMITS.maxBytes) : null, chunk);
      } });
      const body = new PassThrough();
      const writer = uploadBody({ Key: key, Body: body, ContentType: 'application/gpx+xml' });
      try {
        await Promise.all([pipeline(source, bounded, body), writer]);
        return key;
      } catch (error) {
        body.destroy(error);
        await this.delete(key).catch(() => undefined);
        throw error;
      }
    },
    async copySource({ fromKey, trackId, revision }) {
      assertKey(fromKey);
      const key = keyFor(trackId, revision, 'source.gpx');
      await send(new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: `${bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}` }));
      return key;
    },
    async writeAnalysis({ trackId, revision, analysis, status = 'READY', completeness = 'FULL', analysisSources = {} }) {
      const key = keyFor(trackId, revision, 'analysis.json');
      const body = JSON.stringify({ schemaVersion: 1, revision, status, completeness, analysisSources, analysis });
      await send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json' }));
      return key;
    },
    async openRead(key) {
      const result = await send(new GetObjectCommand({ Bucket: bucket, Key: assertKey(key) }));
      return result.Body;
    },
    async readSource(key) {
      const chunks = [];
      for await (const chunk of await this.openRead(key)) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    },
    async readAnalysis(key) {
      return JSON.parse(await this.readSource(key));
    },
    async delete(key) {
      if (!key) return;
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: assertKey(key) }));
    },
  };
}
