# Testing conventions

`npm run test:fast` is the default feedback suite and runs `tests/unit/`. It contains pure unit and in-process component tests and must not require network, databases, credentials, or open ports. Tests live outside production code and mirror its `client` and `backend` boundaries.

`npm run test:integration` runs the database contract in `tests/integration/`, proves the MongoDB adapter against a real server, and requires `MONGODB_URI`. CI supplies an isolated MongoDB service. Add database indexes, repository behavior, and migration/compatibility checks to this suite as persistence evolves.

`npm run check` is the canonical local and CI quality gate: lint, fast tests, then build. Tests should assert observable results and persisted state, not private call order. External Valhalla/Overpass smoke tests are not part of PR CI because those services are rate-limited and non-deterministic.
