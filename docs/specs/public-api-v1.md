# Public API v1 — phase 1

Status: implementation specification. Based on main 4c6ee36 and the user's approved
routing, versioning, documentation, and three-phase scope.

## Objective and scope

Publish all existing track operations as one supported REST API used by the website
and external clients. Anonymous reads are metadata, detailed analysis, and original
GPX. All other operations retain existing session and ownership checks. No second
implementation, new data storage, API tokens, mandatory User-Agent, or rate limiting.

Phase 2 adds client identification and rate limits. Phase 3 may add personal access
tokens. Google sign-in remains a website concern, not an API OAuth authorization flow.

## Contract

The canonical machine-readable contract lives in `src/backend/api/v1/openapi.json`.
OpenAPI describes every request, status, JSON envelope, field, unit, nullability,
pagination rule, and cookie security requirement. It is served at
`/api/v1/openapi.json`. OpenAPI specification version and API major version are
independent of the application release version.

- Mount track HTTP routes under `/api/v1`; use relative routes inside v1.
- Preserve current methods, URLs, and response envelopes. Metadata and mutations use
  `{ data: ... }`; errors use `{ error: { code, message? } }`. Clients branch on codes,
  never on localized legacy prose. Detailed analysis is a standalone JSON document;
  GPX is the original file, not JSON.
- GET `/tracks/{id}` stays point-free and reads MongoDB only. Geometry stays in
  GET `/tracks/{id}/analysis`, delivered from S3 with the existing streaming/nginx
  adapter. Never add `include=geometry`. The website retains two-stage loading.
- GET and PUT `/tracks/{id}/gpx` share the resource path. POST `/tracks` creates a
  track. Processing responses are 202; initial upload returns a status Location.
- Preserve existing PATCH semantics: title, routeType and speedKmh are required;
  omitted externalLinks clears links. Document this compatibility constraint rather
  than silently changing it while extracting the HTTP layer.
- Lists use query (up to 100 characters), opaque cursor, 24-item pages and
  `nextCursor: null` at the end. No public catalogue.
- Canonical units: km, m, km/h, ms, percent; dates are UTC ISO 8601. Missing values
  stay null or omitted as documented, never invented zeros.
- Metadata has ACTIVE/DIAGNOSTIC/NONE results; availability and provenance remain
  explicit. Analysis can return 409 before a completed result exists; missing tracks
  return 404. Original GPX may already be available before analysis finishes.
- Public author is the uploader's displayName/avatarUrl, never email or owner ID.
- Explicit response schemas prevent accidental publication of repository fields.
  Freeze the current S3 analysis representation with a complete documented schema
  and tests; do not buffer or rewrite streamed geometry in the HTTP router.

## Website and API boundaries

`src/backend/api/v1/` owns routes, HTTP validation, response serialization and OpenAPI.
`src/backend/api/` owns version composition, same-origin policy, JSON error handling,
and documentation. `src/backend/site/` owns homepage and sign-in HTTP routes.
Services, repositories, processing and object delivery remain shared and unversioned.
The browser uses `src/client/track-api.js` and never imports backend API modules.
Production and Vite use the same API composition; do not copy route registrations.

Website-only `/auth/*`, `/homepage`, health and internal signing paths are excluded
from the public OpenAPI. Session resolution is a transport adapter and preserves
sliding expiry. API handlers consume resolved identity; future token auth can supply
that identity without duplicating track handlers.

## Access policy and errors

Public GET requests do not require a cookie. Protected operations use the existing
HttpOnly `getgpx_session` cookie. Browser users sign in on GetGPX first; documentation
requests on that origin use the browser cookie automatically. Never ask users to
paste session secrets into documentation or store them in browser localStorage.
External scripts may send an existing session cookie, but automated token issuance
is explicitly unavailable in phase 1.

No cross-origin CORS grants. Reject browser cross-origin API access using Origin and
Fetch Metadata, with an origin derived from configured Google redirect URI in normal
runtimes (same origin as the website), not untrusted forwarded headers. Direct clients
without browser-origin headers remain allowed. Top-level safe GET/HEAD navigation
and download links may work; cross-origin script requests must not. Apply the policy
before JSON parsing and protected operation execution. It is not a barrier to server
proxies, and does not replace authorization. Do not alter Google callback behavior.

Unknown API paths and unsupported versions return JSON 404 rather than the HTML
application shell; unsupported methods on known paths return 405 with Allow.
Malformed JSON returns 400, oversized JSON 413, and unexpected errors 500 without
provider messages or stacks. Existing domain error statuses remain compatible.

## Documentation

- `/api/docs`: Scalar API Reference.
- `/api/swagger`: Swagger UI, reading the same OpenAPI document.
- Locally installed, lockfile-pinned JS/CSS assets; no external documentation proxy,
  validator, fonts, telemetry, or CDN requirement.
- English technical reference with curl examples, units, async upload/polling,
  session caveats, errors, same-origin policy, and links between the two views.
- New site UI labels use every existing language catalog. Standard third-party UI
  and English API reference prose are vendor/technical documentation, not new site
  translation keys.
- Preserve CSP: local external scripts, scoped documentation styles and no unsafe-eval.

## Versioning and agent rules

Published v1 is a compatibility commitment. Any intentional change to its public
contract requires explicit user approval (this implementation is authorized).
Breaking changes require a new API major version and an approved migration plan;
never silently change v1. Additive optional fields are compatible but still require
contract review. Errors, auth, units, enums, nullability and semantic behavior count
as contract, not just paths. App releases do not bump API major automatically.
Keep a reviewed contract baseline in tests; an intentional contract change updates
OpenAPI, baseline, docs and tests together after approval. Agents must not regenerate
the baseline simply to make a failing test pass.

## Plan and boundaries

1. Commit this specification; inspect and preserve all existing behavior.
2. Extract v1 routes and site routes, compose shared middleware, add typed OpenAPI
   schemas and stable response projection. Keep services and persistence shared.
3. Serve local Scalar/Swagger docs from the same application in dev and production.
4. Add schema, route coverage, access-policy, error and browser checks; update agent
   instructions and living architecture docs.

Use ES modules and dependency injection, e.g. `createApiRouter(trackService,
authService, options)`. Tests mirror boundaries under `tests/`; no colocated tests.
No database migration, new authentication flow, provider change, geometry expansion,
or production deployment. Do not edit historical `docs/changes/` or commit secrets.

## Verification and acceptance

- `npm ci` on Node 22.13+; `npm run check` runs catalog validation, lint, fast tests,
  API contract checks and build.
- OpenAPI validates; every operation matches an actual route and appropriate security.
- Real handler/service response samples conform to schemas, including processing,
  diagnostics, metadata, owner lists, favorites, streams and errors.
- Baseline detects unapproved contract changes. Public reads do not resolve sessions
  unnecessarily or read S3 for metadata; protected routes still reject guests.
- Cross-origin script requests fail; same-origin docs and direct clients work.
- Unknown routes/methods and JSON parser errors return stable JSON.
- Browser checks both docs views, operation rendering and an anonymous GET; inspect
  network/CSP, session limitations, desktop and narrow layout.
- Run `npm run test:integration` if persistence wiring changes. No production data or
  real provider calls; temporary test databases must be cleaned up.
