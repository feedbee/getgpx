# Production readiness review

## Resolved in the MVP foundation

- Vite preview is no longer the production server; the Node runtime serves assets and APIs.
- MongoDB configuration fails fast, connections are reused and closed gracefully, and readiness checks the dependency.
- External road enrichment no longer bypasses the backend from the browser.
- Request coordinates and third-party response fields are bounded/allowlisted; generic upstream errors do not expose internals.
- Security headers, reproducible installs, non-root container execution, CI checks, dependency updates, and a release boundary are present.

## Required before public production

1. Provision owned/rate-limited Valhalla and Overpass capacity; community endpoints are not an SLA.
2. Choose hosting, TLS termination, allowed proxy topology, log/metric/error collection, alert thresholds, backups, restore drills, and MongoDB retention/location.
3. Design authentication separately: Argon2id password hashing, verified email policy, httpOnly/secure/sameSite sessions, CSRF defense, login/reset rate limits, session revocation, and audit events.
4. Design track persistence separately: owner-based authorization on every operation, GPX size/point limits, canonical schema version, indexes, quotas, deletion/export, and privacy policy.
5. Add API-wide request IDs, structured logs, rate limiting, timeout/bulkhead policy, and tests for malformed/slow upstream responses.
6. Add browser E2E coverage for GPX upload and the critical analysis journey, plus accessibility and supported-browser checks.

## Known technical debt

- `src/client/main.js` combines rendering, state, and event wiring; split it by feature before adding account and library screens.
- Some DOM rendering uses `innerHTML`. Current interpolated values are internal/allowlisted, but any future user/server strings must use `textContent` or sanitization.
- The app has no persisted schema or migration/versioning policy yet by design. ADR-001 defines when to add them.
- CSP still permits inline styles because visual segments use dynamic style attributes. Replace them with safer CSS variables/nonces if the threat model requires a stricter policy.
