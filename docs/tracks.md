# Saved tracks

## Objective

Turn the single-track proof of concept into a multi-track application. An authenticated
user can upload, process, list, edit, download, retry analysis for, and permanently
delete their own GPX tracks. Any successfully created track is public to anyone who
has its `/tracks/:id` link; there is no public catalogue.

The upload control is visible only to authenticated users. The existing `Replace GPX`
control disappears from the track page and file replacement moves into the owner-only
edit flow. The user menu links to `/my-tracks`.

## User experience and routes

- `/` is a lightweight entry page. Its final content is intentionally deferred; for
  the MVP it may explain the product and offer sign-in.
- `/my-tracks` requires authentication and shows only the current user's tracks,
  newest first. It has upload and name-search controls.
- `/tracks/:id` is publicly readable after initial processing succeeds. Owner-only
  edit, retry, and delete actions are shown when appropriate. Failed analysis still
  has a public page containing every successfully derived GPX metric and a clear
  provenance level: GPX only, GPX + Valhalla, or GPX + Valhalla + OpenStreetMap.
- Upload shows blocking progress while GPX parsing and enrichment run. Success opens
  the new track and shows a confirmation toast.
- Failed external enrichment keeps the uploaded track with `analysisStatus: failed`.
  Its owner can retry; its original GPX remains publicly downloadable by id, while
  the analysis page is not considered successfully published until analysis succeeds.
- Track cards show name, upload date, core metrics, and a normalized route-line SVG
  preview without a map layer. A map-backed preview is a later enhancement.

## Data and storage

Use a `tracks` collection for searchable metadata and derived analysis. Every track
has a schema version, immutable owner id, public Mongo ObjectId, original filename,
editable title, timestamps, analysis status/error, processing revision, effective
speed, metrics, normalized preview path, route points, and derived road, surface,
gradient, climb, and descent data. Named GPX waypoints are retained as points of
interest with their coordinates, type, and symbol so public track pages can render
them independently from reduced route geometry.

Metrics are calculated from every accepted source point. To stay below MongoDB's
16 MiB BSON document limit and keep browser rendering responsive, persisted display
geometry is uniformly reduced to at most 10,000 points while retaining the first and
last point; `sourcePointCount` records the original size.

Missing GPX elevations are represented as missing values rather than zero. During
external enrichment the backend fills only missing values from Valhalla's digital
elevation model, recalculates the elevation profile, ascent, and descent, and records
`elevationSource` so calculated terrain heights remain distinguishable from GPX data.
If the elevation lookup is unavailable, road enrichment continues and the UI omits
the incomplete profile instead of displaying a false flat line.

Store the original GPX in MongoDB GridFS and reference its file id from the track.
This avoids MongoDB's 16 MB document limit and prevents list/detail metadata reads
from loading the source file. S3-compatible object storage remains a future option;
the storage access must sit behind a backend adapter so it can be replaced.

Indexes:

- `{ ownerId: 1, createdAt: -1 }` for `/my-tracks` ordering.
- `{ ownerId: 1, normalizedName: 1, createdAt: -1 }` for owner-scoped name search.
- `{ analysisStatus: 1, updatedAt: 1 }` for retry/operations visibility.
- A unique GridFS/file reference where repository invariants require it.

Use a shared enrichment cache collection keyed by provider, request/schema version,
and normalized geographic input. Entries have `expiresAt` with a MongoDB TTL index;
the initial TTL is 30 days. Tracks retain their derived result after cache expiry.

## Processing rules

The backend, not the browser, becomes authoritative for parsing and derived values.
It validates GPX/XML, file size, point count, coordinates, and ownership, then performs
the existing calculations and external road/surface enrichment. Rendering consumes
persisted results and should not call enrichment providers during a normal page load.

The title comes from GPX `trk/name`, `rte/name`, or metadata name, then from the
original filename without its extension. Average/moving speed is calculated from
valid timestamps as today. If timestamps are insufficient, the deterministic initial
speed is 20 km/h. Editing speed recalculates estimated duration only; editing title
does no analysis. Replacing GPX keeps the track id and owner but creates a new
processing revision and recomputes all derived values atomically on success.

Initial safety limits are 25 MiB per source GPX and 500,000 route points. They support
representative 10–20 hour and multi-day routes and can be revisited with production
evidence.
The parser must be bounded and must not permit XML external entities.

## API outline

- `POST /api/tracks` — authenticated raw GPX stream; returns `202` and a track id
  after durable file storage, then processing continues asynchronously.
- `GET /api/tracks/mine?query=&cursor=` — authenticated owner list, newest first.
- `GET /api/tracks/:id` — public track at any processing outcome, including the
  deepest completed analysis and a human-readable provenance note.
- `PATCH /api/tracks/:id` — owner-only title and/or speed update.
- `PUT /api/tracks/:id/file` — owner-only GPX replacement and reprocessing.
- `POST /api/tracks/:id/retry-analysis` — owner-only retry after enrichment failure.
- `GET /api/tracks/:id/download` — public original GPX download with its filename.
- `DELETE /api/tracks/:id` — owner-only permanent deletion after UI confirmation.

