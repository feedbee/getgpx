# Architecture

GetGPX is a GPX analysis application with a browser client and a Node.js backend.

`client` and `backend` are separate because they execute in different trust zones. The browser owns interaction and rendering; the backend owns authoritative GPX analysis, secrets, MongoDB, validation, and controlled access to external services. They are both application source code, so both live under `src/`.

```text
Browser (Vite bundle)
  ├─ renders saved route metrics and analysis
  └─ renders Leaflet map and elevation analysis
              │
Node.js / Express
  ├─ validates and analyses uploaded GPX files
  ├─ completes Google OAuth and owns opaque user sessions
  ├─ calls Valhalla and enriches matches from Overpass
  ├─ serves the static production bundle
  ├─ owns MongoDB lifecycle and readiness
  └─ initializes saved-track, GridFS, enrichment-cache, and application configuration persistence
              │
MongoDB (users, sessions, tracks, GPX GridFS files, and enrichment cache)
```

At startup the backend creates the `configuration` collection entry keyed by
`userTiers` when it is missing, then loads that entry into memory once. Configuration
changes take effect only after an application restart. New users receive the `BASIC`
tier; users whose older records omit `tier` are also treated as `BASIC`.

The optional `configuration` entry keyed by `homepageTrackIds` contains exactly three
unique track ID strings. Their array order controls both the homepage example list and
the featured route at the top (the first ID is featured). When this entry is absent,
the homepage uses the first three tracks by ascending `createdAt`, with `_id` as the
stable tie-breaker. Like other startup configuration, changes require an application
restart.

Track documents keep MongoDB `_id` values for persistence and configuration references.
Public track URLs use the separately indexed `publicId`; changing the generation format
does not invalidate ids already stored on tracks.
Unmigrated records can still be opened through their legacy MongoDB id during a rolling
deployment, but migrated records are addressed only by `publicId`.

Authenticated uploads are parsed and analysed by the backend, which stores owner-bound track records and source GPX files through MongoDB GridFS. Public track views read the persisted analysis, while a shared 30-day enrichment cache keeps successful Valhalla checkpoints and fully enriched OpenStreetMap results. MongoDB also stores Google-linked users and hashed opaque sessions; Google OAuth tokens are discarded after profile lookup.

The production process fails startup when MongoDB configuration or connectivity is absent. Liveness deliberately avoids dependencies; readiness performs a MongoDB ping so an orchestrator can stop routing traffic to an unhealthy instance.

External Valhalla/Overpass endpoints are availability dependencies and community services by default. Production should use explicitly provisioned endpoints with understood usage limits.
