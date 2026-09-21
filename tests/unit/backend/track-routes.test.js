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

  it('accepts a raw GPX stream and returns a polling resource', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn().mockResolvedValue({ id: 'track-1', status: 'PROCESSING', step: 'QUEUED', error: null }) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString() }) });
    const source = request({
      headers: {
        'content-type': 'application/gpx+xml',
        'content-length': '7',
        'x-gpx-filename': encodeURIComponent('Заезд.gpx'),
      },
    });
    const result = response();

    await handlers.upload(source, result);

    expect(trackService.upload).toHaveBeenCalledWith({ ownerId, tier: 'BASIC', filename: 'Заезд.gpx', source });
    expect(result.statusCode).toBe(202);
    expect(result.headers.location).toBe('/api/tracks/track-1/status');
  });

  it('returns a conflict when the user has reached the configured track limit', async () => {
    const ownerId = new ObjectId();
    const trackService = { upload: vi.fn().mockRejectedValue(new TrackLimitReachedError(100)) };
    const handlers = createTrackHandlers(trackService, { getUser: vi.fn().mockResolvedValue({ id: ownerId.toString(), tier: 'BASIC' }) });
    const source = request({ headers: { 'content-type': 'application/gpx+xml', 'x-gpx-filename': 'ride.gpx' } });
    const result = response();

    await handlers.upload(source, result);

    expect(result.statusCode).toBe(409);
    expect(result.body.error.code).toBe('TRACK_LIMIT_REACHED');
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
    const trackId = new ObjectId();
    const trackService = { getPublicTrack: vi.fn().mockResolvedValue({ id: trackId.toString(), analysisLevel: 'BASIC' }) };
    const authService = { getUser: vi.fn() };
    const handlers = createTrackHandlers(trackService, authService);
    const result = response();

    await handlers.publicTrack(request({ params: { id: trackId.toString() } }), result);

    expect(result.statusCode).toBe(200);
    expect(result.body.data.analysisLevel).toBe('BASIC');
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
    valid.body = { title: ' Renamed ', speedKmh: 32.5 };
    const invalid = request({ params: { id: trackId.toString() } });
    invalid.body = { title: 'Ride', speedKmh: 51 };
    const validResponse = response();
    const invalidResponse = response();

    await handlers.update(valid, validResponse);
    await handlers.update(invalid, invalidResponse);

    expect(trackService.updateDetails).toHaveBeenCalledWith({ trackId, ownerId, title: 'Renamed', speedKmh: 32.5 });
    expect(validResponse.statusCode).toBe(200);
    expect(invalidResponse.statusCode).toBe(422);
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

    expect(trackService.deleteTracks).toHaveBeenCalledWith({ ownerId, trackIds: [firstId, secondId] });
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
