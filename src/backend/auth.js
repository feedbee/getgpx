import { createHash, createHmac, timingSafeEqual, randomBytes as nodeRandomBytes } from 'node:crypto';
import { Router } from 'express';

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;
const ATTEMPT_DURATION_MS = 10 * 60 * 1_000;
const SESSION_COOKIE = 'track_hub_session';
const ATTEMPT_COOKIE = 'track_hub_oauth_attempt';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function encodeAttempt(attempt, secret) {
  const payload = base64url(JSON.stringify(attempt));
  return `${payload}.${sign(payload, secret)}`;
}

function decodeAttempt(cookie, secret) {
  const [payload, signature] = String(cookie || '').split('.');
  if (!payload || !signature) throw new Error('Invalid OAuth attempt.');
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid OAuth attempt.');
  }
  const attempt = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!attempt.state || !attempt.codeVerifier || attempt.expiresAt < Date.now()) throw new Error('Expired OAuth attempt.');
  return attempt;
}

function validateGoogleProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('Google returned an invalid profile.');
  if (typeof value.sub !== 'string' || !value.sub) throw new Error('Google profile has no subject.');
  if (typeof value.email !== 'string' || !value.email || value.email_verified !== true) {
    throw new Error('Google account must have a verified email.');
  }
  return {
    googleSubject: value.sub,
    email: value.email.toLowerCase(),
    displayName: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : value.email,
    avatarUrl: typeof value.picture === 'string' && value.picture.startsWith('https://') ? value.picture : null,
  };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export async function exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri, fetchImplementation = fetch }) {
  const tokenResponse = await fetchImplementation(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }),
  });
  if (!tokenResponse.ok) throw new Error('Google token exchange failed.');
  const tokens = await tokenResponse.json();
  if (typeof tokens.access_token !== 'string') throw new Error('Google returned an invalid token response.');

  const profileResponse = await fetchImplementation(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new Error('Google profile request failed.');
  return profileResponse.json();
}

export function createAuthService({
  clientId,
  clientSecret,
  redirectUri,
  sessionSecret,
  userRepository,
  sessionRepository,
  exchangeCode = exchangeGoogleCode,
  randomBytes = nodeRandomBytes,
} = {}) {
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth configuration is required.');
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (!userRepository || !sessionRepository) throw new Error('Authentication repositories are required.');

  return {
    beginGoogleLogin() {
      const state = randomBytes(32).toString('base64url');
      const codeVerifier = randomBytes(48).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
      const url = new URL(GOOGLE_AUTHORIZATION_URL);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return {
        authorizationUrl: url.toString(),
        attemptCookie: encodeAttempt({ state, codeVerifier, expiresAt: Date.now() + ATTEMPT_DURATION_MS }, sessionSecret),
      };
    },

    async completeGoogleLogin({ code, state, attemptCookie }) {
      if (!code || !state) throw new Error('Google callback is incomplete.');
      const attempt = decodeAttempt(attemptCookie, sessionSecret);
      if (state !== attempt.state) throw new Error('OAuth state mismatch.');
      const rawProfile = await exchangeCode({ code, codeVerifier: attempt.codeVerifier, clientId, clientSecret, redirectUri });
      const user = await userRepository.loginWithGoogle(validateGoogleProfile(rawProfile));
      const sessionToken = randomBytes(32).toString('base64url');
      await sessionRepository.create(sessionToken, user._id, new Date(Date.now() + SESSION_DURATION_MS));
      return { user: publicUser(user), sessionToken };
    },

    async getUser(sessionToken) {
      return publicUser(await sessionRepository.findUserByToken(sessionToken));
    },

    async logout(sessionToken) {
      await sessionRepository.deleteByToken(sessionToken);
    },
  };
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionTokenFromRequest(request) {
  return readCookie(request, SESSION_COOKIE);
}

function serializeCookie(name, value, { maxAge, secureCookies }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secureCookies) parts.push('Secure');
  return parts.join('; ');
}

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
      } catch {
        response.setHeader('Set-Cookie', serializeCookie(ATTEMPT_COOKIE, '', { maxAge: 0, secureCookies }));
        response.redirect('/?auth=error');
      }
    },

    async session(request, response) {
      const user = await authService.getUser(sessionTokenFromRequest(request));
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
  router.get('/api/auth/google', handlers.begin);
  router.get('/api/auth/google/callback', handlers.callback);
  router.get('/api/auth/session', handlers.session);
  router.post('/api/auth/logout', handlers.logout);
  return router;
}
