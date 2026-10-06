# Architecture

GetGPX is a GPX analysis application with a browser client and a Node.js backend.

`client` and `backend` are separate because they execute in different trust zones. The browser owns interaction and rendering; the backend owns authoritative GPX analysis, secrets, MongoDB, validation, and controlled access to external services. They are both application source code, so both live under `src/`.

```text
Browser (Vite bundle)
  ├─ renders saved route metrics and analysis
  └─ renders Leaflet map and elevation analysis
              │
Node.js / Express
  ├─ validates and analyses uploaded GPX files
  ├─ completes Google OAuth and owns opaque user sessions
  ├─ calls Valhalla and enriches matches from Overpass
  ├─ serves the static production bundle
  ├─ owns MongoDB lifecycle and readiness
  └─ initializes saved-track, S3, enrichment-cache, and application configuration adapters
              │
MongoDB (users, sessions, compact track metadata, and enrichment cache)
S3 (original GPX files, detailed analysis JSON, and optional static list previews)
```

At startup the backend creates the `configuration` collection entry keyed by
`userTiers` when it is missing, then loads that entry into memory once. Configuration
changes take effect only after an application restart. New users receive the `BASIC`
tier; users whose older records omit `tier` are also treated as `BASIC`.

The optional `configuration` entry keyed by `homepageTrackIds` contains exactly three
unique track ID strings. Their array order controls both the homepage example list and
the featured route at the top (the first ID is featured). When this entry is absent,
the homepage uses the first three tracks by ascending `createdAt`, with `_id` as the
stable tie-breaker. With the optional homepage track cache enabled, this setting is
reread on every hourly refresh; otherwise changes require an application restart.

`HOMEPAGE_TRACK_CACHE_ENABLED=true` keeps the complete homepage tracks API payload in
process memory. The backend attempts to fill it at startup and refreshes it one hour
after each completed attempt. A failed refresh is logged and preserves the last good
payload. If startup loading fails, requests read the database until one succeeds and
fills the cache. Unset or `false` leaves the per-request database behavior in place.

Track documents keep MongoDB `_id` values for persistence and configuration references.
Public track URLs use the separately indexed `publicId`; changing the generation format
does not invalidate ids already stored on tracks.
Existing track records are recreated rather than migrated to the S3 schema. Public
access uses `publicId`.

Authenticated uploads are parsed and analysed by the backend. It stores owner-bound track metadata, one point-free result and one processing state in MongoDB, with immutable source/analysis revisions in S3. The track page shows aggregate metrics, road distributions, and terrain lists from MongoDB before fetching authorized S3 analysis for map geometry and the elevation chart. A shared 24-hour enrichment cache keeps successful Valhalla checkpoints and fully enriched OpenStreetMap results. MongoDB also stores Google-linked users and hashed opaque sessions; Google OAuth tokens are discarded after profile lookup.

The production process fails startup when MongoDB configuration or connectivity is absent. Liveness deliberately avoids dependencies; readiness performs a MongoDB ping so an orchestrator can stop routing traffic to an unhealthy instance.

Website presentation configuration is served by `site/client-configuration.js`
directly in the HTML in both production and Vite. A non-executable JSON script
exposes only explicitly supported booleans from the startup environment; the
client reads it without a separate request. Production HTML uses
`Cache-Control: private, no-store`, and the executable-script CSP stays unchanged. Changing these settings
requires a server restart and page reload, without rebuilding the client.

External Valhalla/Overpass endpoints are availability dependencies and community services by default. Production should use explicitly provisioned endpoints with understood usage limits.

## Public HTTP API

The browser is a client of `/api/v1`, using `src/client/track-api.js`. The shared
track service, processors and repositories are unversioned. The v1 HTTP adapter in
`src/backend/api/v1/` owns relative routes, request validation, OpenAPI and response
field selection. Explicit schema projection prevents internal fields from leaking
when stored route data or service result objects evolve. S3 analysis is projected at write time using the shared canonical track-data model and remains a
streamed, versioned data representation; its schema is checked against real analysis
outputs, without buffering streams to serialize them in the HTTP adapter.

`src/backend/api/router.js` composes the same version router in production and Vite.
It applies same-origin browser access policy before session refresh, then normalizes
JSON errors, unknown API paths and unsupported versions. Supported API methods are
independent of website routing. `/auth/*` and `/homepage` live in `src/backend/site/`;
they are not part of public OpenAPI. Session lookup/renewal remains shared with the
site and is passed into the API as middleware; no token flow exists yet.

`/api/docs` (Scalar) and `/api/swagger` use `/api/v1/openapi.json` and local assets.
Neither requires login to read. Protected operations still need the website's
HttpOnly cookie. Documentation has a scoped CSP and no external proxy or validator.
See [public API v1](specs/public-api-v1.md) for the compatibility and phase policy.

Static list previews use a pluggable backend adapter in `track-previews/`, selected
at startup by `TRACK_PREVIEW_PROVIDER`. Provider credentials remain server-side.
`site/track-preview-routes.js` exposes authenticated website configuration and image
delivery, independently of API v1 and the analysis/metadata read boundary. PNGs and
their internal S3 references follow the result revision lifecycle; see [tracks](tracks.md).

`site/social-metadata.js` injects localized Open Graph/Twitter metadata into the
initial production and Vite HTML. Public sharing PNGs use centralized track reads,
with lazy S3 generation in the existing preview service. Only JSON translation
catalogs cross into server metadata formatting; browser modules do not run there.
