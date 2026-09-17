import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/backend/database.js';

const uri = process.env.MONGODB_URI;
const describeWithMongo = uri ? describe : describe.skip;

describeWithMongo('MongoDB integration', () => {
  const database = createDatabase({ uri, databaseName: process.env.MONGODB_DATABASE || 'track_hub_test' });

  beforeAll(() => database.connect());
  afterAll(() => database.close());

  it('connects to MongoDB and responds to ping', async () => {
    await expect(database.ping()).resolves.toBe(true);
  });
});
