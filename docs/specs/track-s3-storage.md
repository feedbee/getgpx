# Track storage and delivery through S3

Status: accepted; application implementation present, infrastructure acceptance pending.
Updated: 2026-10-01.

This document defines the application behavior. The user's latest decisions
supersede the earlier drafts: accept at most 100,000 route points, retain the
10,000-point analysis cap with Douglas–Peucker selection, leave provider requests
unchanged, preserve partial results, support interrupted-job
retry, exclude infrastructure work, and expose current results without requiring
clients to select a revision. Current behavior is summarized in `docs/tracks.md`.
Do not edit `docs/changes/`.

## Objective and scope

Store original GPX files and detailed track analysis in S3.
Keep searchable metadata, basic numerical metrics, processing state, and compact
card previews in MongoDB. Lists and basic track information must work without S3
reads. The detailed page obtains basic information and detailed analysis in two
requests, using the same public API URLs in both environments:

- Development: Vite with the Node API middleware, without Nginx, using streaming.
- Production: Node authorization and an internal signed-URL handoff to Nginx;
  Nginx retrieves the object through CloudFront without its body passing through Node.

The application work includes storage/signing adapters, configuration validation,
processing and retry behavior, API contracts, client changes, and application tests.
Nginx configuration, AWS resources, IAM policies, infrastructure deployment, and
infrastructure provisioning instructions belong to a separate infrastructure task.
This specification defines the integration contract that task must implement.

Existing tracks will be recreated. Do not implement data migration, legacy file
fallback, or automatic deletion of existing records at startup. Removal of old
tracks/GridFS files and correction of saved-track relations/homepage configuration
are separate operational work. Do not delete users or sessions.

No orphan-object sweeper, revision-history UI, private-track feature, or external
job queue is included. No additional analysis-size or total-route-distance limit
is introduced. Existing public visibility and owner-only mutations remain.

## Data retention and provider requests

### Accepted source and authoritative analysis

Keep the existing 25 MiB GPX byte limit. Change the maximum accepted route-point
count to **100,000**. Accept exactly 100,000 points; reject larger tracks explicitly,
without silently truncating or sampling them. Check actual received bytes even if
Content-Length is absent or inaccurate. Count points during parsing rather than
building an unbounded intermediate route before checking the limit.

Byte validation precedes track creation. Point validation occurs during asynchronous
parsing after durable GPX storage; an excessive point count therefore leaves an
explicit FAILED track with a stable error code, rather than a partially accepted route.

### Analysis pipeline and the retained 10,000-point cap

Keep the existing pipeline order, changing only the source-point acceptance limit
and the selection algorithm:

1. Parse and validate the GPX (at most 100,000 route points and 25 MiB).
2. Calculate initial basic metrics from **all accepted source points**, as today.
3. Select at most **10,000 route points** using Douglas–Peucker instead of the
   existing uniform index sampling. Leave tracks of 10,000 points or fewer unchanged.
4. Enrich that selected geometry with elevation and road data through the existing
   provider adapters, without changing their request logic or limits.
5. Calculate gradients, climbs, descents, and detailed road/surface summaries on the
   selected, enriched geometry, then persist the complete resulting analysis in S3.

The 10,000-point cap reduces browser work and analysis size; it remains a fixed
analysis limit, separate from TRACK_PREVIEW_MAX_POINTS (default 200). “Complete
analysis” means the full result of this pipeline, including all selected points and
their extensions, not retention of every original point in analysis.json. The original
source.gpx always retains every uploaded byte. sourcePointCount records the original
accepted count. Named GPX waypoints remain separate POI data and are not reduced with
route geometry.

Use the same deterministic geometric simplification primitive as previews, with a
10,000-point budget for analysis and a separate configured budget for previews.
Increase tolerance until the budget is met, optionally refining it to retain more
useful detail. Preserve order, endpoints, characteristic turns, and the original
selected point objects (including elevation, timestamps, and cumulative fields).
Return source indexes or original points, not interpolated replacements or normalized
SVG coordinates. Uniform selection with endpoints is only the last-resort fallback;
it is deterministic, not random. Do not force exactly 10,000 points if fewer points
represent the shape at the chosen tolerance. Avoid unnecessarily coarse tolerance
that discards useful detail when the budget permits it.

