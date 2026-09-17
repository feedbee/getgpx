import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';
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
});
