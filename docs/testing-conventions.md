# Testing conventions

`npm run test:fast` is the default feedback suite and runs `tests/unit/`. It contains pure unit and in-process component tests and must not require network, databases, credentials, or open ports. Tests live outside production code and mirror its `client` and `backend` boundaries.

`npm run test:integration` runs `tests/integration/`. MongoDB contracts require
`MONGODB_URI` and run against a real isolated MongoDB server; those tests are skipped
without the variable. The S3 object adapter contract uses the actual AWS SDK against
a local HTTP test endpoint to verify upload, read, copy, and delete requests without
AWS credentials. CI supplies an isolated MongoDB service. Add indexes and conditional
repository behavior here as persistence evolves.

`npm run check` is the canonical local and CI quality gate: lint, fast tests, then build. Tests should assert observable results and persisted state, not private call order. External Valhalla/Overpass smoke tests are not part of PR CI because those services are rate-limited and non-deterministic.
