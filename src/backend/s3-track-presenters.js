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
  const attempt = track.attempt;
  const interrupted = hasExpiredAttempt(track);
  return { id: track.publicId, status: interrupted ? 'FAILED' : attempt?.status || track.analysisStatus,
    step: attempt?.step || track.analysisStep,
    error: interrupted ? { code: 'PROCESSING_INTERRUPTED' }
      : attempt?.error ? { code: attempt.error.code } : null,
    hasActive: Boolean(track.active), canRetry: Boolean(attempt?.status === 'FAILED' || hasExpiredAttempt(track)),
    interrupted };
}
export function publicTrack(track, uploader = null) {
  if (!track) return null;
  const result = resultOf(track);
  const id = track.publicId;
  return {
    id, title: track.title, routeType: normalizeRouteType(track.routeType),
    status: track.analysisStatus, processing: track.attempt ? statusOf(track) : null,
    resultKind: track.active ? 'ACTIVE' : result ? 'DIAGNOSTIC' : 'NONE',
    revision: result?.revision || null, metrics: result?.metrics || null,
    summary: result?.summary || null,
    originalFilename: result?.originalFilename || track.attempt?.originalFilename || null,
    sourcePointCount: result?.sourcePointCount ?? null,
    pointsOfInterestCount: result?.pointsOfInterestCount ?? 0,
    preview: result?.preview || null, completeness: result?.completeness || null,
    analysisSources: result?.analysisSources || { gpx: track.analysisStatus === 'PROCESSING' ? 'PENDING' : 'FAILED', valhalla: 'PENDING', openStreetMap: 'PENDING' },
    analysisLevel: result ? (track.active ? 'FULL' : 'BASIC') : 'NONE',
    externalLinks: track.externalLinks || {}, createdAt: track.createdAt?.toISOString() || null,
    uploader, analysisUrl: result?.analysisKey ? `/api/tracks/${id}/analysis` : null,
    downloadUrl: result?.sourceKey || track.attempt?.sourceKey ? `/api/tracks/${id}/download` : null,
  };
}
export function card(track) {
  const id = track.publicId;
  const result = resultOf(track);
  return { id, title: track.title, routeType: normalizeRouteType(track.routeType),
    createdAt: track.createdAt?.toISOString() || null, status: track.analysisStatus,
    step: track.attempt?.step || track.analysisStep,
    distanceKm: result?.metrics?.distanceKm ?? null, ascentM: result?.metrics?.ascentM ?? null,
    descentM: result?.metrics?.descentM ?? null, speedKmh: result?.metrics?.effectiveSpeedKmh ?? null,
    estimatedDurationMs: result?.metrics?.estimatedDurationMs ?? null,
    preview: result?.preview || null, externalLinks: track.externalLinks || {},
    url: `/tracks/${id}`, downloadUrl: `/api/tracks/${id}/download` };
}
export function homepage(track) {
  const result = resultOf(track);
  return { id: track.publicId, title: track.title, routeType: normalizeRouteType(track.routeType),
    distanceKm: result?.metrics?.distanceKm ?? null, ascentM: result?.metrics?.ascentM ?? null,
    pointsOfInterestCount: result?.pointsOfInterestCount ?? 0, url: `/tracks/${track.publicId}`,
    analysisUrl: result?.analysisKey ? `/api/tracks/${track.publicId}/analysis` : null };
}
