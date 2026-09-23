# Specification: localization and measurement systems

Status: phase 1 delivered. Phase 2 (account settings and overrides) is deferred to a
separate future project; do not treat its design below as part of phase 1.

## Objective and delivery boundaries

Localize all application-owned user-facing content into English (`en`), Russian
(`ru`), Ukrainian (`uk`), Belarusian (`be`), and Polish (`pl`). Support independent
language and measurement-system choices through a deliberate page reload after each choice.

Deliver this project in two separately accepted phases:

1. **Browser preferences:** complete translations, localized formatting, metric and
   imperial units, and a shared header selector for guests and signed-in users.
   Manual preferences live only in the browser. Login/logout do not affect them.
   No account settings screen, settings API, or account preference storage.
2. **Future, separate project — account preferences:** introduce user settings, persistence and account-level
   overrides. Signed-in users edit both preferences on a settings screen; guests
   continue using the header selector. Start only after phase 1 is complete.

Phase 2 has not started and requires separate planning and authorization. Screenshot
references establish unit mappings, not per-measurement overrides, new fitness
features, or an exact settings-page layout.

## Preference resolution

Resolve `language` and `measurementSystem` independently. Supported system IDs are
`metric` and `imperial`. A missing preference is different from a saved default.
In phase 1, manual values are stored in the browser's origin-scoped `localStorage`
under `getgpx.preferences.v1` as JSON with optional `language` and
`measurementSystem` fields. Visiting the site does not write automatic defaults.

| Context | Priority, highest first |
| --- | --- |
| Phase 1, any visitor | Manual browser preference → automatic value → fallback |
| Phase 2, guest | Manual browser preference → automatic value → fallback |
| Phase 2, authenticated | Account preference → browser preference → automatic value → fallback, with missing account fields initialized once |

Automatic values must not be persisted simply because a page was visited. Saving
one browser preference must not persist the other unless it was also changed.
Use versioned, application-namespaced local storage for manual browser choices.
Invalid or unsupported stored values are ignored independently. If storage is
unavailable, changes still work for the current page session without crashing;
do not claim they will survive another visit.

### Automatic language

- Read the browser's ordered language preferences, falling back to its primary
  language when the list is unavailable. This is the browser-exposed system
  preference; do not request location or infer language from IP addresses.
- Normalize valid locale tags and select the first supported base language:
  `pl-PL` → `pl`, `en-US` → `en`, `be-BY` → `be`.
- Skip unsupported/invalid entries; use English if none match or detection fails.
- A manual language choice does not change the measurement-system choice.
- Format numbers, dates, percentages and plural messages using the selected UI
  language. Do not add timezone, calendar, or date-format settings in this project.

### Automatic measurement system

- Use metric for every visitor who has not manually chosen a system, including
  visitors whose browser locale is `en-US`. Manual choice always wins.
- Browser language tags describe language preferences, not current location.
  Do not infer a measurement system from their region subtags. Do not request
  browser geolocation or use IP-based location for this preference.
- Keep language and measurement-system choices independent. Do not persist the
  metric default merely because a page was visited.

### Phase 2 initialization and account lifecycle

- Registration initializes both account fields from the effective preferences at
  registration: browser manual choices, otherwise automatic values/fallbacks.
  Preserve these values across the OAuth redirect using validated, flow-bound
  state; do not rely on browser local storage being readable by the server.
- Existing accounts missing settings initialize only missing fields once at the
  first authenticated visit after rollout, using the same resolution rules.
- Existing account values always win on login, including on another device.
  Initialization must be conditional/atomic so concurrent visits cannot overwrite
  a stored preference or a deliberate settings update.
- Restored authenticated sessions use account values as soon as session loading
  completes. Avoid displaying a full interactive page in the wrong language first;
  session-loading failure must not be mistaken for confirmed logout.
- Logout removes the account override and restores browser manual/automatic values.
  Account changes must never overwrite the guest's browser preferences.
- Other devices pick up saved settings on their next session load/page visit;
  real-time cross-device synchronization is outside scope.

## User experience

### Phase 1 header selector

- Place an accessible globe button with the current language name beside login,
  or in the equivalent header position beside the signed-in user control.
- Available on every application page, including homepage, public track, personal
  lists and not-found pages, on desktop and mobile.
- One popover contains language selection and, below it, measurement-system
  selection. Show languages as `English`, `Русский`, `Українська`, `Беларуская`,
  `Polski`; use no flags. Translate system labels in the active UI language.
- Save each choice immediately, then reload the current URL, including query and hash.
  No Save button or navigation to another route. The reload may reset scroll, map
  position, selection, open dialogs and other transient page state.
- Block the selector while an upload or analysis is processing, or while a form has
  unsaved edits. Show a concise localized explanation so users can finish or discard
  that work before switching.
- Reloaded content uses the new preference; no live translation registry is required.
- Support keyboard navigation, Escape, focus restoration, selected states and
  accessible names. Language changes update document `lang` and the page title.

### Phase 2 settings screen

