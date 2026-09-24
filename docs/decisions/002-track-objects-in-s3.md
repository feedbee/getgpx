# ADR-002: Store track source and analysis objects in S3

## Status

Accepted

## Date

2026-09-24

## Context

The existing track document contains detailed route geometry and enrichment. Large
analyses make MongoDB reads expensive and approach its 16 MiB document limit. The
original GPX lives in GridFS. Lists only need ownership, title, status, a few
metrics, and a compact preview. The public track page needs detailed analysis and
the original file only when opened or downloaded.

## Decision

Store each GPX source and completed analysis as immutable objects under a revisioned
S3 key. Keep searchable metadata, basic metrics, current object keys, status, and
preview in MongoDB. Upload GPX before inserting the processing record; complete the
analysis object before switching MongoDB to READY. A replacement retains the old
active pair until an atomic MongoDB update publishes the new pair. The browser uses
stable application API URLs. Node authorizes reads and either streams S3 objects in
development or provides a short-lived CloudFront signed URL only through an internal
route on the application listener for Nginx to consume in production.

Existing tracks are recreated, so no legacy data migration is required. The source
GPX remains at most 25 MiB and 100,000 points. Basic metrics use all accepted points;
Douglas–Peucker selects at most 10,000 for detailed analysis and a separate at most
200-point default preview.

## Alternatives considered

- Keep full analysis in MongoDB and only move GPX: leaves large documents and list
  projections sensitive to future growth.
- Stream all production downloads through Node: simpler infrastructure, but makes
  Node carry file traffic and offers no CloudFront offload.
- Redirect the browser to signed CloudFront URLs: exposes URLs/signatures and makes
  future private-track policy harder to enforce at stable client URLs.
- Overwrite the current S3 keys on replacement: risks serving mixed old/new objects
  and leaves no safe publication boundary.

## Consequences

- MongoDB and S3 cannot share a transaction; unreferenced objects can remain after
  failures. READY must never reference an upload that did not complete.
- Application startup needs validated bucket/region settings, and deployment must
  provide AWS permissions and private CloudFront signing material in nginx mode.
- Lists and basic information remain available without an S3 read. A missing object
  affects detailed analysis or download but does not corrupt MongoDB metadata.
- The production Nginx/CloudFront wiring and its security/log checks are a separate
  infrastructure deliverable.
