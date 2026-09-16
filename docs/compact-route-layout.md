# Spec: compact route analysis layout

## Objective
Rebuild the GPX route page around a compact, continuously visible map and a dense analysis column inspired by the strongest interaction patterns in Komoot without copying its brand or assets.

## Commands
- Dev: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

## Project structure
- `src/main.js`: page structure, map/profile rendering and interaction state
- `src/style.css`: responsive layout and visual system
- `src/surface.js`: surface and way-type classification
- `src/climbs.js`: climb/descent detection
- colocated `*.test.js`: behavior tests

## Testing strategy
Pure classification and descent logic use Vitest. Sticky layout, navigation, hover/pin/outside-reset behavior, accessibility and visual density are verified in the real browser.

## Boundaries
- Always: preserve GPX upload, map/profile synchronization, range zoom and existing surface enrichment.
- Never: fabricate photos, waypoints or weather that are absent from GPX/OSM data.
- Responsive fallback: below 900px, use a single column and a non-sticky map.

## Success criteria
- Compact route header and metrics precede the analysis workspace.
- Desktop workspace is roughly 50/50: analysis left, viewport-height sticky map right.
- Section navigation scrolls to Overview, Way Types & Surfaces, Route Details and Climbs & Descents.
- Way types, surfaces, climbs and descents highlight the corresponding route on hover; click pins; outside click or Escape clears.
- Elevation card remains selectable/zoomable and supports gradient/surface/way-type coloring.
- No console errors; tests and production build pass.
