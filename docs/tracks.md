# Saved tracks

## Current behavior and ownership

Authenticated users can upload, list, search, edit, replace, retry, and delete their
own tracks. A track with a public ID can be opened and its GPX downloaded by anyone
with the link. `/my-tracks` shows the owner's tracks, newest first, with name search
and 24-item cursor pagination. `/favorite-tracks` shows saved public tracks, including
the user's own tracks, with author information. Mutations require ownership.

Every track has an immutable MongoDB `_id` for storage and a separate public ID for
URLs. Users have BASIC/PREMIUM track quotas from startup-loaded configuration. Basic
track information and card previews come from MongoDB without S3 reads.

## Storage and processing

The source GPX and analysis are stored under revisioned keys in a private S3 bucket:

```text
<TRACK_S3_PREFIX>/tracks/<internal-track-id>/<revision>/source.gpx
<TRACK_S3_PREFIX>/tracks/<internal-track-id>/<revision>/analysis.json
```

MongoDB stores ownership, title, status, object keys, editable fields, basic metrics,
source point count, provenance, compact previews, and an active-revision `summary`.
The summary contains canonical route/elevation metrics, category IDs with distances
and percentages, climbs and descents with display metrics, POI names/types and
nearest route distances, and source/completeness status. It contains no route-point
array or map geometry. It is built from the
completed analysis and published with the active revision in one conditional MongoDB
update. A diagnostic failure may have its own clearly separate summary. It does not store the full
analysis or route-point arrays. A source upload completes before the processing
record is inserted. The analysis object completes before the MongoDB record becomes
READY. An initial failure can retain a diagnostic partial analysis with a clear
FAILED state. After a successful Valhalla result, an unavailable Overpass result can
still be READY with partial provenance and a retry action.

The upload limit is 25 MiB and the route-point limit is 100,000. Base GPX metrics
are calculated from all accepted points. Douglas–Peucker selects at most 10,000
points for provider enrichment, detailed geometry, grades, climbs, descents, and
persisted analysis. Existing Valhalla/elevation/Overpass request behavior is retained.
Previews use a separate Douglas–Peucker selection from the original accepted points,
before the 10,000-point analysis selection and provider enrichment. This preserves
characteristic turns that detailed analysis may omit. Preview points are capped by
`TRACK_PREVIEW_MAX_POINTS` (default 200), preserving the route's aspect ratio.

Replacement and retry use new object revisions. The old active GPX, basic metrics,
and analysis remain available until the new analysis is fully written and a single
conditional MongoDB update publishes it. A failed replacement leaves the active
version unchanged. In-process workers use an expiring MongoDB lease; the owner may
retry an interrupted attempt. MongoDB removal precedes best-effort S3 deletion;
orphan objects after a failure are possible and are not swept automatically.

Replacing a GPX changes the source file and derived route data while retaining the
track's editable title, speed, route type, and external links. Duration is recalculated
from the new route distance and retained speed. Initial uploads still use the GPX
title and calculated speed until the owner edits them.

## API

- `POST /api/tracks`: authenticated raw GPX upload; 202 after durable source storage
  and MongoDB insertion. Upload headers and quota rules remain as before.
- `GET /api/tracks/mine`, `GET /api/tracks/saved`, `GET /api/tracks/homepage`: compact
  MongoDB-backed lists. The featured homepage track has an `analysisUrl` rather than
  embedded analysis.
- `GET /api/tracks/:id`: public basic information and the complete point-free
  `summary`, including height extrema, surface/road/quality distributions, climbs,
  descents, POI metadata and route distances, current revision, analysisUrl, and
  downloadUrl. No S3 read is required.
- `GET /api/tracks/:id/analysis`: current active detailed JSON, or completed partial
  diagnostic JSON when no active version exists. The client does not choose a revision.

The track page renders its title, route type, metrics, elevation summary, road and
surface distributions, climbs, descents, POI list, attribution, and download action
as soon as the MongoDB-backed basic response arrives. Map, elevation chart, POI
placement and selection, and segment highlighting wait for the separate analysis response. Their controls remain
disabled while waiting. If analysis delivery fails, the summary stays visible and
the map/chart show localized errors. Existing track records are recreated; no legacy
summary fallback or backfill is provided.
- `GET /api/tracks/:id/download`: current active source GPX, or the initial source
  before first publication. The original bytes and safe filename are retained.
- `GET /api/tracks/:id/status`, `GET /api/tracks/:id/manage`: owner-only processing,
  retry, and editing information.
- `PATCH /api/tracks/:id`: owner-only title, route type, speed, and external links;
  updates compact MongoDB fields without rewriting S3 objects.
- `PUT /api/tracks/:id/file`, `POST /api/tracks/:id/retry-analysis`: owner-only new
  processing revision. Live concurrent attempts conflict.
- `DELETE /api/tracks/:id`, `DELETE /api/tracks`: owner-only, MongoDB-first deletion;
  repeat single-track deletion succeeds.
- Saved-track add/remove endpoints remain owner-session scoped.

The same public file URLs work in development and production. `TRACK_FILE_DELIVERY=stream`
(default) streams S3 data through Node and works through Vite without Nginx.
`TRACK_FILE_DELIVERY=nginx` makes Node authorize and expose a short-lived signed
CloudFront URL through an internal route on the same application listener for Nginx
to consume. The signed viewer path omits `TRACK_S3_PREFIX` because the CloudFront
origin path supplies it for S3; the public Node file route does not reveal the URL. Nginx must block
direct browser access to `/internal/`. The Nginx and AWS infrastructure is managed separately.
Read authorization is centralized so a future private-track policy can keep these URLs.

## Verification

Use `npm run check` for every change. Use `npm run test:integration` with an isolated
`MONGODB_URI` for persistence changes, and `npm run test:performance` for large GPX
changes. Unit and integration tests live under `tests/`, mirroring source boundaries.
The [S3 track specification](specs/track-s3-storage.md) contains the full contracts,
failure cases, and acceptance matrix.
