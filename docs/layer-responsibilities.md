# Layer responsibilities

- `src/client/`: browser entrypoint and presentation. It may use DOM and browser APIs but never database credentials.
- `src/client/domain/`: GPX parsing and route calculations. Keep these functions independent from DOM and persistence.
- `src/backend/app.js`: HTTP composition, security policy, health, static serving, and API registration.
- `src/backend/middleware.js`: HTTP boundary for road matching, including request size and status mapping.
- `src/backend/valhalla.js`: external road-service adapters and response normalization.
- `src/backend/database.js`: MongoDB client lifecycle. Future repositories should receive a database/collection rather than importing a global client.
- `src/backend/auth*.js`: Google OAuth boundary, validated public user contract, cookies, and HTTP routes.
- `src/backend/*-repository.js`: persistence for users and hashed server-side sessions.
- `tests/unit/`: fast tests mirroring client/backend source boundaries.
- `tests/integration/`: tests that require MongoDB or other real infrastructure.
- `docs/changes/`: historical design context, not living architecture.

Future user and track work should be split into route/controller, service/domain, and repository layers. Ownership checks belong in the service boundary and every saved track must carry an immutable owner identifier. Do not expose raw MongoDB documents or accept client-provided query operators.
