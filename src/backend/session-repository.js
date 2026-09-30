import { createHash } from 'node:crypto';

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionRepository(sessions, users) {
  if (!sessions || !users) throw new Error('Session and user collections are required.');

  return {
    async ensureIndexes() {
      await sessions.createIndex({ tokenHash: 1 }, { unique: true });
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    },

    async create(token, userId, expiresAt) {
      await sessions.insertOne({ tokenHash: hashToken(token), userId, createdAt: new Date(), expiresAt });
    },

    async findUserByToken(token, now = new Date()) {
      if (!token) return null;
      const session = await sessions.findOneAndUpdate(
        { tokenHash: hashToken(token), expiresAt: { $gt: now } },
        { $set: { expiresAt: new Date(now.getTime() + SESSION_DURATION_MS) } },
        { returnDocument: 'after' },
      );
      return session ? users.findOne({ _id: session.userId }) : null;
    },

    async deleteByToken(token) {
      if (token) await sessions.deleteOne({ tokenHash: hashToken(token) });
    },
  };
}
