import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';
import { Readable } from 'node:stream';
import { createS3TrackService } from '../../src/backend/s3-track-service.js';
import { analyzeGpxSource } from '../../src/backend/track-analysis.js';
import { analysisDocument } from '../../src/backend/track-data.js';
import { publicTrack } from '../../src/backend/s3-track-presenters.js';
import { createS3TrackRepository } from '../../src/backend/s3-track-repository.js';

const uri = process.env.MONGODB_URI;
const describeWithMongo = uri ? describe : describe.skip;

describeWithMongo('MongoDB S3 track contract', () => {
  let database;
  let tracks;
  let repository;
  beforeAll(async () => {
    database = createDatabase({ uri });
    tracks = await database.collection('tracksS3Integration');
    repository = createS3TrackRepository(tracks);
    await repository.ensureIndexes();
  });
  afterAll(() => database?.close());

  it('exposes the GPX title during initial enrichment without changing an active replacement', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    const track = await repository.createProcessing({ trackId, ownerId,
      sourceKey: `dev/tracks/${trackId}/first/source.gpx`, revision: 'first',
      originalFilename: 'COURSE_455453829.gpx', title: 'COURSE_455453829', routeType: 'cycling' });
    const initial = { trackId, ownerId, revision: 'first', workerId: 'first-worker' };
    await repository.claim(initial);
    await repository.setStep(initial, 'ENRICHING', new Date(), 'THE TRAKA 200 _2026');
    expect((await repository.findById(trackId)).title).toBe('THE TRAKA 200 _2026');
    expect((await repository.findById(trackId)).processing.status).toBe('PROCESSING');
    await repository.publish(initial, { analysis: {}, title: 'THE TRAKA 200 _2026',
      analysisKey: `dev/tracks/${trackId}/first/analysis.json`, analysisSources: {} });
    await repository.beginAttempt({ trackId, ownerId, revision: 'second', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/second/source.gpx`, originalFilename: 'other.gpx' });
    const replacement = { trackId, ownerId, revision: 'second', workerId: 'second-worker' };
    await repository.claim(replacement);
    await repository.setStep(replacement, 'ENRICHING', new Date());
    expect((await repository.findByPublicId(track.publicId)).title).toBe('THE TRAKA 200 _2026');
    await tracks.deleteOne({ _id: trackId });
  });

  it('keeps edits made during initial processing through parsing and publication', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await repository.createProcessing({ trackId, ownerId, revision: 'first',
      sourceKey: `dev/tracks/${trackId}/first/source.gpx`, originalFilename: 'file.gpx',
      title: 'File', routeType: 'cycling' });
    const identity = { trackId, ownerId, revision: 'first', workerId: 'worker' };
    await repository.claim(identity);
    const edited = await repository.updateDetails({ trackId, ownerId, title: 'My title',
      speedKmh: 25, routeType: 'road-cycling', externalLinks: { komoot: 'https://komoot.com/tour/1' } });
    expect(edited.title).toBe('My title');
    expect(edited.result).toBeNull();
    await repository.setStep(identity, 'ENRICHING', new Date(), 'GPX title');
    expect((await repository.findById(trackId)).title).toBe('My title');
    await repository.publish(identity, { title: 'GPX title', analysis: { distanceKm: 50, effectiveSpeedKmh: 20 },
      analysisKey: `dev/tracks/${trackId}/first/analysis.json`, analysisSources: {} });
    expect(await repository.findById(trackId)).toMatchObject({ title: 'My title', routeType: 'road-cycling',
      externalLinks: { komoot: 'https://komoot.com/tour/1' }, processing: { status: 'READY', step: null, error: null }, speedKmh: 25,
      result: { kind: 'PUBLISHED', metrics: { speedKmh: 20 } } });
    await tracks.deleteOne({ _id: trackId });
  });

  it('keeps a failed attempt summary separate from an active revision', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await repository.createProcessing({ trackId, ownerId, revision: 'first',
      sourceKey: `dev/tracks/${trackId}/first/source.gpx`, originalFilename: 'ride.gpx',
      title: 'Ride', routeType: 'cycling' });
    const identity = { trackId, ownerId, revision: 'first', workerId: 'worker-first' };
    await repository.claim(identity);
    await repository.fail(identity, { errorCode: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING',
      diagnostic: { analysis: { distanceKm: 8, minElevationM: 20, maxElevationM: 40, points: [{ ele: 20 }, { ele: 40 }] },
        analysisKey: `dev/tracks/${trackId}/first/analysis.json`, analysisSources: { gpx: 'SUCCESS', valhalla: 'FAILED' } } });
    const failed = await repository.findById(trackId);
    expect(failed.result.kind).toBe('DIAGNOSTIC');
    expect(failed.result).toMatchObject({ metrics: { distanceKm: 8,
      minElevationM: 20, maxElevationM: 40 }, completeness: 'PARTIAL' });
    await tracks.deleteOne({ _id: trackId });
  });

  it('publishes only the matching attempt and leaves no large analysis in MongoDB', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    const sourceKey = `dev/tracks/${trackId}/first/source.gpx`;
    const track = await repository.createProcessing({ trackId, ownerId, sourceKey,
      revision: 'first', originalFilename: 'ride.gpx', title: 'Ride', routeType: 'cycling' });
    const identity = { trackId, ownerId, revision: 'first', workerId: 'worker-one' };
    expect(await repository.claim(identity)).toBeTruthy();
    const analysis = { distanceKm: 20, ascentM: 100, descentM: 90, effectiveSpeedKmh: 20,
      estimatedDurationMs: 3_600_000, sourcePointCount: 50_000,
      preview: [{ lat: 50, lon: 20 }, { lat: 51, lon: 21 }],
      points: Array.from({ length: 10_000 }, (_, index) => ({ lat: index / 1000, lon: index / 1000 })) };
    expect(await repository.publish(identity, { analysis, title: 'Ride', analysisKey: `dev/tracks/${trackId}/first/analysis.json`,
      analysisSources: { gpx: 'SUCCESS' } })).toBeTruthy();
    const stored = await repository.findByPublicId(track.publicId);
    expect(stored.result.metrics.distanceKm).toBe(20);
    expect(stored.result.metrics.distanceKm).toBe(20);
    expect(stored.result).not.toHaveProperty('points');
    expect(JSON.stringify(stored).length).toBeLessThan(100_000);
    expect(stored.result.sourcePointCount).toBe(50_000);
    expect(stored).not.toHaveProperty('analysis');
    expect(stored).not.toHaveProperty('result.points');
    expect(await repository.publish(identity, { analysis, title: 'Late', analysisKey: 'late', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });

  it('keeps the active revision when replacement fails and fences old workers', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await tracks.insertOne({ _id: trackId, ownerId, publicId: `track_${trackId}`, title: 'Old',
      normalizedName: 'old', createdAt: new Date(), processing: { status: 'READY', step: null, error: null },
      result: { kind: 'PUBLISHED', revision: 'old', sourceKey: `dev/tracks/${trackId}/old/source.gpx`,
        analysisKey: `dev/tracks/${trackId}/old/analysis.json`, metrics: { distanceKm: 10 } } });
    const next = await repository.beginAttempt({ trackId, ownerId, revision: 'new', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`, originalFilename: 'new.gpx' });
    expect(next.processing.status).toBe('PROCESSING');
    const identity = { trackId, ownerId, revision: 'new', workerId: 'worker-one' };
    await repository.claim(identity);
    await repository.fail(identity, { errorCode: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING' });
    const stored = await repository.findById(trackId);
    expect(stored.result.revision).toBe('old');
    expect(stored.processing.status).toBe('FAILED');
    expect(await repository.publish(identity, { analysis: {}, title: 'Bad', analysisKey: 'bad', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });

  it('switches source and analysis on replacement while keeping editable metadata', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await tracks.insertOne({ _id: trackId, ownerId, publicId: `track_${trackId}`, title: 'Old',
      normalizedName: 'old', routeType: 'gravel-cycling', externalLinks: { komoot: 'https://www.komoot.com/tour/123' },
      createdAt: new Date(), processing: { status: 'READY', step: null, error: null },
      result: { kind: 'PUBLISHED', revision: 'old', sourceKey: `dev/tracks/${trackId}/old/source.gpx`,
        analysisKey: `dev/tracks/${trackId}/old/analysis.json`, metrics: { distanceKm: 10, speedKmh: 25 } } });
    const pending = await repository.beginAttempt({ trackId, ownerId, revision: 'new', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`, originalFilename: 'new.gpx' });
    expect(pending.result.metrics.distanceKm).toBe(10);
    expect(pending.result).not.toHaveProperty('summary');
    const identity = { trackId, ownerId, revision: 'new', workerId: 'worker-new' };
    await repository.claim(identity);
    const previous = await repository.publish(identity, { title: 'New',
      analysis: { distanceKm: 20, ascentM: 200, preview: [{ lat: 50, lon: 20 }, { lat: 51, lon: 21 }] },
      analysisKey: `dev/tracks/${trackId}/new/analysis.json`, analysisSources: { gpx: 'SUCCESS' } });
    expect(previous.result.revision).toBe('old');
    const current = await repository.findById(trackId);
    expect(current).toMatchObject({ title: 'Old', normalizedName: 'old', routeType: 'gravel-cycling',
      externalLinks: { komoot: 'https://www.komoot.com/tour/123' }, processing: { status: 'READY', step: null, error: null }, result: { kind: 'PUBLISHED', revision: 'new',
      originalFilename: 'new.gpx', metrics: { distanceKm: 20 },
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`,
      analysisKey: `dev/tracks/${trackId}/new/analysis.json` } });
    expect(publicTrack(current).metrics).toMatchObject({ distanceKm: 20, speedKmh: 25,
      estimatedDurationMs: 2_880_000 });
    expect(current.processing).toEqual({ status: 'READY', step: null, error: null });
    await tracks.deleteOne({ _id: trackId });
  });

  it('keeps the active summary through a failed replacement and updates edited speed on retry', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await repository.createProcessing({ trackId, ownerId, revision: 'first',
      sourceKey: `dev/tracks/${trackId}/first/source.gpx`, originalFilename: 'first.gpx',
      title: 'First', routeType: 'cycling' });
    const first = { trackId, ownerId, revision: 'first', workerId: 'worker-first' };
    await repository.claim(first);
    await repository.publish(first, { title: 'First', analysisKey: `dev/tracks/${trackId}/first/analysis.json`,
      analysis: { distanceKm: 20, effectiveSpeedKmh: 20, estimatedDurationMs: 3_600_000,
        points: [{ ele: 10 }, { ele: 20 }], climbs: [{ startKm: 1, endKm: 2, lengthM: 1000 }] },
      analysisSources: { gpx: 'SUCCESS' } });
    await repository.beginAttempt({ trackId, ownerId, revision: 'replacement', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/replacement/source.gpx`, originalFilename: 'new.gpx' });
    const replacement = { trackId, ownerId, revision: 'replacement', workerId: 'worker-replacement' };
    await repository.claim(replacement);
    await repository.fail(replacement, { errorCode: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING' });
    expect((await repository.findById(trackId)).result.climbs).toHaveLength(1);
    await repository.updateDetails({ trackId, ownerId, title: 'First', speedKmh: 25,
      estimatedDurationMs: 2_880_000, routeType: 'cycling', externalLinks: {} });
    const edited = await repository.findById(trackId);
    expect(edited.speedKmh).toBe(25);
    expect(edited.result.metrics.speedKmh).toBe(20);
    await repository.beginAttempt({ trackId, ownerId, revision: 'retry', kind: 'RETRY',
      sourceKey: `dev/tracks/${trackId}/retry/source.gpx`, originalFilename: 'first.gpx' });
    const retry = { trackId, ownerId, revision: 'retry', workerId: 'worker-retry' };
    await repository.claim(retry);
    await repository.publish(retry, { title: 'Parsed again', analysisKey: `dev/tracks/${trackId}/retry/analysis.json`,
      analysis: { distanceKm: 20, effectiveSpeedKmh: 20, estimatedDurationMs: 3_600_000 }, analysisSources: {} });
    const result = await repository.findById(trackId);
    expect(publicTrack(result).metrics).toMatchObject({ speedKmh: 25, estimatedDurationMs: 2_880_000 });
    expect(result.result.metrics.speedKmh).toBe(20);
    expect(result.title).toBe('First');
    await tracks.deleteOne({ _id: trackId });
  });

  it('allows an expired attempt to be retried and rejects a stale worker publication', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    const oldTime = new Date('2026-01-01T00:00:00Z');
    await repository.createProcessing({ trackId, ownerId, revision: 'old',
      sourceKey: `dev/tracks/${trackId}/old/source.gpx`, originalFilename: 'ride.gpx',
      title: 'Ride', routeType: 'cycling' }, oldTime);
    const replacement = await repository.beginAttempt({ trackId, ownerId, revision: 'retry', kind: 'RETRY',
      sourceKey: `dev/tracks/${trackId}/retry/source.gpx`, originalFilename: 'ride.gpx' });
    expect(replacement.processing.revision).toBe('retry');
    expect(await repository.publish({ trackId, ownerId, revision: 'old', workerId: 'old-worker' },
      { analysis: { distanceKm: 1 }, title: 'Stale', analysisKey: 'stale', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });

  it('preserves a metadata edit racing with atomic publication', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await repository.createProcessing({ trackId, ownerId, revision: 'first', sourceKey: 'source',
      originalFilename: 'ride.gpx', title: 'File', routeType: 'cycling' });
    const identity = { trackId, ownerId, revision: 'first', workerId: 'worker' };
    await repository.claim(identity);
    const racingRepository = createS3TrackRepository({
      findOneAndUpdate: async (filter, pipeline, options) => {
        await repository.updateDetails({ trackId, ownerId, title: '$My edited title', speedKmh: 25 });
        return tracks.findOneAndUpdate(filter, pipeline, options);
      } });
    await racingRepository.publish(identity, { analysis: { distanceKm: 50, effectiveSpeedKmh: 20 },
      analysisKey: 'analysis', title: 'GPX title', analysisSources: {} });
    const stored = await repository.findById(trackId);
    expect(stored.title).toBe('$My edited title');
    expect(stored.normalizedName).toBe('$my edited title');
    expect(stored).not.toHaveProperty('metadataVersion');
    expect(publicTrack(stored).metrics).toMatchObject({ speedKmh: 25, estimatedDurationMs: 7200000 });
    expect(stored.result.metrics.speedKmh).toBe(20);
    await tracks.deleteOne({ _id: trackId });
  });

  it('preserves the last usable result throughout upload, edit, replacement failure and retry', async () => {
    const ownerId = new ObjectId();
    const objects = new Map();
    const jobs = [];
    let failEnrichment = false;
    const key = (trackId, revision, file) => `dev/tracks/${trackId}/${revision}/${file}`;
    const objectStore = {
      assertKey: (value) => value,
      writeSource: async ({ trackId, revision, source }) => {
        const chunks = [];
        for await (const chunk of source) chunks.push(Buffer.from(chunk));
        const sourceKey = key(trackId, revision, 'source.gpx');
        objects.set(sourceKey, Buffer.concat(chunks).toString());
        return sourceKey;
      },
      copySource: async ({ fromKey, trackId, revision }) => {
        const sourceKey = key(trackId, revision, 'source.gpx');
        objects.set(sourceKey, objects.get(fromKey));
        return sourceKey;
      },
      readSource: async (sourceKey) => objects.get(sourceKey),
      openRead: async (objectKey) => Readable.from(objects.get(objectKey)),
      writeAnalysis: async ({ trackId, revision, ...data }) => {
        const analysisKey = key(trackId, revision, 'analysis.json');
        objects.set(analysisKey, JSON.stringify(analysisDocument({ revision, ...data })));
        return analysisKey;
      },
      delete: async (objectKey) => objects.delete(objectKey),
    };
    const service = createS3TrackService({ trackRepository: repository, objectStore,
      savedTrackRepository: { removeForTrack: async () => {}, savedTrackIds: async () => [] },
      analyzeSource: analyzeGpxSource, schedule: (job) => jobs.push(job), warn: () => {},
      enrichAnalysis: async (analysis) => {
        if (failEnrichment) throw new Error('Synthetic unavailable provider');
        return { ...analysis, enrichmentSource: 'VALHALLA' };
      } });
    const source = (name, endLatitude) => `<gpx><trk><name>${name}</name><trkseg><trkpt lat="50" lon="20"><ele>100</ele></trkpt><trkpt lat="${endLatitude}" lon="20"><ele>200</ele></trkpt></trkseg></trk></gpx>`;
    const uploaded = await service.upload({ ownerId, filename: '$first.gpx', routeType: 'cycling',
      source: Readable.from(source('$Source name', 50.01)) });
    const publicId = uploaded.id;
    try {
      expect(uploaded.status).toBe('PROCESSING');
      await jobs.shift()();
      const initial = await service.getPublicTrack(publicId);
      expect(initial.processing).toMatchObject({ status: 'READY', canRetry: true });
      expect(initial.completeness).toBe('PARTIAL');
      const storedInitial = await repository.findByPublicId(publicId);
      const analysis = JSON.parse(objects.get(storedInitial.result.analysisKey));
      expect(analysis.sourceName).toBe('$Source name');
      expect(initial.title).toBe('$Source name');
      expect(storedInitial.result.originalFilename).toBe('$first.gpx');
      await service.updateDetails({ publicId, ownerId, title: 'My title', speedKmh: 25 });
      const edited = await service.getPublicTrack(publicId);
      expect(edited.metrics.speedKmh).toBe(25);
      expect(JSON.parse(objects.get(storedInitial.result.analysisKey))).toEqual(analysis);
      failEnrichment = true;
      await service.replaceFile({ publicId, ownerId, filename: 'replacement.gpx',
        source: Readable.from(source('Replacement name', 50.02)) });
      expect((await service.getPublicTrack(publicId)).revision).toBe(initial.revision);
      await service.updateDetails({ publicId, ownerId, title: 'Updated during replacement',
        routeType: 'hiking', speedKmh: 25, externalLinks: { strava: 'https://www.strava.com/routes/123' } });
      await jobs.shift()();
      const failed = await service.getPublicTrack(publicId);
      expect(failed.processing).toMatchObject({ status: 'FAILED', canRetry: true });
      expect(failed.revision).toBe(initial.revision);
      expect((await service.fileDescriptor(publicId, 'gpx')).key).toBe(storedInitial.result.sourceKey);
      failEnrichment = false;
      await service.retryAnalysis({ publicId, ownerId });
      await jobs.shift()();
      const retried = await service.getPublicTrack(publicId);
      expect(retried).toMatchObject({ title: 'Updated during replacement', routeType: 'hiking',
        externalLinks: { strava: 'https://www.strava.com/routes/123' }, metrics: { speedKmh: 25 }, processing: { status: 'READY' } });
      expect(retried.metrics.distanceKm).toBeGreaterThan(initial.metrics.distanceKm);
      expect(retried.revision).not.toBe(initial.revision);
      expect(objects.size).toBe(2);
      const stored = await repository.findByPublicId(publicId);
      const cards = await service.listMyTracks({ ownerId });
      expect(cards.items[0]).toMatchObject({ id: publicId, metrics: { speedKmh: 25 } });
      expect((await repository.listOwned({ ownerId }))[0].result).not.toHaveProperty('climbs');
      expect(stored).not.toHaveProperty('active');
      expect(stored).not.toHaveProperty('attempt');
      expect(stored).not.toHaveProperty('originalFilename');
      expect(stored.result).not.toHaveProperty('enrichmentSource');
      expect(stored.result.metrics.speedKmh).toBe(20);
    } finally {
      await service.deleteTrack({ publicId, ownerId });
    }
  });
});
