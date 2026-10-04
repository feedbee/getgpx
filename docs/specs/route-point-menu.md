# Route point popover

## Objective and acceptance criteria

Clicking the active black route marker on the map or the navigation point on the elevation profile opens one shared point popover. It duplicates the current map readout: distance, elevation, gradient, surface, road type, quality and percentage of the complete route. It additionally displays latitude and longitude, offers copying coordinates and opens the selected point in Google Maps in a new tab.

The selected point stays fixed while the popover is open. Prefer placement above the point, fall back below when necessary, and constrain the panel to the visible viewport and available map/profile area. Outside clicks and Escape dismiss it. Clicking the active trigger again dismisses it. Opening another point replaces the previous panel. Preserve profile drag-to-select and existing points-of-interest interactions. Close the panel when its route or profile view is replaced. Keyboard users can open the active point and reach both actions; dismissal restores trigger focus when appropriate.

Coordinates use WGS84 decimal degrees in latitude, longitude order with six decimal places. Copy a plain machine-readable pair with decimal dots. Show localized success or failure feedback for clipboard access. Use the existing measurement and translation helpers for all route statistics. Provide all new messages in en, ru, uk, be and pl.

## Implementation plan

1. Reuse the active-point readout formatter and introduce a focused client popover controller with positioning, dismissal, coordinate actions and focus handling.
2. Connect the map marker and profile point triggers. Prevent hover from replacing the selected point while open and preserve range selection and POI behavior.
3. Style the panel using existing application tokens, add all catalog entries, document the interaction and verify desktop and narrow layouts.

## Commands and testing

Use Node.js 22+; install with `npm ci` without changing the lockfile. Run focused Vitest tests under `tests/unit/client/` for opening, dismissal, frozen point data, coordinate actions, placement and profile drag compatibility. Run `npm run check` for the completed change. Verify rendered behavior in a real browser, including a narrow viewport. No database integration tests are needed because persistence does not change.

## Structure and code style

Keep rendering and interactions in `src/client/`, pure placement calculations in `src/client/domain/` if extraction is useful, catalogs in `src/client/locales/`, and tests under `tests/unit/client/`. Follow ES modules, named exports and injected browser dependencies, for example `export function createRoutePointPopover({ getTrack, documentRef = document }) { ... }`. Escape interpolated HTML and use textContent for coordinates and feedback.

## Boundaries

Always preserve map/profile navigation, localize text and units, and run the quality gate. Ask before intentional public API changes or new dependencies. Never change the reviewed API contract baseline, persistence, environment variables or historical documents for this client feature. Do not commit user GPX data or generated output.

## Review status

Approved by the user. Start (A) and finish (B) markers also select and highlight their endpoint and open the same popover.
