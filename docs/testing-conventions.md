# Testing conventions

`npm run test:fast` is the default feedback suite and runs `tests/unit/`. It contains pure unit and in-process component tests and must not require network, databases, credentials, or open ports. Tests live outside production code and mirror its `client` and `backend` boundaries.

`npm run test:integration` runs `tests/integration/`. MongoDB contracts require
`MONGODB_URI` and run against a real isolated MongoDB server; those tests are skipped
without the variable. The S3 object adapter contract uses the actual AWS SDK against
a local HTTP test endpoint to verify upload, read, copy, and delete requests without
AWS credentials. CI supplies an isolated MongoDB service. Add indexes and conditional
repository behavior here as persistence evolves.

When manually testing against MongoDB in a development environment, create any
throwaway database under a unique, clearly test-only name. Record that name and
drop only that database after the run, even if the test fails. Automated tests
that create temporary databases should clean them up in `finally` or `afterAll`.
Never use a broad cleanup command against the configured application database or
databases owned by other runs.

`npm run check` is the canonical local and CI quality gate: lint, fast tests, then build. Tests should assert observable results and persisted state, not private call order. External Valhalla/Overpass smoke tests are not part of PR CI because those services are rate-limited and non-deterministic.
