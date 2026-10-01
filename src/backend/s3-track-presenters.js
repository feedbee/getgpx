import { trackData } from './track-data.js';
import { ObjectId } from 'mongodb';
import { normalizeRouteType } from '../route-types.js';
import { InvalidTrackCursorError } from './track-contracts.js';
import { hasExpiredProcessing } from './s3-track-repository.js';

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
export function statusOf(track) {
  if (!track) return null;
  const interrupted = hasExpiredProcessing(track);
  const status = interrupted ? 'FAILED' : track.processing.status;
  return { id: track.publicId, status,
    step: status === 'PROCESSING' ? track.processing.step || 'QUEUED' : null,
    error: interrupted ? { code: 'PROCESSING_INTERRUPTED' } : track.processing?.error ? { code: track.processing.error.code } : null,
    canRetry: status !== 'PROCESSING' && Boolean(track.processing?.status === 'FAILED' || interrupted
      || track.result?.sources?.valhalla === 'SUCCESS' && track.result?.sources?.openStreetMap === 'FAILED'),
  };
}
export function publicTrack(track, author = null) {
  if (!track) return null;
  const result = track.result;
  const id = track.publicId;
  const { status, step, error, canRetry } = statusOf(track);
  const processing = { status, step, error, canRetry };
  return {
    id, title: track.title, routeType: normalizeRouteType(track.routeType),
    processing, revision: result?.revision || null,
    metrics: { ...(result?.metrics || trackData({}).metrics), ...(track.speedKmh == null ? {} : {
      speedKmh: track.speedKmh, estimatedDurationMs: result?.metrics?.distanceKm == null
        ? null : result.metrics.distanceKm / track.speedKmh * 3_600_000,
    }) },
    distributions: result?.distributions || { surfaces: [], roadQualities: [], wayTypes: [] },
    climbs: result?.climbs || [], descents: result?.descents || [], pointsOfInterest: result?.pointsOfInterest || [],
    originalFilename: result?.originalFilename || track.processing?.originalFilename || null,
    sourcePointCount: result?.sourcePointCount ?? null,
    completeness: result?.completeness || null,
    sources: result?.sources || { gpx: track.processing.status === 'PROCESSING' ? 'PENDING' : 'FAILED', valhalla: 'PENDING', openStreetMap: 'PENDING' },
    externalLinks: track.externalLinks || {}, createdAt: track.createdAt?.toISOString() || null,
    author, analysisUrl: result?.analysisKey ? `/api/v1/tracks/${id}/analysis` : null,
    downloadURL: result?.sourceKey || track.processing?.sourceKey ? { gpx: `/api/v1/tracks/${id}/gpx` } : {},
  };
}
export function card(track) {
  const value = publicTrack(track);
  const { id, title, routeType, createdAt, processing, metrics, externalLinks, downloadURL, author } = value;
  return { id, title, routeType, createdAt, processing, metrics, externalLinks, downloadURL, author,
    preview: track.result?.preview || null, url: `/tracks/${id}` };
}
export function homepage(track) {
  const result = track.result;
  return { id: track.publicId, title: track.title, routeType: normalizeRouteType(track.routeType),
    distanceKm: result?.metrics?.distanceKm ?? null, ascentM: result?.metrics?.ascentM ?? null,
    pointsOfInterestCount: result?.pointsOfInterest?.length ?? 0, url: `/tracks/${track.publicId}`,
    analysisUrl: result?.analysisKey ? `/api/v1/tracks/${track.publicId}/analysis` : null };
}
