# Operations

## Local and container execution

`docker compose up --build` runs the production image and MongoDB 8 with a persistent named volume. This unauthenticated MongoDB is for local development only and is not published to the host. Production must use a protected managed/self-hosted MongoDB URI supplied by the deployment secret store.

The devcontainer uses Node.js 22 and a private MongoDB sidecar. The production image runs as the unprivileged `node` user and exposes port 3000.

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

Docker Hub publication requires repository variable `DOCKERHUB_IMAGE` (for example `namespace/track-hub`) and secrets `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`. The workflow publishes immutable full-version and major/minor tags, not `latest`. It currently targets `linux/amd64`; add arm64 only after the image and dependencies are verified there.

## Observability and recovery

Probe `/health/live` for process restarts and `/health/ready` for traffic routing. Capture structured request/error telemetry before public launch. Roll back by deploying a previous immutable image tag; database schema changes must remain backward-compatible across one deployment window.
