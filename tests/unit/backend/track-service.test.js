import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createTrackService } from '../../../src/backend/track-service.js';

function dependencies() {
  const scheduled = [];
  const track = {
    _id: 'track-1', ownerId: 'owner-1', sourceFileId: 'file-1', originalFilename: 'ride.gpx',
    analysisStatus: 'PROCESSING', analysisStep: 'QUEUED', analysisRevision: 1,
  };
  const trackRepository = {
    createProcessing: vi.fn().mockResolvedValue(track),
    findById: vi.fn().mockResolvedValue(track),
    findOwnedById: vi.fn().mockResolvedValue(track),
    setAnalysisStep: vi.fn().mockResolvedValue(track),
    saveBaseAnalysis: vi.fn().mockImplementation(async ({ analysis }) => ({ ...track, analysis, analysisStep: 'ENRICHING' })),
    completeAnalysis: vi.fn().mockImplementation(async ({ analysis }) => ({ ...track, analysis, analysisStatus: 'READY', analysisStep: 'COMPLETE' })),
    failAnalysis: vi.fn().mockResolvedValue({ ...track, analysisStatus: 'FAILED' }),
    restartEnrichment: vi.fn().mockResolvedValue({ ...track, analysis: { name: 'Ride', points: [{}, {}] }, analysisStep: 'ENRICHING' }),
    listOwned: vi.fn().mockResolvedValue([]),
    updateDetails: vi.fn(),
    beginReplacement: vi.fn(),
    setReplacementStep: vi.fn(),
    saveReplacementBase: vi.fn(),
    completeReplacement: vi.fn(),
    failReplacement: vi.fn(),
    restartReplacementEnrichment: vi.fn(),
    deleteOwned: vi.fn(),
  };
  const gpxFileStore = {
    save: vi.fn().mockResolvedValue('file-1'),
    delete: vi.fn().mockResolvedValue(undefined),
    openDownload: vi.fn().mockReturnValue(Readable.from('<gpx />')),
  };
  const analyzeSource = vi.fn().mockReturnValue({ name: 'Ride', points: [{}, {}], distanceKm: 10 });
  const enrichAnalysis = vi.fn().mockImplementation(async (analysis) => ({ ...analysis, surfaces: [] }));
  const userRepository = {
    findPublicProfileById: vi.fn().mockResolvedValue({ displayName: 'Jan Kowalski', avatarUrl: 'https://example.com/jan.jpg' }),
  };
  const service = createTrackService({
    trackRepository,
    gpxFileStore,
    enrichmentCacheRepository: { get: vi.fn(), put: vi.fn() },
    userRepository,
    analyzeSource,
    enrichAnalysis,
    schedule: (job) => scheduled.push(job),
  });
  return { service, scheduled, trackRepository, gpxFileStore, userRepository, analyzeSource, enrichAnalysis };
}

