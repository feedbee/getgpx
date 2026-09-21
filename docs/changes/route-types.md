# Route types

## Objective

Give every saved track one route type that can be chosen before upload, changed by
the owner, and recognized at a glance on the track page and in the owner's list.

## Contract

`routeType` is one of `cycling`, `road-cycling`, `gravel-cycling`,
`mountain-biking`, `hiking`, `running`, `walking`, `driving`,
`motorcycling`, `swimming`, `winter-sports`, or `other`. New uploads require an
allowlisted value in `X-Track-Type`; owner edits send the same value in the existing
`PATCH /api/tracks/:id` body. Legacy records without the field resolve to `other`.

The UI owns long and short labels plus matching Tabler SVG icons. Forms use a custom,
keyboard-accessible icon dropdown with the long label; compact metadata uses the icon
and short label. The upload starts as `cycling`, then exposes this dropdown with the
other metadata after the GPX has been accepted. E-bike, bike commuting, and multiple
types per track are intentionally out of scope.

## Implementation plan

1. Add the shared allowlist and persistence/API contract with compatibility defaults.
2. Add an accessible single-choice picker to upload and edit flows.
3. Render the type before distance on public track pages and owner track cards.
4. Cover the contract and UI helpers with unit tests, then run `npm run check` and
   `npm run test:integration` because the persisted document shape changes.

## Success criteria

- A new upload cannot be created without a valid single route type.
- An owner can change the type in the existing edit flow.
- Public detail and owner list responses expose a normalized type, including legacy
  records, without exposing additional owner data.
- The selected icon and short label appear before distance on both requested views.
- Upload and edit controls are labelled and keyboard-accessible.

## Boundaries

- Always validate route types at HTTP boundaries and preserve legacy reads.
- Do not add a third-party icon dependency or infer a type from GPX contents.
- Do not add e-bike, multiple selection, filtering, or service-specific mappings.
