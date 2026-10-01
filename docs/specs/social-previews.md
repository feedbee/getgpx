# Social sharing previews

## Goal and decisions

Serve Open Graph and Twitter card metadata in the initial HTML for the homepage,
track collections and public track pages. Bots must not need JavaScript or login.
Collection metadata is generic and reveals no personal list contents. Track metadata
uses current point-free public metadata: title, route type, distance, ascent, descent,
estimated duration and selected speed. Escape all user data in HTML attributes.

Use the existing 512×512 list PNG and one 1200×630 sharing PNG per requested
track revision. No additional retina variants. Homepage/collections reuse the existing shared brand icon. The sharing map includes attribution because it travels independently
of the webpage. The user approved these two formats.

Generate missing images at first image request, save in the private S3 bucket, then
conditionally attach provenance to the unchanged track revision. Coalesce concurrent
requests, bound provider concurrency and queued jobs, and back off failures. Reads of
existing images do not automatically change their style; maintenance handles that.
GPX publication invalidates both image variants; image failure never fails analysis.
Public sharing images use the same read authorization as public track metadata and
the existing Node stream / signed Nginx transfer. Keep API v1 unchanged.

## Boundaries and validation

Website metadata/HTML adapters live under `src/backend/site/`; provider and persistence
remain backend adapters. Use existing language catalogs, with metric units by default.
Canonical URLs come from a trusted configured origin, never an arbitrary Host header.
Production and Vite must inject identical metadata after loading the page template.

Run `npm run check`; persistence changes also require `npm run test:integration` in
an isolated, uniquely named MongoDB database with exact cleanup. Tests cover escaping,
no private-list disclosure, missing tracks, bot access, no-JS initial HTML, single
render for simultaneous misses, cooldown, revision races and both image lifecycles.
