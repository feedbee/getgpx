import { ObjectId } from 'mongodb';
import { createPublicId } from './public-id.js';
import { normalizeTrackName } from './track-repository.js';
import { normalizeRouteType } from '../route-types.js';
import { createTrackSummary } from './track-summary.js';

const LEASE_MS = 120_000;

function compact(analysis, sourceKey, analysisKey, revision, originalFilename, analysisSources, completeness) {
  const summary = createTrackSummary(analysis, { analysisSources, completeness });
  return {
    revision, sourceKey, analysisKey, originalFilename,
    metrics: summary.metrics,
    summary,
    sourcePointCount: analysis.sourcePointCount ?? null,
    pointsOfInterestCount: analysis.pointsOfInterest?.length ?? 0,
    preview: analysis.preview ?? null,
    analysisSources,
    completeness,
    enrichmentSource: analysis.enrichmentSource ?? null,
  };
}

export function createS3TrackRepository(tracks, { generatePublicId = createPublicId } = {}) {
  if (!tracks) throw new Error('Tracks collection is required.');
  const attemptFilter = ({ trackId, ownerId, revision, workerId }) => ({
    _id: trackId, ownerId, 'attempt.revision': revision, 'attempt.workerId': workerId,
    'attempt.status': 'PROCESSING',
  });
  return {
    async ensureIndexes() {
      const existing = await tracks.indexes().catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
      if (existing.some((index) => index.name === 'sourceFileId_1')) await tracks.dropIndex('sourceFileId_1');
      await Promise.all([
        tracks.createIndex({ publicId: 1 }, { unique: true, partialFilterExpression: { publicId: { $type: 'string' } } }),
        tracks.createIndex({ ownerId: 1, createdAt: -1 }),
        tracks.createIndex({ ownerId: 1, normalizedName: 1, createdAt: -1 }),
        tracks.createIndex({ analysisStatus: 1, updatedAt: 1 }),
      ]);
    },
    async createProcessing({ trackId, ownerId, sourceKey, revision, originalFilename, title, routeType }, now = new Date()) {
      const document = {
        _id: trackId, schemaVersion: 3, ownerId, originalFilename, title,
        routeType: normalizeRouteType(routeType), normalizedName: normalizeTrackName(title),
        analysisStatus: 'PROCESSING', analysisStep: 'QUEUED',
        attempt: { revision, sourceKey, originalFilename, kind: 'INITIAL', status: 'PROCESSING',
          step: 'QUEUED', workerId: null, leaseUntil: new Date(now.getTime() + LEASE_MS), startedAt: now },
        createdAt: now, updatedAt: now,
      };
      for (;;) {
        document.publicId = generatePublicId();
        try { await tracks.insertOne(document); return document; } catch (error) {
          if (error?.code !== 11000 || !error.keyPattern?.publicId) throw error;
        }
      }
    },
    findByPublicId(publicId) { return tracks.findOne({ publicId }); },
    findOwnedByPublicId(publicId, ownerId) { return tracks.findOne({ publicId, ownerId }); },
    findById(trackId) { return tracks.findOne({ _id: trackId }); },
    countOwned(ownerId) { return tracks.countDocuments({ ownerId }); },
    async listHomepage(trackIds) {
      if (trackIds) {
        const found = await tracks.find({ _id: { $in: trackIds } }).toArray();
        const byId = new Map(found.map((track) => [String(track._id), track]));
        return trackIds.map((id) => byId.get(String(id))).filter(Boolean);
      }
      return tracks.find({}).sort({ createdAt: 1, _id: 1 }).limit(3).toArray();
    },
    listOwned({ ownerId, query = '', before = null, limit = 24 }) {
      const filter = { ownerId };
      if (query) filter.normalizedName = { $regex: normalizeTrackName(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      if (before) filter.$or = [
        { createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before.id } },
      ];
      return tracks.find(filter, { projection: { ownerId: 1, publicId: 1, title: 1, routeType: 1,
        createdAt: 1, externalLinks: 1, analysisStatus: 1, analysisStep: 1, active: 1, diagnostic: 1,
        'attempt.status': 1, 'attempt.step': 1 } }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    },
    claim({ trackId, ownerId, revision, workerId }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'attempt.revision': revision, 'attempt.status': 'PROCESSING',
          $or: [{ 'attempt.workerId': null }, { 'attempt.leaseUntil': { $lt: now } }] },
        { $set: { 'attempt.workerId': workerId, 'attempt.leaseUntil': new Date(now.getTime() + LEASE_MS),
          'attempt.step': 'PARSING', analysisStep: 'PARSING', updatedAt: now } },
        { returnDocument: 'after' },
      );
    },
    heartbeat(identity, now = new Date()) {
      return tracks.updateOne(attemptFilter(identity), { $set: {
        'attempt.leaseUntil': new Date(now.getTime() + LEASE_MS), updatedAt: now,
      } });
    },
    setStep(identity, step, now = new Date(), parsedTitle = null) {
      const fields = { 'attempt.step': step, analysisStep: step, updatedAt: now };
      if (parsedTitle) {
        fields.title = parsedTitle;
        fields.normalizedName = normalizeTrackName(parsedTitle);
      }
      return tracks.findOneAndUpdate(attemptFilter(identity),
        { $set: fields }, { returnDocument: 'after' });
    },
    async publish(identity, { analysis, analysisKey, title, analysisSources, completeness = 'FULL' }, now = new Date()) {
      const previous = await tracks.findOne(attemptFilter(identity));
      if (!previous) return null;
      const active = compact(analysis, previous.attempt.sourceKey, analysisKey,
        identity.revision, previous.attempt.originalFilename, analysisSources, completeness);
      if (previous.attempt.kind === 'RETRY' && previous.active) {
        active.metrics.effectiveSpeedKmh = previous.active.metrics.effectiveSpeedKmh;
        active.metrics.estimatedDurationMs = previous.active.metrics.estimatedDurationMs;
        active.summary.metrics.effectiveSpeedKmh = previous.active.metrics.effectiveSpeedKmh;
        active.summary.metrics.estimatedDurationMs = previous.active.metrics.estimatedDurationMs;
      }
      const effectiveTitle = previous.attempt.kind === 'RETRY' && previous.active ? previous.title : title;
      const result = await tracks.updateOne(attemptFilter(identity), {
        $set: { active, title: effectiveTitle, normalizedName: normalizeTrackName(effectiveTitle),
          originalFilename: active.originalFilename, analysisStatus: 'READY', analysisStep: 'COMPLETE',
          updatedAt: now },
        $unset: { attempt: '', diagnostic: '' },
      });
      return result.modifiedCount ? previous : null;
    },
    async fail(identity, { errorCode, failedStep, diagnostic = null }, now = new Date()) {
      const existing = await tracks.findOne(attemptFilter(identity));
      if (!existing) return null;
      const update = { $set: { 'attempt.status': 'FAILED', 'attempt.step': 'FAILED',
        'attempt.error': { code: errorCode, failedStep }, analysisStep: 'FAILED', updatedAt: now,
        analysisStatus: existing.active ? 'READY' : 'FAILED' } };
      if (diagnostic && !existing.active) update.$set.diagnostic = compact(diagnostic.analysis,
        existing.attempt.sourceKey, diagnostic.analysisKey, identity.revision,
        existing.attempt.originalFilename, diagnostic.analysisSources, 'PARTIAL');
      return tracks.findOneAndUpdate(attemptFilter(identity), update, { returnDocument: 'after' });
    },
    beginAttempt({ trackId, ownerId, revision, sourceKey, originalFilename, kind }, now = new Date()) {
      return tracks.findOneAndUpdate({ _id: trackId, ownerId,
        $or: [{ attempt: { $exists: false } }, { 'attempt.status': 'FAILED' }, { 'attempt.leaseUntil': { $lt: now } }] },
      [{ $set: { attempt: { revision, sourceKey, originalFilename, kind, status: 'PROCESSING',
        step: 'QUEUED', workerId: null, leaseUntil: new Date(now.getTime() + LEASE_MS), startedAt: now },
      analysisStatus: { $cond: [{ $ifNull: ['$active', false] }, 'READY', 'PROCESSING'] },
      analysisStep: 'QUEUED', updatedAt: now } }], { returnDocument: 'after' });
    },
    updateDetails({ trackId, ownerId, title, speedKmh, estimatedDurationMs, routeType, externalLinks }, now = new Date()) {
      return tracks.findOneAndUpdate({ _id: trackId, ownerId, active: { $exists: true },
        $or: [{ attempt: { $exists: false } }, { 'attempt.status': 'FAILED' }] },
      { $set: { title, normalizedName: normalizeTrackName(title), routeType: normalizeRouteType(routeType),
        externalLinks, 'active.metrics.effectiveSpeedKmh': speedKmh,
        'active.metrics.estimatedDurationMs': estimatedDurationMs,
        'active.summary.metrics.effectiveSpeedKmh': speedKmh,
        'active.summary.metrics.estimatedDurationMs': estimatedDurationMs, updatedAt: now } },
      { returnDocument: 'after' });
    },
    deleteOwned(trackId, ownerId) { return tracks.findOneAndDelete({ _id: trackId, ownerId }); },
  };
}

export function trackObjectKeys(track) {
  return [...new Set([track.active?.sourceKey, track.active?.analysisKey,
    track.attempt?.sourceKey, track.attempt?.analysisKey,
    track.diagnostic?.sourceKey, track.diagnostic?.analysisKey].filter(Boolean))];
}

export function hasExpiredAttempt(track, now = new Date()) {
  return track.attempt?.status === 'PROCESSING' && new Date(track.attempt.leaseUntil) < now;
}

export function asMongoObjectId(id) { return ObjectId.createFromHexString(id); }