- Add a localized Settings link to the user menu and a dedicated `/settings` page
  with only language and measurement-system fields plus Save/Cancel controls.
- Hide the header preference selector for authenticated users. Guests retain it.
- Form edits are drafts: the active language and units remain unchanged until
  successful Save. Save both fields atomically, then apply without losing context.
- Cancel discards drafts. Warn before leaving with unsaved edits.
- On save failure, keep the draft for retry and retain the previous active settings;
  display a localized error and do not report success. Guard against repeated saves.
- A direct unauthenticated visit offers login and does not expose account data.

## Measurement presets and numeric integrity

Only the complete system is selectable; no custom mixes or individual unit fields.

| Quantity | Metric | Imperial | Scope |
| --- | --- | --- | --- |
| Route distance | kilometers (km) | miles (mi) | Current route/list/map/profile UI |
| Short distances | meters (m) | feet (ft) | Where short-distance formatting is used |
| Elevation, ascent, descent | meters (m) | feet (ft) | Current route UI |
| Speed, including editable estimated speed | km/h | mi/h | Current display and input |
| Running pace | min/km | min/mi | Where present; do not add a new feature |
| Body weight | kilograms (kg) | pounds (lb) | Future mapping only |
| Body height | centimeters (cm) | feet and inches | Future mapping only |
| Temperature | Celsius (°C) | Fahrenheit (°F) | Future mapping only |
| Energy | kilocalories (kcal) | kilocalories (kcal) | Future mapping only |
| Pool length | meters (m) | yards (yd) | Future mapping only |

- Percent gradient, time and counts retain their meaning; localize formatting and labels.
- Keep existing canonical numerical units in domain calculations, APIs and storage.
  Convert only at presentation/input boundaries. Original GPX bytes do not change.
- Use exact length factors: mile = 1609.344 m; foot = 0.3048 m. Speed and pace
  conversions derive from the same factors. Round only displayed values.
- Route totals/profile axes use km or mi. Compact distance formatting uses m below
  1 km or ft below 1 mi; handle rounding at boundaries without misleading labels.
- Keep meaningful existing precision; test zero, small values, negative elevations,
  large distances and rounding boundaries. Unknown values remain unknown, not zero.
- Convert numeric input back to canonical units before validation and submission.
  Express min/max/step and validation messages in the displayed units while keeping
  the existing physical limits. Repeated toggles or an unchanged form submission
  must not accumulate rounding drift.
- Localize units wherever displayed, including homepage examples, list summaries,
  tooltips, chart axes, hover readouts, map scale, edit fields and validation errors.

## Translation coverage and exceptions

Translate all application-owned content: homepage copy and examples, navigation,
login/logout, lists, route/activity types, upload/edit/delete flows, dialogs,
empty/loading/error states, notifications, surface/road/quality categories, POI
categories, climbs/descents, chart legends, map controls, accessible names, help,
validation, settings and document titles.

Do not translate user track names/descriptions, filenames, GPX source text, author
names, geographic map-tile labels or proper names supplied by external sources.
Translate application-generated unnamed-track/POI fallbacks at display time.
Third-party pages, browser/OS-owned dialogs and source-map attributions remain
under their respective owners' control.

Backend errors should expose stable codes and safe structured parameters. The UI
maps them to translated messages; do not translate by matching raw error strings.
Never display raw upstream responses, stack traces, credentials or internal details.
An exceptional, narrowly technical case may use a reviewed safe English message;
document each exception explicitly. Ordinary failures must be translated, including
an unknown-error fallback. Backend-rendered authentication failures also need a
localized presentation or a redirect to an appropriate localized application state.

Persisted analysis and enrichment caches must remain language-independent. Inspect
existing generated labels and errors during implementation. For legacy text, use
reliable provenance to distinguish generated labels from user input; never globally
replace a title just because it equals “Маршрут без названия”. Ambiguous legacy
titles remain original content. If a persistence migration is needed, specify and
test it separately within phase 1; deferring account settings does not justify
leaving generated analysis labels permanently Russian.

Public links keep their existing URLs and use the viewer's preferences. No language
URL variants, automatic content translation or language-specific GPX exports.

## Translation repository and maintenance workflow

- Keep message catalogs in plain UTF-8 JSON, grouped consistently by feature under
  `src/client/locales/`, with one catalog per supported language. Catalogs contain
  only translation keys/messages; context and review metadata live separately.
- English is the source catalog. Use stable semantic keys such as
  `tracks.delete.confirm`, not the original sentence as a key.
- Keep supported languages and their names in one registry. Adding a language
  extends this registry and catalogs rather than introducing five-language branches.
- Use complete messages with named parameters and plural support. Do not concatenate
  translated sentence fragments or implement Russian plural rules for every language.
  Use a maintained message-format implementation if needed; choose it during planning.
- Reuse genuinely shared labels and units, while allowing context-specific wording.
  Prefer plain text messages; escape interpolated user data and avoid executable HTML.
- Generate the initial five catalogs with AI, then review terminology, meaning,
  placeholders and layout. Use neutral, concise UI language and official modern
  Belarusian orthography. Maintain a glossary for route/activity/surface terminology.
