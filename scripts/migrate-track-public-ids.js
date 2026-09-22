import { MongoClient } from 'mongodb';
import process from 'node:process';
import { createPublicId } from '../src/backend/public-id.js';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || 'getgpx';

if (!uri) throw new Error('MONGODB_URI is required.');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });

function isPublicIdCollision(error) {
  return error?.code === 11000 && (error.keyPattern?.publicId === 1 || error.keyValue?.publicId);
}

try {
  const database = client.db(databaseName);
  await client.connect();
  const tracks = database.collection('tracks');
  await tracks.createIndex(
    { publicId: 1 },
    { unique: true, partialFilterExpression: { publicId: { $type: 'string' } } },
  );

  let migrated = 0;
  const cursor = tracks.find({ publicId: { $exists: false } }, { projection: { _id: 1 } });
  for await (const track of cursor) {
    for (;;) {
      try {
        const result = await tracks.updateOne(
          { _id: track._id, publicId: { $exists: false } },
          { $set: { publicId: createPublicId(), schemaVersion: 2 } },
        );
        migrated += result.modifiedCount;
        break;
      } catch (error) {
        if (!isPublicIdCollision(error)) throw error;
      }
    }
  }

  const versionResult = await tracks.updateMany(
    {
      publicId: { $type: 'string' },
      $or: [{ schemaVersion: { $lt: 2 } }, { schemaVersion: { $exists: false } }],
    },
    { $set: { schemaVersion: 2 } },
  );

  process.stdout.write(`Assigned ${migrated} public id(s) and updated ${versionResult.modifiedCount} schema version(s) in ${databaseName}.\n`);
} finally {
  await client.close();
}
