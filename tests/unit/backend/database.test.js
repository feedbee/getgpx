import { describe, expect, it, vi } from 'vitest';
import { createDatabase, databaseNameFromUri } from '../../../src/backend/database.js';

describe('createDatabase', () => {
  it('fails fast when MONGODB_URI is missing', () => {
    expect(() => createDatabase({ uri: '' })).toThrow(/MONGODB_URI/);
  });

  it('uses the database named in the URI and falls back to getgpx', () => {
    expect(databaseNameFromUri('mongodb://localhost:27017/rides?authSource=admin')).toBe('rides');
    expect(databaseNameFromUri('mongodb+srv://user:pass@cluster.example/rides')).toBe('rides');
    expect(databaseNameFromUri('mongodb://localhost:27017/?authSource=admin')).toBe('getgpx');
    expect(databaseNameFromUri('mongodb://localhost:27017')).toBe('getgpx');
  });

  it('connects once, exposes the URI database, and closes cleanly', async () => {
    const db = { command: vi.fn().mockResolvedValue({ ok: 1 }) };
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      db: vi.fn().mockReturnValue(db),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const database = createDatabase({
      uri: 'mongodb://localhost:27017/getgpx_test',
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