- Provide a documented command-based workflow to identify missing, changed and
  obsolete entries and prepare incremental AI translation batches with context.
  Runtime translation services, translator UI and external accounts are not required.
- Track source revisions separately from catalogs so changed English marks its
  translations stale. Regeneration must preserve manual edits, present proposed
  changes as reviewable diffs, and require explicit resolution of conflicts.
- New or changed user-facing content must ship with every registered translation.
  English runtime fallback provides resilience, not permission to ship missing translations.

The implementation must integrate catalog validation into `npm run check`: matching
key sets, nonempty messages, valid message syntax, equivalent parameters, required
locale-specific plural cases, and no unresolved stale translations. Add guardrails
against new hardcoded UI strings, with explicit allowances for user data, brands,
technical identifiers and documented English exceptions. Do not treat a simple
Cyrillic scan as sufficient evidence of full localization.

## Architecture and implementation constraints

Current stack: Node.js >=22.13, ES modules, Vite, vanilla browser JavaScript,
Leaflet, Express, MongoDB and Vitest. Preserve `package-lock.json`; install with
`npm ci`. Follow existing named exports and dependency-injection conventions.

- `src/client/`: preference resolution/storage adapter, presentation translators,
  locale catalogs, numeric formatters/converters, selector and settings UI.
- `src/client/domain/`: pure canonical GPX calculations; no browser preference reads.
- `src/backend/`: safe error contracts, OAuth handoff and phase 2 settings service,
  authenticated HTTP boundary and user repository. Never return raw user documents.
- Phase 2 logical settings may be embedded in a user record; a separate collection
  is not required. Allowlist supported preference values and authorize updates from
  the session, never from a client-supplied owner ID. Follow existing mutation protections.
- Tests stay in `tests/`, mirroring client/backend boundaries. No colocated tests.
- Keep future-state design here until delivered; update living architecture,
  authentication, testing and coding documentation as each phase becomes current.
  Never rewrite historical `docs/changes/` specifications.

Illustrative interface style (not a library commitment):

```js
export function resolvePreferences({ browserLocales, stored, account }) {
  // Resolve fields independently; account is absent throughout phase 1.
  return { language, measurementSystem };
}

// Translate whole messages and format canonical values at the presentation edge.
translate('tracks.delete.confirm', { count: selectedCount });
formatDistance(distanceMeters, { language, measurementSystem });
```

Always preserve original GPX, domain precision and public URLs. Block preference changes while unsaved drafts exist. Never
commit credentials, `.env`, user GPX data or generated `dist/`. Resolve new scope
or destructive legacy-data migration decisions before implementing them.

## Verification and acceptance criteria

Commands from the repository root:

```sh
npm ci
npm run test:fast
npm run check
# With a configured disposable MongoDB database, whenever persistence changes:
npm run test:integration
```

### Phase 1 acceptance

- All five languages cover every in-scope surface, including server-originated
  errors and stored analysis presentation. Automated translation validation passes.
- Preference tests cover absent/invalid storage, storage failures, language lists,
  unsupported locales, metric defaults with and without region subtags,
  independent persistence and identical guest/authenticated behavior.
- Representative formatting tests cover plural counts 0/1/2/5/11/21/22/fractions,
  decimal separators, dates, unit labels and complete parameterized messages.
- Conversion tests prove correct display/input values, physical validation limits,
  boundary rounding and no drift after repeated toggles or unchanged submission.
- Component and real-browser checks cover homepage, public track, personal lists,
  upload/edit/delete, failures, chart/map labels, and keyboard/mobile behavior.
  Smoke-test all ten language/system combinations; inspect long text for clipping.
- Changing preferences reloads the current URL with query and hash intact.
  Processing and unsaved edits block the selector with a localized explanation.
- No account preferences or settings page have been introduced. Login/logout
  leave phase 1 preferences unchanged. `npm run check` passes; run database
  integration tests too if language-neutral persistence work changes database wiring.

### Phase 2 acceptance

- Registration and legacy initialization persist both effective preferences once;
  later logins, concurrent initialization and new devices cannot overwrite them.
- The account wins while signed in; logout restores untouched browser preferences.
- Settings are private, values are validated, Save is atomic, Cancel has no effect,
  and failed saves keep the old active values plus retryable drafts.
- Guests have the header selector; authenticated users have Settings only.
- Tests cover OAuth preference handoff, session restoration/failure, unauthorized
  reads/writes, invalid values, account switching and persistence across sessions.
- MongoDB integration tests prove stored values and conditional initialization;
  browser checks prove successful-save language/unit application without data loss.
- `npm run check` and `npm run test:integration` pass. Living documentation explains
  the delivered preference contract and how to maintain every supported translation.

## Review and next step

Review this specification before implementation planning. Plan phase 1 first;
phase 2 remains a separate delivery. No remaining blocking product questions are
known. Library choice, exact module/file split and any provenance-safe legacy-data
compatibility work are implementation-planning decisions within these constraints.
