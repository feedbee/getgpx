import express from 'express';
import { createAuthRouter, createAuthService } from './auth.js';
import { createSessionRepository } from './session-repository.js';
import { createUserRepository } from './user-repository.js';

export async function createAuthentication(database, {
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  redirectUri = process.env.GOOGLE_REDIRECT_URI,
  sessionSecret = process.env.SESSION_SECRET,
  secureCookies,
} = {}) {
  const users = await database.collection('users');
  const sessions = await database.collection('sessions');
  const userRepository = createUserRepository(users);
  const sessionRepository = createSessionRepository(sessions, users);
  await Promise.all([userRepository.ensureIndexes(), sessionRepository.ensureIndexes()]);
  const service = createAuthService({ clientId, clientSecret, redirectUri, sessionSecret, userRepository, sessionRepository });
  const useSecureCookies = secureCookies ?? new URL(redirectUri).protocol === 'https:';
  const router = createAuthRouter(service, { secureCookies: useSecureCookies });
  const middleware = express();
  middleware.disable('x-powered-by');
  middleware.use(router);
  return { service, router, middleware };
}
