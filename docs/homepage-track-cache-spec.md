# Homepage track cache: proposed specification

Status: implemented. Scope: the public `GET /api/tracks/homepage` response.

## Objective

When enabled, keep the complete response payload for the homepage track section in the Node.js process memory. Serve requests without a database read while the payload is available. Refresh it every hour, including rereading homepage track ID configuration. Keep the current track selection and response format.

## Current behavior

`trackService.getHomepageTracks()` calls `trackRepository.listHomepage()` for every request. A configured `homepageTrackIds` array selects up to three tracks in its given order; without it, the repository selects the **oldest** three by `createdAt` and `_id`. Only the first result includes full analysis. Configuration is currently loaded once at startup.

## Proposed design

- Add one small backend cache module wrapping the homepage data loader. The route keeps calling `getHomepageTracks`; no browser changes are needed.
- Read `HOMEPAGE_TRACK_CACHE_ENABLED` at startup. Only `true` enables the cache; unset or any other value disables it. Document `false` in `.env.example`.
- When enabled, attempt the initial load during startup. If it fails, log the failure, start the server with an empty cache state, and schedule the next hourly attempt. An empty array returned by a successful load is valid cached data.
- On a request with no cached payload, read from the database and cache a successful result. If that read fails, preserve the existing route error response and leave the cache empty. Concurrent cache misses should share one in-flight load rather than start duplicate reads.
- Keep one timer at a time. After a completed refresh attempt, schedule the next attempt for one hour later. This avoids overlapping refreshes and ensures a full hour between attempts.
- Each refresh rereads `homepageTrackIds` from MongoDB and then selects tracks with the current configuration. An absent setting continues to select the oldest three. Keep `userTiers` startup behavior unchanged.
- Refresh into a local value, then replace the cached array atomically on success. On refresh failure, log the error and keep serving the last successful payload. Continue scheduling retries hourly; do not retry sooner.
- Stop the timer during server shutdown. When disabled, call the original service directly; do not create a timer or retain a cache.
- Cache lifetime is per process. Each instance refreshes independently. Homepage configuration changes take effect at the next successful refresh.

## Structure and commands

- `src/backend/homepage-track-cache.js`: cache state, initial load, timer, refresh, cleanup.
- `src/backend/index.js`: environment flag, startup wiring, shutdown cleanup.
- `src/backend/configuration.js` or a small repository reader: read and validate the current homepage ID setting without reloading unrelated configuration.
- `tests/unit/backend/homepage-track-cache.test.js`: fake clock and loader tests.
- `.env.example`, `docs/architecture.md`, `docs/operations.md`: configuration and behavior.
- Setup: `npm ci` on Node.js 22+.
- Required validation: `npm run check` and `npm run test:integration`, because the live configuration read changes database wiring.

## Code style and boundaries

Use a named ES module export with injected loader and timer dependencies for deterministic unit tests. The cache accepts the already serialized homepage payload and does not know MongoDB IDs or HTTP response objects. Keep persistence behind the existing repository and user-facing strings in existing client catalogs; this change introduces no client strings.

## Acceptance criteria

1. Default configuration preserves today's per-request database load and startup-loaded homepage configuration.
2. Enabled startup attempts one load. If it succeeds, the first HTTP request reads from memory; if it fails, startup continues and a request retries the load.
3. Multiple requests within an hour cause no additional homepage database reads.
4. Successful cache-miss reads populate the cache, including an empty result. Failed reads leave it empty and keep the route's existing error behavior.
5. A successful refresh changes subsequent responses atomically; concurrent requests continue to receive the prior complete payload until then.
6. Refresh failures retain the last good payload, log the failure, and retry one hour later.
7. Refreshes do not overlap, and shutdown clears the pending timer.
8. Changes to `homepageTrackIds`, including its removal, take effect at the next successful refresh. The current oldest-three fallback, configured-ID ordering, and featured first-track analysis remain intact.
