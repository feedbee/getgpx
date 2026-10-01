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

MongoDB stores ownership, title, processing state, object keys, editable fields,
source point count, coordinate previews, and canonical route data. Route data consists
of metrics, distributions, climbs, descents and POIs, without route points. The same
projector writes these data shapes into the S3 analysis document. Labels, colors and
drawing indexes are supplied by the client. Publishing a revision updates MongoDB
atomically after the analysis object is written. Initial failure can retain a partial
diagnostic analysis; failed replacements preserve the active revision. Successful
Valhalla analysis with failed OpenStreetMap enrichment remains available with partial
provenance and a retry action.

The upload limit is 25 MiB and the route-point limit is 100,000. Base GPX metrics
are calculated from all accepted points. Douglas–Peucker selects at most 10,000
points for provider enrichment, detailed geometry, grades, climbs, descents, and
persisted analysis. Existing Valhalla/elevation/Overpass request behavior is retained.
Previews use a separate Douglas–Peucker selection from the original accepted points,
before the 10,000-point analysis selection and provider enrichment. This preserves
characteristic turns that detailed analysis may omit. Preview points are capped by
`TRACK_PREVIEW_MAX_POINTS` (default 200), as geographic coordinates; the client draws them with the route's aspect ratio.

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

## API and website

The complete contract is [API v1](specs/public-api-v1.md) and its linked OpenAPI.
Track metadata comes from `GET /api/v1/tracks/:id`; detailed route points come from
`GET /api/v1/tracks/:id/analysis`. Metadata exposes metrics, distributions, climbs,
descents, POIs, processing, revision, author, analysis URL and a downloadURL object keyed by file format, without a duplicate
summary wrapper. `/analysis` is streamed directly from S3. It includes `sourceName`
from GPX or the original filename, separate from the editable metadata title.

The page renders title, route type, metrics, distributions, terrain lists, POIs and
attribution from metadata. Map, elevation profile, selection and highlighting use
separately loaded analysis. If analysis fails, metadata stays visible and the map
and chart show localized errors. Shared fields have identical transport types; the
client derives display categories and indexes into detailed geometry.

Owner controls use the owner-only `/status` resource alongside public metadata.
Editing uses a partial PATCH; omitted fields stay unchanged. List cards use the
same metrics and processing models, drawing geographic previews locally. Source
GPX uses GET and PUT on `/gpx`. Bulk deletion uses POST `/tracks/deletions` and
`/tracks/saved/deletions`. Single deletion uses DELETE and succeeds on repeats.
The homepage is served by `/homepage`.

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