The upload request uses `application/gpx+xml` and a percent-encoded `X-GPX-Filename`
header. `GET /api/tracks/:id/status` is owner-only and exposes the `QUEUED`, `PARSING`,
and `ENRICHING` phases for polling. The owner list uses an opaque cursor over
`(createdAt, _id)`, returns 24 items per page, and performs a case-insensitive
normalized substring search over the title.

## Delivery stages

Each stage starts with a short question round. No stage begins implementation until
its open decisions are answered.

1. **Track persistence foundation.** Define repository contracts, GridFS adapter,
   collection validation/indexes, ownership rules, limits, and integration tests.
2. **Upload and processing.** Move authoritative GPX analysis behind the backend,
   persist results, add caching and retryable failure state, and implement the upload
   spinner-to-track flow.
3. **Public track page.** Load `/tracks/:id` from stored analysis, remove `Replace GPX`,
   expose original-file download, and preserve the current visualization behavior.
4. **My Tracks.** Add the authenticated menu link and owner-only list with newest-first
   cursor pagination, name search, route previews, and upload entry point.
5. **Owner editing and deletion.** Add title/speed editing, duration recalculation,
   GPX replacement with stable id, analysis retry, and confirmed permanent deletion.
6. **Hardening and rollout.** Exercise large/multi-day GPX files, concurrent edits,
   provider failures, cleanup of orphaned GridFS files, performance, and documentation.

## Testing and commands

- Fast feedback and browser/backend behavior: `npm run test:fast`
- MongoDB, indexes, GridFS, TTL, and repository contracts: `npm run test:integration`
- Required quality gate for every change: `npm run check`

Tests live under `tests/` and mirror `src/client` and `src/backend`. External providers
are faked in deterministic tests; CI does not depend on live Valhalla or Overpass.

## Boundaries

- Always validate untrusted GPX and API input, scope mutations to the session owner,
  keep immutable ownership, and clean up files when a write fails.
- Ask before adding dependencies, changing provisional upload limits, changing public
  visibility/download behavior, or switching from synchronous to queued processing.
- Never expose arbitrary MongoDB queries, OAuth/session secrets, raw provider errors,
  private user data, or GPX contents in logs.

## MVP success criteria

- Guests cannot see upload controls or mutate tracks, but can open a successful track
  by id and download its original GPX.
- A signed-in user can upload a representative 10–20 hour or multi-day GPX, wait for
  processing, and land on the persisted track without re-running enrichment on view.
- `/my-tracks` contains only the current user's tracks, newest first, searchable by
  name, with a route preview on every card.
- Owners can rename, change speed, replace GPX without changing the URL, retry failed
  analysis, and permanently delete after confirmation.
- Provider failure preserves a retryable owner-visible record; persistence and cache
  indexes are covered by the integration suite.

## Deferred

- Private/unlisted visibility modes and sharing permissions.
- A public track catalogue, social saving, and collaborative editing.
- Map-tile previews, S3/CDN storage, background job infrastructure, and processing
  progress finer than an indeterminate spinner.
- Final product design for `/`.

## Stage 4 decisions

`/my-tracks` is one reverse-chronological list containing ready, processing, and
failed tracks with clear status badges. Pages contain 24 tracks and use cursor
pagination. Search is a case-insensitive substring match on the normalized title.
Cards show the route preview, title, upload date, distance, ascent, estimated time,
analysis status, and public GPX download action.

## Stage 5 decisions

Editable titles contain 1–200 normalized characters. Manual cycling speed is limited
to 1–50 km/h and changes estimated duration without rerunning route analysis. GPX
replacement keeps the existing public file, title, and analysis available while a
pending revision is processed; the new file and all derived data become active in a
single atomic commit only after successful processing. A failed pending revision can
be replaced again, while failed external enrichment can be retried from that step.
Deletion is permanent after an explicit browser confirmation and removes active and
pending GridFS files.

## Stage 6 decisions

External enrichment has a 50-second shared execution budget, leaving roughly ten
seconds for persistence and response handling inside a one-minute operational window.
If Valhalla finishes before that budget but the subsequent Overpass lookup does not,
the Valhalla road match is retained as a successful partial enrichment and the UI
labels the missing detailed OpenStreetMap tags. A successful Valhalla match is cached
as a resumable checkpoint, but an Overpass timeout or HTTP/server failure is never
treated as a completed cache result: the owner can retry the unavailable source from
the compact source-status popover opened by the question-mark icon beside the track
information heading, retrying only the missing enrichment. The GPX replacement control
lives inside the owner edit dialog rather than in the primary track actions.
GridFS cleanup happens as part of the mutation that removes a reference: successful
replacement removes the previous source, superseding a failed replacement removes
its pending source, and track deletion removes active and pending sources. Dedicated
load checks cover GPX inputs with 50,000 and 490,000 source points.
