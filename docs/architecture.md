# Architecture

Track Hub is a browser-first GPX analysis application with a small Node.js backend.

`client` and `backend` are separate because they execute in different trust zones. The browser owns interaction and local GPX analysis; the backend owns secrets, MongoDB, validation, and controlled access to external services. They are both application source code, so both live under `src/`.

```text
Browser (Vite bundle)
  ├─ parses GPX and computes route metrics locally
  ├─ renders Leaflet map and elevation analysis
  └─ POST /api/surface-match
              │
Node.js / Express
  ├─ validates bounded coordinate input
  ├─ calls Valhalla and enriches matches from Overpass
  ├─ serves the static production bundle
  └─ owns MongoDB lifecycle and readiness
              │
MongoDB (future users and saved tracks)
```

GPX content currently remains in browser memory. The API receives only coordinates needed for road matching; it does not persist tracks yet. MongoDB is connected now to establish deployable infrastructure, health semantics, and a tested adapter before account and track schemas are designed.

The production process fails startup when MongoDB configuration or connectivity is absent. Liveness deliberately avoids dependencies; readiness performs a MongoDB ping so an orchestrator can stop routing traffic to an unhealthy instance.

External Valhalla/Overpass endpoints are availability dependencies and community services by default. Production should use explicitly provisioned endpoints with understood usage limits.
