import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createTrackHandlers } from '../../../src/backend/track-routes.js';
import { TrackLimitReachedError } from '../../../src/backend/track-service.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ body = '<gpx />', headers = {}, params = {} } = {}) {
  const stream = Readable.from(body);
  stream.headers = headers;
  stream.params = params;
  stream.query = {};
  return stream;
}

describe('track HTTP handlers', () => {
  it('requires authentication for upload', async () => {
    const handlers = createTrackHandlers({ upload: vi.fn() }, { getUser: vi.fn().mockResolvedValue(null) });
    const result = response();

    await handlers.upload(request(), result);

    expect(result.statusCode).toBe(401);
    expect(result.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns the authenticated owner list and forwards search pagination', async () => {
    const ownerId = new ObjectId();
    const trackService = { listMyTracks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const source = request();
    source.query = { query: ' gravel ', cursor: 'opaque' };
    const result = response();

    await handlers.mine(source, result);

    expect(trackService.listMyTracks).toHaveBeenCalledWith({ ownerId, query: 'gravel', cursor: 'opaque' });
    expect(result.body).toEqual({ data: { items: [], nextCursor: null } });
  });

  it('lists and toggles favorite tracks for the authenticated user', async () => {
    const userId = new ObjectId();
    const publicId = 'Abcdef_1234567890XYZ';
    const trackService = {
      listSavedTracks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getSavedState: vi.fn().mockResolvedValue(true),
      saveTrack: vi.fn().mockResolvedValue(true),
      unsaveTrack: vi.fn().mockResolvedValue(true),
    };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: userId.toString() }) });
    const listRequest = request();
    listRequest.query = { query: ' лес ', cursor: 'cursor' };

    await handlers.saved(listRequest, response());
    const stateResponse = response();
    await handlers.savedState(request({ params: { id: publicId } }), stateResponse);
    const saveResponse = response();
    await handlers.save(request({ params: { id: publicId } }), saveResponse);
    const removeResponse = response();
    await handlers.unsave(request({ params: { id: publicId } }), removeResponse);

    expect(trackService.listSavedTracks).toHaveBeenCalledWith({ userId, query: 'лес', cursor: 'cursor' });
    expect(stateResponse.body).toEqual({ data: { saved: true } });
    expect(saveResponse.body).toEqual({ data: { saved: true } });
    expect(removeResponse.body).toEqual({ data: { saved: false } });
  });

  it('validates bulk removal from the authenticated user favorites', async () => {
    const userId = new ObjectId();
    const publicId = 'Abcdef_1234567890XYZ';
    const trackService = { unsaveTracks: vi.fn().mockResolvedValue([publicId]) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: userId.toString() }) });
    const source = request();
    source.body = { ids: [publicId, publicId] };
    const result = response();

    await handlers.unsaveMany(source, result);

    expect(trackService.unsaveTracks).toHaveBeenCalledWith({ publicIds: [publicId], userId });
    expect(result.body).toEqual({ data: { removedIds: [publicId] } });
    const invalid = request();
    invalid.body = { ids: ['bad-id'] };
    const invalidResult = response();
    await handlers.unsaveMany(invalid, invalidResult);
    expect(invalidResult.statusCode).toBe(422);
    expect(trackService.unsaveTracks).toHaveBeenCalledTimes(1);
  });

  it('accepts a raw GPX stream and returns a polling resource', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn().mockResolvedValue({ id: 'track-1', status: 'PROCESSING', step: 'QUEUED', error: null }) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const source = request({
      headers: {
        'content-type': 'application/gpx+xml',
        'content-length': '7',
        'x-gpx-filename': encodeURIComponent('Заезд.gpx'),
        'x-track-type': 'gravel-cycling',
      },
    });
    const result = response();

    await handlers.upload(source, result);

    expect(trackService.upload).toHaveBeenCalledWith({ ownerId, tier: 'BASIC', filename: 'Заезд.gpx', routeType: 'gravel-cycling', source, profile: null });
    expect(result.statusCode).toBe(202);
    expect(result.headers.location).toBe('/api/tracks/track-1/status');
  });

  it('returns a conflict when the user has reached the configured track limit', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn().mockRejectedValue(new TrackLimitReachedError(100)) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString(), tier: 'BASIC' }) });
    const source = request({ headers: { 'content-type': 'application/gpx+xml', 'x-gpx-filename': 'ride.gpx', 'x-track-type': 'cycling' } });
    const result = response();

    await handlers.upload(source, result);

    expect(result.statusCode).toBe(409);
    expect(result.body.error.code).toBe('TRACK_LIMIT_REACHED');
  });

  it('rejects an absent or unknown route type before storing an upload', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn() };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });

    for (const routeType of ['', 'e-bike', 'bike-commuting']) {
      const result = response();
      await handlers.upload(request({ headers: {
        'content-type': 'application/gpx+xml', 'x-gpx-filename': 'ride.gpx', 'x-track-type': routeType,
      } }), result);
      expect(result.statusCode).toBe(422);
      expect(result.body.error.code).toBe('INVALID_ROUTE_TYPE');
    }
    expect(trackService.upload).not.toHaveBeenCalled();
  });

  it('rejects unsupported content and declared oversized uploads', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn() };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const wrongType = response();
    const tooLarge = response();

    await handlers.upload(request({ headers: { 'content-type': 'text/plain', 'x-gpx-filename': 'ride.gpx' } }), wrongType);
    await handlers.upload(request({ headers: {
      'content-type': 'application/gpx+xml',
      'content-length': String(25 * 1024 * 1024 + 1),
      'x-gpx-filename': 'ride.gpx',
      'x-track-type': 'cycling',
    } }), tooLarge);

    expect(wrongType.statusCode).toBe(415);
    expect(tooLarge.statusCode).toBe(413);
    expect(trackService.upload).not.toHaveBeenCalled();
  });

  it('returns owner processing status and hides non-owned tracks as not found', async () => {
    const ownerId = new ObjectId();
    const trackId = new ObjectId();
    const trackService = { getStatus: vi.fn().mockResolvedValueOnce({ id: trackId.toString(), status: 'PROCESSING', step: 'ENRICHING', error: null }).mockResolvedValueOnce(null) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const found = response();
    const missing = response();

    await handlers.status(request({ params: { id: trackId.toString() } }), found);
    await handlers.status(request({ params: { id: trackId.toString() } }), missing);

    expect(found.body.data.step).toBe('ENRICHING');
    expect(missing.statusCode).toBe(404);
  });

  it('returns a track publicly without checking a session', async () => {
    const publicId = 'Abcdef_1234567890XYZ';
    const trackService = { getPublicTrack: vi.fn().mockResolvedValue({ id: publicId, analysisLevel: 'BASIC' }) };
    const authService = { getUser: vi.fn() };
    const handlers = createTrackHandlers(trackService, authService);
    const result = response();

    await handlers.publicTrack(request({ params: { id: publicId } }), result);

    expect(result.statusCode).toBe(200);
    expect(result.body.data.analysisLevel).toBe('BASIC');
    expect(authService.getUser).not.toHaveBeenCalled();
    expect(trackService.getPublicTrack).toHaveBeenCalledWith(publicId, null);
  });

  it('returns homepage tracks publicly without checking a session', async () => {
    const trackService = { getHomepageTracks: vi.fn().mockResolvedValue([{ id: 'track-1', title: 'First' }]) };
    const authService = { getUser: vi.fn() };
    const handlers = createTrackHandlers(trackService, authService);
    const result = response();

    await handlers.homepageTracks(request(), result);

    expect(result.body).toEqual({ data: [{ id: 'track-1', title: 'First' }] });
    expect(authService.getUser).not.toHaveBeenCalled();
  });

  it('downloads the original GPX publicly with its UTF-8 filename', async () => {
    const trackId = new ObjectId();
    const stream = { on: vi.fn(), pipe: vi.fn() };
    const handlers = createTrackHandlers({
      getPublicDownload: vi.fn().mockResolvedValue({ filename: 'Заезд.gpx', stream }),
    }, { getUser: vi.fn() });
    const result = response();

    await handlers.download(request({ params: { id: trackId.toString() } }), result);

    expect(result.headers['content-type']).toBe('application/gpx+xml');
    expect(result.headers['content-disposition']).toContain("filename*=UTF-8''%D0%97%D0%B0%D0%B5%D0%B7%D0%B4.gpx");
    expect(stream.pipe).toHaveBeenCalledWith(result);
  });

  it('validates owner edits and accepted cycling speed range', async () => {
    const ownerId = new ObjectId();
    const trackId = new ObjectId();
    const trackService = { updateDetails: vi.fn().mockResolvedValue({ id: trackId.toString(), title: 'Renamed' }) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const valid = request({ params: { id: trackId.toString() } });
    valid.body = {
      title: ' Renamed ',
      speedKmh: 32.5,
      routeType: 'road-cycling',
      externalLinks: {
        komoot: ' https://www.komoot.com/tour/123 ',
        strava: '',
        garmin: 'https://connect.garmin.com/modern/course/456',
        rideWithGps: 'https://ridewithgps.com/routes/789',
      },
    };
    const invalid = request({ params: { id: trackId.toString() } });
    invalid.body = { title: 'Ride', speedKmh: 51 };
    const validResponse = response();
    const invalidResponse = response();

    await handlers.update(valid, validResponse);
    await handlers.update(invalid, invalidResponse);

    expect(trackService.updateDetails).toHaveBeenCalledWith({
      publicId: trackId.toString(),
      ownerId,
      title: 'Renamed',
      speedKmh: 32.5,
      routeType: 'road-cycling',
      externalLinks: {
        komoot: 'https://www.komoot.com/tour/123',
        garmin: 'https://connect.garmin.com/modern/course/456',
        rideWithGps: 'https://ridewithgps.com/routes/789',
      },
    });
    expect(validResponse.statusCode).toBe(200);
    expect(invalidResponse.statusCode).toBe(422);
  });

  it('rejects external links that do not use HTTPS or the matching service domain', async () => {
    const ownerId = new ObjectId();
    const trackId = new ObjectId();
    const trackService = { updateDetails: vi.fn() };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });

    for (const externalLinks of [
      { komoot: 'javascript:alert(1)' },
      { strava: 'https://example.com/activities/1' },
      { unknown: 'https://example.com' },
    ]) {
      const source = request({ params: { id: trackId.toString() } });
      source.body = { title: 'Ride', speedKmh: 20, routeType: 'cycling', externalLinks };
      const result = response();
      await handlers.update(source, result);
      expect(result.statusCode).toBe(422);
      expect(result.body.error.code).toBe('INVALID_EXTERNAL_LINKS');
    }
    expect(trackService.updateDetails).not.toHaveBeenCalled();
  });

  it('validates and deletes a unique list of owned track ids', async () => {
    const ownerId = new ObjectId();
    const firstId = new ObjectId();
    const secondId = new ObjectId();
    const trackService = { deleteTracks: vi.fn().mockResolvedValue([firstId, secondId]) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const source = request();
    source.body = { ids: [firstId.toString(), firstId.toString(), secondId.toString()] };
    const result = response();

    await handlers.removeMany(source, result);

    expect(trackService.deleteTracks).toHaveBeenCalledWith({ ownerId, publicIds: [firstId.toString(), secondId.toString()] });
    expect(result.body).toEqual({ data: { deletedIds: [firstId.toString(), secondId.toString()] } });
  });

  it('rejects empty, oversized, or malformed bulk deletion input', async () => {
    const ownerId = new ObjectId();
    const trackService = { deleteTracks: vi.fn() };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const invalidBodies = [{ ids: [] }, { ids: Array.from({ length: 101 }, () => new ObjectId().toString()) }, { ids: ['not-an-id'] }];

    for (const body of invalidBodies) {
      const source = request();
      source.body = body;
      const result = response();
      await handlers.removeMany(source, result);
      expect(result.statusCode).toBe(422);
    }
    expect(trackService.deleteTracks).not.toHaveBeenCalled();
  });
});