Initial source-based metrics must not be recomputed merely because geometry was
simplified. Preserve existing later enrichment behavior, including its recalculation
when missing elevations are filled from Valhalla; redesigning metric formulas or
that recalculation is outside this change. Douglas–Peucker preserves plan-view
shape, not a guarantee of retaining every elevation extremum; do not introduce a
new elevation-aware selection algorithm in this scope.

### External services remain unchanged

Do not modify request construction, batching, provider sampling, concurrency, pacing,
endpoint settings, timeout budgets, response merging, or enrichment-cache granularity.
In particular, preserve the current Valhalla sampling to at most 2,000 points from
the selected analysis geometry followed by existing distance-based splitting
(default 200 km), the existing elevation request, and the existing Overpass request.
Do not add new per-request budgets, chunk checkpoints, or per-chunk retry logic.

A retry re-parses the stored source, performs the same deterministic selection, and
uses the existing enrichment cache/resumable provider behavior. Interrupted-job retry
still applies as defined below, but does not promise new fine-grained recovery inside
a provider call. Existing successful Valhalla checkpoints can still be reused when
retrying unavailable OpenStreetMap data.

## Storage layout and immutable revisions

Each successfully completed revision has two application objects:

```text
<TRACK_S3_PREFIX>/tracks/<internal-track-id>/<revision>/source.gpx
<TRACK_S3_PREFIX>/tracks/<internal-track-id>/<revision>/analysis.json
```

Generate the internal Mongo ObjectId before upload without inserting a document yet.
Public IDs remain separate and unchanged. Generate a unique server-side revision
token, such as a UUID, for every initial processing, replacement, and retry attempt.
Do not derive it solely from activeRevision + 1: failed or concurrent attempts must
never reuse an object key. Clients cannot supply storage keys.

source.gpx preserves the exact uploaded bytes. A retry copies its source into its
new revision before processing; it does not overwrite the active source or analysis.
All storage reads, writes, copies, deletes, and signing validate that their keys lie
within the configured prefix. Published objects are immutable.

A failed attempt with usable partial analysis writes a **completed diagnostic**
analysis.json with partial completeness. The current processing outcome is exposed by metadata. It is not a READY revision.
A parsing failure or failed JSON write may leave only source.gpx. A successful
PUT/completed multipart upload is sufficient; no subsequent HEAD verification is
required. Abort incomplete multipart uploads on failure when possible.

The analysis object follows the `AnalysisDocument` schema in API v1 OpenAPI:
`revision`, `sourceName`, `completeness`, `sources`, `metrics`, `distributions`,
`climbs`, `descents`, `pointsOfInterest` and `points`. The public representation is
formed before writing S3. GET delivery reads it unchanged. Shared route data uses
exactly the same types in MongoDB and S3, without UI labels, colors or point indexes.
Points use `elevationM` and `gradePercent`, and surface quality uses a category ID.

Use partial completeness for diagnostic results or missing optional enrichment.
Processing outcome belongs to metadata, while completeness describes coverage of
the stored revision. Header metrics come from metadata; analysis metrics describe
the source revision and do not change when editable speed or duration changes.
`sourceName` is the GPX track, route or metadata name, with the original filename
as fallback. The editable title is separate. Never store owner credentials,
internal storage locations, provider error bodies or secrets in analysis.

## MongoDB model

Track documents use schemaVersion 5 and have three responsibilities:

- Editable metadata: title, routeType, externalLinks and speedKmh. A null speed
  selects the analyzed source speed and initial expected duration. Once a user
  chooses a speed, expected duration is computed from distance and that speed.
- `result`: one available immutable route-data snapshot or null. Its internal kind
  is PUBLISHED or DIAGNOSTIC. It contains revision, sourceKey, analysisKey,
  originalFilename, metrics, distributions, climbs, descents, pointsOfInterest,
  coordinate preview, sourcePointCount, sources and completeness. Shared data types
  match the API and S3 document. No route-point array is stored in MongoDB.
- `processing`: the current attempt status, step and error. During processing or
  after failure it also holds revision, sourceKey, originalFilename,
  start time; worker identity and lease exist only during processing. After publication it contains only
  READY, null step and null error. Failures discard worker and lease fields.

Identity and ownership use `_id`, publicId and ownerId; createdAt and updatedAt
are MongoDB dates. normalizedName supports search. titleEdited records that the
owner's title must win over a parsed GPX title. Atomic publication evaluates that
flag and the current title in the same update. These operational fields are excluded from the API.

