import { createPublicId } from './public-id.js';
import { normalizeTrackName } from './track-contracts.js';
import { normalizeRouteType } from '../route-types.js';
import { trackData } from './track-data.js';

const LEASE_MS = 120_000;
const terminalProcessing = (status) => ({ status, step: null, error: null });

function resultExpression(analysis, analysisKey, sources, completeness, kind) {
  // User strings and nested GPX values must never become aggregation expressions.
  return { $mergeObjects: [{ $literal: { kind, analysisKey, ...trackData(analysis),
    sourcePointCount: analysis.sourcePointCount ?? null, preview: analysis.preview ?? null,
    sources, completeness } }, { revision: '$processing.revision', sourceKey: '$processing.sourceKey',
    originalFilename: '$processing.originalFilename' }] };
}

// Cards need no terrain, POI or distribution collections from MongoDB.
export const TRACK_CARD_PROJECTION = Object.freeze({ _id: 1, ownerId: 1, publicId: 1, title: 1,
  routeType: 1, createdAt: 1, externalLinks: 1, speedKmh: 1,
  'result.metrics': 1, 'result.preview': 1, 'result.sources': 1, 'result.sourceKey': 1,
  'processing.status': 1, 'processing.step': 1, 'processing.error': 1,
  'processing.leaseUntil': 1, 'processing.sourceKey': 1 });

export function hasPublishedResult(track) { return track.result?.kind === 'PUBLISHED'; }

