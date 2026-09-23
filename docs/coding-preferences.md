# Coding preferences

- Use ES modules and explicit named exports for reusable logic.
- Keep browser/domain functions small and deterministic; inject network and persistence dependencies where practical.
- Validate untrusted input at the HTTP boundary and allowlist third-party response fields.
- Return stable JSON errors without stack traces. Never log credentials, session tokens, or GPX content.
- Use `textContent` for untrusted strings. Template-based `innerHTML` is acceptable only for values produced by internal allowlisted classifiers; revisit this when server/user content is rendered.
- Add a failing test before behavior changes, then run `npm run check`.
- Put new user-facing messages in the English catalog under `src/client/locales/` and provide reviewed translations for every language in the registry (currently `en`, `ru`, `uk`, `be`, `pl`) in the same change. Use message parameters and plural forms rather than joining translated fragments. `npm run check` validates catalog completeness and syntax.
- Keep measurements canonical in calculations and persistence; format and convert them for the selected measurement system only at UI and input boundaries. A preference change reloads the current URL and must be blocked during GPX processing or unsaved edits.