The result describes available data; processing describes current work. Replacing
or retrying leaves the result intact until a new object has been stored and atomically
published. Diagnostic data can remain visible during retry but is never treated as
a successfully published revision. A failed replacement preserves the published
result and retains its own source for retry. All worker writes filter by track ID,
owner, processing revision, status and worker ID; they never upsert.

Sources are stored once as `sources`. Retry eligibility and completeness are
interpreted from provenance and processing outcome, without a separate stored
provider classification. Original filenames belong to the file revision or attempt.
Editable speed is stored once at the root and projected into API metrics; it does
not mutate source metrics or rewrite S3 analysis. Reprocessing a published result
retains its displayed speed and title. Initial metadata edits survive parsing and
publication. Metadata edits are accepted during processing, independently of available results.

Indexes cover publicId uniqueness, owner/order, owner/name/order and processing
status/update time. Card queries and favorites aggregation select only their small
field subset, excluding terrain, POI and distribution collections. Object keys and
all worker/ownership fields are removed by the API response projection.

There is no reader or migration path for earlier storage representations. Tracks
must be reuploaded before using this schema.

## Processing, publication, and failures

### Initial creation

1. Authenticate, check quota and GPX headers, allocate internal/public IDs and revision.
2. Completely upload source.gpx with the 25 MiB byte limit.
3. Insert PROCESSING/QUEUED in MongoDB. Only then return 202 with the status URL.
4. Claim the attempt, parse with the 100,000-point limit, calculate initial metrics
   from all accepted points, select at most 10,000 analysis points with Douglas–Peucker,
   and run existing enrichment and detailed calculations on that selection. Build
   the separate compact preview. Large intermediate values stay in the job, never
   in the track document.
5. Completely write analysis.json and conditionally commit the active references,
   canonical route data, preview, provenance, and READY in one Mongo update.

Source upload failure creates no record. Mongo insert failure triggers best-effort
cleanup of the just-uploaded source. Orphans are acceptable.

If analysis fails after usable GPX parsing, write one final diagnostic JSON containing
the available map/results and explicit FAILED/PARTIAL provenance, then publish its
reference with FAILED and a safe error code. Do not write an intermediate JSON and
later overwrite it under the same revision. A malformed GPX can be FAILED without
an analysis object. If the diagnostic write also fails, publish FAILED without a
new analysis reference; retain any prior usable active/diagnostic snapshot.

Successful Valhalla with unavailable Overpass retains existing READY-with-warning
behavior. Optional elevation failure preserves accurate missing-elevation provenance;
never substitute missing elevation with a false flat profile. Uncompleted required
matching remains FAILED even when usable basic analysis is available.

If MongoDB is unavailable, persisting FAILED immediately cannot be guaranteed. Log a
safe event; leave the attempt recoverable through lease expiry. Never set READY to
hide a failed write. For an ambiguous publication outcome, re-read MongoDB before
cleanup. If the commit might have succeeded, retain objects rather than deleting a
potentially active source/analysis.

### Replacement and retry

Authorize ownership and check for a live attempt before accepting replacement data.
Completely upload the new source, then atomically attach the attempt only if eligible.
A concurrent loser returns 409 and cleans only its own unreferenced objects best effort.
During processing, public information, map, analysis, and GPX continue using active.

Completely write the new analysis before atomically switching all active references,
metrics, filename, preview, and provenance. Replacement failure leaves active intact.
The failed attempt remains owner-visible; its diagnostic is never substituted for
active data on public endpoints. A later replacement may supersede the failed attempt.

Retry uses a new revision and the failed/pending attempt's source where applicable;
retry of a READY result missing optional enrichment uses its active source. It reuses
the existing enrichment cache and recomputes local analysis using the same selection. The same atomic publication
rules apply, including preserving active during retry. Completed diagnostics and
published JSON are never overwritten by a retry.

After a successful switch, best-effort delete superseded object pairs; no revision
history is promised. Retain diagnostic/source references until no longer needed for
display or retry. An already-started read may finish with the previous version.

### Interrupted-job recovery

