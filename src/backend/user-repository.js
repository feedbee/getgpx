export function createUserRepository(users) {
  if (!users) throw new Error('A users collection is required.');

  return {
    async ensureIndexes() {
      await users.createIndex({ googleSubject: 1 }, { unique: true });
      await users.createIndex({ email: 1 }, { unique: true });
    },

    async loginWithGoogle(profile, now = new Date()) {
      const existing = await users.findOne({ googleSubject: profile.googleSubject });
      const profileChanged = existing && (
        existing.email !== profile.email
        || existing.displayName !== profile.displayName
        || existing.avatarUrl !== profile.avatarUrl
      );
      const updatedProfile = {
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: now,
      };
      if (profileChanged) updatedProfile.profileUpdatedAt = now;

      return users.findOneAndUpdate(
        { googleSubject: profile.googleSubject },
        {
          $set: updatedProfile,
          $setOnInsert: {
            googleSubject: profile.googleSubject,
            registeredAt: now,
            profileUpdatedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
    },
  };
}
