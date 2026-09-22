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

function validateHomepageTrackIds(trackIds) {
  if (!Array.isArray(trackIds) || trackIds.length !== 3
    || trackIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    || new Set(trackIds).size !== trackIds.length) {
    throw new Error('Configuration homepageTrackIds must contain three unique MongoDB object id strings.');
  }
  return trackIds;
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
  const [userTiers, homepageTrackIds] = await Promise.all([
    configuration.findOne({ key: 'userTiers' }),
    configuration.findOne({ key: 'homepageTrackIds' }),
  ]);
  return Object.freeze({
    userTiers: validateUserTiers(userTiers?.value),
    ...(homepageTrackIds ? { homepageTrackIds: validateHomepageTrackIds(homepageTrackIds.value) } : {}),
  });
}