Use a Mongo-backed expiring lease, not a process-local “running” flag or startup-wide
reset. Proposed application constants: heartbeat every 30 seconds, lease duration
120 seconds. The scheduler writes the initial expiry with QUEUED; workers renew it
while processing, including storage operations. Make timing injectable in tests.

A live lease prevents concurrent retry/replacement. A FAILED attempt or an expired
PROCESSING lease is retryable by its owner through the existing retry endpoint.
Expose `canRetry` and an error code through owner status responses; the UI
shows a localized retry action for an interrupted attempt. A successful retry claims
a new token atomically; only one concurrent caller wins. A stale worker must stop
when it cannot renew/confirm ownership, and all its later writes are fenced by token.

No external queue or automatic recovery daemon is required. A restart does not mark
other instances' healthy jobs failed. Owner retry eventually resumes useful work from
stored GPX and the existing provider-level enrichment cache. If the event loop is stalled beyond a lease,
treat the old attempt as expired rather than allowing two jobs to publish.

### Deletion and cleanup

Atomically remove the owner-scoped MongoDB record first and retain its snapshot.
Then delete all known active, attempt, and retained diagnostic objects plus saved-track
relations. Mongo deletion failure must not delete S3 data. Deleting an absent object
is successful. Bulk deletion retains its existing 1–100 ID constraint and owner scope.

Deleting an absent track succeeds idempotently; another owner's existing track returns
404. After Mongo deletion, S3 cleanup failure does not undo logical deletion. Log a
safe event and accept orphaned objects. Repeating cleanup with the snapshot is safe;
an HTTP retry after the record is gone does not promise to rediscover lost keys.

An in-flight job cannot resurrect the record. A late S3 upload may leave an orphan;
no automatic sweeper is introduced. Never delete keys from a potentially successful
but ambiguously acknowledged Mongo commit.

## Preview geometry

Build card previews from the full source geometry using Douglas–Peucker, independently
of analysis and provider requests. Project coordinates with latitude correction and
unwrap longitude across the antimeridian. Use the full source bounding box, one scale
for both axes, centering, and padding so the SVG preserves proportions.

Preserve order and endpoints. Increase tolerance until at most
TRACK_PREVIEW_MAX_POINTS remain (default 200); bounded refinement may improve detail.
Uniform sampling with endpoints is only a final fallback if bounded simplification
cannot produce a valid result. Bound algorithm iterations, not input length beyond
the accepted source limit. Avoid recursive stack overflow and spread over large arrays.

Handle duplicates, a straight line, a closed loop, zero-area bounds, and one/two points
without NaN or Infinity. Test distinctive turns and unequal aspect ratios. Store only
the resulting compact preview in MongoDB; card metadata and SVG fallback never
request analysis or S3. Optional static map images use the compact coordinates in
an explicit backend provider adapter, selected by `TRACK_PREVIEW_PROVIDER`.

Processing stores the PNG before publishing the same result revision. Internal
`result.previewImage` records the S3 key, provider, style, renderer version,
configuration fingerprint, source revision, dimensions, format, attribution and
creation time. Object names use a unique 16-hex image ID, so forced regeneration
never overwrites a published object. Failed rendering does not fail track processing.

Missing images render on first image request; existing references retain their style. The maintenance command defaults to a read-only dry run;
apply mode streams eligible records and conditionally replaces their image metadata
only if the result revision and previous image key still match. Only records whose
analysis key belongs to the configured S3 prefix are eligible. Normal runs skip
current provenance; force mode handles upstream style updates with unchanged IDs.
Delete superseded objects after publication, known conflicting candidates immediately,
and preserve candidates after ambiguous Mongo acknowledgements.

Authenticated website `/track-previews/:publicId.png` delivers stored objects through
Node in stream mode or the existing signed internal Nginx/CloudFront proxy in nginx
mode. Missing references return 204; the SVG remains visible. Responses are private,
no-store. No static-preview fields or routes are added to the stable API v1 contract.
See [operations](../operations.md) for selection, resume and Docker commands.

## Public API and revision selection

The authoritative HTTP contract is [Public API v1](public-api-v1.md) and OpenAPI.
Metadata contains canonical `metrics`, `distributions`, `climbs`, `descents` and
`pointsOfInterest` directly, with `processing`, `sources`, `completeness`, and
`revision`. Analysis uses the same data types plus route points and `sourceName`.
Metadata reads MongoDB; analysis is projected when written and streamed unchanged
from S3. Editable speed/duration can differ from the original revision analysis.

