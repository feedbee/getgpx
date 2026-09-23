# Operations

## Local and container execution

`docker compose up --build` runs the production image and MongoDB 8 with a persistent named volume. This unauthenticated MongoDB is for local development only and is not published to the host. Production must use a protected managed/self-hosted MongoDB URI supplied by the deployment secret store.

The devcontainer uses Node.js 22 and a private MongoDB sidecar. The production image runs as the unprivileged `node` user and exposes port 3000.

Road matching splits tracks at `VALHALLA_MAX_SEGMENT_KM` (default 200 km). Up to two
segments run concurrently. Requests to the public `valhalla*.openstreetmap.de`
service start at least one second apart across this process, including elevation
requests, to respect its published per-user rate limit. A configured private
`VALHALLA_URL` has no start delay; provision its capacity accordingly. All requests
still share the 50-second analysis budget.

## CI and repository setup

The quality workflow runs on pull requests, `main`, and manual dispatch. Configure branch protection to require both `check` and `mongodb-integration`, at least one approving review, and a current branch before merge.

Dependabot proposes weekly npm, GitHub Actions, and Docker updates. Review lockfile changes; do not auto-merge major updates.

## Releases

The authoritative version is `package.json` (with `package-lock.json` synchronized by `npm version`). Before tagging:

1. Move relevant `CHANGELOG.md` entries from Unreleased to the target version/date.
2. Run `npm version MAJOR.MINOR.PATCH --no-git-tag-version`.
3. Run `npm ci && npm run check && npm run test:integration` against MongoDB.
4. Build and smoke-test the Docker image.
5. Commit the version and changelog, then create and push `vMAJOR.MINOR.PATCH` only after review.

Docker Hub publication requires repository variable `DOCKERHUB_IMAGE` (for example `namespace/getgpx`) and secrets `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`. The workflow publishes full-version, major/minor, and `latest` tags for `linux/amd64` and `linux/arm64`. `latest` points to the most recently published release build; rerunning an older release can move it backward. The major/minor tag moves when a new patch release is published. Deploy by full-version tag or digest to pin a release.

To point `latest` at an already published multi-platform release without rebuilding, sign in to Docker Hub and copy its image index:

```bash
docker buildx imagetools create --tag namespace/getgpx:latest namespace/getgpx:MAJOR.MINOR.PATCH
docker buildx imagetools inspect namespace/getgpx:latest
```

## Observability and recovery

Probe `/health/live` for process restarts and `/health/ready` for traffic routing. Capture structured request/error telemetry before public launch. Roll back by deploying a previous immutable image tag; database schema changes must remain backward-compatible across one deployment window.

The backend writes newline-delimited JSON logs to stdout with Pino, including when its API middleware runs inside Vite via `npm run dev`. `LOG_LEVEL` controls the minimum severity (`warn` by default; set `info` for ordinary requests or `debug` for temporary diagnosis). In Vite development, set it in `.env` or the shell; `npm start` reads `.env` through Node. HTTP logs contain a generated `requestId`, method, pathname without query parameters, route template when available, status, and `durationMs` in milliseconds; health request logs are omitted. Unexpected errors and track-analysis failures produce separate events at `error` or `warn`. Query parameters, headers, GPX contents, and OAuth or session values must not be added to log fields. Collect, retain, and search stdout logs outside the application container.

At `LOG_LEVEL=debug`, the homepage tracks, public track, and GPX upload API requests also log individual server steps with `step`, `durationMs`, and the same `requestId`. These timers are inactive at higher log levels. The measurements cover server work only; browser rendering and network transfer require browser tools.
