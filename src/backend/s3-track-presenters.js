import { trackData } from './track-data.js';
import { ObjectId } from 'mongodb';
import { normalizeRouteType } from '../route-types.js';
import { InvalidTrackCursorError } from './track-contracts.js';
import { hasExpiredAttempt } from './s3-track-repository.js';

export const PAGE_SIZE = 24;
export function cursorOf(value, field) {
  return Buffer.from(JSON.stringify({ at: value[field].toISOString(), id: String(value._id) })).toString('base64url');
}
export function decodeCursor(value, field) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    const at = new Date(parsed.at);
    if (Number.isNaN(at.getTime()) || !/^[a-f\d]{24}$/i.test(parsed.id)) throw new Error();
    return { [field]: at, id: ObjectId.createFromHexString(parsed.id) };
  } catch { throw new InvalidTrackCursorError(); }
}
export function titleFromFilename(filename) { return filename.split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim(); }
export function resultOf(track) { return track.active || track.diagnostic || null; }
export function statusOf(track) {
  if (!track) return null;
  const interrupted = hasExpiredAttempt(track);
  const status = interrupted ? 'FAILED' : track.attempt?.status || track.analysisStatus;
  return { id: track.publicId, status,
    step: status === 'PROCESSING' ? track.attempt?.step || track.analysisStep || 'QUEUED' : null,
    error: interrupted ? { code: 'PROCESSING_INTERRUPTED' } : track.attempt?.error ? { code: track.attempt.error.code } : null,
    canRetry: status !== 'PROCESSING' && Boolean(track.attempt?.status === 'FAILED' || interrupted
      || track.active?.enrichmentSource === 'VALHALLA'),
  };
}
export function publicTrack(track, author = null) {
  if (!track) return null;
  const result = resultOf(track);
  const id = track.publicId;
  const { status, step, error, canRetry } = statusOf(track);
  const processing = { status, step, error, canRetry };
  return {
    id, title: track.title, routeType: normalizeRouteType(track.routeType),
    processing, revision: result?.revision || null,
    metrics: result?.metrics || trackData({ effectiveSpeedKmh: track.attempt?.metadataOverrides?.speedKmh }).metrics,
    distributions: result?.distributions || { surfaces: [], roadQualities: [], wayTypes: [] },
    climbs: result?.climbs || [], descents: result?.descents || [], pointsOfInterest: result?.pointsOfInterest || [],
    originalFilename: result?.originalFilename || track.attempt?.originalFilename || null,
    sourcePointCount: result?.sourcePointCount ?? null,
    completeness: result?.completeness || null,
    sources: result?.analysisSources || { gpx: track.analysisStatus === 'PROCESSING' ? 'PENDING' : 'FAILED', valhalla: 'PENDING', openStreetMap: 'PENDING' },
    externalLinks: track.externalLinks || {}, createdAt: track.createdAt?.toISOString() || null,
    author, analysisUrl: result?.analysisKey ? `/api/v1/tracks/${id}/analysis` : null,
    gpxUrl: result?.sourceKey || track.attempt?.sourceKey ? `/api/v1/tracks/${id}/gpx` : null,
  };
}
export function card(track) {
  const value = publicTrack(track);
  const { id, title, routeType, createdAt, processing, metrics, externalLinks, gpxUrl, author } = value;
  return { id, title, routeType, createdAt, processing, metrics, externalLinks, gpxUrl, author,
    preview: resultOf(track)?.preview || null, url: `/tracks/${id}` };
}
export function homepage(track) {
  const result = resultOf(track);
  return { id: track.publicId, title: track.title, routeType: normalizeRouteType(track.routeType),
    distanceKm: result?.metrics?.distanceKm ?? null, ascentM: result?.metrics?.ascentM ?? null,
    pointsOfInterestCount: result?.pointsOfInterest?.length ?? 0, url: `/tracks/${track.publicId}`,
    analysisUrl: result?.analysisKey ? `/api/v1/tracks/${track.publicId}/analysis` : null };
}