describe('track service', () => {
  it('publishes the uploader profile and upload date with a public track', async () => {
    const { service, trackRepository, userRepository } = dependencies();
    const createdAt = new Date('2026-09-17T10:00:00.000Z');
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1', ownerId: 'owner-1', title: 'Ride', createdAt,
      analysisStatus: 'READY', analysis: { enrichmentSource: 'VALHALLA_OSM' },
    });

    const track = await service.getPublicTrack('track-1');

    expect(userRepository.findPublicProfileById).toHaveBeenCalledWith('owner-1');
    expect(track).toMatchObject({
      createdAt: '2026-09-17T10:00:00.000Z',
      uploader: { displayName: 'Jan Kowalski', avatarUrl: 'https://example.com/jan.jpg' },
    });
  });

  it('stores the source, creates a queued track and schedules processing', async () => {
    const { service, scheduled, gpxFileStore, trackRepository } = dependencies();

    const status = await service.upload({
      ownerId: 'owner-1',
      filename: 'Weekend Ride.gpx',
      source: Readable.from('<gpx />'),
    });

    expect(gpxFileStore.save).toHaveBeenCalledWith(expect.objectContaining({ filename: 'Weekend Ride.gpx', ownerId: 'owner-1' }));
    expect(trackRepository.createProcessing).toHaveBeenCalledWith(expect.objectContaining({ title: 'Weekend Ride', sourceFileId: 'file-1' }));
    expect(status).toEqual({ id: 'track-1', status: 'PROCESSING', step: 'QUEUED', error: null });
    expect(scheduled).toHaveLength(1);
  });

  it('parses, persists the base result, enriches it and completes processing', async () => {
    const { service, scheduled, trackRepository, analyzeSource, enrichAnalysis } = dependencies();
    await service.upload({ ownerId: 'owner-1', filename: 'ride.gpx', source: Readable.from('<gpx />') });

    await scheduled[0]();

    expect(trackRepository.setAnalysisStep).toHaveBeenCalledWith(expect.objectContaining({ step: 'PARSING' }));
    expect(analyzeSource).toHaveBeenCalledWith('<gpx />', { filename: 'ride.gpx' });
    expect(trackRepository.saveBaseAnalysis).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ride' }));
    expect(enrichAnalysis).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ride' }), expect.objectContaining({ cache: expect.anything(), signal: expect.any(AbortSignal) }));
    expect(trackRepository.completeAnalysis).toHaveBeenCalledWith(expect.objectContaining({ analysis: expect.objectContaining({ surfaces: [] }) }));
  });

  it('stores a friendly diagnostic code when parsing fails', async () => {
    const deps = dependencies();
    deps.analyzeSource.mockImplementation(() => { throw new Error('Не удалось прочитать GPX'); });
    await deps.service.upload({ ownerId: 'owner-1', filename: 'ride.gpx', source: Readable.from('<gpx />') });

    await deps.scheduled[0]();

    expect(deps.trackRepository.failAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      failedStep: 'PARSING',
      errorCode: 'INVALID_GPX',
    }));
  });

  it('aborts external enrichment after its configured budget', async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    deps.enrichAnalysis.mockImplementation((_analysis, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const service = createTrackService({
      trackRepository: deps.trackRepository,
      gpxFileStore: deps.gpxFileStore,
      enrichmentCacheRepository: {},
      analyzeSource: deps.analyzeSource,
      enrichAnalysis: deps.enrichAnalysis,
      enrichmentTimeoutMs: 50_000,
      schedule: (job) => deps.scheduled.push(job),
    });
    await service.upload({ ownerId: 'owner-1', filename: 'ride.gpx', source: Readable.from('<gpx />') });
    const processing = deps.scheduled[0]();

    await vi.advanceTimersByTimeAsync(50_000);
    await processing;

    expect(deps.trackRepository.failAnalysis).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'ENRICHMENT_UNAVAILABLE' }));
    vi.useRealTimers();
  });

  it('retries only enrichment from the persisted base analysis', async () => {
    const { service, scheduled, gpxFileStore, analyzeSource, enrichAnalysis } = dependencies();

    const status = await service.retryAnalysis({ trackId: 'track-1', ownerId: 'owner-1' });
    await scheduled[0]();

    expect(status.step).toBe('ENRICHING');
    expect(gpxFileStore.openDownload).not.toHaveBeenCalled();
    expect(analyzeSource).not.toHaveBeenCalled();
    expect(enrichAnalysis).toHaveBeenCalledTimes(1);
  });

  it('allows a ready Valhalla-only track to continue missing OSM enrichment', async () => {
    const { service, scheduled, trackRepository } = dependencies();
    const partial = {
      _id: 'track-1', ownerId: 'owner-1', analysisStatus: 'READY', analysisStep: 'COMPLETE', analysisRevision: 1,
      analysis: { enrichmentSource: 'VALHALLA', points: [{}, {}] },
    };
    trackRepository.findOwnedById.mockResolvedValue(partial);
    trackRepository.restartEnrichment.mockResolvedValue({ ...partial, analysisStatus: 'PROCESSING', analysisStep: 'ENRICHING' });

    const management = await service.getManagement({ trackId: 'track-1', ownerId: 'owner-1' });
    const status = await service.retryAnalysis({ trackId: 'track-1', ownerId: 'owner-1' });

    expect(management).toMatchObject({ canRetry: true, missingOsmTags: true, retrySource: 'openStreetMap' });
    expect(status).toMatchObject({ status: 'PROCESSING', step: 'ENRICHING' });
    expect(scheduled).toHaveLength(1);
  });

  it('exposes the deepest completed analysis without owner data', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1',
      ownerId: 'owner-secret',
      sourceFileId: 'file-1',
      title: 'Ride',
      originalFilename: 'ride.gpx',
      analysisStatus: 'FAILED',
      analysis: { distanceKm: 42, points: [{}, {}] },
    });

    const track = await service.getPublicTrack('track-1');

    expect(track).toEqual({
      id: 'track-1',
      title: 'Ride',
      status: 'FAILED',
      analysisLevel: 'BASIC',
      analysisNote: 'Источники: GPX — маршрут, высоты и основные показатели. Дорожные данные недоступны.',
      analysisSources: { gpx: 'SUCCESS', valhalla: 'FAILED', openStreetMap: 'FAILED' },
      analysis: { distanceKm: 42, points: [{}, {}] },
      createdAt: null,
      uploader: { displayName: 'Jan Kowalski', avatarUrl: 'https://example.com/jan.jpg' },
      downloadUrl: '/api/tracks/track-1/download',
    });
    expect(track).not.toHaveProperty('ownerId');
    expect(track).not.toHaveProperty('sourceFileId');
  });

  it('opens the original GPX for a public download', async () => {
    const { service, trackRepository, gpxFileStore } = dependencies();
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1', sourceFileId: 'file-1', originalFilename: 'Original ride.gpx',
    });

    const download = await service.getPublicDownload('track-1');

    expect(download.filename).toBe('Original ride.gpx');
    expect(gpxFileStore.openDownload).toHaveBeenCalledWith('file-1');
  });

  it('describes partial data as in progress rather than failed while enrichment runs', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1', title: 'Ride', analysisStatus: 'PROCESSING', analysis: { points: [{}, {}] },
    });

    const track = await service.getPublicTrack('track-1');

    expect(track.analysisLevel).toBe('BASIC');
    expect(track.analysisNote).toBe('Источники: GPX — маршрут, высоты и основные показатели. Дорожные данные ещё обрабатываются.');
  });

  it('briefly explains the role of each available enrichment source', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.findById
      .mockResolvedValueOnce({ _id: 'track-1', title: 'Ride', analysisStatus: 'READY', analysis: { enrichmentSource: 'VALHALLA' } })
      .mockResolvedValueOnce({ _id: 'track-1', title: 'Ride', analysisStatus: 'READY', analysis: { enrichmentSource: 'VALHALLA_OSM' } });

    const valhalla = await service.getPublicTrack('track-1');
    const osm = await service.getPublicTrack('track-1');

    expect(valhalla.analysisNote).toContain('Valhalla — типы дорог и оценка покрытий');
    expect(valhalla.analysisNote).toContain('теги OpenStreetMap временно недоступны');
    expect(valhalla.analysisSources).toEqual({ gpx: 'SUCCESS', valhalla: 'SUCCESS', openStreetMap: 'FAILED' });
    expect(osm.analysisNote).toContain('OpenStreetMap — покрытия и качество дорог');
    expect(osm.analysisSources).toEqual({ gpx: 'SUCCESS', valhalla: 'SUCCESS', openStreetMap: 'SUCCESS' });
  });

  it('attributes calculated elevation to the terrain model', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1', title: 'Ride', analysisStatus: 'READY',
      analysis: { enrichmentSource: 'VALHALLA_OSM', elevationSource: 'VALHALLA_DEM' },
    });

    const track = await service.getPublicTrack('track-1');

    expect(track.analysisNote).toContain('высоты по модели рельефа Valhalla');
  });

  it('returns 24 compact cards and an opaque cursor without route points', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.listOwned.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({
      _id: new ObjectId((index + 1).toString(16).padStart(24, '0')), title: `Ride ${index}`,
      createdAt: new Date(Date.UTC(2026, 8, 17, 12, 0, 25 - index)), analysisStatus: 'READY', analysisStep: 'COMPLETE',
      analysis: { distanceKm: index, ascentM: 100, descentM: 90, effectiveSpeedKmh: 21, estimatedDurationMs: 3_600_000, preview: { points: [[0, 0], [100, 100]] }, points: [{ secret: true }] },
    })));

    const result = await service.listMyTracks({ ownerId: 'owner-1', query: 'ride' });

    expect(result.items).toHaveLength(24);
    expect(result.items[0]).not.toHaveProperty('analysis');
    expect(result.items[0]).toMatchObject({ title: 'Ride 0', distanceKm: 0, ascentM: 100, descentM: 90, speedKmh: 21, url: '/tracks/000000000000000000000001' });
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('decodes a cursor for the repository and rejects malformed cursors', async () => {
    const { service, trackRepository } = dependencies();
    const id = new ObjectId();
    const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-09-17T10:00:00.000Z', id: id.toString() })).toString('base64url');

    await service.listMyTracks({ ownerId: 'owner-1', cursor });

    expect(trackRepository.listOwned).toHaveBeenCalledWith(expect.objectContaining({ limit: 24, before: { createdAt: new Date('2026-09-17T10:00:00.000Z'), id } }));
    await expect(service.listMyTracks({ ownerId: 'owner-1', cursor: 'nope' })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('updates title and speed while recalculating duration without reanalysis', async () => {
    const { service, trackRepository, analyzeSource, enrichAnalysis } = dependencies();
    trackRepository.findOwnedById.mockResolvedValue({ ...trackRepository.findOwnedById.getMockImplementation?.(), analysis: { distanceKm: 25 } });
    trackRepository.updateDetails.mockImplementation(async (values) => ({
      _id: 'track-1', title: values.title, analysisStatus: 'READY',
      analysis: { distanceKm: 25, effectiveSpeedKmh: values.speedKmh, estimatedDurationMs: values.estimatedDurationMs },
    }));

    const result = await service.updateDetails({ trackId: 'track-1', ownerId: 'owner-1', title: 'New title', speedKmh: 25 });

    expect(trackRepository.updateDetails).toHaveBeenCalledWith(expect.objectContaining({ estimatedDurationMs: 3_600_000 }));
    expect(result.title).toBe('New title');
    expect(analyzeSource).not.toHaveBeenCalled();
    expect(enrichAnalysis).not.toHaveBeenCalled();
  });

  it('keeps the active source while a replacement is processed, then deletes the old file', async () => {
    const deps = dependencies();
    const replacementTrack = {
      ...deps.trackRepository.findOwnedById.getMockImplementation?.(),
      _id: 'track-1', ownerId: 'owner-1', sourceFileId: 'old-file', analysisRevision: 1,
      replacement: { sourceFileId: 'new-file', originalFilename: 'new.gpx', revision: 2, status: 'PROCESSING', step: 'QUEUED' },
    };
    deps.gpxFileStore.save.mockResolvedValue('new-file');
    deps.trackRepository.findOwnedById.mockResolvedValue({ ...replacementTrack, replacement: undefined });
    deps.trackRepository.beginReplacement.mockResolvedValue(replacementTrack);
    deps.trackRepository.setReplacementStep.mockResolvedValue(replacementTrack);
    deps.trackRepository.saveReplacementBase.mockImplementation(async ({ analysis, title }) => ({ ...replacementTrack, replacement: { ...replacementTrack.replacement, analysis, title, step: 'ENRICHING' } }));
    deps.trackRepository.completeReplacement.mockResolvedValue({ sourceFileId: 'old-file' });

    const status = await deps.service.replaceFile({ trackId: 'track-1', ownerId: 'owner-1', filename: 'new.gpx', source: Readable.from('<gpx />') });
    await deps.scheduled[0]();

    expect(status).toMatchObject({ status: 'PROCESSING', step: 'QUEUED' });
    expect(deps.trackRepository.completeReplacement).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
    expect(deps.gpxFileStore.delete).toHaveBeenCalledWith('old-file');
  });

  it('permanently deletes the owned record and both active and pending files', async () => {
    const { service, trackRepository, gpxFileStore } = dependencies();
    trackRepository.deleteOwned.mockResolvedValue({ sourceFileId: 'active', replacement: { sourceFileId: 'pending' } });

    await expect(service.deleteTrack({ trackId: 'track-1', ownerId: 'owner-1' })).resolves.toBe(true);

    expect(gpxFileStore.delete).toHaveBeenCalledWith('active');
    expect(gpxFileStore.delete).toHaveBeenCalledWith('pending');
  });
});
