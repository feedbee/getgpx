import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_TIERS, loadConfiguration } from '../../../src/backend/configuration.js';

describe('application configuration', () => {
  it('creates the default user tiers once and loads the persisted value', async () => {
    const persisted = { BASIC: { limits: { tracks: 75 } }, PREMIUM: { limits: { tracks: 750 } } };
    const collection = {
      createIndex: vi.fn().mockResolvedValue('key_1'),
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 0 }),
      findOne: vi.fn().mockResolvedValue({ key: 'userTiers', value: persisted }),
    };
    const database = { collection: vi.fn().mockResolvedValue(collection) };

    const configuration = await loadConfiguration(database);

    expect(database.collection).toHaveBeenCalledWith('configuration');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { key: 'userTiers' },
      { $setOnInsert: { key: 'userTiers', value: DEFAULT_USER_TIERS } },
      { upsert: true },
    );
    expect(configuration).toEqual({ userTiers: persisted });
  });
});
