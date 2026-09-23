# Changelog

All notable user-facing and operator-facing changes are recorded here. Versions follow Semantic Versioning; release notes are derived from the matching version section.

## [Unreleased]

### Changed

- Docker Hub release builds now update `latest` alongside the version tags for both supported platforms.

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
