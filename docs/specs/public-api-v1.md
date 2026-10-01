# Public API v1

## Contract

The canonical contract is [OpenAPI](../../src/backend/api/v1/openapi.json), served
at `/api/v1/openapi.json`. The website and external clients use the same API.

- Base path: `/api/v1`.
- JSON responses use `{ data: ... }`; errors use `{ error: { code, message? } }`.
  Clients handle the stable error code. Detailed analysis is a standalone JSON
  document; GPX responses contain the original file.
- Public reads: track metadata, detailed analysis, and original GPX.
- Protected operations: upload, edit, replace, retry, delete, owner lists and
  favorites. They use the HttpOnly `getgpx_session` cookie obtained by signing in
  on the website. Personal access tokens are not available.
- Lists use an optional search query of up to 100 characters, an opaque cursor,
  24-item pages and `nextCursor: null` at the end.
- Units: km, m, km/h, ms and percent. Dates are UTC ISO 8601. Unknown numeric values
  are null. IDs are opaque strings.

## Track resources

`GET /tracks/{id}` returns editable metadata and point-free route data:
`metrics`, `distributions`, `climbs`, `descents`, `pointsOfInterest`, `sources`,
`completeness`, `revision`, `processing`, public `author`, and file URLs. `downloadURL` maps available formats to URLs, currently
`{ gpx: "/api/v1/tracks/{id}/gpx" }`; unavailable formats are omitted.
Each data group has one representation. Author information contains display name
and avatar, without account identifiers or email.

`GET /tracks/{id}/analysis` returns the stored analysis document with route
`points`. Its metrics, distributions, terrain segments and POIs have the same
shapes as metadata. It describes the original analysis of that revision; editable
speed and estimated duration in metadata may differ. `sourceName` contains the
original GPX name or filename fallback, while metadata `title` is editable.

Processing has one model: `status`, `step`, `error`, `canRetry`. The owner-only
`GET /tracks/{id}/status` adds `id` to that model. Result availability is determined
by `revision` and file URLs. A failed replacement can coexist with an available
previous revision. READY with PARTIAL completeness and canRetry=true indicates
usable analysis with optional enrichment available for retry. Known processing
error codes and their meanings are documented in OpenAPI. Analysis returns 409 while no result is available; an unknown
track returns 404.

`GET` and `PUT /tracks/{id}/gpx` read and replace the source resource. Uploads use
raw GPX request bodies and return 202 with processing status. An initial upload
also returns a status URL in `Location`.

`PATCH /tracks/{id}` accepts any nonempty subset of `title`, `routeType`, `speedKmh`
and `externalLinks`. Omitted top-level fields are preserved. A supplied externalLinks object replaces
all links. An empty links object clears
links. Unknown fields and invalid values return 422. Speed changes recalculate
estimated duration without changing the source analysis.

Bulk operations use `POST /tracks/deletions` and
`POST /tracks/saved/deletions`, accepting `{ ids: [...] }` and returning the affected
IDs as `{ data: { ids: [...] } }`. Single-resource deletion uses DELETE.

List previews are geographic coordinate arrays. Terrain classifications and
surface/road categories use stable identifiers; the website supplies localized
labels, colors and drawing indexes.

## Access and errors

Same-origin browser requests are supported. Cross-origin script requests are
rejected, and the service grants no cross-origin CORS access. Direct clients
without browser-origin headers can access public reads.

Unknown routes and unsupported versions return JSON 404. Unsupported methods on
known paths return 405 with `Allow`. Malformed JSON returns 400; oversized JSON
returns 413; unexpected failures return 500 without stacks or provider details.
Operation-specific statuses and response schemas are defined in OpenAPI.

## Code boundaries and delivery

`src/backend/api/v1/` owns version-specific routes, validation, response shaping
and OpenAPI. `src/backend/api/` owns composition, access policy, error handling and
API documentation. `src/backend/site/` owns website routes. Services and persistence
are shared. Production and Vite compose the same API.

Metadata reads MongoDB. Analysis is projected into the public format when written
to S3 and delivered directly through the configured stream or Nginx adapter. The
HTTP GET handler does not parse or transform the document. The website loads
metadata first and analysis separately through `src/client/track-api.js`.

## Documentation

`/api/docs` serves Scalar API Reference; `/api/swagger` serves Swagger UI. Both
read the same OpenAPI document and run on the application's domain and port.
JavaScript and CSS assets are installed locally and pinned in the lockfile.
Documentation requests use the browser's same-origin session cookie.

## Compatibility and verification

Published v1 is a compatibility commitment. Intentional contract changes require
explicit user approval. Breaking changes require a new major API version and an
approved migration plan. Application release versions do not change API versions.
OpenAPI, documentation, contract tests and the reviewed SHA baseline are updated
together. Do not regenerate the baseline merely to silence a test failure.

The current unpublished redesign is approved without data migration; tracks are
reuploaded using the new storage representation. Client identification and limits
belong to phase 2; personal access tokens belong to phase 3.

Run `npm run check` for every change and `npm run test:integration` for persistence
changes. Verify actual response shapes, route coverage, permissions, direct file
delivery and the website's metadata, map, profile, editing and list interactions.
Temporary test databases must have unique test-only names and be removed after use.
