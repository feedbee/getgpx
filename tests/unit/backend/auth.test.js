import { describe, expect, it, vi } from 'vitest';
import { createAuthHandlers, createAuthService, createSessionRefreshMiddleware, exchangeGoogleCode, publicUser } from '../../../src/backend/auth.js';

describe('Google OAuth requests', () => {
  it('aborts a stalled token exchange after ten seconds', async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
      const exchange = exchangeGoogleCode({ code: 'code', codeVerifier: 'verifier', clientId: 'client',
        clientSecret: 'secret', redirectUri: 'https://example.com/callback', fetchImplementation });
      const rejected = expect(exchange).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives the profile request its own ten-second timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
        .mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
      const exchange = exchangeGoogleCode({ code: 'code', codeVerifier: 'verifier', clientId: 'client',
        clientSecret: 'secret', redirectUri: 'https://example.com/callback', fetchImplementation });
      const rejected = expect(exchange).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      expect(fetchImplementation).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('authentication service', () => {
  it('exposes only the public user contract', () => {
    expect(publicUser({
      _id: { toString: () => 'user-1' }, googleSubject: 'secret-subject', email: 'rider@example.com',
      displayName: 'Rider', avatarUrl: null, registeredAt: new Date(), lastLoginAt: new Date(),
    })).toEqual({ id: 'user-1', email: 'rider@example.com', displayName: 'Rider', avatarUrl: null, tier: 'BASIC' });
  });

  it('exposes an explicitly assigned premium tier', () => {
    expect(publicUser({
      _id: { toString: () => 'user-1' }, email: 'rider@example.com', displayName: 'Rider', avatarUrl: null, tier: 'PREMIUM',
    }).tier).toBe('PREMIUM');
  });

  it('creates a signed PKCE login URL and accepts a matching callback', async () => {
    const attempts = new Map();
    const sessions = [];
    const auth = createAuthService({
      clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://getgpx.test/auth/google/callback',
      sessionSecret: 'a'.repeat(32),
      userRepository: { loginWithGoogle: async (profile) => ({ _id: 'user-1', ...profile }) },
      sessionRepository: { create: async (...args) => sessions.push(args), findUserByToken: async () => null, deleteByToken: async () => {} },
      exchangeCode: async ({ code, codeVerifier }) => {
        expect(code).toBe('google-code');
        expect(codeVerifier.length).toBeGreaterThan(40);
        return { sub: 'google-123', email: 'rider@example.com', email_verified: true, name: 'Rider', picture: 'https://example.com/a.jpg' };
      },
      randomBytes: (size) => Buffer.alloc(size, 7),
      attempts,
    });

    const login = auth.beginGoogleLogin();
    const url = new URL(login.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const result = await auth.completeGoogleLogin({ code: 'google-code', state: url.searchParams.get('state'), attemptCookie: login.attemptCookie });
    expect(result.user.email).toBe('rider@example.com');
    expect(result.sessionToken).toBeTruthy();
    expect(sessions).toHaveLength(1);
  });

  it('rejects unverified Google email addresses', async () => {
    const auth = createAuthService({
      clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://getgpx.test/callback', sessionSecret: 'a'.repeat(32),
      userRepository: { loginWithGoogle: async () => { throw new Error('must not run'); } },
      sessionRepository: { create: async () => {}, findUserByToken: async () => null, deleteByToken: async () => {} },
      exchangeCode: async () => ({ sub: 'google-123', email: 'rider@example.com', email_verified: false, name: 'Rider' }),
      randomBytes: (size) => Buffer.alloc(size, 3), attempts: new Map(),
    });
    const login = auth.beginGoogleLogin();
    const state = new URL(login.authorizationUrl).searchParams.get('state');

    await expect(auth.completeGoogleLogin({ code: 'code', state, attemptCookie: login.attemptCookie })).rejects.toThrow('verified email');
  });
});

describe('authentication HTTP handlers', () => {
  it('renews a valid session cookie on a server request', async () => {
    const authService = { getUser: vi.fn().mockResolvedValue({ id: 'user-1' }) };
    const middleware = createSessionRefreshMiddleware(authService, { secureCookies: true });
    const request = { path: '/api/v1/tracks', headers: { cookie: 'getgpx_session=active-token' } };
    const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    const next = vi.fn();

    await middleware(request, response, next);

    expect(authService.getUser).toHaveBeenCalledWith('active-token');
    expect(request.authenticatedUser).toEqual({ id: 'user-1' });
    expect(response.headers['Set-Cookie']).toContain('Max-Age=2592000');
    expect(response.headers['Set-Cookie']).toContain('Secure');
    expect(next).toHaveBeenCalledWith();
  });

  it('does not renew an invalid session cookie', async () => {
    const middleware = createSessionRefreshMiddleware({ getUser: async () => null });
    const request = { path: '/api/v1/tracks', headers: { cookie: 'getgpx_session=expired' } };
    const response = { setHeader: vi.fn() };
    await middleware(request, response, vi.fn());
    expect(request.authenticatedUser).toBeNull();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('returns the current session user and clears it on logout', async () => {
    const deleted = [];
    const authService = {
      getUser: async (token) => token === 'active-token' ? { id: 'user-1' } : null,
      logout: async (token) => deleted.push(token),
    };
    const handlers = createAuthHandlers(authService, { secureCookies: true });
    const sessionResponse = { json(value) { this.body = value; } };
    const logoutResponse = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      end() { this.ended = true; },
    };

    await handlers.session({ headers: { cookie: 'getgpx_session=active-token' } }, sessionResponse);
    await handlers.logout({ headers: { cookie: 'getgpx_session=active-token' } }, logoutResponse);

    expect(sessionResponse.body).toEqual({ user: { id: 'user-1' } });
    expect(deleted).toEqual(['active-token']);
    expect(logoutResponse.statusCode).toBe(204);
    expect(logoutResponse.headers['Set-Cookie']).toContain('Secure');
    expect(logoutResponse.headers['Set-Cookie']).toContain('Max-Age=0');
  });
});
