import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createS3TrackService } from '../../../src/backend/s3-track-service.js';

function fixture({ parsedName = 'Ride', enrichAnalysis = async (analysis) => ({ ...analysis, enrichmentSource: 'VALHALLA_OSM' }) } = {}) {
  const calls = [];
  const jobs = [];
  const track = { _id: '0123456789abcdef01234567', publicId: 'publicTrackId00000001', ownerId: 'owner',
    title: 'Ride', createdAt: new Date(), analysisStatus: 'PROCESSING',
    attempt: { revision: 'revision', sourceKey: 'dev/tracks/0123456789abcdef01234567/revision/source.gpx',
      originalFilename: 'ride.gpx', status: 'PROCESSING', kind: 'INITIAL', step: 'QUEUED' } };
  const repository = {
    countOwned: vi.fn(async () => 0),
    createProcessing: vi.fn(async () => { calls.push('mongo-create'); return track; }),
    claim: vi.fn(async () => track), setStep: vi.fn(async () => track),
    publish: vi.fn(async () => { calls.push('mongo-ready'); return track; }),
    findById: vi.fn(async () => track), findByPublicId: vi.fn(async () => track),
    findOwnedByPublicId: vi.fn(async () => track),
    fail: vi.fn(async () => track),
  };
  const store = {
    assertKey: vi.fn((key) => key),
    writeSource: vi.fn(async () => { calls.push('s3-source'); return track.attempt.sourceKey; }),
    readSource: vi.fn(async () => '<gpx/>'),
    writeAnalysis: vi.fn(async () => { calls.push('s3-analysis'); return 'analysis-key'; }),
    openRead: vi.fn(async () => Readable.from('{}')),
    delete: vi.fn(async () => undefined), copySource: vi.fn(),
  };
  const service = createS3TrackService({ trackRepository: repository, objectStore: store,
    savedTrackRepository: { savedTrackIds: vi.fn(async () => []) },
    analyzeSource: () => ({ name: parsedName, points: [{ lat: 1, lon: 2 }, { lat: 2, lon: 3 }], distanceKm: 3 }),
    enrichAnalysis,
    configuration: { userTiers: { BASIC: { limits: { tracks: 100 } } } },
    schedule: (job) => jobs.push(job), warn: vi.fn(),
  });
  return { calls, jobs, track, repository, store, service };
}

