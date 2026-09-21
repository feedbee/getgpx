export const DEFAULT_USER_TIERS = Object.freeze({
  BASIC: Object.freeze({ limits: Object.freeze({ tracks: 100 }) }),
  PREMIUM: Object.freeze({ limits: Object.freeze({ tracks: 1000 }) }),
});

function validateUserTiers(userTiers) {
  for (const tier of ['BASIC', 'PREMIUM']) {
    if (!Number.isSafeInteger(userTiers?.[tier]?.limits?.tracks) || userTiers[tier].limits.tracks < 0) {
      throw new Error(`Configuration userTiers.${tier}.limits.tracks must be a non-negative integer.`);
    }
  }
  return userTiers;
}

export async function loadConfiguration(database) {
  if (!database) throw new Error('A database adapter is required.');
  const configuration = await database.collection('configuration');
  await configuration.createIndex({ key: 1 }, { unique: true });
  await configuration.updateOne(
    { key: 'userTiers' },
    { $setOnInsert: { key: 'userTiers', value: DEFAULT_USER_TIERS } },
    { upsert: true },
  );
  const userTiers = await configuration.findOne({ key: 'userTiers' });
  return Object.freeze({ userTiers: validateUserTiers(userTiers?.value) });
}
