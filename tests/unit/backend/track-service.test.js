import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createTrackService } from '../../../src/backend/track-service.js';

function dependencies() {
  const scheduled = [];
  const track = {
    _id: 'track-1', publicId: 'publicTrackId00000001', ownerId: 'owner-1', sourceFileId: 'file-1', originalFilename: 'ride.gpx',
    analysisStatus: 'PROCESSING', analysisStep: 'QUEUED', analysisRevision: 1,
  };
  const findById = vi.fn().mockResolvedValue(track);
  const findOwnedById = vi.fn().mockResolvedValue(track);
  const trackRepository = {
    createProcessing: vi.fn().mockResolvedValue(track),
    countOwned: vi.fn().mockResolvedValue(0),
    findById,
    findOwnedById,
    findByPublicId: findById,
    findOwnedByPublicId: findOwnedById,
    setAnalysisStep: vi.fn().mockResolvedValue(track),
    saveBaseAnalysis: vi.fn().mockImplementation(async ({ analysis }) => ({ ...track, analysis, analysisStep: 'ENRICHING' })),
    completeAnalysis: vi.fn().mockImplementation(async ({ analysis }) => ({ ...track, analysis, analysisStatus: 'READY', analysisStep: 'COMPLETE' })),
    failAnalysis: vi.fn().mockResolvedValue({ ...track, analysisStatus: 'FAILED' }),
    restartEnrichment: vi.fn().mockResolvedValue({ ...track, analysis: { name: 'Ride', points: [{}, {}] }, analysisStep: 'ENRICHING' }),
    listOwned: vi.fn().mockResolvedValue([]),
    listHomepage: vi.fn().mockResolvedValue([]),
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
  const warn = vi.fn();
  const userRepository = {
    findPublicProfileById: vi.fn().mockResolvedValue({ displayName: 'Jan Kowalski', avatarUrl: 'https://example.com/jan.jpg' }),
  };
  const savedTrackRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    removeForTrack: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    isSaved: vi.fn().mockResolvedValue(false),
    savedTrackIds: vi.fn().mockResolvedValue([]),
    removeMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
    list: vi.fn().mockResolvedValue([]),
  };
  const service = createTrackService({
    trackRepository,
    gpxFileStore,
    enrichmentCacheRepository: { get: vi.fn(), put: vi.fn() },
    userRepository,
    savedTrackRepository,
    analyzeSource,
    enrichAnalysis,
    configuration: { userTiers: { BASIC: { limits: { tracks: 100 } }, PREMIUM: { limits: { tracks: 1000 } } } },
    schedule: (job) => scheduled.push(job),
    warn,
  });
  return { service, scheduled, trackRepository, savedTrackRepository, gpxFileStore, userRepository, analyzeSource, enrichAnalysis, warn };
}

