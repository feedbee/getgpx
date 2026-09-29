import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';
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
    expect((await repository.findById(trackId)).analysisStatus).toBe('PROCESSING');
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

  it('keeps a failed attempt summary separate from an active revision', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await repository.createProcessing({ trackId, ownerId, revision: 'first',
      sourceKey: `dev/tracks/${trackId}/first/source.gpx`, originalFilename: 'ride.gpx',
      title: 'Ride', routeType: 'cycling' });
    const identity = { trackId, ownerId, revision: 'first', workerId: 'worker-first' };
    await repository.claim(identity);
    await repository.fail(identity, { errorCode: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING',
      diagnostic: { analysis: { distanceKm: 8, points: [{ ele: 20 }, { ele: 40 }] },
        analysisKey: `dev/tracks/${trackId}/first/analysis.json`, analysisSources: { gpx: 'SUCCESS', valhalla: 'FAILED' } } });
    const failed = await repository.findById(trackId);
    expect(failed.active).toBeUndefined();
    expect(failed.diagnostic.summary).toMatchObject({ metrics: { distanceKm: 8,
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
      preview: { viewBox: '0 0 100 100', points: [[0, 0], [100, 100]] },
      points: Array.from({ length: 10_000 }, (_, index) => ({ lat: index / 1000, lon: index / 1000 })) };
    expect(await repository.publish(identity, { analysis, title: 'Ride', analysisKey: `dev/tracks/${trackId}/first/analysis.json`,
      analysisSources: { gpx: 'SUCCESS' } })).toBeTruthy();
    const stored = await repository.findByPublicId(track.publicId);
    expect(stored.active.metrics.distanceKm).toBe(20);
    expect(stored.active.summary.metrics.distanceKm).toBe(20);
    expect(stored.active.summary).not.toHaveProperty('points');
    expect(JSON.stringify(stored).length).toBeLessThan(100_000);
    expect(stored.active.sourcePointCount).toBe(50_000);
    expect(stored).not.toHaveProperty('analysis');
    expect(stored).not.toHaveProperty('active.points');
    expect(await repository.publish(identity, { analysis, title: 'Late', analysisKey: 'late', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });

  it('keeps the active revision when replacement fails and fences old workers', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await tracks.insertOne({ _id: trackId, ownerId, publicId: `track_${trackId}`, title: 'Old',
      normalizedName: 'old', createdAt: new Date(), analysisStatus: 'READY',
      active: { revision: 'old', sourceKey: `dev/tracks/${trackId}/old/source.gpx`,
        analysisKey: `dev/tracks/${trackId}/old/analysis.json`, metrics: { distanceKm: 10 } } });
    const next = await repository.beginAttempt({ trackId, ownerId, revision: 'new', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`, originalFilename: 'new.gpx' });
    expect(next.analysisStatus).toBe('READY');
    const identity = { trackId, ownerId, revision: 'new', workerId: 'worker-one' };
    await repository.claim(identity);
    await repository.fail(identity, { errorCode: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING' });
    const stored = await repository.findById(trackId);
    expect(stored.active.revision).toBe('old');
    expect(stored.analysisStatus).toBe('READY');
    expect(await repository.publish(identity, { analysis: {}, title: 'Bad', analysisKey: 'bad', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });

  it('switches source, analysis and basic metrics together on replacement', async () => {
    const trackId = new ObjectId();
    const ownerId = new ObjectId();
    await tracks.insertOne({ _id: trackId, ownerId, publicId: `track_${trackId}`, title: 'Old',
      normalizedName: 'old', createdAt: new Date(), analysisStatus: 'READY',
      active: { revision: 'old', sourceKey: `dev/tracks/${trackId}/old/source.gpx`,
        analysisKey: `dev/tracks/${trackId}/old/analysis.json`, metrics: { distanceKm: 10 } } });
    const pending = await repository.beginAttempt({ trackId, ownerId, revision: 'new', kind: 'REPLACE',
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`, originalFilename: 'new.gpx' });
    expect(pending.active.metrics.distanceKm).toBe(10);
    expect(pending.active.summary).toBeUndefined();
    const identity = { trackId, ownerId, revision: 'new', workerId: 'worker-new' };
    await repository.claim(identity);
    const previous = await repository.publish(identity, { title: 'New',
      analysis: { distanceKm: 20, ascentM: 200, preview: { points: [[1, 1], [2, 2]] } },
      analysisKey: `dev/tracks/${trackId}/new/analysis.json`, analysisSources: { gpx: 'SUCCESS' } });
    expect(previous.active.revision).toBe('old');
    const current = await repository.findById(trackId);
    expect(current).toMatchObject({ title: 'New', analysisStatus: 'READY', active: { revision: 'new',
      originalFilename: 'new.gpx', metrics: { distanceKm: 20 },
      sourceKey: `dev/tracks/${trackId}/new/source.gpx`,
      analysisKey: `dev/tracks/${trackId}/new/analysis.json` } });
    expect(current.active.summary.metrics.distanceKm).toBe(20);
    expect(current).not.toHaveProperty('attempt');
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
    expect((await repository.findById(trackId)).active.summary.climbs).toHaveLength(1);
    await repository.updateDetails({ trackId, ownerId, title: 'First', speedKmh: 25,
      estimatedDurationMs: 2_880_000, routeType: 'cycling', externalLinks: {} });
    const edited = await repository.findById(trackId);
    expect(edited.active.summary.metrics.effectiveSpeedKmh).toBe(25);
    await repository.beginAttempt({ trackId, ownerId, revision: 'retry', kind: 'RETRY',
      sourceKey: `dev/tracks/${trackId}/retry/source.gpx`, originalFilename: 'first.gpx' });
    const retry = { trackId, ownerId, revision: 'retry', workerId: 'worker-retry' };
    await repository.claim(retry);
    await repository.publish(retry, { title: 'Parsed again', analysisKey: `dev/tracks/${trackId}/retry/analysis.json`,
      analysis: { distanceKm: 20, effectiveSpeedKmh: 20, estimatedDurationMs: 3_600_000 }, analysisSources: {} });
    const result = await repository.findById(trackId);
    expect(result.active.summary.metrics).toMatchObject({ effectiveSpeedKmh: 25, estimatedDurationMs: 2_880_000 });
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
    expect(replacement.attempt.revision).toBe('retry');
    expect(await repository.publish({ trackId, ownerId, revision: 'old', workerId: 'old-worker' },
      { analysis: { distanceKm: 1 }, title: 'Stale', analysisKey: 'stale', analysisSources: {} })).toBeNull();
    await tracks.deleteOne({ _id: trackId });
  });
});
