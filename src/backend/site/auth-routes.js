import { SESSION_DURATION_MS } from '../session-repository.js';
import { Router } from 'express';
import { ATTEMPT_COOKIE, SESSION_COOKIE, ATTEMPT_DURATION_MS, readCookie, serializeCookie, sessionTokenFromRequest } from '../auth.js';
import { safeErrorDetails } from '../safe-error-details.js';

export function createAuthHandlers(authService, { secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  if (!authService) throw new Error('An authentication service is required.');
  return {
    begin(_request, response) {
      const login = authService.beginGoogleLogin();
      response.setHeader('Set-Cookie', serializeCookie(ATTEMPT_COOKIE, login.attemptCookie, { maxAge: ATTEMPT_DURATION_MS / 1_000, secureCookies }));
      response.redirect(login.authorizationUrl);
    },

    async callback(request, response) {
      try {
        const result = await authService.completeGoogleLogin({
          code: typeof request.query.code === 'string' ? request.query.code : '',
          state: typeof request.query.state === 'string' ? request.query.state : '',
          attemptCookie: readCookie(request, ATTEMPT_COOKIE),
        });
        response.setHeader('Set-Cookie', [
          serializeCookie(ATTEMPT_COOKIE, '', { maxAge: 0, secureCookies }),
          serializeCookie(SESSION_COOKIE, result.sessionToken, { maxAge: SESSION_DURATION_MS / 1_000, secureCookies }),
        ]);
        response.redirect('/');
      } catch (authError) {
        request.log?.warn({ event: 'google_authentication_failed', ...safeErrorDetails(authError) }, 'Google authentication failed');
        response.setHeader('Set-Cookie', serializeCookie(ATTEMPT_COOKIE, '', { maxAge: 0, secureCookies }));
        response.redirect('/?auth=error');
      }
    },

    async session(request, response) {
      const user = request.authenticatedUser === undefined
        ? await authService.getUser(sessionTokenFromRequest(request)) : request.authenticatedUser;
      response.setHeader?.('Cache-Control', 'no-store');
      response.json({ user });
    },

    async logout(request, response) {
      await authService.logout(sessionTokenFromRequest(request));
      response.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secureCookies }));
      response.status(204).end();
    },
  };
}

export function createAuthRouter(authService, options) {
  const handlers = createAuthHandlers(authService, options);
  const router = Router();
  router.get('/auth/google', handlers.begin);
  router.get('/auth/google/callback', handlers.callback);
  router.get('/auth/session', handlers.session);
  router.post('/auth/logout', handlers.logout);
  return router;
}
