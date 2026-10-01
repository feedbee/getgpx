import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';
import { loadConfiguration, loadHomepageTrackIds } from '../../src/backend/configuration.js';
import { createS3TrackPersistence } from '../../src/backend/s3-track-persistence.js';
import { createS3TrackRepository } from '../../src/backend/s3-track-repository.js';
import { createUserRepository } from '../../src/backend/user-repository.js';
import { createSavedTrackRepository } from '../../src/backend/saved-track-repository.js';
import { createSessionRepository } from '../../src/backend/session-repository.js';

const uri = process.env.MONGODB_URI;
const describeWithMongo = uri ? describe : describe.skip;

describeWithMongo('MongoDB integration', () => {
  let database;

  beforeAll(() => {
    database = createDatabase({ uri });
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
    expect(user.tier).toBe('BASIC');
    await users.deleteOne({ googleSubject: 'integration-google-user' });
  });

  it('renews only a session that has not expired', async () => {
    const sessions = await database.collection('sessions');
    const users = await database.collection('users');
    const repository = createSessionRepository(sessions, users);
    const userId = new ObjectId();
    const token = `integration-session-${userId}`;
    const initialExpiry = new Date('2030-01-02T12:00:00.000Z');
    const lastRequest = new Date('2030-01-02T11:00:00.000Z');
    await repository.ensureIndexes();
    await users.insertOne({ _id: userId, googleSubject: `session-${userId}`, email: `${userId}@example.com` });
    try {
      await repository.create(token, userId, initialExpiry);
      await expect(repository.findUserByToken(token, lastRequest)).resolves.toMatchObject({ _id: userId });
      const renewed = await sessions.findOne({ userId });
      expect(renewed.expiresAt).toEqual(new Date('2030-02-01T11:00:00.000Z'));
      await expect(repository.findUserByToken(token, new Date('2030-02-01T11:00:00.000Z'))).resolves.toBeNull();
    } finally {
      await repository.deleteByToken(token);
      await users.deleteOne({ _id: userId });
    }
  });

  it('initializes and loads user tier limits from application configuration', async () => {
    const configurationCollection = await database.collection('configuration');
    await configurationCollection.deleteOne({ key: 'userTiers' });

    const configuration = await loadConfiguration(database);

    expect(configuration.userTiers).toEqual({
      BASIC: { limits: { tracks: 100 } },
      PREMIUM: { limits: { tracks: 1000 } },
    });
    await expect(configurationCollection.findOne({ key: 'userTiers' })).resolves.toMatchObject({
      key: 'userTiers',
      value: configuration.userTiers,
    });
  });

  it('rereads homepage ids and observes removal without restarting', async () => {
    const collection = await database.collection('configuration');
    const ids = ['6ab02471fb28fc3ae79e4d23', '6ab0249bfb28fc3ae79e4d26', '6aafc485fb28fc3ae79e4d17'];
    try {
      await collection.updateOne({ key: 'homepageTrackIds' }, { $set: { value: ids } }, { upsert: true });
      await expect(loadHomepageTrackIds(database)).resolves.toEqual(ids);
      await collection.deleteOne({ key: 'homepageTrackIds' });
      await expect(loadHomepageTrackIds(database)).resolves.toBeNull();
    } finally {
      await collection.deleteOne({ key: 'homepageTrackIds' });
    }
  });

  it('creates the S3 track, cache and favorites indexes', async () => {
    await createS3TrackPersistence(database, { region: 'eu-central-1', bucket: 'test-only', prefix: 'dev' }, { s3: {} });
    const tracks = await database.collection('tracks');
    const cache = await database.collection('enrichmentCache');
    const saved = await database.collection('savedTracks');
    expect(await tracks.indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { publicId: 1 }, unique: true }),
      expect.objectContaining({ key: { 'processing.status': 1, updatedAt: 1 } }),
    ]));
    expect(await cache.indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
    expect(await saved.indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { userId: 1, trackId: 1 }, unique: true }),
    ]));
  });

  it('stores one saved relation and lists it with the track author', async () => {
    const savedTracks = await database.collection('savedTracks');
    const tracks = await database.collection('tracks');
    const users = await database.collection('users');
    const repository = createSavedTrackRepository(savedTracks, tracks, users);
    const userId = new ObjectId();
    const authorId = new ObjectId();
    const trackId = new ObjectId();
    await savedTracks.deleteMany({ userId });
    await users.insertOne({ _id: authorId, displayName: 'Мария', googleSubject: `saved-author-${authorId}`, email: `${authorId}@example.com` });
    await tracks.insertOne({ _id: trackId, ownerId: authorId, publicId: 'SavedTrack_1234567890A', title: 'Лесной круг', normalizedName: 'лесной круг', routeType: 'gravel-cycling', createdAt: new Date(), processing: { status: 'READY', step: null, error: null } });

    await repository.save({ userId, trackId }, new Date('2026-09-22T10:00:00Z'));
    await repository.save({ userId, trackId }, new Date('2026-09-22T11:00:00Z'));
    const result = await repository.list({ userId, query: 'ЛЕС', limit: 24 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ track: { title: 'Лесной круг' }, author: { displayName: 'Мария' } });
    expect(await repository.savedTrackIds({ userId, trackIds: [trackId] })).toEqual([trackId]);
    await repository.removeMany({ userId, trackIds: [trackId] });
    expect(await repository.isSaved({ userId, trackId })).toBe(false);
    await savedTracks.deleteMany({ userId });
    await tracks.deleteOne({ _id: trackId });
    await users.deleteOne({ _id: authorId });
  });

  it('lists only owner tracks newest first with substring search and cursor paging', async () => {
    const tracks = await database.collection('tracks');
    const repository = createS3TrackRepository(tracks);
    const ownerId = 'integration-list-owner';
    const otherOwnerId = 'integration-list-other';
    await tracks.deleteMany({ ownerId: { $in: [ownerId, otherOwnerId] } });
    const documents = [
      { ownerId, title: 'Morning gravel', normalizedName: 'morning gravel', createdAt: new Date('2026-09-17T08:00:00Z') },
      { ownerId, title: 'Evening GRAVEL loop', normalizedName: 'evening gravel loop', createdAt: new Date('2026-09-17T18:00:00Z') },
      { ownerId, title: 'Road ride', normalizedName: 'road ride', createdAt: new Date('2026-09-17T12:00:00Z') },
      { ownerId: otherOwnerId, title: 'Private gravel', normalizedName: 'private gravel', createdAt: new Date('2026-09-18T12:00:00Z') },
    ].map((document, index) => ({ ...document, publicId: `integration_list_${index}`, processing: { status: 'READY', step: null, error: null } }));
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

});
