export const TRACK_SCHEMA_VERSION = 1;
export const TRACK_UPLOAD_LIMITS = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  maxPoints: 500_000,
});

export const TRACK_ANALYSIS_STATUS = Object.freeze({
  processing: 'PROCESSING',
  ready: 'READY',
  failed: 'FAILED',
});

export function normalizeTrackName(name) {
  return name.normalize('NFKC').trim().toLocaleLowerCase('ru-RU');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createTrackRepository(tracks) {
  if (!tracks) throw new Error('A tracks collection is required.');

  return {
    async ensureIndexes() {
      await Promise.all([
        tracks.createIndex({ ownerId: 1, createdAt: -1 }),
        tracks.createIndex({ ownerId: 1, normalizedName: 1, createdAt: -1 }),
        tracks.createIndex({ analysisStatus: 1, updatedAt: 1 }),
        tracks.createIndex({ sourceFileId: 1 }, { unique: true }),
      ]);
    },

    async createProcessing({ ownerId, sourceFileId, originalFilename, title }, now = new Date()) {
      const track = {
        schemaVersion: TRACK_SCHEMA_VERSION,
        ownerId,
        sourceFileId,
        originalFilename,
        title,
        normalizedName: normalizeTrackName(title),
        analysisStatus: TRACK_ANALYSIS_STATUS.processing,
        analysisStep: 'QUEUED',
        analysisRevision: 1,
        analysis: null,
        analysisError: null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await tracks.insertOne(track);
      return { ...track, _id: result.insertedId };
    },

    findOwnedById(trackId, ownerId) {
      return tracks.findOne({ _id: trackId, ownerId });
    },

    findById(trackId) {
      return tracks.findOne({ _id: trackId });
    },

    async listOwned({ ownerId, query = '', before = null, limit = 24 }) {
      const filter = { ownerId };
      const normalizedQuery = normalizeTrackName(query);
      if (normalizedQuery) filter.normalizedName = { $regex: escapeRegex(normalizedQuery) };
      if (before) {
        filter.$or = [
          { createdAt: { $lt: before.createdAt } },
          { createdAt: before.createdAt, _id: { $lt: before.id } },
        ];
      }
      return tracks.find(filter, {
        projection: {
          title: 1, createdAt: 1, analysisStatus: 1, analysisStep: 1,
          'analysis.distanceKm': 1, 'analysis.ascentM': 1,
          'analysis.estimatedDurationMs': 1, 'analysis.preview': 1,
        },
      }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    },

    setAnalysisStep({ trackId, ownerId, revision, step }, now = new Date()) {
      return tracks.findOneAndUpdate(
        {
          _id: trackId,
          ownerId,
          analysisRevision: revision,
          analysisStatus: TRACK_ANALYSIS_STATUS.processing,
        },
        { $set: { analysisStep: step, updatedAt: now } },
        { returnDocument: 'after' },
      );
    },

    saveBaseAnalysis({ trackId, ownerId, revision, title, analysis }, now = new Date()) {
      return tracks.findOneAndUpdate(
        {
          _id: trackId,
          ownerId,
          analysisRevision: revision,
          analysisStatus: TRACK_ANALYSIS_STATUS.processing,
          analysisStep: 'PARSING',
        },
        {
          $set: {
            title,
            normalizedName: normalizeTrackName(title),
            analysis,
            analysisStep: 'ENRICHING',
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
    },

    completeAnalysis({ trackId, ownerId, revision, analysis }, now = new Date()) {
      return tracks.findOneAndUpdate(
        {
          _id: trackId,
          ownerId,
          analysisRevision: revision,
          analysisStatus: TRACK_ANALYSIS_STATUS.processing,
        },
        {
          $set: {
            analysisStatus: TRACK_ANALYSIS_STATUS.ready,
            analysisStep: 'COMPLETE',
            analysis,
            analysisError: null,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
    },

    failAnalysis({ trackId, ownerId, revision, failedStep, errorCode }, now = new Date()) {
      return tracks.findOneAndUpdate(
        {
          _id: trackId,
          ownerId,
          analysisRevision: revision,
          analysisStatus: TRACK_ANALYSIS_STATUS.processing,
        },
        {
          $set: {
            analysisStatus: TRACK_ANALYSIS_STATUS.failed,
            analysisStep: 'FAILED',
            analysisError: { code: errorCode, failedStep },
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
    },

    restartEnrichment({ trackId, ownerId }, now = new Date()) {
      return tracks.findOneAndUpdate(
        {
          _id: trackId,
          ownerId,
          analysis: { $ne: null },
          $or: [
            { analysisStatus: TRACK_ANALYSIS_STATUS.failed },
            { analysisStatus: TRACK_ANALYSIS_STATUS.ready, 'analysis.enrichmentSource': 'VALHALLA' },
          ],
        },
        {
          $set: {
            analysisStatus: TRACK_ANALYSIS_STATUS.processing,
            analysisStep: 'ENRICHING',
            analysisError: null,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
    },

    updateDetails({ trackId, ownerId, title, speedKmh, estimatedDurationMs }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId },
        {
          $set: {
            title,
            normalizedName: normalizeTrackName(title),
            'analysis.effectiveSpeedKmh': speedKmh,
            'analysis.estimatedDurationMs': estimatedDurationMs,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
    },

    beginReplacement({ trackId, ownerId, sourceFileId, originalFilename }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, $or: [{ replacement: { $exists: false } }, { 'replacement.status': TRACK_ANALYSIS_STATUS.failed }] },
        [{ $set: {
          replacement: {
            sourceFileId,
            originalFilename,
            revision: { $add: ['$analysisRevision', 1] },
            status: TRACK_ANALYSIS_STATUS.processing,
            step: 'QUEUED',
            analysis: null,
            error: null,
          },
          updatedAt: now,
        } }],
        { returnDocument: 'after' },
      );
    },

    setReplacementStep({ trackId, ownerId, revision, step }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'replacement.revision': revision, 'replacement.status': TRACK_ANALYSIS_STATUS.processing },
        { $set: { 'replacement.step': step, updatedAt: now } },
        { returnDocument: 'after' },
      );
    },

    saveReplacementBase({ trackId, ownerId, revision, title, analysis }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'replacement.revision': revision, 'replacement.status': TRACK_ANALYSIS_STATUS.processing, 'replacement.step': 'PARSING' },
        { $set: { 'replacement.title': title, 'replacement.analysis': analysis, 'replacement.step': 'ENRICHING', updatedAt: now } },
        { returnDocument: 'after' },
      );
    },

    completeReplacement({ trackId, ownerId, revision, title, normalizedName, analysis }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'replacement.revision': revision, 'replacement.status': TRACK_ANALYSIS_STATUS.processing },
        [{ $set: {
          sourceFileId: '$replacement.sourceFileId',
          originalFilename: '$replacement.originalFilename',
          title,
          normalizedName,
          analysisRevision: '$replacement.revision',
          analysisStatus: TRACK_ANALYSIS_STATUS.ready,
          analysisStep: 'COMPLETE',
          analysis,
          analysisError: null,
          updatedAt: now,
        } }, { $unset: 'replacement' }],
        { returnDocument: 'before' },
      );
    },

    failReplacement({ trackId, ownerId, revision, failedStep, errorCode }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'replacement.revision': revision, 'replacement.status': TRACK_ANALYSIS_STATUS.processing },
        { $set: {
          'replacement.status': TRACK_ANALYSIS_STATUS.failed,
          'replacement.step': 'FAILED',
          'replacement.error': { code: errorCode, failedStep },
          updatedAt: now,
        } },
        { returnDocument: 'after' },
      );
    },

    restartReplacementEnrichment({ trackId, ownerId }, now = new Date()) {
      return tracks.findOneAndUpdate(
        { _id: trackId, ownerId, 'replacement.status': TRACK_ANALYSIS_STATUS.failed, 'replacement.analysis': { $ne: null } },
        { $set: { 'replacement.status': TRACK_ANALYSIS_STATUS.processing, 'replacement.step': 'ENRICHING', 'replacement.error': null, updatedAt: now } },
        { returnDocument: 'after' },
      );
    },

    deleteOwned(trackId, ownerId) {
      return tracks.findOneAndDelete({ _id: trackId, ownerId });
    },
  };
}
