import { createHash, createHmac, timingSafeEqual, randomBytes as nodeRandomBytes } from 'node:crypto';
import { SESSION_DURATION_MS } from './session-repository.js';

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
export const ATTEMPT_DURATION_MS = 10 * 60 * 1_000;
const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;
export const SESSION_COOKIE = 'getgpx_session';
export const ATTEMPT_COOKIE = 'getgpx_oauth_attempt';

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
    tier: user.tier || 'BASIC',
  };
}

export async function exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri, fetchImplementation = fetch }) {
  const requestJson = async (url, options, failureMessage) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Google request timed out.', 'TimeoutError')),
      GOOGLE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImplementation(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(failureMessage);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
  const tokens = await requestJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }),
  }, 'Google token exchange failed.');
  if (typeof tokens.access_token !== 'string') throw new Error('Google returned an invalid token response.');

  return requestJson(GOOGLE_USERINFO_URL,
    { headers: { authorization: `Bearer ${tokens.access_token}` } }, 'Google profile request failed.');
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

export function readCookie(request, name) {
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

export function serializeCookie(name, value, { maxAge, secureCookies }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secureCookies) parts.push('Secure');
  return parts.join('; ');
}

export function createSessionRefreshMiddleware(authService, { secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  return async (request, response, next) => {
    const token = sessionTokenFromRequest(request);
    if (!token || request.path === '/auth/logout') return next();
    try {
      const user = await authService.getUser(token);
      request.authenticatedUser = user;
      if (user) response.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token,
        { maxAge: SESSION_DURATION_MS / 1_000, secureCookies }));
      next();
    } catch (error) {
      next(error);
    }
  };
}
