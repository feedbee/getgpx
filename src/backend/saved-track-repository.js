import { TRACK_CARD_PROJECTION } from './s3-track-repository.js';
import { normalizeTrackName } from './track-contracts.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createSavedTrackRepository(savedTracks, tracks = null, users = null) {
  if (!savedTracks) throw new Error('A saved tracks collection is required.');

  return {
    async ensureIndexes() {
      await Promise.all([
        savedTracks.createIndex({ userId: 1, trackId: 1 }, { unique: true }),
        savedTracks.createIndex({ userId: 1, savedAt: -1, _id: -1 }),
      ]);
    },

    save({ userId, trackId }, savedAt = new Date()) {
      return savedTracks.updateOne(
        { userId, trackId },
        { $setOnInsert: { userId, trackId, savedAt } },
        { upsert: true },
      );
    },

    remove({ userId, trackId }) {
      return savedTracks.deleteOne({ userId, trackId });
    },

    removeForTrack(trackId) {
      return savedTracks.deleteMany({ trackId });
    },

    removeMany({ userId, trackIds }) {
      return savedTracks.deleteMany({ userId, trackId: { $in: trackIds } });
    },

    async savedTrackIds({ userId, trackIds }) {
      if (!trackIds.length) return [];
      const relations = await savedTracks.find({ userId, trackId: { $in: trackIds } }, { projection: { trackId: 1 } }).toArray();
      return relations.map((relation) => relation.trackId);
    },

    async isSaved({ userId, trackId }) {
      return Boolean(await savedTracks.findOne({ userId, trackId }, { projection: { _id: 1 } }));
    },

    async list({ userId, query = '', before = null, limit = 24 }) {
      if (!tracks || !users) throw new Error('Track and user collections are required for listing saved tracks.');
      const relationFilter = { userId };
      if (before) relationFilter.$or = [
        { savedAt: { $lt: before.savedAt } },
        { savedAt: before.savedAt, _id: { $lt: before.id } },
      ];
      const normalizedQuery = normalizeTrackName(query);
      const pipeline = [
        { $match: relationFilter },
        { $sort: { savedAt: -1, _id: -1 } },
        { $lookup: { from: tracks.collectionName, localField: 'trackId', foreignField: '_id', as: 'track' } },
        { $unwind: '$track' },
      ];
      if (normalizedQuery) pipeline.push({ $match: { 'track.normalizedName': { $regex: escapeRegex(normalizedQuery) } } });
      pipeline.push(
        { $lookup: { from: users.collectionName, localField: 'track.ownerId', foreignField: '_id', as: 'author' } },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
        { $limit: limit + 1 },
        { $project: {
          savedAt: 1,
          ...Object.fromEntries(Object.keys(TRACK_CARD_PROJECTION).map((key) => [`track.${key}`, 1])),
          author: { displayName: 1, avatarUrl: 1 },
        } },
      );
      return savedTracks.aggregate(pipeline).toArray();
    },
  };
}