describe('S3 track service', () => {
  it('does not insert a track when source upload fails', async () => {
    const { service, store, repository } = fixture();
    store.writeSource.mockRejectedValueOnce(new Error('S3 failed'));
    await expect(service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling',
      source: Readable.from('GPX') })).rejects.toThrow('S3 failed');
    expect(repository.createProcessing).not.toHaveBeenCalled();
  });

  it('cleans up an uploaded source when MongoDB confirms insertion failed', async () => {
    const { service, repository, store } = fixture();
    repository.createProcessing.mockRejectedValueOnce(new Error('insert failed'));
    repository.findById.mockResolvedValueOnce(null);
    await expect(service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling',
      source: Readable.from('GPX') })).rejects.toThrow('insert failed');
    expect(store.delete).toHaveBeenCalled();
  });

  it('publishes only after analysis upload finishes', async () => {
    const { service, store, repository, calls, jobs } = fixture();
    let finish;
    store.writeAnalysis.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling', source: Readable.from('GPX') });
    expect(calls).toEqual(['s3-source', 'mongo-create']);
    const running = jobs[0]();
    while (!finish) await Promise.resolve();
    expect(repository.publish).not.toHaveBeenCalled();
    finish('analysis-key');
    await running;
    expect(repository.publish).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ analysisKey: 'analysis-key' }), expect.any(Date));
  });

  it('shows the parsed GPX title while enrichment is still running', async () => {
    let finishEnrichment;
    const { service, repository, jobs } = fixture({ parsedName: 'THE TRAKA 200 _2026',
      enrichAnalysis: () => new Promise((resolve) => { finishEnrichment = resolve; }) });
    await service.upload({ ownerId: 'owner', filename: 'COURSE_455453829.gpx',
      routeType: 'cycling', source: Readable.from('GPX') });
    const running = jobs[0]();
    while (!finishEnrichment) await Promise.resolve();
    expect(repository.setStep).toHaveBeenCalledWith(expect.anything(), 'ENRICHING', expect.any(Date), 'THE TRAKA 200 _2026');
    finishEnrichment({ name: 'THE TRAKA 200 _2026', points: [{}, {}], enrichmentSource: 'VALHALLA_OSM' });
    await running;
  });

  it('marks a failed analysis and stores usable diagnostic data separately', async () => {
    const { store, repository, jobs, track } = fixture();
    const service = createS3TrackService({ trackRepository: repository, objectStore: store,
      analyzeSource: () => ({ name: 'Ride', points: [{}, {}], distanceKm: 3 }),
      enrichAnalysis: async () => { throw new Error('provider failed'); },
      configuration: { userTiers: { BASIC: { limits: { tracks: 100 } } } },
      schedule: (job) => jobs.push(job), warn: vi.fn() });
    await service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling', source: Readable.from('GPX') });
    await jobs[0]();
    expect(store.writeAnalysis).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', completeness: 'PARTIAL' }));
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ errorCode: 'ENRICHMENT_UNAVAILABLE', diagnostic: expect.any(Object) }), expect.any(Date));
    expect(track.active).toBeUndefined();
  });

  it('does not publish READY when the analysis object upload fails', async () => {
    const { service, store, repository, jobs } = fixture();
    store.writeAnalysis.mockRejectedValue(new Error('S3 failed'));
    await service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling', source: Readable.from('GPX') });
    await jobs[0]();
    expect(repository.publish).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ errorCode: 'ANALYSIS_STORAGE_UNAVAILABLE' }), expect.any(Date));
  });

  it('does not overwrite analysis after an ambiguous MongoDB publication result', async () => {
    const { service, store, repository, jobs } = fixture();
    repository.publish.mockRejectedValueOnce(new Error('MongoDB acknowledgement lost'));
    await service.upload({ ownerId: 'owner', filename: 'ride.gpx', routeType: 'cycling', source: Readable.from('GPX') });
    await jobs[0]();
    expect(store.writeAnalysis).toHaveBeenCalledTimes(1);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('reads basic metrics and list cards without opening S3', async () => {
    const { service, repository, store, track } = fixture();
    track.analysisStatus = 'READY';
    track.active = { revision: 'active', sourceKey: 'source', analysisKey: 'analysis',
      metrics: { distanceKm: 25, ascentM: 300, descentM: 280, effectiveSpeedKmh: 20, estimatedDurationMs: 4_500_000 },
      summary: { metrics: { distanceKm: 25 }, distributions: { surfaces: [], wayTypes: [], roadQualities: [] },
        climbs: [], descents: [] },
      preview: { viewBox: '0 0 100 100', points: [[0, 0], [100, 100]] } };
    delete track.attempt;
    repository.listOwned = vi.fn(async () => [track]);
    const basic = await service.getPublicTrack(track.publicId);
    const list = await service.listMyTracks({ ownerId: 'owner' });
    expect(basic.metrics.distanceKm).toBe(25);
    expect(basic.summary.metrics.distanceKm).toBe(25);
    expect(basic.analysisUrl).toBe(`/api/tracks/${track.publicId}/analysis`);
    expect(list.items[0].preview.points).toHaveLength(2);
    expect(store.openRead).not.toHaveBeenCalled();
    expect(store.readSource).not.toHaveBeenCalled();
  });

  it('keeps the active version visible while a replacement is queued', async () => {
    const { service, repository, store, track } = fixture();
    track.active = { revision: 'active', sourceKey: 'old-source', analysisKey: 'old-analysis',
      originalFilename: 'old.gpx', metrics: { distanceKm: 10 } };
    track.analysisStatus = 'READY';
    track.attempt.status = 'FAILED';
    repository.beginAttempt = vi.fn(async () => {
      track.attempt = { ...track.attempt, revision: 'replacement', status: 'PROCESSING', kind: 'REPLACE' };
      return track;
    });
    await service.replaceFile({ publicId: track.publicId, ownerId: 'owner', filename: 'new.gpx', source: Readable.from('GPX') });
    expect((await service.getPublicTrack(track.publicId)).metrics.distanceKm).toBe(10);
    expect((await service.fileDescriptor(track.publicId, 'download')).key).toBe('old-source');
    expect(store.readSource).not.toHaveBeenCalled();
  });

  it('makes repeated deletion succeed but does not delete another owner’s track', async () => {
    const { service, repository, store } = fixture();
    repository.findOwnedByPublicId.mockResolvedValue(null);
    repository.findByPublicId.mockResolvedValueOnce(null).mockResolvedValueOnce({ ownerId: 'other' });
    await expect(service.deleteTrack({ publicId: 'publicTrackId00000001', ownerId: 'owner' })).resolves.toBe(true);
    await expect(service.deleteTrack({ publicId: 'publicTrackId00000001', ownerId: 'owner' })).resolves.toBe(false);
    expect(store.delete).not.toHaveBeenCalled();
  });
});
