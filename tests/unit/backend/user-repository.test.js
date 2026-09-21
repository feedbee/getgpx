import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../../src/backend/user-repository.js';

function createUsersCollection() {
  const documents = new Map();
  return {
    documents,
    async findOne(query) {
      return [...documents.values()].find((document) => (
        query._id ? document._id === query._id : document.googleSubject === query.googleSubject
      )) || null;
    },
    async findOneAndUpdate(query, update) {
      const existing = await this.findOne(query);
      const next = existing
        ? { ...existing, ...update.$set }
        : { _id: 'user-1', ...update.$setOnInsert, ...update.$set };
      documents.set(next.googleSubject, next);
      return next;
    },
  };
}

describe('user repository', () => {
  it('registers a Google user with all lifecycle timestamps', async () => {
    const repository = createUserRepository(createUsersCollection());
    const now = new Date('2026-09-17T10:00:00.000Z');

    const user = await repository.loginWithGoogle({
      googleSubject: 'google-123', email: 'rider@example.com', displayName: 'Rider', avatarUrl: 'https://example.com/avatar.jpg',
    }, now);

    expect(user).toMatchObject({
      googleSubject: 'google-123', email: 'rider@example.com', tier: 'BASIC', registeredAt: now, lastLoginAt: now, profileUpdatedAt: now,
    });
  });

  it('keeps a manually assigned premium tier on later logins', async () => {
    const users = createUsersCollection();
    const repository = createUserRepository(users);
    const profile = { googleSubject: 'google-123', email: 'rider@example.com', displayName: 'Rider', avatarUrl: null };
    const user = await repository.loginWithGoogle(profile);
    users.documents.get(user.googleSubject).tier = 'PREMIUM';

    await expect(repository.loginWithGoogle(profile)).resolves.toMatchObject({ tier: 'PREMIUM' });
  });

  it('preserves registration and profile dates when only the login time changes', async () => {
    const repository = createUserRepository(createUsersCollection());
    const registeredAt = new Date('2026-09-17T10:00:00.000Z');
    const nextLogin = new Date('2026-09-18T12:00:00.000Z');
    const profile = { googleSubject: 'google-123', email: 'rider@example.com', displayName: 'Rider', avatarUrl: null };

    await repository.loginWithGoogle(profile, registeredAt);
    const user = await repository.loginWithGoogle(profile, nextLogin);

    expect(user.registeredAt).toEqual(registeredAt);
    expect(user.lastLoginAt).toEqual(nextLogin);
    expect(user.profileUpdatedAt).toEqual(registeredAt);
  });

  it('records a profile update when Google profile fields change', async () => {
    const repository = createUserRepository(createUsersCollection());
    const registeredAt = new Date('2026-09-17T10:00:00.000Z');
    const changedAt = new Date('2026-09-19T12:00:00.000Z');

    await repository.loginWithGoogle({ googleSubject: 'google-123', email: 'old@example.com', displayName: 'Rider', avatarUrl: null }, registeredAt);
    const user = await repository.loginWithGoogle({ googleSubject: 'google-123', email: 'new@example.com', displayName: 'Rider Two', avatarUrl: null }, changedAt);

    expect(user.email).toBe('new@example.com');
    expect(user.profileUpdatedAt).toEqual(changedAt);
  });

  it('returns only public profile fields for attribution', async () => {
    const repository = createUserRepository(createUsersCollection());
    const user = await repository.loginWithGoogle({
      googleSubject: 'google-123', email: 'private@example.com', displayName: 'Rider', avatarUrl: 'https://example.com/avatar.jpg',
    });

    await expect(repository.findPublicProfileById(user._id)).resolves.toEqual({
      displayName: 'Rider', avatarUrl: 'https://example.com/avatar.jpg',
    });
  });
});
