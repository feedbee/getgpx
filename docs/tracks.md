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

## MongoDB document

Editable title, route type, links and selected speed are root fields. `result` holds
one PUBLISHED or DIAGNOSTIC revision with canonical point-free route data and object
references. `processing` holds the latest attempt outcome and temporary worker data.
Result data and processing are independent, so replacement failure leaves the
published route accessible. Source metrics remain unchanged by edits; API metrics
combine them with the selected speed. Card queries exclude large aggregate lists.

There are no duplicate root status/step or filename fields, provider classification,
metadata override copies, or separate active/diagnostic slots. The previous storage
format and GridFS adapters are unsupported; tracks are reuploaded.

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
same metrics and processing models. With `TRACK_PREVIEW_PROVIDER=none` (default),
they draw geographic previews locally. Mapbox mode uses a server-only preview adapter
(`src/backend/track-previews/`) to create 512×512 PNGs with the softly colored Streets basemap and a blue
route with a white outline. The route uses a 6 px stroke (#1769d2, matching the SVG preview) over a 15 px white
outline at the 256 px logical rendering size, rendered at double resolution
for smooth edges in small list cards. The provider contract is `render(previewCoordinates)`
returning a PNG buffer, plus a credential-free version and attribution links.
Adding another provider requires an adapter and registration in the factory; the
client and storage flow stay shared.

Preview images are stored alongside the current result under
`<TRACK_S3_PREFIX>/tracks/<internal-track-id>/<revision>/preview-<random-image-id>.png`.
MongoDB retains internal `result.previewImage` metadata: object key, provider, style,
renderer version, configuration fingerprint (`version`), source revision, dimensions,
format, attribution and creation time. Credentials are never persisted there.
Processing writes the PNG before atomically publishing the result. GPX replacement
and retry prepare a new image; title/speed edits do not require regeneration.
Provider failures do not block publication and leave SVG fallback previews usable.
Rendering is limited to four concurrent jobs.

HTTP reads never generate images. Changing provider/style affects subsequent
processing; existing images remain available until explicitly regenerated.
`npm run previews:regenerate` defaults to a dry run. Add `--apply` to generate
missing/outdated images, or `--apply --force` to rebuild all eligible images.
The command streams records sequentially, skips other S3 environments, and swaps
image references conditionally on the unchanged revision and previous image key.
It deletes the previous object only after a successful swap, and removes unpublished
candidates on a known conflict. Uncertain MongoDB acknowledgements may leave orphans.
See [operations](operations.md) for Docker execution and resumable batches.

`/track-previews/config` and `/track-previews/:publicId.png` are authenticated website
routes shared by production and Vite. `TRACK_FILE_DELIVERY=stream` streams stored
PNG objects through Node; `nginx` uses the existing signed CloudFront handoff and
internal Nginx proxy. No separate distribution is needed. Responses are private,
no-store; absent images return 204 and the client keeps the SVG fallback.
These routes and internal image references are outside the stable `/api/v1` contract.
Mapbox/OSM attribution appears once below the list, outside the images; these assets
are currently for list thumbnails, not social sharing.

Source GPX uses GET and PUT on `/gpx`. Bulk deletion uses POST `/tracks/deletions` and
`/tracks/saved/deletions`. Single deletion uses DELETE and succeeds on repeats.
The homepage is served by `/homepage`.

The same public file URLs work in development and production. `TRACK_FILE_DELIVERY=stream`
(default) streams S3 data through Node and works through Vite without Nginx.
`TRACK_FILE_DELIVERY=nginx` keeps access checks and JSON errors in the public Node
API. Ready files use a local `X-Accel-Redirect` to Nginx's internal-only
`/_track_files/` CloudFront proxy; their bodies do not pass through Node. Signed
viewer paths omit `TRACK_S3_PREFIX` because CloudFront's origin path supplies it.
The old internal signing endpoint is removed. Nginx and AWS infrastructure remain
separate; see [the infrastructure task](nginx-x-accel-handoff.md).
Read authorization is centralized so a future private-track policy can keep these URLs.

## Verification

Use `npm run check` for every change. Use `npm run test:integration` with an isolated
`MONGODB_URI` for persistence changes, and `npm run test:performance` for large GPX
changes. Unit and integration tests live under `tests/`, mirroring source boundaries.
The [S3 track specification](specs/track-s3-storage.md) contains the full contracts,
failure cases, and acceptance matrix.

The processing dialog distinguishes track creation, GPX replacement and reprocessing,
including their completion titles. Metadata editors appear once the owner status resource reports ENRICHING,
after parsing has extracted the source title, or READY. Edits persist immediately
and survive publication, processing failure and retry. Each operation resets previous editors, errors and completion
actions; each save sends only explicitly edited fields to avoid overwriting other metadata.

### Elevation coloring

The map and elevation profile each offer an independent Elevation color mode.
It blends absolute altitude (30%) with position within the full track altitude
range (70%), using a smooth blue-to-red palette. The relative contribution
reaches 70% at a 300 m range and decreases proportionally for smaller ranges
to avoid amplifying altitude noise. Flat tracks use absolute altitude only.
Sea level and lower stay blue; Everest (8,849 m) and higher stay red. The relative
range is clipped to these bounds. Low tracks stay cooler and high tracks warmer,
while local elevation changes gain contrast. Colors remain stable during zoom. The map interpolates colors along each edge, and the profile line and
ribbon use continuous gradients. The profile area always uses slope gradient
colors, just as in Surface, Road Type and Quality modes. Compact legend markers
show the track minimum and maximum with their actual colors and selected units.
Points without altitude use neutral gray.
