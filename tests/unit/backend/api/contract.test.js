import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import express from 'express';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../../../src/backend/api/v1/openapi.json' with { type: 'json' };
import { trackRoutes } from '../../../../src/backend/api/v1/routes.js';
import { createApiRouter } from '../../../../src/backend/api/router.js';
import { createS3TrackService } from '../../../../src/backend/s3-track-service.js';
import { analyzeGpxSource, enrichTrackAnalysis } from '../../../../src/backend/track-analysis.js';
import { trackData, analysisDocument } from '../../../../src/backend/track-data.js';
import { publicTrack, card, statusOf } from '../../../../src/backend/s3-track-presenters.js';
import { serialize } from '../../../../src/backend/api/v1/serialization.js';
import { request } from './http.js';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'v1', components: contract.components });
function conforms(name, value) {
  const validate = ajv.compile({ $ref: `v1#/components/schemas/${name}` });
  expect(validate(JSON.parse(JSON.stringify(value))), JSON.stringify(validate.errors)).toBe(true);
}
const source = '<gpx><trk><name>Contract ride</name><trkseg><trkpt lat="50" lon="20"><ele>100</ele></trkpt><trkpt lat="50.01" lon="20.01"><ele>180</ele></trkpt><trkpt lat="50.02" lon="20.02"><ele>100</ele></trkpt></trkseg></trk><wpt lat="50.01" lon="20.01"><name>Water</name><type>water</type><sym>Water Source</sym></wpt></gpx>';

async function fixture(enriched = true) {
  const base = analyzeGpxSource(source, { filename: 'ride.gpx' });
  const analysis = enriched ? await enrichTrackAnalysis(base, {
    matchTrack: async () => [], fetchWayTags: async () => [],
  }) : base;
  const analysisSources = { gpx: 'SUCCESS', valhalla: enriched ? 'SUCCESS' : 'FAILED', openStreetMap: enriched ? 'SUCCESS' : 'FAILED' };
  const completeness = enriched ? 'FULL' : 'PARTIAL';
  const summary = trackData(analysis);
  const result = { revision: 'revision1', sourceKey: 'private/source.gpx', analysisKey: 'private/analysis.json',
    ...summary, preview: analysis.preview, completeness, sources: analysisSources,
    originalFilename: 'ride.gpx', sourcePointCount: analysis.sourcePointCount, pointsOfInterestCount: analysis.pointsOfInterest.length };
  const track = { _id: '0123456789abcdef01234567', publicId: 'publicTrackId00000001', ownerId: 'private-owner',
    title: 'Contract ride', routeType: 'cycling', createdAt: new Date('2026-09-01T00:00:00Z'),
    processing: { status: enriched ? 'READY' : 'FAILED', step: null, error: null }, result: { ...result, kind: enriched ? 'PUBLISHED' : 'DIAGNOSTIC' } };
  const document = analysisDocument({ revision: result.revision, completeness, analysisSources, analysis });
  const objectStore = { assertKey: (key) => key, openRead: vi.fn(async () => Readable.from(JSON.stringify(document))) };
  const service = createS3TrackService({
    trackRepository: { findByPublicId: async () => track, findOwnedByPublicId: async () => track,
      listOwned: async () => [track] }, objectStore,
    savedTrackRepository: { savedTrackIds: async () => [], list: async () => [{ track, savedAt: new Date(), author: { displayName: 'Rider' } }] },
    userRepository: { findPublicProfileById: async () => ({ displayName: 'Rider', avatarUrl: null }) },
    analyzeSource: () => base, enrichAnalysis: async () => analysis,
  });
  return { track, document, objectStore, service };
}

describe('download formats', () => {
  it('returns GPX as a keyed URL and supports additive download formats', () => {
    const schema = contract.components.schemas.DownloadURLs;
    expect(serialize(schema, { gpx: '/track.gpx', fit: '/track.fit' })).toEqual({ gpx: '/track.gpx', fit: '/track.fit' });
    conforms('DownloadURLs', { gpx: '/track.gpx', fit: '/track.fit' });
    conforms('DownloadURLs', {});
  });
});

describe('API v1 contract', () => {
  it('validates as OpenAPI and remains identical to the explicitly approved baseline', async () => {
    await SwaggerParser.validate(structuredClone(contract));
    const actual = createHash('sha256').update(JSON.stringify(contract)).digest('hex');
    const baseline = readFileSync(new URL('../../../contracts/api-v1.sha256', import.meta.url), 'utf8').trim();
    expect(actual, 'Public contract changed. Obtain user approval and review compatibility before updating the baseline.').toBe(baseline);
  });

  it('documents every actual route and only anonymous reads omit security', () => {
    const actual = trackRoutes.map(([method, path, operationId]) => `${method} ${path.replace(':id', '{id}')} ${operationId}`).sort();
    const declared = Object.entries(contract.paths).flatMap(([path, item]) => Object.entries(item).map(([method, op]) => `${method} ${path} ${op.operationId}`)).sort();
    expect(actual).toEqual(declared);
    for (const [method, , operationId] of trackRoutes) {
      const op = Object.values(contract.paths).flatMap(Object.values).find((op) => op.operationId === operationId);
      expect(op.security).toEqual(['publicTrack', 'analysis', 'download'].includes(operationId) && method === 'get' ? [] : [{ sessionCookie: [] }]);
    }
  });

  it.each([true, false])('validates real %s analysis, metadata and list responses', async (enriched) => {
    const { service, document, objectStore, track } = await fixture(enriched);
    conforms('AnalysisDocument', document);
    const server = express();
    server.use('/api', createApiRouter(service, { getUser: async () => ({ id: '0123456789abcdef01234567' }) }));
    for (const [suffix, schema] of [['', 'TrackResponse'], ['/status', 'ProcessingStatusResponse']]) {
      const result = await request(server, { url: `/api/v1/tracks/${track.publicId}${suffix}` });
      expect(result.status).toBe(200);
      conforms(schema, result.json());
      expect(result.text).not.toContain('private/');
      expect(result.text).not.toContain('private-owner');
      if (!suffix) {
        expect(result.json().data).not.toHaveProperty('preview');
        expect(result.json().data.downloadURL).toEqual({ gpx: `/api/v1/tracks/${track.publicId}/gpx` });
      }
    }
    expect(objectStore.openRead).not.toHaveBeenCalled();
    conforms('TrackPage', await service.listMyTracks({ ownerId: track.ownerId }));
    conforms('TrackPage', await service.listSavedTracks({ userId: track.ownerId }));
    const detailed = await request(server, { url: `/api/v1/tracks/${track.publicId}/analysis` });
    conforms('AnalysisDocument', detailed.json());
  });

  it('validates pending metadata and drops accidental nested internal fields', async () => {
    const { track } = await fixture();
    delete track.result;

    track.processing = { status: 'PROCESSING', step: 'QUEUED', revision: 'pending', sourceKey: 'private/source', originalFilename: 'ride.gpx' };
    conforms('ProcessingStatus', statusOf(track));
    const value = publicTrack(track);
    value.ownerId = 'secret';
    value.metrics = { ...trackData({}).metrics, distanceKm: 10, internal: 'secret' };
    const selected = serialize(contract.components.schemas.Track, value);
    conforms('Track', selected);
    expect(JSON.stringify(selected)).not.toContain('secret');
    expect(selected).not.toHaveProperty('preview');
    conforms('TrackListItem', { ...card(track), isFavorite: false, savedAt: null });
  });
});
