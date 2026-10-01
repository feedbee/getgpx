import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTrackObjectStore } from '../../src/backend/track-object-store.js';

describe('S3 SDK track object contract', () => {
  const objects = new Map();
  let server;
  let s3;
  let store;
  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      const key = decodeURIComponent(url.pathname.slice('/track-files/'.length));
      if (request.method === 'PUT') {
        const copyFrom = request.headers['x-amz-copy-source'];
        if (copyFrom) {
          objects.set(key, objects.get(decodeURIComponent(copyFrom).replace(/^\/?track-files\//, '')));
          response.writeHead(200, { 'Content-Type': 'application/xml' });
          response.end('<CopyObjectResult><ETag>"copied"</ETag></CopyObjectResult>');
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        objects.set(key, Buffer.concat(chunks));
        response.writeHead(200, { ETag: '"stored"' }); response.end(); return;
      }
      if (request.method === 'GET' && objects.has(key)) {
        response.writeHead(200, { 'Content-Length': objects.get(key).length });
        response.end(objects.get(key)); return;
      }
      if (request.method === 'DELETE') { objects.delete(key); response.writeHead(204); response.end(); return; }
      response.writeHead(404); response.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    s3 = new S3Client({ region: 'eu-central-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      endpoint: `http://127.0.0.1:${server.address().port}`, forcePathStyle: true });
    store = createTrackObjectStore({ s3, bucket: 'track-files', prefix: 'dev' });
  });
  afterAll(async () => { s3?.destroy(); if (server) await new Promise((resolve) => server.close(resolve)); });

  it('uploads, reads, copies and deletes revisioned source and analysis objects', async () => {
    const trackId = '0123456789abcdef01234567';
    const sourceKey = await store.writeSource({ trackId, revision: 'first', source: Readable.from('<gpx>exact bytes</gpx>') });
    expect(await store.readSource(sourceKey)).toBe('<gpx>exact bytes</gpx>');
    const analysisKey = await store.writeAnalysis({ trackId, revision: 'first', analysis: { distanceKm: 3, points: [{ lat: 1 }] } });
    expect(await store.readAnalysis(analysisKey)).toMatchObject({ revision: 'first', metrics: { distanceKm: 3 } });
    const copied = await store.copySource({ fromKey: sourceKey, trackId, revision: 'second' });
    expect(await store.readSource(copied)).toBe('<gpx>exact bytes</gpx>');
    await store.delete(sourceKey);
    expect(objects.has(sourceKey)).toBe(false);
    await store.delete(sourceKey);
  });
});
