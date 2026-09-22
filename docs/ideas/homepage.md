# GetGPX homepage

## Objective

Replace the demo route at `/` with a calm, product-led introduction for two audiences:
authors who publish a route and recipients who open a shared route. The page should make
the core promise clear within the first screen: one independent route page, one link,
and an original GPX download that does not require a GetGPX account.

## Recommended direction

Lead with **“Один трек. Одна ссылка.”** and a compact visualization derived from the
real `THE TRAKA 200 _2026` GPX supplied for this work. Present GetGPX as the
canonical page for a ready-to-ride route: map shape, key metrics, analysis, points of
interest, original file, author, and links to copies already published elsewhere.

GetGPX does not distribute or synchronize routes with Komoot, Strava, Garmin, or
Ride with GPS. Authors add those links manually. External links, collections, and tags
may be previewed on the homepage only when clearly labelled as upcoming.

## Acceptance criteria

- `/` no longer renders the demonstration route workspace.
- The first screen explains the product and distinguishes publishing from viewing.
- Guests see a sign-in-first publishing action; signed-in users see the existing GPX
  upload action.
- A recipient is told that viewing and downloading the original GPX requires no GetGPX
  registration.
- The real example route is represented by a lightweight inline route outline and its
  factual headline metrics, without adding the source GPX to the repository.
- Current and upcoming functionality cannot be confused.
- The page is keyboard accessible and responsive at 320, 768, 1024, and 1440 pixels.
- Existing `/my-tracks` and `/tracks/:id` behavior remains unchanged.

## Technical plan

1. Add a small presentation module for homepage markup and cover its content contract
   with a unit test.
2. Route `/` to the homepage while retaining the existing route workspace for public
   track URLs.
3. Make the primary homepage action follow restored authentication state.
4. Add homepage-specific styles using the existing typography and color system.
5. Run `npm run check`, then verify desktop and mobile layouts in a real browser.

## Key assumptions to validate

- Authors value an independent, downloadable GPX enough to upload a track in addition
  to publishing it on a specialist platform.
- Recipients prefer one complete route page over several platform-specific links.
- Analysis and points of interest provide enough value beyond sending a raw file.
- Manually adding external publication links is acceptable to authors.

## MVP scope

The homepage communicates and demonstrates the product using static example content.
It reuses current authentication and upload controls but adds no persistence, external
platform integration, collection model, tags, or public catalogue.

## Not doing

- Automatic publication or synchronization with external platforms.
- Importing or downloading files from external platforms.
- Anonymous GPX uploads.
- Public route discovery or a social feed.
- Ride reports, photography, or editorial storytelling.

## Commands and boundaries

- Verify: `npm run check`
- Browser preview: `npm run dev`
- Source remains in `src/client`; tests remain under `tests/unit/client`.
- Do not add dependencies, change persistence, or commit the supplied GPX.
