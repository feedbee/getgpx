import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createSavedTrackRepository } from '../../../src/backend/saved-track-repository.js';

describe('saved track repository', () => {
  it('creates uniqueness and newest-first indexes', async () => {
    const collection = { createIndex: vi.fn().mockResolvedValue('index') };
    const repository = createSavedTrackRepository(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1, trackId: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1, savedAt: -1, _id: -1 });
  });

  it('saves idempotently and removes only the current user relation', async () => {
    const collection = {
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const repository = createSavedTrackRepository(collection);
    const userId = new ObjectId();
    const trackId = new ObjectId();
    const savedAt = new Date('2026-09-22T10:00:00Z');

    await repository.save({ userId, trackId }, savedAt);
    await repository.remove({ userId, trackId });
    await repository.removeForTrack(trackId);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { userId, trackId },
      { $setOnInsert: { userId, trackId, savedAt } },
      { upsert: true },
    );
    expect(collection.deleteOne).toHaveBeenCalledWith({ userId, trackId });
    expect(collection.deleteMany).toHaveBeenCalledWith({ trackId });
  });
});
