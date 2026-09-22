import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../../src/backend/database.js';

describe('createDatabase', () => {
  it('fails fast when MONGODB_URI is missing', () => {
    expect(() => createDatabase({ uri: '' })).toThrow(/MONGODB_URI/);
  });

  it('connects once, exposes the configured database, and closes cleanly', async () => {
    const db = { command: vi.fn().mockResolvedValue({ ok: 1 }) };
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      db: vi.fn().mockReturnValue(db),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const database = createDatabase({
      uri: 'mongodb://localhost:27017',
      databaseName: 'getgpx_test',
      createClient: () => client,
    });

    expect(await database.connect()).toBe(db);
    expect(await database.connect()).toBe(db);
    await expect(database.ping()).resolves.toBe(true);
    await database.close();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.db).toHaveBeenCalledWith('getgpx_test');
    expect(db.command).toHaveBeenCalledWith({ ping: 1 });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
