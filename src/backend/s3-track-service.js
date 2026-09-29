import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { DEFAULT_USER_TIERS } from './configuration.js';
import { normalizeRouteType } from '../route-types.js';
import { InvalidTrackCursorError, TrackLimitReachedError, EXTERNAL_ANALYSIS_TIMEOUT_MS } from './track-service.js';
import { hasExpiredAttempt, trackObjectKeys } from './s3-track-repository.js';
import { analysisFailure } from './analysis-warning.js';
import { logger } from './logger.js';
import { safeErrorDetails } from './safe-error-details.js';

const PAGE_SIZE = 24;
function cursorOf(value, field) {
  return Buffer.from(JSON.stringify({ at: value[field].toISOString(), id: String(value._id) })).toString('base64url');
}
function decodeCursor(value, field) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    const at = new Date(parsed.at);
    if (Number.isNaN(at.getTime()) || !/^[a-f\d]{24}$/i.test(parsed.id)) throw new Error();
    return { [field]: at, id: ObjectId.createFromHexString(parsed.id) };
  } catch { throw new InvalidTrackCursorError(); }
}
function titleFromFilename(filename) { return filename.split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim(); }
function resultOf(track) { return track.active || track.diagnostic || null; }
function sourcesOf(analysis, status) {
  return {
    gpx: 'SUCCESS',
    valhalla: analysis.enrichmentSource ? 'SUCCESS' : status === 'READY' ? 'SUCCESS' : 'FAILED',
    openStreetMap: analysis.enrichmentSource === 'VALHALLA_OSM' ? 'SUCCESS' : 'FAILED',
  };
}
function statusOf(track) {
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
function publicTrack(track, uploader = null) {
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
function card(track) {
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
function homepage(track) {
  const result = resultOf(track);
  return { id: track.publicId, title: track.title, routeType: normalizeRouteType(track.routeType),
    distanceKm: result?.metrics?.distanceKm ?? null, ascentM: result?.metrics?.ascentM ?? null,
    pointsOfInterestCount: result?.pointsOfInterestCount ?? 0, url: `/tracks/${track.publicId}`,
    analysisUrl: result?.analysisKey ? `/api/tracks/${track.publicId}/analysis` : null };
}

export function createS3TrackService({ trackRepository, objectStore, enrichmentCacheRepository,
  savedTrackRepository, userRepository, analyzeSource, enrichAnalysis,
  configuration = { userTiers: DEFAULT_USER_TIERS },
  schedule = (job) => setImmediate(job), warn = (details) => logger.warn(details, 'Track analysis warning'),
  enrichmentTimeoutMs = EXTERNAL_ANALYSIS_TIMEOUT_MS, now = () => new Date() }) {
  if (!trackRepository || !objectStore || !analyzeSource || !enrichAnalysis) throw new Error('Track service dependencies are required.');
  const authorizeTrackRead = (_identity, track) => Boolean(track); // Public today; policy boundary for private tracks.
  const cleanup = async (keys) => {
    const results = await Promise.allSettled([...new Set(keys.filter(Boolean))].map((key) => objectStore.delete(key)));
    for (const result of results) if (result.status === 'rejected') {
      warn({ event: 'track_object_cleanup_failed', ...safeErrorDetails(result.reason) });
    }
  };
  const scheduleProcessing = (track) => schedule(() => process(track).catch((error) => {
    warn({ event: 'track_analysis_job_failed', trackId: String(track._id),
      revision: track.attempt?.revision, ...safeErrorDetails(error) });
  }));

  async function process(track) {
    const identity = { trackId: track._id, ownerId: track.ownerId,
      revision: track.attempt.revision, workerId: randomUUID() };
    const claimed = await trackRepository.claim(identity, now());
    if (!claimed) return;
    let lost = false;
    const heartbeat = setInterval(() => {
      trackRepository.heartbeat(identity, now()).then((result) => { if (!result.modifiedCount) lost = true; })
        .catch((heartbeatError) => {
          if (!lost) warn({ event: 'track_heartbeat_failed', trackId: String(track._id),
            revision: identity.revision, ...safeErrorDetails(heartbeatError) });
          lost = true;
        });
    }, 30_000);
    heartbeat.unref?.();
    let base;
    let step = 'READING';
    try {
      const source = await objectStore.readSource(claimed.attempt.sourceKey);
      step = 'PARSING';
      base = analyzeSource(source, { filename: claimed.attempt.originalFilename });
      if (lost || !await trackRepository.setStep(identity, 'ENRICHING', now(),
        claimed.active ? null : base.name)) return;
      step = 'ENRICHING';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
      let analysis;
      try {
        analysis = await enrichAnalysis(base, { cache: enrichmentCacheRepository, signal: controller.signal,
          warn: (details) => warn({ trackId: String(track._id), revision: identity.revision, ...details }) });
      } finally { clearTimeout(timeout); }
      if (lost) return;
      const analysisSources = sourcesOf(analysis, 'READY');
      const completeness = analysis.enrichmentSource === 'VALHALLA_OSM' ? 'FULL' : 'PARTIAL';
      step = 'WRITING';
      const analysisKey = await objectStore.writeAnalysis({ trackId: String(track._id), revision: identity.revision,
        analysis, analysisSources, completeness });
      step = 'PUBLISHING';
      const previous = await trackRepository.publish(identity, { analysis, analysisKey,
        title: base.name, analysisSources, completeness }, now());
      if (previous) {
        const retained = new Set(trackObjectKeys(await trackRepository.findById(track._id) || {}));
        await cleanup(trackObjectKeys(previous).filter((key) => !retained.has(key)));
      }
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: identity.revision,
        step, ...analysisFailure(error) });
      // A lost MongoDB acknowledgement can mean the new object is already active.
      if (step === 'PUBLISHING') return;
      const errorCode = step === 'READING' ? 'TRACK_FILE_UNAVAILABLE' : step === 'PARSING'
        ? error?.code === 'GPX_POINT_LIMIT' ? 'GPX_POINT_LIMIT' : 'INVALID_GPX'
        : step === 'WRITING' ? 'ANALYSIS_STORAGE_UNAVAILABLE' : 'ENRICHMENT_UNAVAILABLE';
      let diagnostic = null;
      if (step === 'ENRICHING' && base && !claimed.active) {
        try {
          const analysisSources = sourcesOf(base, 'FAILED');
          const analysisKey = await objectStore.writeAnalysis({ trackId: String(track._id),
            revision: identity.revision, analysis: base, status: 'FAILED', completeness: 'PARTIAL', analysisSources });
          diagnostic = { analysis: base, analysisKey, analysisSources };
        } catch (writeError) {
          warn({ event: 'track_diagnostic_write_failed', trackId: String(track._id),
            revision: identity.revision, ...safeErrorDetails(writeError) });
        }
      }
      await trackRepository.fail(identity, { errorCode, failedStep: step, diagnostic }, now());
    } finally { clearInterval(heartbeat); }
  }

  async function findReadable(publicId, identity = null) {
    const track = await trackRepository.findByPublicId(publicId);
    return authorizeTrackRead(identity, track) ? track : null;
  }
  async function fileDescriptor(publicId, kind, identity = null) {
    const track = await findReadable(publicId, identity);
    if (!track) return null;
    const result = resultOf(track);
    const key = kind === 'analysis' ? result?.analysisKey : result?.sourceKey || track.attempt?.sourceKey;
    if (key) objectStore.assertKey(key);
    return { key: key || null, revision: result?.revision || track.attempt?.revision,
      filename: result?.originalFilename || track.attempt?.originalFilename };
  }
  async function deleteTrack(track) {
    const removed = await trackRepository.deleteOwned(track._id, track.ownerId);
    if (!removed) return true;
    const results = await Promise.allSettled([cleanup(trackObjectKeys(removed)), savedTrackRepository.removeForTrack(removed._id)]);
    if (results[1].status === 'rejected') {
      warn({ event: 'track_saved_relations_cleanup_failed', trackId: String(removed._id),
        ...safeErrorDetails(results[1].reason) });
    }
    return true;
  }

  return {
    authorizeTrackRead,
    async getHomepageTracks(homepageTrackIds = configuration.homepageTrackIds) {
      const ids = homepageTrackIds?.map((id) => ObjectId.createFromHexString(id));
      return (await trackRepository.listHomepage(ids)).map(homepage);
    },
    async upload({ ownerId, tier = 'BASIC', filename, routeType, source, onStage = () => {} }) {
      onStage('quota_check');
      const limit = configuration.userTiers[tier]?.limits?.tracks ?? configuration.userTiers.BASIC.limits.tracks;
      if (await trackRepository.countOwned(ownerId) >= limit) throw new TrackLimitReachedError(limit);
      const trackId = new ObjectId();
      const revision = randomUUID();
      onStage('source_upload');
      const sourceKey = await objectStore.writeSource({ trackId: String(trackId), revision, source });
      try {
        onStage('track_record_create');
        const track = await trackRepository.createProcessing({ trackId, ownerId, sourceKey, revision,
          originalFilename: filename, title: titleFromFilename(filename), routeType });
        onStage('processing_schedule');
        scheduleProcessing(track);
        return statusOf(track);
      } catch (error) {
        try {
          const stored = await trackRepository.findById(trackId);
          if (!stored) await cleanup([sourceKey]);
        } catch (lookupError) {
          warn({ event: 'track_upload_cleanup_check_failed', trackId: String(trackId), revision,
            ...safeErrorDetails(lookupError) });
        }
        throw error;
      }
    },
    getStatus: async ({ publicId, ownerId }) => statusOf(await trackRepository.findOwnedByPublicId(publicId, ownerId)),
    async getManagement({ publicId, ownerId }) {
      const track = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!track) return null;
      const result = resultOf(track);
      return { id: track.publicId, title: track.title, routeType: normalizeRouteType(track.routeType),
        speedKmh: result?.metrics?.effectiveSpeedKmh ?? null, externalLinks: track.externalLinks || {},
        analysis: statusOf(track), replacement: track.attempt?.kind === 'REPLACE' ? statusOf(track) : null,
        canRetry: Boolean(track.attempt?.status === 'FAILED' || hasExpiredAttempt(track)
          || track.active?.enrichmentSource === 'VALHALLA'),
        interrupted: hasExpiredAttempt(track),
        missingOsmTags: track.active?.enrichmentSource === 'VALHALLA',
        retrySource: track.active?.enrichmentSource === 'VALHALLA' ? 'openStreetMap' : 'valhalla' };
    },
    async getPublicTrack(publicId) {
      const track = await findReadable(publicId);
      if (!track) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await userRepository.findPublicProfileById(track.ownerId) : null;
      return publicTrack(track, uploader);
    },
    fileDescriptor,
    async getPublicDownload(publicId) {
      const descriptor = await fileDescriptor(publicId, 'download');
      if (!descriptor?.key) return null;
      return { filename: descriptor.filename, stream: await objectStore.openRead(descriptor.key) };
    },
    async getPublicAnalysis(publicId) {
      const descriptor = await fileDescriptor(publicId, 'analysis');
      if (!descriptor) return null;
      if (!descriptor.key) return { unavailable: true };
      return { stream: await objectStore.openRead(descriptor.key) };
    },
    async updateDetails({ publicId, ownerId, title, speedKmh, routeType, externalLinks }) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
        if (!existing) return null;
        if (existing.active && existing.attempt?.status === 'PROCESSING') {
          const conflict = new Error('Track processing is in progress.');
          conflict.code = 'TRACK_EDIT_CONFLICT';
          throw conflict;
        }
        const updated = !existing.active && existing.attempt?.status === 'PROCESSING'
          ? await trackRepository.updateProcessingDetails({ trackId: existing._id, ownerId,
            title, speedKmh, routeType, externalLinks })
          : existing.active ? await trackRepository.updateDetails({ trackId: existing._id, ownerId,
            title, speedKmh, estimatedDurationMs: existing.active.metrics.distanceKm / speedKmh * 3_600_000,
            routeType, externalLinks }) : null;
        if (updated) {
          const uploader = userRepository?.findPublicProfileById
            ? await userRepository.findPublicProfileById(updated.ownerId) : null;
          return publicTrack(updated, uploader);
        }
        // The first publication may have finished between the read and update.
      }
      return null;
    },
    async replaceFile({ publicId, ownerId, filename, source, onStage = () => {} }) {
      onStage('track_lookup');
      const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!existing || existing.attempt?.status === 'PROCESSING' && !hasExpiredAttempt(existing)) return null;
      const revision = randomUUID();
      onStage('source_upload');
      const sourceKey = await objectStore.writeSource({ trackId: String(existing._id), revision, source });
      try {
        onStage('track_record_create');
        const track = await trackRepository.beginAttempt({ trackId: existing._id, ownerId, revision,
          sourceKey, originalFilename: filename, kind: 'REPLACE' }, now());
        if (!track) { await cleanup([sourceKey]); return null; }
        onStage('processing_schedule');
        scheduleProcessing(track);
        return statusOf(track);
      } catch (error) {
        try {
          const current = await trackRepository.findById(existing._id);
          if (current?.attempt?.revision !== revision) await cleanup([sourceKey]);
        } catch (lookupError) {
          warn({ event: 'track_replacement_cleanup_check_failed', trackId: String(existing._id), revision,
            ...safeErrorDetails(lookupError) });
        }
        throw error;
      }
    },
    async retryAnalysis({ publicId, ownerId }) {
      const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!existing || existing.attempt?.status === 'PROCESSING' && !hasExpiredAttempt(existing)) return null;
      if (!existing.attempt && existing.active?.enrichmentSource !== 'VALHALLA') return null;
      const from = existing.attempt?.sourceKey || existing.active?.sourceKey;
      if (!from) return null;
      const revision = randomUUID();
      const sourceKey = await objectStore.copySource({ fromKey: from, trackId: String(existing._id), revision });
      try {
        const track = await trackRepository.beginAttempt({ trackId: existing._id, ownerId, revision,
          sourceKey, originalFilename: existing.attempt?.originalFilename || existing.active.originalFilename,
          kind: existing.attempt?.kind === 'REPLACE' ? 'REPLACE' : 'RETRY' }, now());
        if (!track) { await cleanup([sourceKey]); return null; }
        scheduleProcessing(track);
        return statusOf(track);
      } catch (error) {
        try {
          const current = await trackRepository.findById(existing._id);
          if (current?.attempt?.revision !== revision) await cleanup([sourceKey]);
        } catch (lookupError) {
          warn({ event: 'track_retry_cleanup_check_failed', trackId: String(existing._id), revision,
            ...safeErrorDetails(lookupError) });
        }
        throw error;
      }
    },
    async deleteTrack({ publicId, ownerId }) {
      const track = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (track) return deleteTrack(track);
      return !await trackRepository.findByPublicId(publicId);
    },
    async deleteTracks({ publicIds, ownerId }) {
      const deletedIds = [];
      for (const publicId of publicIds) {
        const track = await trackRepository.findOwnedByPublicId(publicId, ownerId);
        if (track && await deleteTrack(track)) deletedIds.push(publicId);
      }
      return deletedIds;
    },
    async listMyTracks({ ownerId, query = '', cursor = '' }) {
      const tracks = await trackRepository.listOwned({ ownerId, query, before: decodeCursor(cursor, 'createdAt'), limit: PAGE_SIZE });
      const page = tracks.slice(0, PAGE_SIZE);
      const favorites = new Set((await savedTrackRepository.savedTrackIds({ userId: ownerId,
        trackIds: page.map((track) => track._id) })).map(String));
      return { items: page.map((track) => ({ ...card(track), isFavorite: favorites.has(String(track._id)) })),
        nextCursor: tracks.length > PAGE_SIZE ? cursorOf(page.at(-1), 'createdAt') : null };
    },
    async listSavedTracks({ userId, query = '', cursor = '' }) {
      const relations = await savedTrackRepository.list({ userId, query, before: decodeCursor(cursor, 'savedAt'), limit: PAGE_SIZE });
      const page = relations.slice(0, PAGE_SIZE);
      return { items: page.map((relation) => ({ ...card(relation.track), savedAt: relation.savedAt.toISOString(),
        author: relation.author?.displayName ? { displayName: relation.author.displayName,
          avatarUrl: relation.author.avatarUrl || null } : null })),
      nextCursor: relations.length > PAGE_SIZE ? cursorOf(page.at(-1), 'savedAt') : null };
    },
    async getSavedState({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      return track ? savedTrackRepository.isSaved({ userId, trackId: track._id }) : false;
    },
    async saveTrack({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return false;
      await savedTrackRepository.save({ userId, trackId: track._id }); return true;
    },
    async unsaveTrack({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return false;
      await savedTrackRepository.remove({ userId, trackId: track._id }); return true;
    },
    async unsaveTracks({ publicIds, userId }) {
      const found = await Promise.all(publicIds.map((publicId) => trackRepository.findByPublicId(publicId)));
      const ids = found.filter(Boolean).map((track) => track._id);
      const saved = new Set((await savedTrackRepository.savedTrackIds({ userId, trackIds: ids })).map(String));
      const selected = found.filter((track) => track && saved.has(String(track._id)));
      if (selected.length) await savedTrackRepository.removeMany({ userId, trackIds: selected.map((track) => track._id) });
      return selected.map((track) => track.publicId);
    },
  };
}