Selection rules are shared by stream and Nginx delivery:

1. An active revision supplies metadata, analysis and GPX during replacement or
   retry. A new revision becomes active only after object writes and atomic MongoDB
   publication succeed.
2. Without active data, a persisted diagnostic supplies partial route data and
   analysis. The processing state describes the current attempt, including retry.
3. Without either result, revision and analysis URL are null; unknown metrics are
   null. The successfully stored source GPX remains downloadable.
4. Diagnostic GPX uses the diagnostic source; without any result, GPX uses the
   current attempt's source. A pending replacement never displaces the active GPX.

Expose an opaque revision in responses only for consistency detection, not routing.
Each request resolves the current selection atomically from its document snapshot.
Two requests can straddle publication: if metadata and analysis revision differ,
the client refreshes basic information and, if needed, analysis. Bound automatic
reloads and offer a localized retry if replacements continue. No revision query
parameter, historical-revision endpoint, or normal TRACK_REVISION_CHANGED error is
required. Independent basic-information consumers can ignore revision entirely.

Lists mine/saved/homepage retain their pagination/search/ordering semantics and read
only MongoDB. Homepage basic payload includes analysisUrl for its featured map rather
than embedded analysis. The homepage cache stores basic information only. File access
always checks fresh track state, never cached homepage authorization. Handle deleted
examples and refresh stale cached metadata when loading a newer detailed result.

## Access checks and file response semantics

Use one backend read-policy boundary, such as `authorizeTrackRead(identity, track)`,
for basic information, analysis, and GPX. Current tracks are public, including failure
pages and their downloadable source. The boundary must allow future private-track
policy without changing URLs. All mutations and processing-status details remain
owner-only. Never let a caller select arbitrary keys or upstream URLs.

Use existing structured errors `{ error: { code, message } }`: 404 TRACK_NOT_FOUND
for absent/inaccessible tracks; 409 TRACK_ANALYSIS_NOT_READY when no completed JSON
is available; 502 TRACK_FILE_UNAVAILABLE for unavailable storage reads. Do not expose
raw S3/CloudFront XML or provider diagnostics. A stream failure after headers aborts
the response instead of appending JSON to file bytes.

File content types are application/gpx+xml and application/json. GPX Content-Disposition
uses a sanitized fallback filename plus UTF-8 filename*. Browser responses use
Cache-Control: private, no-store. HEAD performs the same access check without a body.
Range support is not required initially; ignore Range consistently in both modes and
return a full 200. Conditional/cache requests must not bypass access checks.

Update all en/ru/uk/be/pl catalogs for new errors, partial/interrupted states, and
retry messages; preserve locale-aware display of canonical metrics.

## File delivery and infrastructure integration boundary

### stream mode

After authorization and current-object resolution, Node opens S3 GetObject and pipes
its body with backpressure. Do not buffer the complete object solely for HTTP delivery.
Abort upstream reads on client disconnect. Vite configureServer mounts the same API
service/router; no Nginx or CloudFront configuration is required in this mode.

### nginx mode: application contract

All public requests reach the same Node API as stream mode. Node applies the API
origin policy, resolves identity, authorizes the current file descriptor, and returns
JSON errors directly. For a ready GPX or analysis object it signs the CloudFront
viewer URL for 60 seconds and returns HTTP 200 with no body and
`X-Accel-Redirect: /_track_files/tracks/<object-id>/<revision>/<filename>?<signed-query>`.
The regular Content-Type, Content-Disposition (GPX only), and
Cache-Control: private, no-store headers describe the eventual file response.
The adapter validates the configured S3 prefix, object path, file kind and signed
URL before emitting the local URI. CloudFront's origin path supplies the S3 prefix.
The internal service kinds are `gpx` and `analysis`.

Nginx consumes X-Accel-Redirect and proxies through an internal-only location to a
fixed CloudFront host with verified TLS. It never forwards identity headers, exposes
the signed URI, or caches file responses. Node never reads the file body in this
mode. The previous /internal/track-files endpoint and X-Track-File-* protocol are
removed. auth_request and reconstruction of application errors are unnecessary.

Deploy the Node change and the Nginx protocol update together. Detailed requirements
and acceptance checks for infrastructure agents without application-code access are
in [the nginx handoff task](../nginx-x-accel-handoff.md).

