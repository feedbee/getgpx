# Changelog

All notable user-facing and operator-facing changes are recorded here. Versions follow Semantic Versioning; release notes are derived from the matching version section.

## [Unreleased]

### Added

- Google SSO with persisted users, hashed server-side sessions, login/avatar/logout header controls, and setup documentation.
- Production Node.js runtime with liveness/readiness endpoints and security headers.
- MongoDB connection lifecycle and infrastructure integration test.
- Docker, devcontainer, CI quality gates, dependency updates, and tag-triggered Docker Hub publishing.
- Project onboarding, architecture, testing, operations, and production-readiness documentation.

### Changed

- Updated the development toolchain to ESLint 10 and Vite 8; the minimum supported Node.js version is now 22.13.
- Renamed the npm package from the PoC identifier to `track-hub`.
- Routed all road-enrichment calls through the server instead of calling Overpass from the browser.
- Renamed the project from **Track Hub** (`track-hub`) to **GetGPX** (`getgpx`): updated brand identity in the UI (logo mark, topbar label, page title, favicon), session/attempt cookie names, MongoDB default database name, and all documentation and configuration references.
