import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_TIERS, loadConfiguration } from '../../../src/backend/configuration.js';

describe('application configuration', () => {
  it('creates the default user tiers once and loads the persisted value', async () => {
    const persisted = { BASIC: { limits: { tracks: 75 } }, PREMIUM: { limits: { tracks: 750 } } };
    const collection = {
      createIndex: vi.fn().mockResolvedValue('key_1'),
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 0 }),
      findOne: vi.fn()
        .mockResolvedValueOnce({ key: 'userTiers', value: persisted })
        .mockResolvedValueOnce(null),
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

  it('loads optional homepage track ids in their configured order', async () => {
    const ids = ['6ab02471fb28fc3ae79e4d23', '6ab0249bfb28fc3ae79e4d26', '6aafc485fb28fc3ae79e4d17'];
    const collection = {
      createIndex: vi.fn().mockResolvedValue('key_1'),
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 0 }),
      findOne: vi.fn()
        .mockResolvedValueOnce({ key: 'userTiers', value: DEFAULT_USER_TIERS })
        .mockResolvedValueOnce({ key: 'homepageTrackIds', value: ids }),
    };

    await expect(loadConfiguration({ collection: vi.fn().mockResolvedValue(collection) }))
      .resolves.toEqual({ userTiers: DEFAULT_USER_TIERS, homepageTrackIds: ids });
  });
});