describe('track service', () => {
  it('records unexpected failures in scheduled analysis jobs', async () => {
    const { service, scheduled, trackRepository, warn } = dependencies();
    trackRepository.setAnalysisStep.mockRejectedValue(new Error('database unavailable'));

    await service.upload({ ownerId: new ObjectId(), filename: 'ride.gpx', routeType: 'ROAD', source: Readable.from('') });
    await scheduled[0]();

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_analysis_job_failed', trackId: 'track-1', reason: 'Error',
    }));
  });

  it('adds an existing track to favorites and exposes persisted state', async () => {
    const { service, trackRepository, savedTrackRepository } = dependencies();
    const ownerId = new ObjectId();
    const userId = new ObjectId();
    const trackId = new ObjectId();
    trackRepository.findByPublicId.mockResolvedValue({ _id: trackId, ownerId });
    savedTrackRepository.isSaved.mockResolvedValue(true);

    await expect(service.saveTrack({ publicId: 'track-1', userId })).resolves.toBe(true);
    await expect(service.getSavedState({ publicId: 'track-1', userId })).resolves.toBe(true);

    expect(savedTrackRepository.save).toHaveBeenCalledWith({ userId, trackId });
  });

  it('allows the current user to add their own track to favorites', async () => {
    const { service, trackRepository, savedTrackRepository } = dependencies();
    const userId = new ObjectId();
    trackRepository.findByPublicId.mockResolvedValue({ _id: new ObjectId(), ownerId: userId });

    await expect(service.saveTrack({ publicId: 'track-1', userId })).resolves.toBe(true);
    expect(savedTrackRepository.save).toHaveBeenCalled();
  });
  it('marks owned list cards that are in favorites without checking each card separately', async () => {
    const { service, trackRepository, savedTrackRepository } = dependencies();
    const ownerId = new ObjectId();
    const favoriteId = new ObjectId();
    const otherId = new ObjectId();
    trackRepository.listOwned.mockResolvedValue([
      { _id: favoriteId, ownerId, title: 'Favorite', createdAt: new Date(), analysisStatus: 'READY' },
      { _id: otherId, ownerId, title: 'Other', createdAt: new Date(), analysisStatus: 'READY' },
    ]);
    savedTrackRepository.savedTrackIds.mockResolvedValue([favoriteId]);

    const page = await service.listMyTracks({ ownerId });

    expect(page.items.map((item) => item.isFavorite)).toEqual([true, false]);
    expect(savedTrackRepository.savedTrackIds).toHaveBeenCalledWith({ userId: ownerId, trackIds: [favoriteId, otherId] });
  });

  it('removes selected favorites without deleting their tracks', async () => {
    const { service, trackRepository, savedTrackRepository } = dependencies();
    const userId = new ObjectId();
    const first = new ObjectId();
    const second = new ObjectId();
    trackRepository.findByPublicId.mockResolvedValueOnce({ _id: first }).mockResolvedValueOnce({ _id: second });
    savedTrackRepository.savedTrackIds.mockResolvedValue([first, second]);

    const removed = await service.unsaveTracks({ publicIds: ['first', 'second'], userId });

    expect(removed).toEqual(['first', 'second']);
    expect(savedTrackRepository.removeMany).toHaveBeenCalledWith({ userId, trackIds: [first, second] });
    expect(trackRepository.deleteOwned).not.toHaveBeenCalled();
  });
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

  it('returns homepage tracks with the first track analysis and compact remaining items', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.listHomepage.mockResolvedValue([
      { _id: 'track-1', title: 'First', analysisStatus: 'READY', analysis: { distanceKm: 10, ascentM: 200, points: [{ lat: 1, lon: 2 }], pointsOfInterest: [{ name: 'Water' }] } },
      { _id: 'track-2', title: 'Second', analysisStatus: 'READY', analysis: { distanceKm: 20, ascentM: 300, points: [{ lat: 3, lon: 4 }] } },
    ]);

    const tracks = await service.getHomepageTracks();

    expect(trackRepository.listHomepage).toHaveBeenCalledWith(undefined);
    expect(tracks[0]).toMatchObject({ id: 'track-1', title: 'First', distanceKm: 10, ascentM: 200, pointsOfInterestCount: 1, analysis: { points: [{ lat: 1, lon: 2 }] } });
    expect(tracks[1]).toMatchObject({ id: 'track-2', title: 'Second', distanceKm: 20, ascentM: 300 });
    expect(tracks[1]).not.toHaveProperty('analysis');
  });

  it('profiles homepage selection and preparation with request-scoped steps', async () => {
    const { service } = dependencies();
    const steps = [];
    const profile = async (step, operation) => {
      steps.push(step);
      return operation();
    };

    await service.getHomepageTracks(undefined, profile);

    expect(steps).toEqual(['homepage.listTracks', 'homepage.prepareResponse']);
  });

  it('uses the refreshed homepage selection, including the oldest-three fallback', async () => {
    const { service, trackRepository } = dependencies();
    trackRepository.listHomepage.mockResolvedValue([]);
    const ids = ['6ab02471fb28fc3ae79e4d23', '6ab0249bfb28fc3ae79e4d26', '6aafc485fb28fc3ae79e4d17'];

    await service.getHomepageTracks(ids);
    await service.getHomepageTracks(null);

    expect(trackRepository.listHomepage.mock.calls[0][0].map(String)).toEqual(ids);
    expect(trackRepository.listHomepage.mock.calls[1][0]).toBeUndefined();
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
    expect(status).toEqual({ id: 'publicTrackId00000001', status: 'PROCESSING', step: 'QUEUED', error: null });
    expect(scheduled).toHaveLength(1);
  });

  it('rejects a basic user at the configured track limit before storing the source', async () => {
    const { service, trackRepository, gpxFileStore } = dependencies();
    trackRepository.countOwned.mockResolvedValue(100);

    await expect(service.upload({
      ownerId: 'owner-1', tier: 'BASIC', filename: 'ride.gpx', source: Readable.from('<gpx />'),
    })).rejects.toMatchObject({ code: 'TRACK_LIMIT_REACHED', limit: 100 });
    expect(gpxFileStore.save).not.toHaveBeenCalled();
  });

  it('uses the premium limit and defaults a missing tier to basic', async () => {
    const premium = dependencies();
    premium.trackRepository.countOwned.mockResolvedValue(999);
    await expect(premium.service.upload({ ownerId: 'owner-1', tier: 'PREMIUM', filename: 'ride.gpx', source: Readable.from('<gpx />') })).resolves.toBeTruthy();

    const legacy = dependencies();
    legacy.trackRepository.countOwned.mockResolvedValue(100);
    await expect(legacy.service.upload({ ownerId: 'owner-1', filename: 'ride.gpx', source: Readable.from('<gpx />') }))
      .rejects.toMatchObject({ code: 'TRACK_LIMIT_REACHED', limit: 100 });
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
    expect(deps.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_analysis_failed', trackId: 'track-1', step: 'PARSING', reason: 'Error',
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

  it('logs the enrichment failure reason without the provider response body', async () => {
    const deps = dependencies();
    deps.enrichAnalysis.mockRejectedValue(new Error('Valhalla HTTP 429'));
    await deps.service.upload({ ownerId: 'owner-1', filename: 'ride.gpx', source: Readable.from('<gpx />') });

    await deps.scheduled[0]();

    expect(deps.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_analysis_failed', trackId: 'track-1', step: 'ENRICHING',
      pointCount: 2, reason: 'VALHALLA_HTTP_429',
    }));
  });

  it('retries only enrichment from the persisted base analysis', async () => {
    const { service, scheduled, gpxFileStore, analyzeSource, enrichAnalysis } = dependencies();

    const status = await service.retryAnalysis({ publicId: 'track-1', ownerId: 'owner-1' });
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

    const management = await service.getManagement({ publicId: 'track-1', ownerId: 'owner-1' });
    const status = await service.retryAnalysis({ publicId: 'track-1', ownerId: 'owner-1' });

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
      routeType: 'other',
      status: 'FAILED',
      analysisLevel: 'BASIC',
      analysisNote: 'Источники: GPX — маршрут, высоты и основные показатели. Дорожные данные недоступны.',
      analysisSources: { gpx: 'SUCCESS', valhalla: 'FAILED', openStreetMap: 'FAILED' },
      analysis: { distanceKm: 42, points: [{}, {}] },
      externalLinks: {},
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
      externalLinks: { komoot: `https://www.komoot.com/tour/${index}` },
      analysis: { distanceKm: index, ascentM: 100, descentM: 90, effectiveSpeedKmh: 21, estimatedDurationMs: 3_600_000, preview: { points: [[0, 0], [100, 100]] }, points: [{ secret: true }] },
    })));

    const result = await service.listMyTracks({ ownerId: 'owner-1', query: 'ride' });

    expect(result.items).toHaveLength(24);
    expect(result.items[0]).not.toHaveProperty('analysis');
    expect(result.items[0]).toMatchObject({
      title: 'Ride 0', distanceKm: 0, ascentM: 100, descentM: 90, speedKmh: 21,
      externalLinks: { komoot: 'https://www.komoot.com/tour/0' },
      url: '/tracks/000000000000000000000001',
    });
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

    const externalLinks = { komoot: 'https://www.komoot.com/tour/123' };
    const result = await service.updateDetails({ publicId: 'track-1', ownerId: 'owner-1', title: 'New title', speedKmh: 25, routeType: 'road-cycling', externalLinks });

    expect(trackRepository.updateDetails).toHaveBeenCalledWith(expect.objectContaining({ estimatedDurationMs: 3_600_000, routeType: 'road-cycling', externalLinks }));
    expect(result.title).toBe('New title');
    expect(analyzeSource).not.toHaveBeenCalled();
    expect(enrichAnalysis).not.toHaveBeenCalled();
  });

  it('exposes external service links publicly and in owner management data', async () => {
    const { service, trackRepository } = dependencies();
    const externalLinks = { strava: 'https://www.strava.com/routes/123' };
    trackRepository.findById.mockResolvedValue({
      _id: 'track-1', ownerId: 'owner-1', title: 'Ride', analysisStatus: 'READY',
      analysis: { enrichmentSource: 'VALHALLA_OSM' }, externalLinks,
    });
    trackRepository.findOwnedById.mockResolvedValue({
      _id: 'track-1', title: 'Ride', analysisStatus: 'READY', analysis: { effectiveSpeedKmh: 20 }, externalLinks,
    });

    await expect(service.getPublicTrack('track-1')).resolves.toMatchObject({ externalLinks });
    await expect(service.getManagement({ publicId: 'track-1', ownerId: 'owner-1' })).resolves.toMatchObject({ externalLinks });
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

    const status = await deps.service.replaceFile({ publicId: 'track-1', ownerId: 'owner-1', filename: 'new.gpx', source: Readable.from('<gpx />') });
    await deps.scheduled[0]();

    expect(status).toMatchObject({ status: 'PROCESSING', step: 'QUEUED' });
    expect(deps.trackRepository.completeReplacement).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
    expect(deps.gpxFileStore.delete).toHaveBeenCalledWith('old-file');
  });

  it('permanently deletes the owned record and both active and pending files', async () => {
    const { service, trackRepository, gpxFileStore } = dependencies();
    trackRepository.deleteOwned.mockResolvedValue({ sourceFileId: 'active', replacement: { sourceFileId: 'pending' } });

    await expect(service.deleteTrack({ publicId: 'track-1', ownerId: 'owner-1' })).resolves.toBe(true);

    expect(gpxFileStore.delete).toHaveBeenCalledWith('active');
    expect(gpxFileStore.delete).toHaveBeenCalledWith('pending');
  });

  it('deletes multiple owned tracks and reports only records that existed', async () => {
    const { service, trackRepository, gpxFileStore } = dependencies();
    trackRepository.deleteOwned
      .mockResolvedValueOnce({ sourceFileId: 'active-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sourceFileId: 'active-3', replacement: { sourceFileId: 'pending-3' } });

    await expect(service.deleteTracks({ publicIds: ['track-1', 'track-2', 'track-3'], ownerId: 'owner-1' }))
      .resolves.toEqual(['track-1', 'track-3']);

    expect(gpxFileStore.delete).toHaveBeenCalledWith('active-1');
    expect(gpxFileStore.delete).toHaveBeenCalledWith('active-3');
    expect(gpxFileStore.delete).toHaveBeenCalledWith('pending-3');
  });
});
