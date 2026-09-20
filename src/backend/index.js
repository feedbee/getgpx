import { createApp } from './app.js';
import { createAuthentication } from './authentication.js';
import { createDatabase } from './database.js';
import { analyzeGpxSource, enrichTrackAnalysis } from './track-analysis.js';
import { createTrackPersistence } from './track-persistence.js';
import { createTrackRouter } from './track-routes.js';
import { createTrackService } from './track-service.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const database = createDatabase();

await database.connect();
const [authentication, trackPersistence] = await Promise.all([
  createAuthentication(database),
  createTrackPersistence(database),
]);
const trackService = createTrackService({
  ...trackPersistence,
  userRepository: authentication.userRepository,
  analyzeSource: analyzeGpxSource,
  enrichAnalysis: enrichTrackAnalysis,
});
const trackRouter = createTrackRouter(trackService, authentication.service);
const server = createApp({ database, authRouter: authentication.middleware, trackRouter }).listen(port, host, () => {
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