Application logs omit signed URIs, signature parameters, credentials, GPX data and
raw provider errors. Descriptor and signing failures log track_file_delivery_failed
at error level with publicId, kind, stage and safe error details before returning 502.
Infrastructure must independently log transport failures without disclosing signed
URIs, including in its standard error log.

## Application configuration

| Variable | Default | Startup validation |
| --- | --- | --- |
| TRACK_S3_PREFIX | dev | One nonempty [A-Za-z0-9_-]+ segment, no slashes/traversal |
| TRACK_PREVIEW_MAX_POINTS | 200 | Safe integer >= 2 |
| TRACK_FILE_DELIVERY | stream | stream or nginx only |
| TRACK_S3_BUCKET | None | Required valid bucket name |
| AWS_REGION | None | Required nonempty region |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | Unset | Optional, supplied together if used |
| TRACK_CLOUDFRONT_DOMAIN | None | Required in nginx: DNS hostname without scheme/path/query/port |
| TRACK_CLOUDFRONT_PUBLIC_KEY_ID | None | Required in nginx: nonempty key ID |
| TRACK_CLOUDFRONT_PRIVATE_KEY_PATH | None | Required in nginx: readable signing-compatible PEM |

Production explicitly sets TRACK_S3_PREFIX=prod. Both Node and Vite use one validated
server configuration. Stream mode does not load a CloudFront key. Build-only commands
do not require runtime storage credentials. Startup configuration checks do not upload
probe files or HEAD objects and do not require resolving EC2 credentials eagerly.

Use the AWS SDK standard credential chain: environment credentials, temporary session
tokens when supplied, and EC2 role credentials work without separate code paths.
Vite's server environment loader must make configured server-only AWS variables
available to that standard chain; do not expose the loaded environment through client
build definitions or VITE_ variables. Never commit credentials or private keys or
copy them into frontend assets. Deployment supplies the private-key file externally.

Planned dependencies for implementation: @aws-sdk/client-s3, @aws-sdk/lib-storage,
and @aws-sdk/cloudfront-signer. Preserve and update package-lock.json through npm.
Do not install them merely to prepare this specification.

## Structure, conventions, and boundaries

Use existing JavaScript ES modules, Node >=22.13, Express 5, MongoDB driver 7,
Vite 8, and Vitest 5 as locked in the repository. No framework upgrades are in scope.

- `src/backend/`: S3/signing/configuration/delivery adapters; existing provider adapters unchanged;
  service orchestration; repository conditional writes/leases; API boundaries.
- `src/client/domain/`: existing calculations and shared deterministic geometry simplification for analysis/previews.
- `src/client/`: basic/detailed loading, map presentation, localized error/retry UI.
- `tests/unit/` and `tests/integration/`: mirror source boundaries; no colocated tests.
- `docs/`: this specification and living architecture/API/testing updates as implemented.

Example adapter style (contract sketch, not implementation):

```js
export function createTrackObjectStore({ s3, bucket, prefix }) {
  return {
    async writeAnalysis({ trackId, revision, analysis }) {
      // Return the key only after the upload has completed.
    },
    async openRead({ key }) {
      // Return a stream and controlled object metadata.
    },
    async deleteObjects({ keys }) {
      // Missing objects are already successfully deleted.
    },
  };
}
```

Always validate boundary input/configuration, enforce owner scope, fence worker
writes, keep lists independent of S3, update all language catalogs, and run checks.
Discuss scope changes first: infrastructure, new queues, changes to visibility or
accepted limits. Never commit secrets/user GPX/dist, edit historical change docs,
publish unfinished uploads, or clean potentially active objects after ambiguous commits.

## Verification and acceptance

Existing commands:

```sh
npm ci
npm run check
npm run test:integration
npm run test:performance
npm run dev -- --host 127.0.0.1
npm run build
npm start
```

Mongo integration requires MONGODB_URI pointing to an isolated test database. Extend
the integration script during implementation so new storage/delivery tests actually
run; it currently names only database.test.js. Fast tests remain independent of network,
credentials, databases, and open ports. Use synthetic GPX fixtures, not user data.

