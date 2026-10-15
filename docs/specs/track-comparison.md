# Track comparison

## Objective and acceptance
Select saved tracks on their pages and compare their geometry and summary metrics at
`/compare?tracks=id1,id2`. The selection persists in browser storage, independently of login, with
at most eight tracks to keep colors distinguishable and analysis loading bounded.
The action shows the total selection count and supports removing a selected track.
The global header comparison icon is always present; its label and count badge appear
for any nonempty selection.
Collection toolbars place Add to comparison between Select all and Remove/Delete.
It adds checked tracks to the existing selection without navigating. It is enabled
only when at least one new track is checked and the combined selection fits eight tracks.

Desktop: one third track list, two thirds map. Mobile: stacked list and map.
Each loaded track shows its owner’s display name and avatar (or the same fallback icon
as favorites), when public author metadata is available.
Each track has a numbered color, matching circular endpoints (A start, B finish), a link
opening its page in a new tab through a separate external-link icon, and localized sport/distance/ascent/descent/time/speed.
Drag the numbered handle with a mouse, pen or touch to reorder tracks; arrow keys
(and Home/End) offer the same action. The first row is the top map layer, including
endpoints and point hit targets. Hovering or focusing a track temporarily raises the entire route, its endpoints
and point hit targets above the others. Its endpoints gain a color ring and other
tracks dim so overlapping routes and coincident starts remain distinguishable.
Leaving the track restores the list order.
Reordering saves the selection order and changes existing layers without refetching
analysis or fitting the viewport. Colors retain their identity after reordering
and reload; numbers follow the current list positions and update in both the list
and map endpoints. Color slots persist through `getgpx.comparison-identities.v1`.
Legacy selections
without identity storage receive unique color slots on load. Drag cancellation restores
the original order; the list scrolls near its edges during dragging. Drop placement
uses the dragged card center, including the final release coordinates, and tolerates
sideways pointer drift.
Clicking the track name or a non-interactive part of its row fits that track to the
map with padding, without changing layer order. Enter/Space on the row or the name
button offer the same action. Fitting is disabled until geometry is available.
Hover or keyboard focus highlights both row and route. Default map mode is track
identity; gradient, elevation, surface, road type and quality reuse existing analysis
colors, with the same white outlines and widths as the single-track map. Both maps
use shared line drawing and endpoint helpers. Highlighting dims other routes without
increasing line width. Point readouts carry a track-colored stripe and dot. Point hover and details include the track title.
No elevation chart or POI panel is displayed. Empty, loading and partial failure
states permit removing unavailable tracks and retrying failed loads.

## Implementation and boundaries
Vanilla ES modules and Leaflet, using the existing styles and five locale catalogs.
Browser selection, comparison loading and rendering live under `src/client`;
behavior tests live under `tests/unit/client`. Metadata and analysis are loaded
separately through existing API methods, checking revisions. The production frontend route allowlist includes `/compare`. No public API,
backend persistence, dependencies or environment variables change.

Track names are inserted as text or escaped through the i18n HTML helpers.

## Ordered work and verification
1. Selection storage and comparison reads; test malformed storage, toggling,
   limits, denied storage, partial failures and stale analysis revisions.
2. Track action and navigation, comparison list/map, shared point details.
3. All locale catalogs, responsive CSS, browser verification and documentation.

Commands: `npm ci`, `npm run check`, `npm run dev -- --mode test` for browser
verification using deterministic fixtures. Database wiring is unchanged.

During pointer dragging a floating card follows the pointer, sibling rows animate
to their new positions, and the card settles into its destination on release.
Reduced-motion preferences disable the transition animations. The card uses a
pointer cursor, except for its drag handle, which uses grab/grabbing.

## Shareable selection and visibility

`/compare?tracks=id1,id2` is the source of the comparison page, including layer
order. Opening it works without browser storage; a bare `/compare` is empty.
Removing or reordering a track updates the URL. Hiding it only changes the current
page display, retains its list row and does not change the URL. Share copies the
comparison URL with every selected track, including hidden ones.

The header comparison icon links directly to the comparison URL, with a label and
count for nonempty selections. The track action panel has a Compare toggle,
matching the favorite button: pressed means the current track is selected.
Selection changes briefly pulse the header badge; the first selection animates
the label appearing. Reduced-motion preferences suppress these animations.
There are no comparison dropdowns or explanatory menu text.

List updates preserve keyboard focus, including through asynchronous loads;
removing a row focuses its neighbor, and retry falls back to the row while its
button is hidden. Hidden tracks retain visibility through retries and partial
loads. Map redraws preserve highlight; closing point details clears it. The shared
point dialog uses a unique comparison ID and a track-colored dot. Repeated point
movement within the same track does not reapply every layer style. Share icons,
clipboard handling, loading state and feedback are shared with the track page.

Comparison links have server-rendered localized Open Graph/Twitter metadata with
a comparison title, description and the shared GetGPX brand icon. Canonical URLs
preserve validated track IDs and their order; unrelated query parameters are omitted.
No geometry reads or comparison image generation are needed for social previews.

The author and row actions share a wrapping footer with spacing between them.
Hide uses a crossed-out eye; Show uses an open eye, matching the offered action.

Loading analysis uses an accessible spinner in the existing title row with a
reserved slot, rather than a separate loading message that changes card height.
Failures retain the status message and retry action.
