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

Track work is split into route/controller, service/domain, and repository layers. Ownership checks belong in the service boundary and every saved track must carry an immutable owner identifier. Do not expose raw MongoDB documents or accept client-provided query operators.

- `src/backend/track-object-store.js` and `s3-track-persistence.js`: S3 adapter and persistence wiring.
- `src/backend/s3-track-repository.js`: compact MongoDB track state and processing leases.
- `src/backend/s3-track-processor.js`: background analysis and publication.
- `src/backend/s3-track-service.js`: track operations and storage coordination; `s3-track-presenters.js` builds API responses.
- `src/client/app-shell.js`: page markup; `track-api.js`: browser track requests; `track-upload-flow.js`: upload and processing state; `track-collection.js`: library and favorites lists. `main.js` owns page composition and remaining interaction wiring.
- `src/backend/track-internal-router.js`: nginx-mode signing handoff mounted on the application listener; Nginx blocks direct external access.