export function createS3TrackRepository(tracks, { generatePublicId = createPublicId } = {}) {
  if (!tracks) throw new Error('Tracks collection is required.');
  const processingFilter = ({ trackId, ownerId, revision, workerId }) => ({
    _id: trackId, ownerId, 'processing.revision': revision, 'processing.workerId': workerId,
    'processing.status': 'PROCESSING',
  });
  return {
    async ensureIndexes() {
      await Promise.all([
        tracks.createIndex({ publicId: 1 }, { unique: true }),
        tracks.createIndex({ ownerId: 1, createdAt: -1 }),
        tracks.createIndex({ ownerId: 1, normalizedName: 1, createdAt: -1 }),
        tracks.createIndex({ 'processing.status': 1, updatedAt: 1 }),
      ]);
    },
    async createProcessing({ trackId, ownerId, sourceKey, revision, originalFilename, title, routeType }, now = new Date()) {
      const document = {
        _id: trackId, schemaVersion: 5, ownerId, title, titleEdited: false,
        speedKmh: null, externalLinks: {}, result: null,
        routeType: normalizeRouteType(routeType), normalizedName: normalizeTrackName(title),
        processing: { ...terminalProcessing('PROCESSING'), revision, sourceKey, originalFilename,
          step: 'QUEUED', workerId: null,
          leaseUntil: new Date(now.getTime() + LEASE_MS), startedAt: now },
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
      return tracks.find(filter, { projection: TRACK_CARD_PROJECTION })
        .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    },
    claim({ trackId, ownerId, revision, workerId }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'processing.revision': revision, 'processing.status': 'PROCESSING',
          $or: [{ 'processing.workerId': null }, { 'processing.leaseUntil': { $lt: now } }] },
        { $set: { 'processing.workerId': workerId, 'processing.leaseUntil': new Date(now.getTime() + LEASE_MS),
          'processing.step': 'PARSING', updatedAt: now } }, { returnDocument: 'after' },
      );
    },
    heartbeat(identity, now = new Date()) {
      return tracks.updateOne(processingFilter(identity), { $set: {
        'processing.leaseUntil': new Date(now.getTime() + LEASE_MS), updatedAt: now,
      } });
    },
    setStep(identity, step, now = new Date(), parsedTitle = null) {
      const fields = { 'processing.step': step, updatedAt: now };
      if (parsedTitle) {
        return tracks.findOneAndUpdate(processingFilter(identity), [{ $set: {
          ...fields, title: { $cond: ['$titleEdited', '$title', { $literal: parsedTitle }] },
          normalizedName: { $cond: ['$titleEdited', '$normalizedName', { $literal: normalizeTrackName(parsedTitle) }] },
        } }], { returnDocument: 'after' });
      }
      return tracks.findOneAndUpdate(processingFilter(identity), { $set: fields }, { returnDocument: 'after' });
    },
    publish(identity, { analysis, analysisKey, title, analysisSources, completeness = 'FULL' }, now = new Date()) {
      const retainTitle = { $or: ['$titleEdited', { $eq: ['$result.kind', 'PUBLISHED'] }] };
      return tracks.findOneAndUpdate(processingFilter(identity), [{ $set: {
        result: resultExpression(analysis, analysisKey, analysisSources, completeness, 'PUBLISHED'),
        title: { $cond: [retainTitle, '$title', { $literal: title }] },
        normalizedName: { $cond: [retainTitle, '$normalizedName', { $literal: normalizeTrackName(title) }] },
        processing: { $literal: terminalProcessing('READY') }, updatedAt: now,
      } }], { returnDocument: 'before' });
    },
    fail(identity, { errorCode, failedStep, diagnostic = null }, now = new Date()) {
      const fields = { 'processing.status': 'FAILED', 'processing.step': null,
        'processing.error': { code: errorCode, failedStep }, updatedAt: now };
      if (diagnostic) fields.result = { $cond: [{ $eq: ['$result.kind', 'PUBLISHED'] }, '$result',
        resultExpression(diagnostic.analysis, diagnostic.analysisKey, diagnostic.analysisSources, 'PARTIAL', 'DIAGNOSTIC')] };
      return tracks.findOneAndUpdate(processingFilter(identity), [
        { $set: fields }, { $unset: ['processing.workerId', 'processing.leaseUntil'] },
      ], { returnDocument: 'after' });
    },
    beginAttempt({ trackId, ownerId, revision, sourceKey, originalFilename }, now = new Date()) {
      return tracks.findOneAndUpdate({ _id: trackId, ownerId,
        $or: [{ 'processing.status': { $ne: 'PROCESSING' } }, { 'processing.leaseUntil': { $lt: now } }] },
      [{ $set: { processing: { $literal: { ...terminalProcessing('PROCESSING'), revision, sourceKey, originalFilename,
        step: 'QUEUED', workerId: null, leaseUntil: new Date(now.getTime() + LEASE_MS), startedAt: now } },
      // Preserve the displayed speed when a published route is reprocessed.
      speedKmh: { $cond: [{ $eq: ['$result.kind', 'PUBLISHED'] },
        { $ifNull: ['$speedKmh', '$result.metrics.speedKmh'] }, '$speedKmh'] }, updatedAt: now } }],
      { returnDocument: 'after' });
    },
    updateDetails({ trackId, ownerId, title, speedKmh, routeType, externalLinks }, now = new Date()) {
      const fields = { updatedAt: now };
      if (title !== undefined) Object.assign(fields, { title, normalizedName: normalizeTrackName(title), titleEdited: true });
      if (speedKmh !== undefined) fields.speedKmh = speedKmh;
      if (routeType !== undefined) fields.routeType = normalizeRouteType(routeType);
      if (externalLinks !== undefined) fields.externalLinks = externalLinks;
      return tracks.findOneAndUpdate({ _id: trackId, ownerId, $or: [
        { 'result.kind': 'PUBLISHED', 'processing.status': { $ne: 'PROCESSING' } },
        { 'result.kind': { $ne: 'PUBLISHED' }, 'processing.status': 'PROCESSING' },
      ] }, { $set: fields }, { returnDocument: 'after' });
    },
    deleteOwned(trackId, ownerId) { return tracks.findOneAndDelete({ _id: trackId, ownerId }); },
  };
}

export function trackObjectKeys(track) {
  return [...new Set([track.result?.sourceKey, track.result?.analysisKey,
    track.processing?.sourceKey].filter(Boolean))];
}

export function hasExpiredProcessing(track, now = new Date()) {
  return track.processing?.status === 'PROCESSING' && new Date(track.processing.leaseUntil) < now;
}
