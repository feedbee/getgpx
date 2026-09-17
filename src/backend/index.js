import { createApp } from './app.js';
import { createAuthentication } from './authentication.js';
import { createDatabase } from './database.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const database = createDatabase();

await database.connect();
const { middleware: authRouter } = await createAuthentication(database);
const server = createApp({ database, authRouter }).listen(port, host, () => {
  console.log(`Track Hub listening on http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async (error) => {
    await database.close();
    process.exitCode = error ? 1 : 0;
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
