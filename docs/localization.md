# Localization guide for contributors and agents

Phase 1 is current: five UI languages (`en`, `ru`, `uk`, `be`, `pl`) and metric or
imperial presentation units work for guests and signed-in users alike. Phase 2
(account settings) is deferred; see [the specification](localization-spec.md) for
that future scope. Do not add account preference fields or endpoints as part of
ordinary UI changes.

## Add or change user-facing content

1. Put the English source message under a stable, semantic key in
   `src/client/locales/en.json`. Add a real translation for that same key in
   every language registered by `src/client/locales/registry.js`. This rule also
   applies when future languages are added to the registry.
2. Keep messages in the JSON catalogs, including form labels, validation and
   API error text, toast copy, empty states, chart/map text, titles, `aria-label`,
   `title` and `placeholder`. Do not introduce hard-coded CSS `content` text or
   untranslated strings in templates. Brand names and user-supplied names are
   data, not catalog messages.
3. Use `t(key, parameters)` for text nodes, `htmlMessage` for internal HTML
   templates, and `messageAttribute` for their localized attributes. The HTML
   helpers escape interpolated values; do not concatenate untrusted input into
   markup. Use complete messages with named parameters and ICU plural forms, not
   translated sentence fragments or hand-written language-specific plural rules.
4. Keep GPX analysis, API payloads and persisted measurements in canonical units.
   Format at the UI boundary with `src/client/measurements.js` and `src/client/i18n.js`.
   Convert user-entered values back before validation or submission. Do not infer
   units from the language: the default is metric for every locale, including
   `en-US`; a manually saved choice can select imperial.
5. Map backend errors by stable code to localized messages. Preserve user-authored
   track titles, filenames and GPX names exactly; translate only reliably marked
   application-generated fallbacks.
6. Run `npm run locales:check` and `npm run check`. The catalog check validates
   key parity, ICU syntax, parameters and plural forms. Add behavioral tests for
   new formatting and translation logic, then inspect new UI in a browser,
   including narrow screens and long translated labels. Review AI-generated
   translations for meaning and terminology before merging.

## Browser preferences

The manual choice is stored in this site's `localStorage`, key
`getgpx.preferences.v1`. The value is JSON containing only fields explicitly
changed by the user, for example
`{"language":"pl","measurementSystem":"imperial"}`. The fields are independent:
changing language does not store or change units. With no stored field, language
comes from the browser's preferred languages (English fallback), while units are
metric. Invalid stored values are ignored. A successful change reloads the current
URL; selection is blocked during GPX processing and unsaved edits.

`localStorage` belongs to one origin (protocol, host and port) in one browser
profile. It is not an account setting and does not sync to another device. If
storage is unavailable, the choice lasts only in the current page session and
the selector explains that it could not be saved. Clearing site data removes the
manual choice. Keep this contract in mind when testing on different localhost
ports or comparing preview with development servers.
