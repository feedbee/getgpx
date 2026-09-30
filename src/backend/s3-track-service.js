import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { DEFAULT_USER_TIERS } from './configuration.js';
import { normalizeRouteType } from '../route-types.js';
import { TrackLimitReachedError, EXTERNAL_ANALYSIS_TIMEOUT_MS } from './track-contracts.js';
import { hasExpiredAttempt, trackObjectKeys } from './s3-track-repository.js';
import { PAGE_SIZE, cursorOf, decodeCursor, titleFromFilename, resultOf, statusOf, publicTrack, card, homepage } from './s3-track-presenters.js';
import { logger } from './logger.js';
import { safeErrorDetails } from './safe-error-details.js';
import { createS3TrackProcessor } from './s3-track-processor.js';
import { profileStep } from './request-profile.js';

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
  const scheduleProcessing = createS3TrackProcessor({ trackRepository, objectStore, enrichmentCacheRepository,
    analyzeSource, enrichAnalysis, cleanup, schedule, warn, enrichmentTimeoutMs, now });

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
    async getPublicTrack(publicId, profile, { includeGeometry = false } = {}) {
      const track = await findReadable(publicId);
      if (!track) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await userRepository.findPublicProfileById(track.ownerId) : null;
      const data = publicTrack(track, uploader);
      if (includeGeometry) {
        const key = resultOf(track)?.analysisKey;
        const detail = key
          ? await profileStep(profile, 'track.readAnalysis', () => objectStore.readAnalysis(key))
          : null;
        data.analysis = detail ? { ...detail.analysis, ...data.metrics, name: data.title } : null;
      } else {
        delete data.preview;
      }
      return data;
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