| Area | Required observable result |
| --- | --- |
| Upload | 202 only after source write and Mongo insert; READY only after analysis write |
| Limits | 25 MiB byte enforcement with/without Content-Length; exactly 100,000 route points accepted, 100,001 explicitly rejected |
| Analysis selection | At most 10,000 original points, selected deterministically with Douglas–Peucker; order, endpoints, fields, and characteristic turns preserved |
| Basic metrics | Initial metrics use all accepted source points and are not recomputed merely due to simplification |
| Provider compatibility | Existing Valhalla sampling/splitting, elevation/Overpass requests, cache behavior, concurrency, and timeouts remain unchanged |
| Detailed calculations | Enrichment, gradients, climbs, descents, and persisted geometry use the selected analysis points |
| Basic API | GET /api/v1/tracks/:id returns metrics, elevation summary, distributions, climbs, descents, and POI metadata with no S3 access |
| Current analysis | Plain /analysis resolves active automatically; callers need not know a revision |
| Lists/previews | mine/saved/homepage function without S3; preview point cap, proportions, and turns are correct |
| Detailed page | Separate basic/analysis requests render the selected route geometry, POI, profile, road data, and climb/descent tables |
| Partial failure | Completed diagnostic JSON is readable and FAILED/PARTIAL; optional Overpass failure remains READY with warning |
| Replacement | Old metrics, GPX, and analysis remain available until atomic publication; failure leaves active unchanged |
| Retry/leases | Restart or expired lease exposes retry; live jobs reject duplicate retry; stale jobs cannot publish |
| PATCH | Header speed/time updates are reflected without S3 rewriting or stale JSON overriding them |
| Download | Exact original bytes and safe original filename, including first-upload failures |
| Races | Concurrent retry/replace, delete/complete, and stale worker writes preserve invariants |
| Write failures | Cover source/analysis/diagnostic S3 writes and Mongo insert/commit/delete, including ambiguous outcomes |
| Cleanup | Mongo removed first; repeat delete safe; orphans allowed; no unrelated prefix/key touched |
| Vite stream | Upload, polling, list, map, partial view, download, replacement, and retry work without Nginx |
| nginx application | Public API signs current object, checks identity, returns a local X-Accel-Redirect with no body, and never reads S3 for delivery |
| Public isolation | Public listener cannot expose internal signing route, even with spoofed headers |
| Confidentiality | No secrets/signed URLs in public application responses, client assets, or application logs |
| Stream failures | HEAD has no body; client abort closes upstream; midstream failure does not append JSON |
| Homepage/cache | Featured analysis is separate; stale revision/deleted examples are handled |

Unit tests cover fake SDK/store contracts, state transitions, leases with a controlled
clock, analysis/preview simplification, unchanged provider contracts, API shapes, signer behavior with temporary
test keys, configuration validation, and client loading/error states.
Integration tests cover real MongoDB conditional operations and S3 adapter behavior
against an available isolated test service. Test both application delivery modes;
nginx handoff can be exercised through the public API without adding an
Nginx configuration to this repository.

Actual Nginx-to-CloudFront browser delivery, AWS policy, TLS/upstream failure behavior,
and infrastructure log non-disclosure require the separate infrastructure environment.
Run a joint end-to-end acceptance check when that environment is supplied; do not
claim application contract tests prove the full production path.

Large synthetic analyses must demonstrate that the track BSON document does not grow
with source-point count except bounded preview and canonical metadata lists. The route data
contains no points, geometry, or per-segment data. Adapt existing
50,000/490,000-point performance fixtures to the new acceptance boundary: exercise
50,000 and 100,000 accepted points and rejection above the limit. Measure memory/time
for full-source basic metrics, 10,000-point selection, JSON, unchanged provider calls,
and browser rendering. Verify that source GPX stays byte-identical, sourcePointCount
retains the accepted count, and persisted analysis geometry never exceeds 10,000 points.

## Remaining integration detail

The application contract is defined above. Nginx must intercept the public file URLs,
block direct external `/internal/` access, and send internal subrequests to the same
application listener. Do not replace Nginx path isolation with a client-supplied flag.
There are no remaining product questions about point limits, partial results, current
revision URLs, basic metrics, or the infrastructure scope.

## Technical references

- [AWS SDK credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
- [CloudFront private content](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html).
- [CloudFront trusted signers and key groups](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html).
- [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
- [Nginx auth_request status semantics](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html).

Sharing metadata and the second PNG variant follow [the social preview specification](social-previews.md).
