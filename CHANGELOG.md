# Changelog

All notable user-facing and operator-facing changes are recorded here. Versions follow Semantic Versioning; release notes are derived from the matching version section.

## [Unreleased]

## [0.4.0] - 2026-10-01

### Added

- Published the stable `/api/v1` contract with OpenAPI, Scalar and Swagger documentation at `/api/v1/openapi.json`, `/api/docs` and `/api/swagger`.
- Track metadata now exposes available download formats through `downloadURL`.

### Changed

- Track metadata and detailed geometry are separate resources. Metadata is served from MongoDB without route points; `/api/v1/tracks/:id/analysis` serves the detailed analysis from S3. The website loads them separately.
- Track processing uses one compact MongoDB result and processing model. Editing a track's title, route type, speed or links works as soon as parsing reaches enrichment, including while an upload is still processing.
- Valid sessions renew their cookie and database expiry on use. Road-enrichment cache entries now expire sooner.

### Fixed

- Processing dialogs distinguish new uploads, GPX replacements and retries, and reset stale editing and completion state between operations.
- Track publication preserves metadata edits made while analysis is running.

### Upgrade notes

- API clients should use the published OpenAPI v1 contract. `GET /api/v1/tracks/:id?include=geometry` is no longer supported; request `/api/v1/tracks/:id/analysis` separately. Download links are now grouped by format in `downloadURL`.
- The previous MongoDB track document format is unsupported. Reupload existing tracks to create the new S3-backed representation; no automatic migration is provided.
- If nginx delivers track files through CloudFront, deploy the updated proxy rules in [operations](docs/operations.md) alongside this version.

## [0.3.0] - 2026-09-30

### Added

- Versioned track API routes under `/api/v1/tracks`, including `GET /api/v1/tracks/:id?include=geometry` to return metadata and detailed geometry for the same track revision in one response.

### Changed

- Authentication routes now use `/auth`; the featured-track feed uses `/homepage`; GPX download and replacement use `/api/v1/tracks/:id/gpx`.
- Google OAuth token and profile requests now time out after ten seconds each.

### Fixed

- Replacing a GPX preserves the track's edited title, speed, route type, and external links, and recalculates duration from the new distance.
- Public track pages show an unavailable state if metadata loading fails.

### Upgrade notes

- Update clients and reverse-proxy rules to the new API paths. Register the new `/auth/google/callback` URL with Google and update `GOOGLE_REDIRECT_URI` before deploying.

## [0.2.3] - 2026-09-29

### Fixed

- Track owners can edit title, route type, external links, and speed while an initial upload is still processing. Edits remain intact when analysis finishes, including if publication races with an edit.

## [0.2.2] - 2026-09-29

### Fixed

- CloudFront track file links now sign the viewer URL path without the S3 origin prefix, so protected GPX and analysis downloads validate correctly.

## [0.2.1] - 2026-09-29

### Changed

- Starting the server or public-ID migration without a `.env` file no longer prints a missing-file notice; supplied environment variables continue to work without a file.
- MongoDB database selection now comes from the path in `MONGODB_URI`, defaulting to `getgpx` when no database is named. The separate `MONGODB_DATABASE` setting is no longer used.

### Fixed

- Track upload, replacement, S3 delivery, CloudFront handoff, background worker, and cleanup failures now include safe provider codes and HTTP status in server logs without exposing provider messages or user data.

### Upgrade notes

- If the deployment used `MONGODB_DATABASE` to select a database other than `getgpx`, append that name to `MONGODB_URI` before upgrading (for example, `mongodb://host:27017/mydb`).

## [0.2.0] - 2026-09-29

### Added

- Track source GPX files and analysis results are stored as immutable objects in S3, with MongoDB retaining track metadata and the active revision.
- Track pages load a compact summary before detailed map analysis, so basic track information appears sooner.

### Changed

- GPX downloads and track analysis delivery now use the configured S3 storage path. Streaming works without a reverse proxy; nginx and CloudFront delivery can be configured separately.

### Upgrade notes

- Configure `TRACK_S3_BUCKET` and `AWS_REGION` before starting the app. Production also requires `TRACK_S3_PREFIX=prod` and access to the S3 bucket. Existing MongoDB-only tracks are not migrated; recreate them in S3 before relying on them in this release. See `docs/operations.md` and `docs/specs/track-s3-storage.md`.

## [0.1.5] - 2026-09-23

### Changed

- Debug logs now include timing for individual server steps in homepage tracks, public track, and GPX upload requests, using the request ID to correlate them with the HTTP log. Step timing is enabled with `LOG_LEVEL=debug`.

## [0.1.4] - 2026-09-23

### Changed

- Pages and track actions now show loading feedback while data or saves are in progress.
- Backend logs now use structured JSON with request IDs and timing; routine request logging is available by setting `LOG_LEVEL=info`.
- The homepage tracks response can be cached per server process with hourly refresh by setting `HOMEPAGE_TRACK_CACHE_ENABLED=true`; caching is off by default.

## [0.1.3] - 2026-09-23

### Changed

- Long routes are split into bounded Valhalla requests, with limited parallel processing to improve analysis time while respecting public service rate limits.
- Track analysis failures are logged as warnings for easier diagnosis.

### Fixed

- The upload dialog button now uses the correct hover styling.

## [0.1.2] - 2026-09-23

### Changed

- Docker Hub release builds now update `latest` alongside the version tags for both supported platforms.

### Fixed

- Production images now include the favicon and brand assets from `public/`.
- OpenStreetMap tile requests now send the site's origin as referrer, and the production Content Security Policy allows the tile server.

## [0.1.1] - 2026-09-23

### Fixed

- Docker Hub releases now include both `linux/amd64` and `linux/arm64` images. The ARM64 image was built and smoke-tested against MongoDB.
- Release metadata no longer adds an unplanned `latest` tag. Use the full version tag to pin a deployment.

## [0.1.0] - 2026-09-23

### Added

- GPX upload and persistent track processing with distance, elevation, climbs, descents, road and surface analysis, points of interest, and synchronized map and elevation profile views.
- Google sign-in and a personal track collection with search, editing, GPX replacement and download, retry after failed analysis, and individual or bulk deletion.
- Public, shareable track pages and a configurable homepage featuring selected tracks.
- Favorite tracks for signed-in users, including a searchable collection and confirmed individual or bulk removal.
- Route types, external service links, track limits by user tier, and profile highlighting and color controls.
- Interface translations and browser preferences for language and measurement units.
- Production Node.js and MongoDB runtime with health endpoints, security headers, Docker image, CI checks, and tag-triggered Docker Hub publication workflow.

### Fixed

- Missing elevations in saved tracks, incorrect owner attribution, and layout issues in the homepage and track collection.
- Unknown public track links now show a 404 page instead of a demo route.
- Production container now includes the route-analysis modules required by the API at startup.

### Upgrade notes

- This is the first release; there is no earlier version to migrate from. Deployment requires MongoDB and Google OAuth configuration as described in `README.md`.
