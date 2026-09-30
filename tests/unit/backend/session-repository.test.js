import { describe, expect, it, vi } from 'vitest';
import { createSessionRepository } from '../../../src/backend/session-repository.js';

describe('session repository', () => {
  it('extends a valid session by 30 days from its last request', async () => {
    const now = new Date('2026-09-30T12:00:00.000Z');
    const sessions = { findOneAndUpdate: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
    const users = { findOne: vi.fn().mockResolvedValue({ _id: 'user-1' }) };
    const repository = createSessionRepository(sessions, users);

    await expect(repository.findUserByToken('token', now)).resolves.toEqual({ _id: 'user-1' });
    expect(sessions.findOneAndUpdate).toHaveBeenCalledWith(
      { tokenHash: expect.any(String), expiresAt: { $gt: now } },
      { $set: { expiresAt: new Date('2026-10-30T12:00:00.000Z') } },
      { returnDocument: 'after' },
    );
  });

  it('does not look up a user when the session has expired', async () => {
    const sessions = { findOneAndUpdate: vi.fn().mockResolvedValue(null) };
    const users = { findOne: vi.fn() };
    const repository = createSessionRepository(sessions, users);

    await expect(repository.findUserByToken('expired')).resolves.toBeNull();
    expect(users.findOne).not.toHaveBeenCalled();
  });
});
