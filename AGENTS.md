# Agent guide

- Use Node.js 22+ and `npm ci`; preserve `package-lock.json`.
- Run `npm run check` for every change. Run `npm run test:integration` when database wiring changes.
- If you create a temporary MongoDB database for development or testing, give it a unique, clearly test-only name and drop that exact database when finished, including after test failures (for example, in `finally` or `afterAll`). Never drop a configured application database or another developer's database; verify the target before cleanup.
- Keep browser/domain code in `src/client`; keep external services and persistence behind `src/backend` adapters.
- Keep all tests under `tests/`, mirroring the source boundary; do not colocate tests with production files.
- Do not commit `.env`, credentials, GPX user data, or generated `dist/` output.
- Treat `docs/` living documents as current truth; treat `docs/changes/` files as immutable historical context.
- When adding, removing, or changing a supported environment variable, update the table in `docs/environment-variables.md` in the same change, including its default, requirement condition, and behavior. Keep `.env.example` aligned.
- Read [docs/README.md](docs/README.md), especially architecture and testing conventions, before changing boundaries.
- For every new or changed user-facing string, follow [docs/localization.md](docs/localization.md): update all registered language catalogs in the same change, localize formatting and units, and run the catalog check included in `npm run check`.

- Preserve the track read boundary: `GET /api/v1/tracks/:id` returns point-free metadata from MongoDB; `GET /api/v1/tracks/:id/analysis` delivers detailed analysis with geometry from S3. The site loads these separately. Do not reintroduce `include=geometry` or embed detailed analysis in metadata responses. See [docs/tracks.md](docs/tracks.md).
- Treat `/api/v1` as a stable public contract. Any intentional contract change needs explicit user approval. Breaking changes require a new major API version and an approved migration plan; application versions do not change API versions. Keep `src/backend/api/v1/openapi.json`, documentation and contract tests in sync. Never update `tests/contracts/api-v1.sha256` just to silence a test: it records the reviewed contract. See [docs/specs/public-api-v1.md](docs/specs/public-api-v1.md).
- Keep version-specific HTTP routes and response shaping under `src/backend/api/v1/`; keep website-only authentication and homepage routes under `src/backend/site/`. Services and persistence remain shared. Preserve the same API composition in production and Vite.
