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
- `src/backend/s3-track-repository.js`: MongoDB editable metadata, canonical result snapshots, processing leases and compact card projections.
- `src/backend/s3-track-processor.js`: background analysis and publication.
- `src/backend/s3-track-service.js`: track operations and storage coordination; `s3-track-presenters.js` builds API responses.
- `src/client/app-shell.js`: page markup; `track-api.js`: browser track requests; `track-upload-flow.js`: upload and processing state; `upload-interactions.js`: file input, dropzone, and upload dialog events; `track-collection.js`: library and favorites lists.
- `src/client/track-editor-ui.js`: track edit dialog, speed draft, and update action; `track-delete-ui.js`: single and bulk deletion dialogs and API action.
- `src/client/route-page-summary.js` and `route-summary-ui.js`: route header, analysis states, climbs, and surface summaries; `route-detail-ui.js`: ready route preparation, metrics, and detailed loading states; `elevation-profile.js`: elevation chart rendering and its visible metrics; `profile-interactions.js`: chart pointer and keyboard gestures; `profile-viewport.js`: visible range and zoom history; `route-map.js`: Leaflet route layers, markers, and range focus; `route-filters.js`: surface and terrain filter state and controls; `poi-controller.js`: POI list and selection; `active-route-point.js`: shared map and profile cursor. `main.js` owns page composition and remaining interaction wiring.
- `src/backend/track-file-delivery.js`: validates object paths and signs CloudFront URLs, returning only local X-Accel-Redirect URIs. The v1 handlers own access checks and HTTP response shaping.

## Versioned HTTP and website routes

- `src/backend/api/router.js`: version composition, access policy, documentation,
  session middleware integration, and consistent API errors.
- `src/backend/api/v1/track-handlers.js`: v1 request validation and HTTP status mapping.
- `src/backend/api/v1/router.js`, `routes.js`: relative route registration and 405 rules.
- `src/backend/api/v1/openapi.json`: public contract for every track operation.
- `src/backend/api/v1/serialization.js`: allowlisted JSON response fields, derived from
  that contract. Streams preserve the separately tested analysis/GPX representation.
- `src/backend/site/`: website-only Google sign-in/session routes and homepage feed.
- `src/backend/auth.js`: shared session/cookie primitives and Google authentication
  service; API handlers can consume an already resolved identity.
- `tests/unit/backend/api/`: contract validation, HTTP boundary and access-policy tests.
  `tests/contracts/api-v1.sha256` freezes the reviewed contract; approval is required
  before intentionally updating it.

- `src/backend/track-data.js` projects canonical route data for MongoDB and S3.
  `src/client/track-data.js` adapts transport fields into map/profile drawing models.
