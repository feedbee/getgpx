# Google authentication

## Objective

Add optional Google sign-in without changing access to route analysis. A guest sees a
login control beside GPX upload. A signed-in user sees their Google avatar and can
open a menu containing only logout.

## Contract and data

- `GET /api/auth/session` returns `{ "user": null }` or a public user containing
  `id`, `email`, `displayName`, and `avatarUrl`.
- `GET /api/auth/google` starts Google OAuth 2.0 Authorization Code flow with PKCE.
- `GET /api/auth/google/callback` validates OAuth state, exchanges the code, upserts
  the user, creates a server-side session, and redirects to `/`.
- `POST /api/auth/logout` revokes the current server-side session and clears its cookie.
- Users store Google subject, email, display name, avatar URL, registration time,
  last-login time, and profile-update time. Profile-update time changes only when a
  profile field received from Google changes.
- Session cookies are opaque, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
  MongoDB stores only a SHA-256 hash of each session token.

## Structure and implementation order

1. Backend repositories and indexes for users and sessions.
2. OAuth/session service and HTTP routes with validated Google responses.
3. Accessible header control and client session state.
4. Environment template, operations documentation, and end-to-end verification.

Backend code remains under `src/backend`; browser code remains under `src/client`.
Tests mirror those boundaries under `tests/`. Existing ES module and formatting
conventions apply.

## Commands and testing

- Fast feedback: `npm run test:fast`
- Database contract: `npm run test:integration`
- Quality gate: `npm run check`

Unit tests cover OAuth state, session behavior, public response shape, user timestamp
semantics, and browser UI rendering. MongoDB integration tests cover indexes and user
upsert persistence. No test calls Google.

## Boundaries

- Always validate Google responses and callback inputs; never expose OAuth or session
  tokens; never commit credentials.
- Google credentials and the session secret are deployment configuration.
- Track ownership, saved tracks, profile editing, roles, and authorization changes are
  explicitly outside this change.

## Success criteria

- A first Google login registers a user; later logins update `lastLoginAt` without
  changing `registeredAt`.
- Login/logout and session restoration work through the header controls.
- Guests retain the same route-analysis page and capabilities.
- Missing auth configuration fails clearly at startup, and setup is documented.
- `npm run check` and the MongoDB integration suite pass.
