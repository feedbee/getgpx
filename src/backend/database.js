import { MongoClient } from 'mongodb';

export function databaseNameFromUri(uri) {
  const encodedName = /^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]*)/.exec(uri)?.[1];
  return encodedName ? decodeURIComponent(encodedName) : 'getgpx';
}

export function createDatabase({
  uri = process.env.MONGODB_URI,
  createClient = (connectionUri) => new MongoClient(connectionUri, { serverSelectionTimeoutMS: 5_000 }),
} = {}) {
  if (!uri) throw new Error('MONGODB_URI is required.');

  const databaseName = databaseNameFromUri(uri);
  const client = createClient(uri);
  let database;
  let connection;

  async function connect() {
    if (database) return database;
    connection ??= client.connect().then(() => {
      database = client.db(databaseName);
      return database;
    });
    return connection;
  }

  return {
    connect,
    async collection(name) {
      const db = await connect();
      return db.collection(name);
    },
    async ping() {
      const db = await connect();
      await db.command({ ping: 1 });
      return true;
    },
    async close() {
      await client.close();
      database = undefined;
      connection = undefined;
    },
  };
}
