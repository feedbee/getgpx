import { describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { createTrackRepository } from '../../../src/backend/track-repository.js';

function createTracksCollection() {
  const documents = [];
  const matches = (document, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some((condition) => matches(document, condition));
    if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
      if ('$ne' in value) return document[key] !== value.$ne;
      if ('$exists' in value) return (document[key] !== undefined) === value.$exists;
    }
    return document[key]?.toString() === value?.toString();
  });
  return {
    documents,
    createIndex: vi.fn().mockResolvedValue('index'),
    async insertOne(document) {
      document._id ??= new ObjectId();
      documents.push({ ...document });
      return { insertedId: document._id };
    },
    async findOne(query) {
      return documents.find((document) => matches(document, query)) || null;
    },
    async findOneAndUpdate(query, update) {
      const index = documents.findIndex((document) => matches(document, query));
      if (index < 0) return null;
      documents[index] = { ...documents[index], ...update.$set };
      return { ...documents[index] };
    },
    find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) }),
  };
}

describe('track repository', () => {
  it('creates indexes for owner ordering, owner name search and analysis status', async () => {
    const tracks = createTracksCollection();
    const repository = createTrackRepository(tracks);

    await repository.ensureIndexes();

    expect(tracks.createIndex).toHaveBeenCalledWith({ ownerId: 1, createdAt: -1 });
    expect(tracks.createIndex).toHaveBeenCalledWith({ ownerId: 1, normalizedName: 1, createdAt: -1 });
    expect(tracks.createIndex).toHaveBeenCalledWith({ analysisStatus: 1, updatedAt: 1 });
    expect(tracks.createIndex).toHaveBeenCalledWith({ sourceFileId: 1 }, { unique: true });
  });

  it('creates an owner-bound processing track with an immutable first revision', async () => {
    const repository = createTrackRepository(createTracksCollection());
    const ownerId = new ObjectId();
    const sourceFileId = new ObjectId();
    const now = new Date('2026-09-17T20:00:00.000Z');

    const track = await repository.createProcessing({
      ownerId,
      sourceFileId,
      originalFilename: 'Weekend Ride.gpx',
      title: 'Weekend Ride',
    }, now);

    expect(track).toMatchObject({
      schemaVersion: 1,
      ownerId,
      sourceFileId,
      originalFilename: 'Weekend Ride.gpx',
      title: 'Weekend Ride',
      normalizedName: 'weekend ride',
      analysisStatus: 'PROCESSING',
      analysisStep: 'QUEUED',
      analysisRevision: 1,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('counts all tracks owned by a user', async () => {
    const collection = createTracksCollection();
    collection.countDocuments = vi.fn().mockResolvedValue(17);
    const repository = createTrackRepository(collection);
    const ownerId = new ObjectId();

    await expect(repository.countOwned(ownerId)).resolves.toBe(17);
    expect(collection.countDocuments).toHaveBeenCalledWith({ ownerId });
  });

  it('only returns a track when both id and owner match', async () => {
    const collection = createTracksCollection();
    const repository = createTrackRepository(collection);
    const ownerId = new ObjectId();
    const otherOwnerId = new ObjectId();
    const track = await repository.createProcessing({
      ownerId,
      sourceFileId: new ObjectId(),
      originalFilename: 'ride.gpx',
      title: 'Ride',
    });

    await expect(repository.findOwnedById(track._id, ownerId)).resolves.toMatchObject({ _id: track._id });
    await expect(repository.findOwnedById(track._id, otherOwnerId)).resolves.toBeNull();
    await expect(repository.findById(track._id)).resolves.toMatchObject({ _id: track._id });
  });

  it('lists one extra owner track with escaped substring search and a stable cursor', async () => {
    const collection = createTracksCollection();
    const repository = createTrackRepository(collection);
    const ownerId = new ObjectId();
    const before = { createdAt: new Date('2026-09-17T10:00:00.000Z'), id: new ObjectId() };

    await repository.listOwned({ ownerId, query: '  Вечер.* ', before, limit: 24 });

    expect(collection.find).toHaveBeenCalledWith({ ownerId, normalizedName: { $regex: 'вечер\\.\\*' }, $or: [
      { createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before.id } },
    ] }, expect.objectContaining({ projection: expect.objectContaining({ title: 1, 'analysis.preview': 1 }) }));
    const cursor = collection.find.mock.results[0].value;
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(25);
  });

  it('does not let a stale processing revision overwrite a replacement', async () => {
    const repository = createTrackRepository(createTracksCollection());
    const ownerId = new ObjectId();
    const track = await repository.createProcessing({
      ownerId,
      sourceFileId: new ObjectId(),
      originalFilename: 'ride.gpx',
      title: 'Ride',
    });

    await expect(repository.completeAnalysis({
      trackId: track._id,
      ownerId,
      revision: 2,
      analysis: { distanceKm: 42 },
    })).resolves.toBeNull();

    await expect(repository.completeAnalysis({
      trackId: track._id,
      ownerId,
      revision: 1,
      analysis: { distanceKm: 42 },
    })).resolves.toMatchObject({ analysisStatus: 'READY', analysis: { distanceKm: 42 } });
  });

  it('records a retryable analysis failure without deleting the track', async () => {
    const repository = createTrackRepository(createTracksCollection());
    const ownerId = new ObjectId();
    const track = await repository.createProcessing({
      ownerId,
      sourceFileId: new ObjectId(),
      originalFilename: 'ride.gpx',
      title: 'Ride',
    });

    const failed = await repository.failAnalysis({
      trackId: track._id,
      ownerId,
      revision: 1,
      failedStep: 'ENRICHING',
      errorCode: 'ENRICHMENT_UNAVAILABLE',
    });

    expect(failed).toMatchObject({
      analysisStatus: 'FAILED',
      analysisStep: 'FAILED',
      analysisError: { code: 'ENRICHMENT_UNAVAILABLE', failedStep: 'ENRICHING' },
    });
  });

  it('persists parsing progress and restarts a failed enrichment without reparsing', async () => {
    const repository = createTrackRepository(createTracksCollection());
    const ownerId = new ObjectId();
    const track = await repository.createProcessing({
      ownerId,
      sourceFileId: new ObjectId(),
      originalFilename: 'ride.gpx',
      title: 'ride',
    });

    await repository.setAnalysisStep({ trackId: track._id, ownerId, revision: 1, step: 'PARSING' });
    const enriching = await repository.saveBaseAnalysis({
      trackId: track._id,
      ownerId,
      revision: 1,
      title: 'GPX title',
      analysis: { distanceKm: 42, points: [{}, {}] },
    });
    await repository.failAnalysis({
      trackId: track._id,
      ownerId,
      revision: 1,
      failedStep: 'ENRICHING',
      errorCode: 'ENRICHMENT_UNAVAILABLE',
    });
    const restarted = await repository.restartEnrichment({ trackId: track._id, ownerId });

    expect(enriching).toMatchObject({ title: 'GPX title', normalizedName: 'gpx title', analysisStep: 'ENRICHING' });
    expect(restarted).toMatchObject({
      analysisStatus: 'PROCESSING',
      analysisStep: 'ENRICHING',
      analysis: { distanceKm: 42 },
      analysisError: null,
    });
  });
});
