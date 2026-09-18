import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';
import { createTrackPersistence } from '../../src/backend/track-persistence.js';
import { createTrackRepository } from '../../src/backend/track-repository.js';
import { createUserRepository } from '../../src/backend/user-repository.js';

const uri = process.env.MONGODB_URI;
const describeWithMongo = uri ? describe : describe.skip;

describeWithMongo('MongoDB integration', () => {
  let database;

  beforeAll(() => {
    database = createDatabase({ uri, databaseName: process.env.MONGODB_DATABASE || 'track_hub_test' });
    return database.connect();
  });
  afterAll(() => database?.close());

  it('connects to MongoDB and responds to ping', async () => {
    await expect(database.ping()).resolves.toBe(true);
  });

  it('persists user registration and later login timestamps', async () => {
    const users = await database.collection('users');
    await users.deleteMany({ googleSubject: 'integration-google-user' });
    const repository = createUserRepository(users);
    await repository.ensureIndexes();
    const registeredAt = new Date('2026-09-17T10:00:00.000Z');
    const lastLoginAt = new Date('2026-09-18T10:00:00.000Z');
    const profile = { googleSubject: 'integration-google-user', email: 'integration@example.com', displayName: 'Integration Rider', avatarUrl: null };

    await repository.loginWithGoogle(profile, registeredAt);
    const user = await repository.loginWithGoogle(profile, lastLoginAt);

    expect(user.registeredAt).toEqual(registeredAt);
    expect(user.lastLoginAt).toEqual(lastLoginAt);
    expect(user.profileUpdatedAt).toEqual(registeredAt);
    await users.deleteOne({ googleSubject: 'integration-google-user' });
  });

  it('uses MongoDB GridFS for GPX source files and creates track indexes', async () => {
    const { gpxFileStore } = await createTrackPersistence(database);
    const tracks = await database.collection('tracks');
    const enrichmentCache = await database.collection('enrichmentCache');
    const ownerId = 'integration-gridfs-owner';
    const filename = 'integration-route.gpx';
    const fileId = await gpxFileStore.save({
      filename,
      ownerId,
      source: Readable.from('<gpx version="1.1"></gpx>'),
    });
    const chunks = [];
    for await (const chunk of gpxFileStore.openDownload(fileId)) chunks.push(chunk);
    const indexes = await tracks.indexes();
    const cacheIndexes = await enrichmentCache.indexes();

    expect(Buffer.concat(chunks).toString()).toBe('<gpx version="1.1"></gpx>');
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { ownerId: 1, createdAt: -1 } }),
      expect.objectContaining({ key: { sourceFileId: 1 }, unique: true }),
    ]));
    expect(cacheIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { key: 1 }, unique: true }),
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));

    await gpxFileStore.delete(fileId);
  });

  it('lists only owner tracks newest first with substring search and cursor paging', async () => {
    const tracks = await database.collection('tracks');
    const repository = createTrackRepository(tracks);
    const ownerId = 'integration-list-owner';
    const otherOwnerId = 'integration-list-other';
    await tracks.deleteMany({ ownerId: { $in: [ownerId, otherOwnerId] } });
    const documents = [
      { ownerId, title: 'Morning gravel', normalizedName: 'morning gravel', createdAt: new Date('2026-09-17T08:00:00Z') },
      { ownerId, title: 'Evening GRAVEL loop', normalizedName: 'evening gravel loop', createdAt: new Date('2026-09-17T18:00:00Z') },
      { ownerId, title: 'Road ride', normalizedName: 'road ride', createdAt: new Date('2026-09-17T12:00:00Z') },
      { ownerId: otherOwnerId, title: 'Private gravel', normalizedName: 'private gravel', createdAt: new Date('2026-09-18T12:00:00Z') },
    ].map((document, index) => ({ ...document, sourceFileId: `integration-list-file-${index}`, analysisStatus: 'READY', analysisStep: 'COMPLETE', analysis: null }));
    await tracks.insertMany(documents);

    const firstPage = await repository.listOwned({ ownerId, query: 'GRAVEL', limit: 1 });
    const secondPage = await repository.listOwned({
      ownerId,
      query: 'gravel',
      before: { createdAt: firstPage[0].createdAt, id: firstPage[0]._id },
      limit: 1,
    });

    expect(firstPage.map(({ title }) => title)).toEqual(['Evening GRAVEL loop', 'Morning gravel']);
    expect(secondPage.map(({ title }) => title)).toEqual(['Morning gravel']);
    await tracks.deleteMany({ ownerId: { $in: [ownerId, otherOwnerId] } });
  });

  it('keeps the published track intact until a replacement commits atomically', async () => {
    const tracks = await database.collection('tracks');
    const repository = createTrackRepository(tracks);
    const ownerId = 'integration-replacement-owner';
    await tracks.deleteMany({ ownerId });
    const original = await repository.createProcessing({
      ownerId, sourceFileId: 'integration-original-file', originalFilename: 'old.gpx', title: 'Old route',
    });
    await tracks.updateOne({ _id: original._id }, { $set: {
      analysisStatus: 'READY', analysisStep: 'COMPLETE', analysis: { distanceKm: 10, effectiveSpeedKmh: 20 },
    } });

    const replacing = await repository.beginReplacement({
      trackId: original._id, ownerId, sourceFileId: 'integration-new-file', originalFilename: 'new.gpx',
    });
    await repository.setReplacementStep({ trackId: original._id, ownerId, revision: 2, step: 'PARSING' });
    await repository.saveReplacementBase({
      trackId: original._id, ownerId, revision: 2, title: 'New route', analysis: { distanceKm: 20, effectiveSpeedKmh: 20 },
    });
    const beforeCommit = await repository.findById(original._id);
    const previous = await repository.completeReplacement({
      trackId: original._id, ownerId, revision: 2, title: 'New route', normalizedName: 'new route',
      analysis: { distanceKm: 20, effectiveSpeedKmh: 20, surfaces: [] },
    });
    const committed = await repository.findById(original._id);

    expect(replacing.replacement).toMatchObject({ revision: 2, sourceFileId: 'integration-new-file', status: 'PROCESSING' });
    expect(beforeCommit).toMatchObject({ sourceFileId: 'integration-original-file', title: 'Old route', analysis: { distanceKm: 10 } });
    expect(previous.sourceFileId).toBe('integration-original-file');
    expect(committed).toMatchObject({ sourceFileId: 'integration-new-file', title: 'New route', analysisRevision: 2, analysis: { distanceKm: 20 } });
    expect(committed).not.toHaveProperty('replacement');
    await tracks.deleteOne({ _id: original._id });
  });

  it('resumes a ready Valhalla-only track from external enrichment', async () => {
    const tracks = await database.collection('tracks');
    const repository = createTrackRepository(tracks);
    const ownerId = 'integration-partial-owner';
    await tracks.deleteMany({ ownerId });
    const track = await repository.createProcessing({
      ownerId, sourceFileId: 'integration-partial-file', originalFilename: 'partial.gpx', title: 'Partial route',
    });
    await tracks.updateOne({ _id: track._id }, { $set: {
      analysisStatus: 'READY', analysisStep: 'COMPLETE', analysis: { enrichmentSource: 'VALHALLA', points: [{}, {}] },
    } });

    const restarted = await repository.restartEnrichment({ trackId: track._id, ownerId });

    expect(restarted).toMatchObject({ analysisStatus: 'PROCESSING', analysisStep: 'ENRICHING', analysis: { enrichmentSource: 'VALHALLA' } });
    await tracks.deleteOne({ _id: track._id });
  });
});
