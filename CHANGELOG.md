# Changelog

All notable user-facing and operator-facing changes are recorded here. Versions follow Semantic Versioning; release notes are derived from the matching version section.

## [Unreleased]

### Added

- Production Node.js runtime with liveness/readiness endpoints and security headers.
- MongoDB connection lifecycle and infrastructure integration test.
- Docker, devcontainer, CI quality gates, dependency updates, and tag-triggered Docker Hub publishing.
- Project onboarding, architecture, testing, operations, and production-readiness documentation.

### Changed

- Renamed the npm package from the PoC identifier to `track-hub`.
- Routed all road-enrichment calls through the server instead of calling Overpass from the browser.
